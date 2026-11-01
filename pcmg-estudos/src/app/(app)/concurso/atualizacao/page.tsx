"use client";
import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, ExternalLink, ShieldAlert, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useApp, useRows, useTable } from "@/components/app/context";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, EmptyState, Stat } from "@/components/ui/primitives";
import { useConfirm } from "@/components/ui/dialog";
import { cn } from "@/components/ui/cn";
import { applyUpdatePreview, buildUpdatePreview, type UpdatePreview } from "@/lib/monitor/apply";
import { ALIGN_TAGS } from "@/lib/monitor/alignment";
import type { EditalData } from "@/lib/monitor/parse-edital";
import type { Classification } from "@/lib/monitor/classify";
import { fmt } from "@/lib/domain/dates";
import { useVideoAutoSearch } from "@/components/videos/auto-search";

const IMPACT = { alto: "alert", medio: "warn", baixo: "neutral" } as const;
const br = (iso?: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");

function UpdateInner() {
  const params = useSearchParams();
  const versionId = params.get("versao");
  const jobId = params.get("analise");
  const router = useRouter();
  const { actions, engine } = useApp();
  const confirm = useConfirm();
  const versions = useTable("competition_versions");
  const docs = useTable("competition_documents");
  const jobs = useTable("syllabus_import_jobs");
  const versionsList = useRows("competition_versions");
  const autoVideos = useVideoAutoSearch();
  const [applied, setApplied] = useState(false);

  const source = useMemo(() => {
    if (versionId && versions[versionId]) {
      const v = versions[versionId];
      const doc = v.document_id ? docs[v.document_id] : undefined;
      const prev = v.base_version_id ? versions[v.base_version_id] : versionsList.filter((x) => x.version_number < v.version_number).sort((a, b) => b.version_number - a.version_number)[0];
      return { data: v.data as EditalData, prev: (prev?.data as EditalData) ?? null, confirmed: v.reliability === "confirmado", reliability: v.reliability, title: v.label, url: doc?.url ?? null, docId: v.document_id, vId: v.id, cls: (doc?.parsed as { classification?: Classification })?.classification, notes: ((doc?.parsed as { aiNotes?: string[] })?.aiNotes) ?? [], diff: v.diff as { field: string; before: string; after: string }[] };
    }
    if (jobId && jobs[jobId]) {
      const a = jobs[jobId].analysis as { parsed: EditalData; classification: Classification; notes: string[]; url?: string };
      return { data: a.parsed, prev: null, confirmed: false, reliability: a.classification.reliability, title: `Análise manual: ${jobs[jobId].source_name ?? "documento"}`, url: a.url || null, docId: null, vId: null, cls: a.classification, notes: a.notes ?? [], diff: [] };
    }
    return null;
  }, [versionId, jobId, versions, docs, jobs, versionsList]);

  const preview: UpdatePreview | null = useMemo(() => {
    if (!source) return null;
    try {
      return buildUpdatePreview(actions, source.data, { versionId: source.vId, documentId: source.docId, title: source.title, sourceUrl: source.url, publishedAt: null, confirmed: source.confirmed }, source.prev);
    } catch { return null; }
    // a prévia é calculada uma vez por documento (não muda enquanto a usuária lê)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  if (!source || !preview) return <EmptyState title="Documento não encontrado" description="Volte à Central do Concurso." action={<Link href="/concurso"><Button>Central do Concurso</Button></Link>} />;
  const d = source.data;
  const wrongCargo = source.cls && (source.cls.cargoMatch === "outro_cargo" || source.cls.outdated || !source.cls.aboutPcmg);
  const isApplied = applied || (!!source.vId && actions.settings().applied_version_id === source.vId);

  const apply = async () => {
    const ok = source.confirmed
      ? await confirm({ title: "Aplicar atualização ao seu plano?", description: "Matérias, pesos, conteúdos, datas, cronograma e rotação serão atualizados. Seu histórico é preservado e você pode desfazer depois.", confirmLabel: "Aplicar" })
      : await confirm({ title: "Documento ainda não confirmado", description: "Este documento não foi confirmado como oficial pelo app. Só aplique se você conferiu que é o edital oficial de Investigador da PCMG. As datas ficarão marcadas como não confirmadas.", confirmLabel: "Aplicar mesmo assim", danger: true, typeToConfirm: "CONFERI" });
    if (!ok) return;
    applyUpdatePreview(actions, preview);
    if (jobId) engine.patch("syllabus_import_jobs", jobId, { status: "aplicado" });
    setApplied(true);
    toast.success("Plano atualizado! Buscando videoaulas para os novos conteúdos…");
    void autoVideos(10);
  };

  const fields: [string, string | null | undefined, number | null | undefined][] = [
    ["Número do edital", d.editalNumber?.value, d.editalNumber?.page], ["Cargo", d.cargo?.value, d.cargo?.page], ["Banca", d.board?.value, d.board?.page],
    ["Vagas", d.vacancies?.value.toLocaleString("pt-BR"), d.vacancies?.page], ["Escolaridade", d.education?.value, d.education?.page],
    ["Remuneração", d.salary ? `R$ ${d.salary.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : null, d.salary?.page],
    ["Taxa de inscrição", d.fee ? `R$ ${d.fee.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : null, d.fee?.page],
    ["Inscrições", d.registration ? `${br(d.registration.value.start)} a ${br(d.registration.value.end)}` : null, d.registration?.page],
    ["Data da prova", br(d.examDate?.value), d.examDate?.page], ["Horário", d.examTime?.value, d.examTime?.page],
    ["Duração", d.durationMinutes ? `${Math.floor(d.durationMinutes.value / 60)}h${d.durationMinutes.value % 60 ? String(d.durationMinutes.value % 60).padStart(2, "0") : ""}` : null, d.durationMinutes?.page],
    ["Total de questões", d.totalQuestions?.value?.toString(), d.totalQuestions?.page], ["Etapas", d.stages?.value.join(", "), d.stages?.page],
    ["Critério de aprovação", d.approval?.value, d.approval?.page],
  ];
  const f = preview.forecast;

  return (
    <div className="space-y-4 animate-fade-in">
      <Link href="/concurso" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft size={15} /> Central do Concurso</Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">O que mudou no novo edital?</h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
          <span>{source.title}</span>
          <Badge tone={source.confirmed ? "primary" : "warn"}>{source.confirmed ? "Oficial confirmado" : "Aguardando confirmação"}</Badge>
          {source.url && <a href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary">documento original <ExternalLink size={12} /></a>}
        </div>
      </div>
      {wrongCargo && <Card className="flex gap-3 border-alert/40 bg-alert-soft p-4 text-sm text-alert"><ShieldAlert size={18} className="shrink-0" /><div><b>Atenção:</b> {source.cls?.reasons.join(" ")} Não recomendamos aplicar este documento ao seu plano.</div></Card>}
      {(d.warnings.length > 0 || source.notes.length > 0) && <Card className="space-y-1 border-warn/40 p-4 text-sm"><p className="flex items-center gap-2 font-medium text-warn"><AlertTriangle size={16} /> Pontos para conferir no documento</p>{[...d.warnings, ...source.notes].map((w) => <p key={w} className="text-muted">• {w}</p>)}</Card>}

      <Card>
        <CardHeader title="Mudanças identificadas" description="Cada linha indica a página do documento quando disponível" />
        <div className="overflow-x-auto px-2 pb-3 pt-2 sm:px-3">
          <table className="w-full min-w-[560px] text-sm" data-testid="changes-table">
            <thead className="text-left text-xs text-muted"><tr><th className="p-2">Informação</th><th className="p-2">Antes</th><th className="p-2">Novo edital</th><th className="p-2">Pág.</th><th className="p-2">Impacto</th></tr></thead>
            <tbody className="divide-y">
              {preview.comparison.changes.filter((c) => c.category !== "cronograma").map((c) => (
                <tr key={c.id}><td className="p-2 font-medium">{c.label}</td><td className="p-2 text-muted">{c.before}</td><td className="p-2">{c.after}</td><td className="tnum p-2 text-muted">{c.page ?? "—"}</td><td className="p-2"><Badge tone={IMPACT[c.impact]}>{c.impact}</Badge></td></tr>
              ))}
            </tbody>
          </table>
          {source.diff?.length > 0 && <p className="px-2 pt-2 text-xs text-muted">Em relação à versão anterior do edital: {source.diff.map((x) => `${x.field} (${x.before} → ${x.after})`).join("; ").slice(0, 600)}</p>}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Dados extraídos do edital" description="Fonte: documento oficial; confira os itens marcados" />
          <CardBody>
            <dl className="divide-y text-sm">{fields.map(([k, v, p]) => (
              <div key={k} className="grid grid-cols-[130px_1fr] gap-2 py-1.5"><dt className="text-muted">{k}</dt><dd>{v ?? <span className="text-muted">não identificado</span>}{p ? <span className="ml-1 text-xs text-muted">(p. {p})</span> : null}</dd></div>
            ))}</dl>
            {d.requirements?.value.length ? <div className="mt-3 text-sm"><p className="mb-1 text-muted">Requisitos</p><ul className="list-disc space-y-0.5 pl-4">{d.requirements.value.map((r) => <li key={r}>{r}</li>)}</ul></div> : null}
            {d.legislation.length > 0 && <div className="mt-3 text-sm"><p className="mb-1 text-muted">Legislação citada</p><div className="flex flex-wrap gap-1">{d.legislation.map((l) => <Badge key={l} tone="outline">{l}</Badge>)}</div></div>}
            {d.schedule.length > 0 && <div className="mt-3 text-sm"><p className="mb-1 text-muted">Cronograma oficial</p><ul className="space-y-0.5">{d.schedule.map((s) => <li key={s.date + s.event}><span className="tnum">{br(s.date)}</span> — {s.event}</li>)}</ul></div>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Matérias e questões" />
          <CardBody>
            <ul className="divide-y text-sm">{preview.comparison.mapping.map((m) => (
              <li key={m.editalName} className="flex items-center gap-2 py-1.5">
                <span className="flex-1">{m.editalName}</span>
                {m.status !== "mantida" && <Badge tone={m.status === "adicionada" ? "primary" : "outline"}>{m.status}</Badge>}
                <span className="tnum w-24 text-right">{m.questions ?? "—"} questões</span>
              </li>
            ))}
              {preview.comparison.removedSubjectIds.map((id) => <li key={id} className="flex items-center gap-2 py-1.5 text-muted"><span className="flex-1 line-through">{engine.row("subjects", id)?.name}</span><Badge tone="alert">removida (fica inativa)</Badge></li>)}
            </ul>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Como seu plano será atualizado" description={preview.strategy} />
        <CardBody className="space-y-4">
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Dias até a prova" value={f.daysLeft ?? "—"} hint={d.examDate ? `prova em ${br(d.examDate.value)}` : undefined} />
            <Stat label="Horas disponíveis" value={f.hoursAvailable ?? "—"} hint={f.studyDaysLeft ? `${f.studyDaysLeft} dias de estudo · 12 h/semana` : undefined} />
            <Stat label="Conteúdos a estudar" value={`${f.pendingTopics}/${f.totalTopics}`} hint={`≈ ${f.estimatedHoursNeeded} h de teoria`} />
            <Stat label="Fim estimado da teoria" value={f.theoryCompletionDate ? fmt(f.theoryCompletionDate, "dd/MM/yy") : "—"} hint={f.fitsBeforeExam === false ? "depois do início da reta final" : "antes da reta final"} />
          </section>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border p-3 text-sm">
              <p className="mb-1.5 font-medium">O que será alterado</p>
              <ul className="space-y-0.5 text-muted">
                <li>• {preview.summary.added} matéria(s) adicionada(s), {preview.summary.removed} desativada(s), {preview.summary.renamed} renomeada(s)</li>
                <li>• {preview.summary.questionsChanged} matéria(s) com nova quantidade de questões e pesos</li>
                <li>• {preview.summary.newTopics} conteúdo(s) novo(s) no edital verticalizado; {preview.topicsOutOfEdital.length} marcado(s) como fora do edital</li>
                <li>• Banca, data e duração da prova, contagem regressiva e fases recalculadas</li>
                <li>• Cronograma semanal e matéria rotativa de sexta reorganizados por prioridade</li>
                <li>• {preview.reviewsAffected} revisão(ões) afetada(s); atrasadas serão redistribuídas</li>
                <li>• Banco de questões: {preview.alignment.counts.valida} válidas, {preview.alignment.counts.fora} “{ALIGN_TAGS.fora}”, {preview.alignment.counts.reclassificar} para reclassificar, {preview.alignment.counts.legislacao} com legislação a conferir (nenhuma excluída)</li>
              </ul>
            </div>
            <div className="rounded-xl border p-3 text-sm">
              <p className="mb-1.5 font-medium">O que será preservado</p>
              <ul className="space-y-0.5 text-muted">{preview.summary.preserved.map((p) => <li key={p}>• {p}</li>)}</ul>
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Nova distribuição semanal (12 h)</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
              {preview.planDiff.map((p) => (
                <div key={p.weekday} className="rounded-xl border p-2 text-xs">
                  <p className="mb-1 font-semibold">{p.label}</p>
                  {p.after.map((a, i) => <p key={i} className={cn(p.before[i] !== a && "font-medium text-primary")}>{a}</p>)}
                  {p.before.join() !== p.after.join() && <p className="mt-1 text-muted line-through">{p.before.join(", ")}</p>}
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Prioridade das matérias</p>
            <ul className="space-y-1.5">{preview.priorities.map((p) => (
              <li key={p.subjectId} className="grid grid-cols-[120px_1fr_44px] items-center gap-2 text-xs sm:grid-cols-[160px_1fr_44px_1fr]">
                <span className="truncate font-medium">{p.name}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full bg-primary" style={{ width: `${Math.min(100, p.share * 100 * 4)}%` }} /></span>
                <span className="tnum text-right">{Math.round(p.share * 100)}%</span>
                <span className="hidden truncate text-muted sm:block">{p.reasons.join(" · ")}</span>
              </li>
            ))}</ul>
          </div>
          {isApplied ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl bg-primary-soft p-4 text-primary" data-testid="update-applied">
              <CheckCircle2 size={20} /><span className="flex-1 font-medium">Plano atualizado com este edital.</span>
              <Button variant="outline" size="sm" onClick={() => router.push("/")}>Ver o dia de hoje</Button>
            </div>
          ) : (
            <Button size="lg" className="w-full" onClick={apply} data-testid="apply-update"><Sparkles size={18} /> APLICAR ATUALIZAÇÃO AO MEU PLANO</Button>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
export default function UpdatePage() { return <Suspense><UpdateInner /></Suspense>; }
