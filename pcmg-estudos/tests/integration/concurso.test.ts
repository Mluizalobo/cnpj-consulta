/**
 * Testes da Central do Concurso. Todos os documentos usados são FICTÍCIOS (tests/fixtures).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MemoryMonitorStore } from "@/lib/monitor/store";
import { runMonitor, analyzeUpload } from "@/lib/monitor/pipeline";
import type { Fetcher } from "@/lib/monitor/fetcher";
import { extractPdfPages } from "@/lib/monitor/extract";
import { classifyDocument } from "@/lib/monitor/classify";
import { parseEdital, splitPages, type EditalData } from "@/lib/monitor/parse-edital";
import { refineWithAi } from "@/lib/monitor/ai";
import { buildUpdatePreview, applyUpdatePreview, revertUpdate } from "@/lib/monitor/apply";
import { ALIGN_TAGS } from "@/lib/monitor/alignment";
import { MemoryBackend } from "@/lib/data/memory-backend";
import { MemoryPersistence } from "@/lib/data/persistence";
import { SyncEngine } from "@/lib/data/sync-engine";
import { createActions } from "@/lib/data/actions";
import { getDayItems } from "@/lib/domain/plan";
import { assertSafeUrl } from "@/lib/monitor/fetcher";
import { UID } from "../helpers";

const fx = (f: string) => readFileSync(`tests/fixtures/${f}`, "utf8");
const pdfBytes = new Uint8Array(readFileSync("tests/fixtures/edital-investigador-ficticio.pdf"));
const enc = (s: string) => new TextEncoder().encode(s);
const html = (body: string) => enc(`<html><body>${body}</body></html>`);

type Route = { status?: number; type?: string; body: Uint8Array } | Error;
function fakeWeb(routes: Record<string, Route>): Fetcher {
  return async (url) => {
    const r = routes[url];
    if (!r) return { url, status: 404, contentType: "text/html", bytes: enc("not found") };
    if (r instanceof Error) throw r;
    return { url, status: r.status ?? 200, contentType: r.type ?? "text/html", bytes: r.body };
  };
}
const PCMG = "https://www.policiacivil.mg.gov.br/pagina/concursos";
const FGV = "https://conhecimento.fgv.br/concursos";
const CURSINHO = "https://www.exemplo-cursinho.com.br/pcmg";
const EDITAL_PDF = "https://www.policiacivil.mg.gov.br/arquivos/edital-01-2026.pdf";
const RETIF = "https://www.policiacivil.mg.gov.br/arquivos/retificacao-02-2026.pdf";
const DELEG = "https://www.policiacivil.mg.gov.br/arquivos/edital-delegado-03-2026.pdf";

function storeWith() {
  const s = new MemoryMonitorStore();
  const t = new Date().toISOString();
  s.sources = [
    { id: "s1", name: "PCMG Concursos", url: PCMG, kind: "oficial", active: true, last_checked_at: null, last_status: null, created_at: t, updated_at: t },
    { id: "s2", name: "FGV", url: FGV, kind: "banca", active: true, last_checked_at: null, last_status: null, created_at: t, updated_at: t },
    { id: "s3", name: "Cursinho (secundária)", url: CURSINHO, kind: "secundaria", active: true, last_checked_at: null, last_status: null, created_at: t, updated_at: t },
  ];
  return s;
}
const textPdf = (t: string): Route => ({ type: "application/pdf", body: enc(t) });
// O fetcher fake entrega texto como "PDF": substituímos a extração quando não é PDF real.
const pdfFromText = (t: string): Route => ({ type: "text/plain", body: enc(t) });

async function app() {
  const server = new MemoryBackend();
  const engine = new SyncEngine(server, new MemoryPersistence(), { debounceMs: 0, autoRetry: false });
  await engine.start(UID);
  const a = createActions(engine, { now: () => new Date("2026-12-20T12:00:00") });
  a.seedIfNeeded();
  await engine.flush();
  return { a, engine, server };
}
const editalData = () => parseEdital(splitPages(fx("edital-investigador-ficticio.txt")));
const meta = { versionId: "v1", documentId: "d1", title: "Edital nº 01/2026 (fictício)", sourceUrl: EDITAL_PDF, publishedAt: "2026-12-15", confirmed: true };

describe("Central do Concurso — monitoramento", () => {
  it("1. simula a descoberta de um novo edital nas fontes oficiais", async () => {
    const store = storeWith();
    const web = fakeWeb({
      [PCMG]: { body: html(`<a href="/arquivos/edital-01-2026.pdf">Edital nº 01/2026 — Concurso Investigador de Polícia</a>`) },
      [EDITAL_PDF]: { type: "application/pdf", body: pdfBytes },
      [FGV]: { body: html("<p>Concursos em andamento</p>") },
      [CURSINHO]: { body: html("<p>Nada</p>") },
    });
    const r = await runMonitor({ trigger: "teste", store, fetcher: web });
    expect(r.editalFound).toBe(true);
    expect(store.documents).toHaveLength(1);
    expect(store.documents[0]).toMatchObject({ doc_type: "edital_abertura", cargo_match: "investigador", is_official: true, reliability: "confirmado", edital_number: "01/2026", page_count: 4 });
    expect(store.updates.find((u) => u.kind === "edital_publicado")).toBeDefined();
    expect(store.versions).toHaveLength(1);
    expect(store.logs[0]).toMatchObject({ status: "ok", new_documents: 1 });
  });

  it("2. extrai o texto de um PDF real (com páginas)", async () => {
    const pages = await extractPdfPages(pdfBytes);
    expect(pages).toHaveLength(4);
    expect(pages[0]).toMatch(/INVESTIGADOR DE POLÍCIA/);
    const d = parseEdital(pages);
    expect(d.examDate?.value).toBe("2027-05-16");
    expect(d.examDate?.page).toBe(2);
    expect(d.subjects).toHaveLength(13);
    await expect(extractPdfPages(enc("não é pdf"))).rejects.toThrow(/não é um PDF/);
  });

  it("3. identifica corretamente o cargo de Investigador", () => {
    const c = classifyDocument({ text: fx("edital-investigador-ficticio.txt"), url: EDITAL_PDF, sourceKind: "oficial" });
    expect(c).toMatchObject({ cargoMatch: "investigador", docType: "edital_abertura", aboutPcmg: true, usableForPlan: true });
  });

  it("4. rejeita documentos de outros cargos e de anos anteriores", () => {
    const d = classifyDocument({ text: fx("edital-delegado-ficticio.txt"), url: DELEG, sourceKind: "oficial" });
    expect(d.cargoMatch).toBe("outro_cargo"); // cita investigadores só de passagem
    expect(d.usableForPlan).toBe(false);
    const old = classifyDocument({ text: fx("edital-antigo-ficticio.txt"), url: EDITAL_PDF, sourceKind: "oficial" });
    expect(old).toMatchObject({ outdated: true, year: 2021, usableForPlan: false });
    const news = classifyDocument({ text: fx("edital-investigador-ficticio.txt"), url: CURSINHO, sourceKind: "secundaria" });
    expect(news).toMatchObject({ isOfficial: false, reliability: "preliminar", usableForPlan: false });
  });

  it("13. fontes indisponíveis não derrubam a verificação (status parcial e log sem dados pessoais)", async () => {
    const store = storeWith();
    const web = fakeWeb({ [PCMG]: new Error("fetch failed https://x.y/z?email=a@b"), [FGV]: { status: 503, body: enc("") }, [CURSINHO]: { body: html("ok") } });
    const r = await runMonitor({ trigger: "teste", store, fetcher: web });
    expect(r.status).toBe("parcial");
    expect(r.errors).toHaveLength(2);
    expect(JSON.stringify(store.logs)).not.toMatch(/a@b|https:\/\/x\.y/);
    expect(r.message).toMatch(/Não encontramos alterações oficiais/);
    expect(store.sources.find((s) => s.id === "s1")?.last_status).toMatch(/^erro/);
  });

  it("14. documentos duplicados não são processados duas vezes (hash)", async () => {
    const store = storeWith();
    const web = fakeWeb({
      [PCMG]: { body: html(`<a href="${EDITAL_PDF}">Edital Investigador</a><a href="${EDITAL_PDF}?copia=1">Edital Investigador (cópia)</a>`) },
      [EDITAL_PDF]: { type: "application/pdf", body: pdfBytes }, [`${EDITAL_PDF}?copia=1`]: { type: "application/pdf", body: pdfBytes },
    });
    const r1 = await runMonitor({ trigger: "teste", store, fetcher: web });
    expect(r1.newDocuments).toBe(1);
    expect(r1.duplicates).toBe(1);
    store.sources[0].last_hash = null; // força reprocessar a página
    const r2 = await runMonitor({ trigger: "teste", store, fetcher: web });
    expect(r2.newDocuments).toBe(0);
    expect(store.updates.filter((u) => u.kind === "edital_publicado")).toHaveLength(1);
  });

  it("12. identifica retificações e gera nova versão com o trecho alterado", async () => {
    const store = storeWith();
    const web1 = fakeWeb({ [PCMG]: { body: html(`<a href="${EDITAL_PDF}">Edital Investigador</a>`) }, [EDITAL_PDF]: { type: "application/pdf", body: pdfBytes } });
    await runMonitor({ trigger: "teste", store, fetcher: web1 });
    const web2 = fakeWeb({ [PCMG]: { body: html(`<a href="${RETIF}">Retificação do edital - Investigador</a>`) }, [RETIF]: pdfFromText(fx("retificacao-ficticia.txt")) });
    const r = await runMonitor({ trigger: "teste", store, fetcher: web2 });
    expect(r.newUpdates).toBe(1);
    const upd = store.updates.find((u) => u.kind === "alteracao_importante")!;
    expect(upd.title).toMatch(/Retificação/);
    expect(store.versions).toHaveLength(2);
    const v2 = store.versions[1];
    expect(v2.base_version_id).toBe(store.versions[0].id);
    expect((v2.data as EditalData).examDate?.value).toBe("2027-05-23");
    expect(JSON.stringify(v2.diff)).toMatch(/2027-05-16.*2027-05-23|Data da prova/);
    expect(JSON.stringify(v2.diff)).toMatch(/dignidade sexual/);
  });

  it("15. informações contraditórias: vale o documento oficial mais recente e a divergência é registrada", async () => {
    const store = storeWith();
    const web1 = fakeWeb({ [PCMG]: { body: html(`<a href="${EDITAL_PDF}">Edital Investigador</a>`) }, [EDITAL_PDF]: { type: "application/pdf", body: pdfBytes } });
    await runMonitor({ trigger: "teste", store, fetcher: web1 });
    const other = fx("edital-investigador-ficticio.txt").replace("16/05/2027, com início", "30/05/2027, com início");
    const url2 = "https://www.policiacivil.mg.gov.br/arquivos/edital-01-2026-v2.pdf";
    const web2 = fakeWeb({ [PCMG]: { body: html(`<a href="${url2}">Edital Investigador (republicado)</a>`) }, [url2]: pdfFromText(other) });
    await runMonitor({ trigger: "teste", store, fetcher: web2 });
    const u = store.updates[store.updates.length - 1];
    expect(u.kind).toBe("alteracao_importante");
    expect(JSON.stringify(u.details)).toMatch(/Divergência|Data da prova: versão anterior 2027-05-16, novo documento 2027-05-30/);
    expect((store.versions[1].data as EditalData).examDate?.value).toBe("2027-05-30");
  });

  it("notícias de cursinho viram apenas pista não oficial", async () => {
    const store = storeWith();
    const web = fakeWeb({ [CURSINHO]: { body: html("<p>Concurso Polícia Civil de Minas Gerais: edital de investigador deve sair em breve, diz professor.</p>") } });
    const r = await runMonitor({ trigger: "teste", store, fetcher: web });
    expect(store.updates).toHaveLength(1);
    expect(store.updates[0]).toMatchObject({ kind: "pista_nao_oficial", reliability: "preliminar" });
    expect(store.versions).toHaveLength(0);
    expect(r.editalFound).toBe(false);
  });

  it("segurança: bloqueia endereços internos (SSRF)", () => {
    expect(() => assertSafeUrl("http://localhost:5432")).toThrow();
    expect(() => assertSafeUrl("http://169.254.169.254/latest")).toThrow();
    expect(() => assertSafeUrl("file:///etc/passwd")).toThrow();
    expect(assertSafeUrl("https://www.policiacivil.mg.gov.br/").hostname).toBe("www.policiacivil.mg.gov.br");
  });
});

describe("Central do Concurso — comparação e atualização do plano", () => {
  it("5–9. detecta matéria nova, alterações de questões, pesos, banca e data da prova", async () => {
    const { a } = await app();
    const p = buildUpdatePreview(a, editalData(), meta);
    const ch = p.comparison.changes;
    expect(ch.find((c) => c.label === "Nova matéria: Noções de Estatística")).toMatchObject({ kind: "adicionado", after: "8 questões" });
    expect(ch.find((c) => c.category === "questoes" && c.label === "Português")).toMatchObject({ before: "10 questões", after: "12 questões" });
    expect(ch.find((c) => c.category === "questoes" && c.label === "Informática")).toMatchObject({ before: "8 questões", after: "6 questões" });
    expect(ch.find((c) => c.label === "Peso de Português")).toMatchObject({ before: "14,29%", after: "15%" });
    expect(ch.find((c) => c.category === "banca")).toMatchObject({ before: "FGV (prevista)", kind: "confirmado" });
    expect(ch.find((c) => c.category === "prova" && c.label === "Data da prova")).toMatchObject({ before: "16/05/2027 (previsão)", after: "16/05/2027", kind: "confirmado" });
    expect(ch.find((c) => c.category === "duracao")).toBeUndefined(); // 4h30 igual à previsão
    expect(ch.find((c) => c.category === "total")).toMatchObject({ before: "70", after: "80" });
    expect(p.comparison.mapping.find((m) => m.editalName.startsWith("Legislação Institucional"))?.status).toBe("renomeada");
    expect(p.comparison.mapping.find((m) => m.editalName === "Língua Portuguesa")?.status).toBe("mantida");
  });

  it("6. detecta matérias removidas (sem apagar) e renomeadas", async () => {
    const { a } = await app();
    const d = editalData();
    d.subjects = d.subjects.filter((s) => s.slug !== "criminologia");
    d.syllabus = d.syllabus.filter((s) => s.slug !== "criminologia");
    const i = d.subjects.findIndex((s) => s.slug === "direitos-humanos");
    d.subjects[i] = { ...d.subjects[i], name: "Direitos Humanos e Cidadania", slug: null };
    d.syllabus = d.syllabus.filter((s) => s.slug !== "direitos-humanos");
    const p = buildUpdatePreview(a, d, meta);
    expect(p.comparison.changes.find((c) => c.label === "Matéria removida: Criminologia")).toBeDefined();
    expect(p.comparison.changes.find((c) => c.kind === "renomeado" && c.after === "Direitos Humanos e Cidadania")).toMatchObject({ before: "Direitos Humanos" });
    applyUpdatePreview(a, p);
    const crim = a.engine.rows("subjects").find((s) => s.slug === "criminologia")!;
    expect(crim).toMatchObject({ active: false }); // preservada, apenas inativa
  });

  it("10–11. reorganiza o cronograma com um clique e preserva todo o histórico", async () => {
    const { a, engine } = await app();
    // histórico prévio: sessão, respostas, erro, revisão
    const port = engine.rows("subjects").find((s) => s.slug === "portugues")!;
    a.logManualSession({ date: "2026-12-18", subjectId: port.id, activity: "teoria_questoes", minutes: 60, topic: "Crase" });
    const q = engine.rows("questions").find((x) => x.subject_id === port.id)!;
    a.answerQuestion(q.id, q.correct_option === "A" ? "B" : "A");
    a.addToNotebook(q.id, "A");
    const counts = () => ({ s: engine.rows("study_sessions").length, at: engine.rows("question_attempts").length, n: engine.rows("error_notebook").length, r: engine.rows("review_schedule").length, q: engine.rows("questions").length });
    const before = counts();
    const p = buildUpdatePreview(a, editalData(), meta);
    expect(p.plan.slots.filter((s) => s.slot_type === "subject")).toHaveLength(9);
    expect(p.plan.slots.filter((s) => s.weekday === 0)).toHaveLength(0); // domingo livre
    expect(p.plan.slots.reduce((s, x) => s + x.duration_minutes, 0)).toBe(720); // 12h semanais
    expect(p.forecast.daysLeft).toBe(147);
    expect(p.summary.preserved.length).toBeGreaterThan(3);
    const h = applyUpdatePreview(a, p);
    expect(counts()).toEqual(before); // nada apagado
    const st = a.settings();
    expect(st).toMatchObject({ exam_board: "FGV", exam_board_confirmed: true, exam_date: "2027-05-16", exam_date_confirmed: true, edital_published: true, exam_total_questions: 80, applied_version_id: "v1" });
    const estat = engine.rows("subjects").find((s) => s.name === "Noções de Estatística")!;
    expect(estat).toMatchObject({ exam_questions: 8, active: true });
    expect(engine.rows("syllabus_topics").filter((t) => t.subject_id === estat.id && t.origin === "edital")).toHaveLength(3);
    // plano novo vale para os dias futuros
    const items = getDayItems("2026-12-21", { settings: st, subjects: engine.rows("subjects"), plan: engine.rows("study_plan") });
    expect(items.length).toBe(2);
    // questões ganharam etiqueta de alinhamento (nenhuma excluída)
    expect(engine.rows("questions").every((x) => x.tags.some((t) => Object.values(ALIGN_TAGS).includes(t as never)))).toBe(true);
    expect(engine.rows("user_notifications").some((n) => n.title === "Seu planejamento foi atualizado")).toBe(true);
    // pode desfazer
    revertUpdate(a, h.id);
    expect(a.settings().exam_total_questions).toBe(70);
    expect(engine.rows("subjects").find((s) => s.id === estat.id)).toBeDefined(); // nada apagado ao desfazer
  });

  it("estado de estudo dos conteúdos equivalentes é preservado", async () => {
    const { a, engine } = await app();
    const crase = engine.rows("syllabus_topics").find((t) => t.title === "Crase")!;
    a.setTopicStatus(crase.id, "dominado");
    const p = buildUpdatePreview(a, editalData(), meta);
    applyUpdatePreview(a, p);
    const novo = engine.rows("syllabus_topics").find((t) => t.origin === "edital" && /crase/i.test(t.title))!;
    expect(novo.status).toBe("dominado");
    expect(engine.row("syllabus_topics", crase.id)?.in_current_edital).toBe(false); // preliminar fica fora, mas preservado
  });

  it("16. atualização sem conexão: aplica localmente e sincroniza depois", async () => {
    const { a, engine, server } = await app();
    server.online = false;
    applyUpdatePreview(a, buildUpdatePreview(a, editalData(), meta));
    await engine.flush();
    expect(engine.state.sync.status).toBe("offline");
    expect(engine.pendingCount()).toBeGreaterThan(0);
    server.online = true;
    await engine.sync();
    expect(server.tables.user_settings?.get(UID)?.exam_total_questions).toBe(80);
  });

  it("17. falhas da IA não impedem a análise; IA sem evidência é descartada", async () => {
    const pages = splitPages(fx("edital-investigador-ficticio.txt").replace(/organizado e executado pela Fundação Getulio Vargas \(FGV\)/, "organizado por instituição a definir"));
    const base = parseEdital(pages);
    expect(base.board).toBeNull();
    const failing = { name: "falha", complete: async () => { throw new Error("503 Service Unavailable"); } };
    const r1 = await refineWithAi(base, pages, failing);
    expect(r1.used).toBe(false);
    expect(r1.data.examDate?.value).toBe("2027-05-16");
    expect(r1.notes[0]).toMatch(/IA indisponível/);
    const liar = { name: "inventa", complete: async () => JSON.stringify({ board: { value: "Banca Inventada", evidence: "organizado pela Banca Inventada" } }) };
    const r2 = await refineWithAi(base, pages, liar);
    expect(r2.data.board).toBeNull();
    expect(r2.notes.join(" ")).toMatch(/sem trecho comprovável/);
    const garbage = { name: "lixo", complete: async () => "isto não é json" };
    expect((await refineWithAi(base, pages, garbage)).data.board).toBeNull();
  });

  it("análise manual assistida de um PDF enviado", async () => {
    const r = await analyzeUpload({ bytes: pdfBytes });
    expect(r.classification.cargoMatch).toBe("investigador");
    expect(r.classification.isOfficial).toBe(false); // sem URL oficial: requer confirmação
    expect(r.summary).toMatch(/Banca: FGV/);
    expect(r.pages).toBe(4);
  });

  it("18. fluxo completo com um clique: monitor → versão → prévia → aplicar", async () => {
    const store = storeWith();
    const web = fakeWeb({ [PCMG]: { body: html(`<a href="${EDITAL_PDF}">Edital Investigador</a>`) }, [EDITAL_PDF]: { type: "application/pdf", body: pdfBytes } });
    const run = await runMonitor({ trigger: "manual", store, fetcher: web });
    expect(run.editalFound).toBe(true);
    const v = store.versions[0];
    const { a } = await app();
    const preview = buildUpdatePreview(a, v.data as EditalData, { versionId: v.id, documentId: v.document_id, title: v.label, sourceUrl: EDITAL_PDF, publishedAt: null, confirmed: v.reliability === "confirmado" });
    expect(preview.strategy.length).toBeGreaterThan(10);
    applyUpdatePreview(a, preview);
    expect(a.settings().applied_version_id).toBe(v.id);
    expect(a.engine.rows("plan_update_history")).toHaveLength(1);
  });
});
