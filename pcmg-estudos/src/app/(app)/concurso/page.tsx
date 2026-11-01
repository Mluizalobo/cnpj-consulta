"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ExternalLink, FileSearch, FileText, History, Loader2, Radar, RotateCcw, ShieldCheck, Upload } from "lucide-react";
import { toast } from "sonner";
import { useApp, useRows, useSettings } from "@/components/app/context";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, EmptyState, Field, Input, PageHeader, Textarea } from "@/components/ui/primitives";
import { Dialog, useConfirm } from "@/components/ui/dialog";
import { cn } from "@/components/ui/cn";
import { CHECK_STEPS, pendingVersion, useCheckJob } from "@/components/concurso/check-job";
import { revertUpdate } from "@/lib/monitor/apply";
import { newId } from "@/lib/domain/ids";
import { fmt } from "@/lib/domain/dates";
import type { CompetitionUpdate, Reliability, SourceKind } from "@/lib/types";
import type { EditalData } from "@/lib/monitor/parse-edital";

const REL: Record<Reliability, { label: string; tone: "primary" | "warn" | "neutral" }> = {
  confirmado: { label: "Confirmado", tone: "primary" }, preliminar: { label: "Preliminar", tone: "neutral" }, aguardando_confirmacao: { label: "Aguardando confirmação", tone: "warn" },
};
const KIND: Record<SourceKind, string> = { oficial: "Oficial", banca: "Banca", diario_oficial: "Diário Oficial", secundaria: "Não oficial (pista)" };
const UPD: Record<CompetitionUpdate["kind"], string> = {
  nova_informacao: "Nova informação", novo_documento: "Novo documento", alteracao_importante: "Alteração importante", edital_publicado: "Edital publicado", pista_nao_oficial: "Pista não oficial",
};

export default function CompetitionPage() {
  const { engine, actions, auth } = useApp();
  const settings = useSettings()!;
  const router = useRouter();
  const confirm = useConfirm();
  const job = useCheckJob();
  const updates = useRows("competition_updates");
  const docs = useRows("competition_documents");
  const versions = useRows("competition_versions");
  const logs = useRows("monitoring_logs");
  const sources = useRows("competition_sources");
  const history = useRows("plan_update_history");
  const [server, setServer] = useState<{ monitoring: boolean; cron: boolean; ai: boolean } | null>(null);
  const [manual, setManual] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { fetch("/api/concurso/status").then((r) => r.json()).then(setServer).catch(() => setServer(null)); }, []);

  const pending = pendingVersion(versions, settings);
  const applied = versions.find((v) => v.id === settings.applied_version_id);
  const lastLog = useMemo(() => [...logs].sort((a, b) => b.started_at.localeCompare(a.started_at))[0], [logs]);
  const officialDocs = useMemo(() => docs.filter((d) => d.is_official).sort((a, b) => b.fetched_at.localeCompare(a.fetched_at)), [docs]);
  const sortedUpdates = useMemo(() => [...updates].sort((a, b) => b.detected_at.localeCompare(a.detected_at)), [updates]);
  const ed = (applied?.data ?? pending?.data) as EditalData | undefined;
  const today = actions.today();
  const stage = (() => {
    const reg = ed?.registration?.value;
    if (settings.exam_date && settings.exam_date_confirmed && settings.exam_date < today) return "Prova realizada";
    if (reg && today >= reg.start && today <= reg.end) return "Inscrições abertas";
    if (ed?.examDate || (settings.exam_date_confirmed && settings.exam_date)) return "Prova marcada";
    if (ed || settings.edital_published) return "Edital publicado";
    if (settings.exam_board_confirmed) return "Banca definida";
    return "Anunciado — aguardando edital";
  })();
  const monitorState = !server ? "Verificando servidor…" : server.monitoring ? (pending ? "Atualização aguardando sua confirmação" : sortedUpdates[0] && lastLog && sortedUpdates[0].detected_at >= lastLog.started_at ? "Nova informação encontrada" : "Monitoramento ativo") : "Monitoramento não ativado no servidor";

  const analyzeManual = async () => {
    if (!file && text.trim().length < 200) { toast.error("Envie o PDF ou cole o texto completo do edital."); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      if (file) fd.append("file", file);
      if (text) fd.append("text", text);
      if (url) fd.append("url", url);
      const res = await fetch("/api/concurso/analisar", { method: "POST", body: fd, headers: { Authorization: `Bearer ${(await auth.accessToken()) ?? ""}` } });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Falha na análise");
      const id = newId();
      engine.upsert("syllabus_import_jobs", { id, user_id: actions.uid(), created_at: actions.nowIso(), updated_at: actions.nowIso(), document_id: null, source_name: file?.name ?? (url || "Texto colado"), status: "analisado", analysis: { ...body, url }, error: null });
      setManual(false);
      router.push(`/concurso/atualizacao?analise=${id}`);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader title="Central do Concurso" description="Investigador de Polícia · Polícia Civil de Minas Gerais" />

      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary"><Radar size={22} /></div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Situação do concurso</p>
              <p className="text-xl font-semibold" data-testid="competition-stage">{stage}</p>
              <div className="mt-1 flex flex-wrap gap-2 text-xs">
                <Badge tone={server?.monitoring ? "primary" : "warn"}>{monitorState}</Badge>
                <Badge tone="outline">Última verificação: {lastLog ? new Date(lastLog.started_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "nunca"}</Badge>
                {officialDocs[0] && <Badge tone="outline">Última publicação oficial: {new Date(officialDocs[0].published_at ?? officialDocs[0].fetched_at).toLocaleDateString("pt-BR")}</Badge>}
              </div>
            </div>
          </div>
          <div className="grid gap-2 text-sm sm:grid-cols-3">
            <div className="rounded-xl bg-surface-2 p-3"><p className="text-xs text-muted">Banca</p><p className="font-medium">{settings.exam_board ?? "—"} {settings.exam_board_confirmed ? <Badge tone="primary">confirmada</Badge> : <Badge>prevista</Badge>}</p></div>
            <div className="rounded-xl bg-surface-2 p-3"><p className="text-xs text-muted">Edital</p><p className="font-medium">{settings.edital_published ? `Publicado${settings.edital_date ? ` em ${fmt(settings.edital_date, "dd/MM/yyyy")}` : ""}` : settings.edital_date ? <>Previsão: {fmt(settings.edital_date, "MM/yyyy")} <Badge>não oficial</Badge></> : "Sem previsão"}</p></div>
            <div className="rounded-xl bg-surface-2 p-3"><p className="text-xs text-muted">Prova</p><p className="font-medium">{settings.exam_date ? <>{fmt(settings.exam_date, "dd/MM/yyyy")} {settings.exam_date_confirmed ? <Badge tone="primary">confirmada</Badge> : <Badge>previsão</Badge>}</> : "A definir"}</p></div>
          </div>
          {!settings.edital_published && <p className="text-xs text-muted">Previsões vêm do anúncio do governo (≈ 3 mil vagas, edital até dez/2026, prova entre abr–jun/2027) e <b>não</b> são informações oficiais. Elas só serão substituídas por documentos oficiais confirmados.</p>}

          <div className="space-y-3 rounded-2xl border p-4">
            {pending ? (
              <Link href={`/concurso/atualizacao?versao=${pending.id}`}><Button size="lg" className="w-full" data-testid="analyze-edital"><FileSearch size={18} /> ANALISAR NOVO EDITAL</Button></Link>
            ) : null}
            <Button size="lg" variant={pending ? "outline" : "primary"} className="w-full" loading={job.running} onClick={() => job.run(engine, auth, settings)} data-testid="check-updates">
              {!job.running && <Radar size={18} />} VERIFICAR E ATUALIZAR CONCURSO
            </Button>
            {(job.running || job.outcome) && (
              <div className="space-y-2" aria-live="polite" data-testid="check-progress">
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${((job.step + (job.outcome ? 1 : 0)) / CHECK_STEPS.length) * 100}%` }} /></div>
                <ul className="space-y-1 text-sm">
                  {CHECK_STEPS.slice(0, job.outcome?.kind === "sem_novidades" ? 4 : CHECK_STEPS.length).map((s, i) => (
                    <li key={s} className={cn("flex items-center gap-2", i > job.step && "text-muted/60")}>
                      {i < job.step || (job.outcome && i <= job.step) ? <CheckCircle2 size={15} className="text-primary" /> : i === job.step && job.running ? <Loader2 size={15} className="animate-spin text-primary" /> : <span className="h-[15px] w-[15px] rounded-full border" />}
                      {s}
                    </li>
                  ))}
                </ul>
                {job.notes.map((n) => <p key={n} className="text-xs text-muted">{n}</p>)}
                {job.outcome?.kind === "sem_novidades" && <p className="rounded-xl bg-surface-2 p-3 text-sm font-medium" data-testid="no-news">{job.outcome.message}</p>}
                {job.outcome?.kind === "erro" && <p className="rounded-xl bg-alert-soft p-3 text-sm text-alert">{job.outcome.message}</p>}
                {job.outcome?.kind === "pronto" && <Link href={`/concurso/atualizacao?versao=${job.outcome.versionId}`}><Button className="w-full">Ver o relatório e aplicar</Button></Link>}
              </div>
            )}
            <button type="button" onClick={() => setManual(true)} className="inline-flex items-center gap-1.5 text-sm text-primary"><Upload size={14} /> Tenho o PDF do edital — analisar manualmente</button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Alertas e novidades" description="Somente documentos oficiais podem alterar seu plano — e sempre com sua confirmação." />
        {sortedUpdates.length === 0 ? <EmptyState icon={<ShieldCheck size={20} />} title="Nenhuma novidade registrada" description="Quando o monitoramento encontrar algo, aparece aqui e nas notificações." /> : (
          <ul className="divide-y px-4 pb-2 pt-2 sm:px-5">
            {sortedUpdates.slice(0, 30).map((u) => (
              <li key={u.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  {u.kind === "pista_nao_oficial" ? <AlertTriangle size={15} className="text-warn" /> : <FileText size={15} className="text-primary" />}
                  <span className="text-sm font-medium">{u.title}</span>
                </div>
                <p className="mt-1 text-sm text-muted">{u.summary}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                  <Badge tone="outline">{UPD[u.kind]}</Badge>
                  <Badge tone={REL[u.reliability].tone}>{REL[u.reliability].label}</Badge>
                  <Badge>{KIND[u.source_kind as SourceKind] ?? u.source_kind}</Badge>
                  <span className="text-muted">verificado em {new Date(u.detected_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
                  {u.source_url && <a href={u.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary">fonte <ExternalLink size={11} /></a>}
                </div>
                {Array.isArray((u.details as { divergences?: string[] })?.divergences) && <p className="mt-1.5 rounded-lg bg-warn-soft p-2 text-xs text-warn">Divergência entre documentos: {(u.details as { divergences: string[] }).divergences.join("; ")}. Vale o documento oficial mais recente.</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Documentos oficiais" />
          <CardBody>
            {officialDocs.length === 0 ? <p className="text-sm text-muted">Nenhum documento oficial identificado ainda.</p> : (
              <ul className="space-y-2 text-sm">{officialDocs.slice(0, 20).map((d) => (
                <li key={d.id} className="flex items-start gap-2">
                  <FileText size={15} className="mt-0.5 shrink-0 text-muted" />
                  <div className="min-w-0 flex-1">
                    <a href={d.url} target="_blank" rel="noopener noreferrer" className="line-clamp-2 font-medium hover:underline">{d.title}</a>
                    <p className="text-xs text-muted">{d.source_name} · {d.doc_type.replace("_", " ")} · {d.cargo_match === "outro_cargo" ? "outro cargo" : d.cargo_match} · confiança {Math.round(d.confidence * 100)}%</p>
                  </div>
                </li>
              ))}</ul>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Histórico do Concurso" description="Versões do edital e atualizações aplicadas ao seu plano" />
          <CardBody className="space-y-3 text-sm">
            {versions.length === 0 && history.length === 0 && <p className="text-muted">Sem versões registradas.</p>}
            {[...versions].sort((a, b) => b.version_number - a.version_number).map((v) => (
              <div key={v.id} className="flex items-center gap-2">
                <History size={14} className="text-muted" />
                <span className="flex-1">v{v.version_number} · {v.label}</span>
                <Badge tone={REL[v.reliability].tone}>{REL[v.reliability].label}</Badge>
                <Link href={`/concurso/atualizacao?versao=${v.id}`} className="text-primary">ver</Link>
              </div>
            ))}
            {[...history].sort((a, b) => b.applied_at.localeCompare(a.applied_at)).map((h) => (
              <div key={h.id} className="rounded-xl border p-2.5">
                <div className="flex items-center gap-2"><CheckCircle2 size={14} className="text-primary" /><span className="flex-1 font-medium">Plano atualizado: {h.title}</span>
                  <button type="button" className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg" onClick={async () => { if (await confirm({ title: "Desfazer esta atualização?", description: "Matérias, plano semanal e configurações voltam ao estado anterior. Seu histórico de estudos não é afetado.", confirmLabel: "Desfazer" })) { revertUpdate(actions, h.id); toast.success("Atualização desfeita"); } }}><RotateCcw size={12} /> desfazer</button>
                </div>
                <p className="mt-1 text-xs text-muted">{new Date(h.applied_at).toLocaleString("pt-BR")} · {h.summary}</p>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Fontes monitoradas" description="Cursinhos e portais de notícias servem apenas como pista para achar documentos oficiais." />
        <CardBody>
          {sources.length === 0 ? <p className="text-sm text-muted">As fontes aparecem aqui depois de configurar o banco (migration de fontes).</p> : (
            <ul className="grid gap-2 text-sm sm:grid-cols-2">{[...sources].sort((a, b) => a.kind.localeCompare(b.kind)).map((s) => (
              <li key={s.id} className="flex items-center gap-2 rounded-xl border p-2.5">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", s.last_status?.startsWith("erro") ? "bg-alert" : s.last_checked_at ? "bg-primary" : "bg-muted")} />
                <span className="min-w-0 flex-1"><a href={s.url} target="_blank" rel="noopener noreferrer" className="block truncate hover:underline">{s.name}</a><span className="text-xs text-muted">{KIND[s.kind]}{s.last_status ? ` · ${s.last_status}` : ""}</span></span>
              </li>
            ))}</ul>
          )}
          {server && <p className="mt-3 text-xs text-muted">Servidor: monitoramento {server.monitoring ? "ativo" : "desativado"} · agendamento {server.cron ? "configurado" : "não configurado"} · IA opcional {server.ai ? "ativa (Gemini)" : "desligada (só regras)"}</p>}
        </CardBody>
      </Card>

      <Dialog open={manual} onOpenChange={setManual} title="Análise manual assistida" description="Envie o PDF do edital ou cole o texto. Nada é alterado sem sua confirmação."
        footer={<><Button variant="outline" onClick={() => setManual(false)}>Cancelar</Button><Button onClick={analyzeManual} loading={busy}>Analisar</Button></>}>
        <div className="space-y-3">
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed p-4 hover:bg-surface-2">
            <Upload size={18} className="text-primary" /><span className="text-sm">{file ? file.name : "Escolher PDF (até 15 MB)"}</span>
            <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <Field label="…ou cole o texto completo"><Textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} aria-label="Texto do edital" /></Field>
          <Field label="Endereço oficial do documento (opcional)" hint="Se for de um domínio oficial (mg.gov.br, fgv.br), o documento é tratado como oficial."><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" aria-label="Endereço do documento" /></Field>
        </div>
      </Dialog>
    </div>
  );
}
