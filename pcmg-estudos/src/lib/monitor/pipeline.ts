import type { CompetitionDocument, CompetitionSource, CompetitionUpdate, SourceKind } from "../types";
import { newId } from "../domain/ids";
import { normalizeText } from "../domain/text";
import { classifyDocument, isOfficialUrl, type Classification } from "./classify";
import { applyRectification, parseEdital, type EditalData } from "./parse-edital";
import { diffEditalVersions } from "./compare";
import { extractLinks, extractPdfPages, htmlToText, isPdf, relevantLinks } from "./extract";
import { sha256, type Fetcher } from "./fetcher";
import { plainSummary, refineWithAi, type AiProvider } from "./ai";
import type { MonitorStore } from "./store";

export interface RunOptions {
  trigger: "cron" | "manual" | "teste";
  store: MonitorStore;
  fetcher: Fetcher;
  ai?: AiProvider | null;
  now?: () => Date;
  maxDocsPerSource?: number;
}

export interface RunResult {
  runId: string;
  status: "ok" | "erro" | "parcial";
  sourcesChecked: number;
  documentsFound: number;
  newDocuments: number;
  duplicates: number;
  newUpdates: number;
  editalFound: boolean;
  errors: { source: string; message: string }[];
  message: string;
  steps: string[];
}

const safeMsg = (e: unknown) => String((e as Error)?.message ?? e).replace(/https?:\/\/\S+/g, "[url]").slice(0, 200);

export async function runMonitor(o: RunOptions): Promise<RunResult> {
  const now = o.now ?? (() => new Date());
  const runId = newId();
  const logId = newId();
  const started = now().toISOString();
  const res: RunResult = { runId, status: "ok", sourcesChecked: 0, documentsFound: 0, newDocuments: 0, duplicates: 0, newUpdates: 0, editalFound: false, errors: [], message: "", steps: [] };
  await o.store.insertLog({ id: logId, run_id: runId, trigger: o.trigger, status: "ok", sources_checked: 0, documents_found: 0, new_documents: 0, message: "Em andamento", errors: [], started_at: started, finished_at: null });

  const sources = await o.store.listSources();
  // Fontes oficiais primeiro; secundárias só servem de pista.
  const order: SourceKind[] = ["oficial", "diario_oficial", "banca", "secundaria"];
  sources.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  const visited = new Set<string>();

  const processDocument = async (url: string, src: CompetitionSource, linkText: string) => {
    if (visited.has(url) || visited.size > 80) return;
    visited.add(url);
    const r = await o.fetcher(url);
    if (r.status >= 400) throw new Error(`HTTP ${r.status}`);
    res.documentsFound++;
    const hash = await sha256(r.bytes);
    if (await o.store.findDocumentByHash(hash)) { res.duplicates++; return; }
    let pages: string[];
    if (isPdf(r.contentType, r.bytes, url)) pages = await extractPdfPages(r.bytes);
    else pages = [htmlToText(new TextDecoder().decode(r.bytes))];
    const text = pages.join("\n");
    const kind: SourceKind = isOfficialUrl(r.url) ? (src.kind === "secundaria" ? "oficial" : src.kind) : "secundaria";
    const cls = classifyDocument({ title: linkText, text, url: r.url, sourceKind: kind });
    if (!cls.aboutPcmg) return; // não é sobre a PCMG: ignora
    let parsed: EditalData | null = null;
    let aiNotes: string[] = [];
    let versionInfo: { data: EditalData; diff: unknown; label: string } | null = null;
    if ((cls.docType === "edital_abertura" || cls.docType === "retificacao") && (cls.cargoMatch === "investigador" || cls.cargoMatch === "multi_cargo") && !cls.outdated) {
      const latest = await o.store.latestVersion();
      if (cls.docType === "retificacao" && latest) {
        const rr = applyRectification(latest.data as EditalData, pages);
        parsed = rr.data;
        aiNotes = [...rr.applied.map((a) => `Aplicado: ${a}`), ...rr.unresolved.map((u) => `Verificar manualmente: ${u}`)];
        versionInfo = { data: rr.data, diff: diffEditalVersions(latest.data as EditalData, rr.data), label: `Retificação ${cls.editalNumber ?? ""}`.trim() };
      } else {
        const ai = await refineWithAi(parseEdital(pages), pages, o.ai ?? null);
        parsed = ai.data;
        aiNotes = ai.notes;
        versionInfo = { data: parsed, diff: latest ? diffEditalVersions(latest.data as EditalData, parsed) : [], label: `Edital ${cls.editalNumber ?? ""}`.trim() };
      }
    }
    const docId = newId();
    const title = (linkText || pages[0].split("\n").find((l) => l.trim().length > 10) || r.url).trim().slice(0, 300);
    const doc: Omit<CompetitionDocument, "created_at" | "updated_at"> = {
      id: docId, source_id: src.id, source_name: src.name, source_kind: kind, url: r.url, title, doc_type: cls.docType, content_hash: hash,
      published_at: null, fetched_at: now().toISOString(), cargo_match: cls.cargoMatch, is_official: cls.isOfficial, confidence: cls.confidence,
      reliability: cls.reliability, year: cls.year, edital_number: cls.editalNumber, text_excerpt: text.slice(0, 1500), page_count: pages.length,
      parsed: parsed ? { ...parsed, classification: cls, aiNotes } : { classification: cls },
    };
    await o.store.insertDocument(doc, pages);
    res.newDocuments++;
    await registerUpdate(o, res, doc, cls, parsed, versionInfo, aiNotes);
  };

  for (const src of sources) {
    res.sourcesChecked++;
    try {
      const r = await o.fetcher(src.url);
      if (r.status >= 400) throw new Error(`HTTP ${r.status}`);
      if (isPdf(r.contentType, r.bytes, src.url)) { await processDocument(src.url, src, src.name); continue; }
      const html = new TextDecoder().decode(r.bytes);
      const text = htmlToText(html);
      const pageHash = await sha256(normalizeText(text));
      if (src.last_hash && src.last_hash === pageHash) {
        await o.store.updateSource(src.id, { last_checked_at: now().toISOString(), last_status: "sem alterações", last_hash: pageHash });
        continue;
      }
      const links = relevantLinks(extractLinks(html, r.url || src.url));
      if (src.kind === "secundaria") {
        // Pistas: menções ao concurso em sites não oficiais. Nunca alteram o plano.
        const n = normalizeText(text);
        const m = n.match(/.{0,120}(policia civil de minas|pcmg).{0,40}(investigador|edital|banca|concurso).{0,160}/);
        if (m) {
          const ok = await o.store.insertUpdate({
            id: newId(), document_id: null, kind: "pista_nao_oficial", title: `Pista não oficial: ${src.name}`,
            summary: "Uma fonte secundária publicou algo sobre o concurso. Isto NÃO é confirmação oficial — o app vai procurar o documento nas fontes oficiais.",
            details: { trecho: m[0].slice(0, 300) }, reliability: "preliminar", source_url: src.url, source_kind: "secundaria",
            detected_at: now().toISOString(), dedupe_key: `pista:${src.id}:${await sha256(m[0])}`,
          });
          if (ok) res.newUpdates++;
        }
        // Links de cursinhos que apontam para domínios oficiais são seguidos como pista.
        for (const l of links.filter((x) => isOfficialUrl(x.href)).slice(0, o.maxDocsPerSource ?? 5)) {
          try { await processDocument(l.href, src, l.text); } catch (e) { res.errors.push({ source: src.name, message: safeMsg(e) }); }
        }
      } else {
        for (const l of links.slice(0, o.maxDocsPerSource ?? 8)) {
          try { await processDocument(l.href, src, l.text); } catch (e) { res.errors.push({ source: `${src.name} (documento)`, message: safeMsg(e) }); }
        }
      }
      await o.store.updateSource(src.id, { last_checked_at: now().toISOString(), last_status: "ok", last_hash: pageHash });
    } catch (e) {
      res.errors.push({ source: src.name, message: safeMsg(e) });
      await o.store.updateSource(src.id, { last_checked_at: now().toISOString(), last_status: `erro: ${safeMsg(e)}` }).catch(() => undefined);
    }
  }

  res.status = res.errors.length === 0 ? "ok" : res.errors.length >= res.sourcesChecked && res.sourcesChecked > 0 ? "erro" : "parcial";
  res.message = res.newUpdates > 0
    ? `${res.newUpdates} novidade(s) encontrada(s).`
    : "Não encontramos alterações oficiais desde a última verificação.";
  if (res.errors.length) res.message += ` ${res.errors.length} fonte(s) indisponível(is) no momento.`;
  await o.store.updateLog(logId, {
    status: res.status, sources_checked: res.sourcesChecked, documents_found: res.documentsFound, new_documents: res.newDocuments,
    message: res.message, errors: res.errors, finished_at: now().toISOString(),
  });
  return res;
}

async function registerUpdate(o: RunOptions, res: RunResult, doc: Omit<CompetitionDocument, "created_at" | "updated_at">, cls: Classification, parsed: EditalData | null, version: { data: EditalData; diff: unknown; label: string } | null, notes: string[]) {
  const now = (o.now ?? (() => new Date()))().toISOString();
  let kind: CompetitionUpdate["kind"] = "novo_documento";
  let title = `Novo documento oficial: ${doc.title}`;
  if (!cls.isOfficial) { kind = "pista_nao_oficial"; title = `Documento em fonte não oficial: ${doc.title}`; }
  else if (cls.cargoMatch === "outro_cargo") { kind = "nova_informacao"; title = `Documento de outro cargo (não afeta seu plano): ${doc.title}`; }
  else if (cls.outdated) { kind = "nova_informacao"; title = `Documento de concurso anterior (${cls.year}): ${doc.title}`; }
  else if (cls.usableForPlan && cls.docType === "edital_abertura") { kind = "edital_publicado"; title = `O edital de Investigador da PCMG foi publicado! (${cls.editalNumber ?? "número não identificado"})`; res.editalFound = true; }
  else if (cls.usableForPlan && cls.docType === "retificacao") { kind = "alteracao_importante"; title = `Retificação publicada: ${cls.editalNumber ?? doc.title}`; }

  const details: Record<string, unknown> = { classification: cls, notes };
  let versionId: string | null = null;
  if (version && cls.usableForPlan) {
    const latest = await o.store.latestVersion();
    // Divergências entre fontes oficiais: vale o documento oficial mais recente, mas registramos a diferença.
    const prev = latest?.data as EditalData | undefined;
    const divergences: string[] = [];
    if (prev && cls.docType !== "retificacao") {
      if (prev.examDate?.value && version.data.examDate?.value && prev.examDate.value !== version.data.examDate.value) divergences.push(`Data da prova: versão anterior ${prev.examDate.value}, novo documento ${version.data.examDate.value}`);
      if (prev.board?.value && version.data.board?.value && prev.board.value !== version.data.board.value) divergences.push(`Banca: ${prev.board.value} x ${version.data.board.value}`);
    }
    if (divergences.length) { details.divergences = divergences; kind = "alteracao_importante"; }
    versionId = newId();
    await o.store.insertVersion({
      id: versionId, version_number: (latest?.version_number ?? 0) + 1, document_id: doc.id, base_version_id: latest?.id ?? null,
      label: version.label, data: version.data, diff: version.diff, reliability: cls.reliability,
    });
    details.version_id = versionId;
  }
  const ok = await o.store.insertUpdate({
    id: newId(), document_id: doc.id, kind, title, summary: parsed ? plainSummary(parsed, cls.docType) : cls.reasons.join(" ") || "Documento identificado.",
    details, reliability: cls.reliability, source_url: doc.url, source_kind: doc.source_kind, detected_at: now, dedupe_key: `doc:${doc.content_hash}`,
  });
  if (ok) res.newUpdates++;
}

/** Análise manual assistida: interpreta um PDF/texto enviado pela usuária (sem gravar nada). */
export async function analyzeUpload(p: { bytes?: Uint8Array; text?: string; url?: string; ai?: AiProvider | null }) {
  const pages = p.bytes ? await extractPdfPages(p.bytes) : (p.text ?? "").split(/\f/).filter((x) => x.trim());
  if (!pages.length) throw new Error("Documento vazio");
  const url = p.url || "https://upload.local/documento";
  const cls = classifyDocument({ text: pages.join("\n"), url, sourceKind: p.url && isOfficialUrl(p.url) ? "oficial" : "secundaria" });
  const ai = await refineWithAi(parseEdital(pages), pages, p.ai ?? null);
  return { classification: cls, parsed: ai.data, notes: ai.notes, pages: pages.length, summary: plainSummary(ai.data, cls.docType), hash: p.bytes ? await sha256(p.bytes) : await sha256(pages.join("\n")) };
}
