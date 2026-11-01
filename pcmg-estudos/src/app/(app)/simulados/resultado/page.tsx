"use client";
import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Check, Minus, NotebookPen, X } from "lucide-react";
import { toast } from "sonner";
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useApp, useRows, useSettings, useSubjects, useTable } from "@/components/app/context";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, EmptyState, Segmented, Stat } from "@/components/ui/primitives";
import { cn } from "@/components/ui/cn";
import { useChartColors } from "@/components/shared/chart-colors";
import { formatDuration } from "@/lib/domain/dates";
import { scoreMock } from "@/lib/domain/mock";
import { band, BAND_LABEL, pct } from "@/lib/domain/stats";
import { optionText } from "@/components/questions/labels";

function ResultInner() {
  const id = useSearchParams().get("id") ?? "";
  const { actions } = useApp();
  const settings = useSettings()!;
  const mock = useTable("mock_exams")[id];
  const mocks = useRows("mock_exams");
  const allMq = useRows("mock_exam_questions");
  const questions = useTable("questions");
  const { byId } = useSubjects();
  const colors = useChartColors();
  const [filter, setFilter] = useState<"erradas" | "branco" | "todas">("erradas");
  const mqs = useMemo(() => allMq.filter((q) => q.mock_exam_id === id).sort((a, b) => a.position - b.position), [allMq, id]);
  const score = useMemo(() => scoreMock(mqs), [mqs]);
  if (!mock) return <EmptyState title="Simulado não encontrado" />;
  const target = settings.target_accuracy;
  const rows = score.bySubject.map((s) => ({ ...s, name: byId.get(s.subject_id ?? "")?.short_name ?? "—", band: band(s.pct, target) })).sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0));
  const prev = mocks.filter((m) => m.status === "finalizado" && m.id !== id && (m.finished_at ?? "") < (mock.finished_at ?? "")).sort((a, b) => (b.finished_at ?? "").localeCompare(a.finished_at ?? ""))[0];
  const prevPct = prev ? pct(prev.correct_count ?? 0, prev.total_questions) : null;
  const wrong = mqs.filter((q) => q.selected_option && q.selected_option !== q.correct_option).length;
  const blank = mqs.filter((q) => !q.selected_option).length;
  const list = mqs.filter((q) => filter === "todas" || (filter === "erradas" ? q.selected_option && q.selected_option !== q.correct_option : !q.selected_option));

  return (
    <div className="space-y-4 animate-fade-in">
      <Link href="/simulados" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft size={15} /> Simulados</Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{mock.title}</h1>
        <p className="text-sm text-muted">{new Date(mock.finished_at ?? mock.started_at).toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short" })}</p>
      </div>
      {mock.status !== "finalizado" ? <Card className="p-4 text-sm">Este simulado ainda está em andamento. <Link className="text-primary" href={`/simulados/prova?id=${id}`}>Continuar</Link></Card> : (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Nota" value={<span data-testid="mock-score">{score.correct}/{score.total}</span>} hint={`${wrong} erradas · ${blank} em branco`} />
            <Stat label="Acertos" value={`${(score.pct ?? 0).toLocaleString("pt-BR")}%`} hint={score.pct !== null && score.pct >= target ? `meta de ${target}% atingida` : `faltam ${Math.max(0, Math.round(((target - (score.pct ?? 0)) / 100) * score.total))} acertos para ${target}%`} />
            <Stat label="Tempo utilizado" value={formatDuration(mock.elapsed_seconds, { short: true })} hint={`de ${formatDuration(mock.time_limit_seconds, { short: true })}`} />
            <Stat label="Comparado ao anterior" value={prevPct === null ? "—" : `${(score.pct ?? 0) - prevPct >= 0 ? "+" : ""}${Math.round(((score.pct ?? 0) - prevPct) * 10) / 10} p.p.`} hint={prev ? `anterior: ${prevPct}%` : "primeiro simulado"} />
          </section>

          <Card>
            <CardHeader title="Acertos por matéria" description={`Linha tracejada = meta de ${target}%`} />
            <CardBody>
              <div style={{ height: Math.max(200, rows.length * 30) }} role="img" aria-label="Percentual de acertos por matéria">
                <ResponsiveContainer>
                  <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }} barCategoryGap={6}>
                    <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fill: colors.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={118} tick={{ fill: colors.axis, fontSize: 12 }} axisLine={false} tickLine={false} />
                    <ReferenceLine x={target} stroke={colors.ref} strokeDasharray="4 4" />
                    <Tooltip cursor={{ fill: colors.grid, opacity: 0.4 }} contentStyle={{ borderRadius: 12, border: `1px solid ${colors.grid}`, background: colors.surface }}
                      formatter={(v, _n, p) => [`${v}% (${p.payload.correct}/${p.payload.total}) · ${BAND_LABEL[p.payload.band as keyof typeof BAND_LABEL]}`, "Acertos"]} />
                    <Bar dataKey="pct" radius={[0, 4, 4, 0]} maxBarSize={18}>{rows.map((r) => <Cell key={r.subject_id ?? "x"} fill={colors[r.band]} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted"><tr><th className="py-1.5">Matéria</th><th>Acertos</th><th>%</th><th>Situação</th></tr></thead>
                  <tbody className="divide-y">{rows.map((r) => (
                    <tr key={r.subject_id ?? "x"}><td className="py-1.5">{r.name}</td><td className="tnum">{r.correct}/{r.total}</td><td className="tnum">{r.pct}%</td>
                      <td><Badge tone={r.band === "meta" ? "primary" : r.band === "critico" ? "alert" : "warn"}>{BAND_LABEL[r.band]}</Badge></td></tr>
                  ))}</tbody>
                </table>
              </div>
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <p><span className="font-medium text-alert">Abaixo de 50%:</span> {rows.filter((r) => r.band === "critico").map((r) => r.name).join(", ") || "nenhuma"}</p>
                <p><span className="font-medium text-warn">Abaixo de {target}%:</span> {rows.filter((r) => (r.pct ?? 0) < target).map((r) => r.name).join(", ") || "nenhuma"}</p>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Revisar questões" action={wrong > 0 ? <Button size="sm" variant="soft" onClick={() => { const n = actions.addMockErrorsToNotebook(id); toast.success(n ? `${n} questões adicionadas ao caderno de erros` : "Os erros já estavam no caderno"); }} data-testid="mock-errors-notebook"><NotebookPen size={14} /> Erros → caderno</Button> : undefined} />
            <CardBody className="space-y-3">
              <Segmented size="sm" value={filter} onChange={setFilter} options={[{ value: "erradas", label: `Erradas (${wrong})` }, { value: "branco", label: `Em branco (${blank})` }, { value: "todas", label: "Todas" }]} />
              {list.length === 0 ? <p className="py-4 text-center text-sm text-muted">Nada aqui.</p> : list.map((mq) => {
                const q = mq.question_id ? questions[mq.question_id] : undefined;
                const ok = mq.selected_option === mq.correct_option;
                return (
                  <details key={mq.id} className="rounded-xl border p-3">
                    <summary className="flex cursor-pointer list-none items-center gap-2 text-sm">
                      {!mq.selected_option ? <Minus size={15} className="text-muted" /> : ok ? <Check size={15} className="text-primary" /> : <X size={15} className="text-alert" />}
                      <span className="font-medium">Questão {mq.position + 1}</span>
                      <span className="text-muted">{byId.get(mq.subject_id ?? "")?.short_name}</span>
                      <span className="ml-auto text-xs">sua: <b>{mq.selected_option ?? "—"}</b> · gabarito: <b>{mq.correct_option}</b></span>
                    </summary>
                    {q ? (
                      <div className="mt-3 space-y-2 text-sm">
                        <p className="whitespace-pre-line leading-relaxed">{q.statement}</p>
                        <ul className="space-y-1">{(["A", "B", "C", "D", "E"] as const).map((o) => (
                          <li key={o} className={cn("rounded-lg px-2 py-1", o === mq.correct_option && "bg-primary-soft text-primary", o === mq.selected_option && !ok && "bg-alert-soft text-alert")}><b>{o})</b> {optionText(q, o)}</li>
                        ))}</ul>
                        {q.explanation && <p className="rounded-lg bg-surface-2 p-2"><b>Comentário:</b> {q.explanation}</p>}
                      </div>
                    ) : <p className="mt-2 text-sm text-muted">Questão excluída do banco.</p>}
                  </details>
                );
              })}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
export default function ResultPage() { return <Suspense><ResultInner /></Suspense>; }
