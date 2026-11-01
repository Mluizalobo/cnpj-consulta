"use client";
import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, CalendarDays, CheckCircle2, Clock, Flame, Library, Repeat2, Trophy } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useApp, useRows, useSettings, useSubjects, useTable } from "@/components/app/context";
import { Badge, Card, CardBody, CardHeader, PageHeader, Segmented, Select, Stat } from "@/components/ui/primitives";
import { cn } from "@/components/ui/cn";
import { useChartColors } from "@/components/shared/chart-colors";
import { addDaysKey, formatDuration, hoursLabel, weekStartKey, fmt } from "@/lib/domain/dates";
import { accuracyBySubject, band, BAND_LABEL, filterAttempts, overallAccuracy, pct, streak, studiedDays, sumSecondsBetween, type ModeFilter } from "@/lib/domain/stats";
import { difficultTopics, difficultyBreakdown, difficultyGaps, firstVsLater, repeatedErrors, subjectErrorRanking, timeSeries, TREND_LABEL, type Trend } from "@/lib/domain/analytics";
import { DIFF_LABEL } from "@/components/questions/labels";

const TrendIcon = ({ t }: { t: Trend }) => t === "melhorando" ? <ArrowUpRight size={14} className="text-primary" /> : t === "piorando" ? <ArrowDownRight size={14} className="text-alert" /> : <ArrowRight size={14} className="text-muted" />;

export default function PerformancePage() {
  const { actions } = useApp();
  const settings = useSettings()!;
  const sessions = useRows("study_sessions");
  const attempts = useRows("question_attempts");
  const mocks = useRows("mock_exams");
  const questions = useTable("questions");
  const { all, byId } = useSubjects();
  const c = useChartColors();
  const today = actions.today();
  const [period, setPeriod] = useState<"7" | "30" | "todo">("30");
  const [mode, setMode] = useState<ModeFilter>("todos");
  const [granularity, setGranularity] = useState<"semana" | "mes">("semana");
  const [seriesSubject, setSeriesSubject] = useState("");
  const target = settings.target_accuracy;
  const since = period === "todo" ? null : addDaysKey(today, -(Number(period) - 1));
  const filtered = useMemo(() => filterAttempts(attempts, { since, mode }), [attempts, since, mode]);

  const totalSec = sessions.reduce((s, x) => s + x.total_seconds, 0);
  const weekSec = sumSecondsBetween(sessions, weekStartKey(today), today);
  const monthSec = sumSecondsBetween(sessions, today.slice(0, 8) + "01", today);
  const days = studiedDays(sessions);
  const streakN = streak(days, today, settings.rest_weekdays);
  const overall = overallAccuracy(attempts, { since, mode });
  const doneMocks = mocks.filter((m) => m.status === "finalizado").sort((a, b) => (a.finished_at ?? "").localeCompare(b.finished_at ?? ""));

  const bySubject = useMemo(() => {
    const acc = accuracyBySubject(attempts, { since, mode });
    return all.filter((s) => s.active || acc[s.id]).map((s) => ({ id: s.id, name: s.short_name, answered: acc[s.id]?.answered ?? 0, correct: acc[s.id]?.correct ?? 0, pct: acc[s.id]?.pct ?? null }))
      .map((r) => ({ ...r, band: band(r.pct, target), value: r.pct === null ? 0 : Math.max(r.pct, 1) }));
  }, [all, attempts, since, mode, target]);
  const critical = bySubject.filter((r) => r.band === "critico");
  const series = useMemo(() => timeSeries(filterAttempts(attempts, { mode }) as never, granularity, { subjectId: seriesSubject || null, today }), [attempts, mode, granularity, seriesSubject, today]);
  const weeksHours = useMemo(() => Array.from({ length: 8 }, (_, i) => {
    const start = addDaysKey(weekStartKey(today), -7 * (7 - i));
    return { label: fmt(start, "dd/MM"), horas: Math.round((sumSecondsBetween(sessions, start, addDaysKey(start, 6)) / 3600) * 10) / 10 };
  }), [sessions, today]);
  const mockSeries = doneMocks.map((m, i) => ({ n: `#${i + 1}`, pct: pct(m.correct_count ?? 0, m.total_questions) }));

  const ranking = useMemo(() => subjectErrorRanking(filtered as never, 3), [filtered]);
  const hardTopics = useMemo(() => difficultTopics(filtered as never, target, 3).slice(0, 8), [filtered, target]);
  const repeated = useMemo(() => repeatedErrors(attempts as never).slice(0, 8), [attempts]);
  const fvl = useMemo(() => firstVsLater(attempts as never), [attempts]);
  const gaps = useMemo(() => difficultyGaps(filtered as never).slice(0, 6), [filtered]);
  const diff = useMemo(() => difficultyBreakdown(filtered as never), [filtered]);
  const tip = { borderRadius: 12, border: `1px solid ${c.grid}`, background: c.surface, fontSize: 13 };
  const modeLabel = mode === "todos" ? "treino + simulados" : mode === "treino" ? "somente treino" : "somente simulados";

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader title="Desempenho" description={`Meta de acertos: ${target}% · questões não respondidas nunca contam como erro`} />
      <div className="flex flex-wrap gap-2">
        <Segmented size="sm" value={period} onChange={setPeriod} options={[{ value: "7", label: "7 dias" }, { value: "30", label: "30 dias" }, { value: "todo", label: "Todo o período" }]} />
        <Segmented size="sm" value={mode} onChange={setMode} options={[{ value: "todos", label: "Tudo" }, { value: "treino", label: "Treino" }, { value: "simulado", label: "Simulados" }]} />
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total estudado" icon={<Clock size={14} />} value={hoursLabel(totalSec)} hint={`semana ${formatDuration(weekSec, { short: true })} · mês ${formatDuration(monthSec, { short: true })}`} />
        <Stat label="Dias estudados" icon={<CalendarDays size={14} />} value={days.size} hint={<span className="inline-flex items-center gap-1"><Flame size={12} /> sequência de {streakN}</span>} />
        <Stat label="Questões respondidas" icon={<Library size={14} />} value={overall.answered} hint={modeLabel} />
        <Stat label="Acertos" icon={<CheckCircle2 size={14} />} value={overall.pct === null ? "—" : `${overall.pct.toLocaleString("pt-BR")}%`} hint={`${doneMocks.length} simulado${doneMocks.length === 1 ? "" : "s"} realizados`} />
      </section>

      <Card>
        <CardHeader title="Acertos por matéria" description={`${modeLabel} · ${period === "todo" ? "todo o período" : `últimos ${period} dias`} · tracejado = meta`} />
        <CardBody>
          {critical.length > 0 && <p className="mb-3 rounded-xl bg-alert-soft px-3 py-2 text-sm text-alert">Abaixo de 50%: <b>{critical.map((r) => r.name).join(", ")}</b>. Vale reforçar a teoria e refazer os erros.</p>}
          <div style={{ height: Math.max(220, bySubject.length * 30) }} role="img" aria-label="Percentual de acertos por matéria">
            <ResponsiveContainer>
              <BarChart data={bySubject} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }} barCategoryGap={6}>
                <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fill: c.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={118} tick={{ fill: c.axis, fontSize: 12 }} axisLine={false} tickLine={false} />
                <ReferenceLine x={target} stroke={c.ref} strokeDasharray="4 4" />
                <ReferenceLine x={50} stroke={c.grid} />
                <Tooltip cursor={{ fill: c.grid, opacity: 0.4 }} contentStyle={tip} formatter={(_v, _n, p) => [p.payload.pct === null ? "sem questões respondidas" : `${p.payload.pct}% (${p.payload.correct}/${p.payload.answered}) · ${BAND_LABEL[p.payload.band as keyof typeof BAND_LABEL]}`, "Acertos"]} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={18}>{bySubject.map((r) => <Cell key={r.id} fill={c[r.band]} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted">
            {(["critico", "desenvolvimento", "meta"] as const).map((b) => <span key={b} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: c[b] }} />{BAND_LABEL[b]} {b === "critico" ? "(< 50%)" : b === "desenvolvimento" ? `(50–${target}%)` : `(≥ ${target}%)`}</span>)}
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm" data-testid="subject-table">
              <thead className="text-left text-xs text-muted"><tr><th className="py-1.5">Matéria</th><th>Respondidas</th><th>Acertos</th><th>%</th><th>Situação</th></tr></thead>
              <tbody className="divide-y">{bySubject.map((r) => (
                <tr key={r.id}><td className="py-1.5">{r.name}</td><td className="tnum">{r.answered}</td><td className="tnum">{r.correct}</td><td className="tnum">{r.pct === null ? "—" : `${r.pct}%`}{r.answered > 0 && r.answered < 10 && <span className="ml-1 text-[11px] text-muted">(amostra pequena)</span>}</td>
                  <td><Badge tone={r.band === "meta" ? "primary" : r.band === "critico" ? "alert" : r.band === "sem_dados" ? "neutral" : "warn"}>{BAND_LABEL[r.band]}</Badge></td></tr>
              ))}</tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Evolução de acertos e erros" description={`${modeLabel}${seriesSubject ? ` · ${byId.get(seriesSubject)?.short_name}` : " · todas as matérias"}`} />
        <CardBody className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Segmented size="sm" value={granularity} onChange={setGranularity} options={[{ value: "semana", label: "Semanal" }, { value: "mes", label: "Mensal" }]} />
            <Select value={seriesSubject} onChange={(e) => setSeriesSubject(e.target.value)} className="h-9 w-auto text-sm" aria-label="Matéria do gráfico"><option value="">Todas as matérias</option>{all.map((s) => <option key={s.id} value={s.id}>{s.short_name}</option>)}</Select>
          </div>
          <div className="h-60" role="img" aria-label="Acertos e erros por período">
            <ResponsiveContainer>
              <BarChart data={series} margin={{ top: 8, right: 8, left: -20, bottom: 0 }} barCategoryGap="28%">
                <CartesianGrid stroke={c.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: c.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: c.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: c.grid, opacity: 0.4 }} contentStyle={tip} formatter={(v, n) => [v, n]} labelFormatter={(l, p) => `${granularity === "semana" ? "Semana de " : ""}${l}${p?.[0]?.payload?.pct !== null && p?.[0]?.payload?.pct !== undefined ? ` · ${p[0].payload.pct}% de acertos` : ""}`} />
                <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12, color: c.axis }} />
                <Bar dataKey="correct" name="Acertos" stackId="a" fill={c.meta} maxBarSize={28} />
                <Bar dataKey="wrong" name="Erros" stackId="a" fill={c.critico} radius={[4, 4, 0, 0]} maxBarSize={28} stroke={c.surface} strokeWidth={1} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Horas por semana" description="Últimas 8 semanas · todas as sessões" />
          <CardBody>
            <div className="h-48" role="img" aria-label="Horas estudadas por semana">
              <ResponsiveContainer>
                <BarChart data={weeksHours} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                  <CartesianGrid stroke={c.grid} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: c.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: c.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <ReferenceLine y={12} stroke={c.ref} strokeDasharray="4 4" label={{ value: "12 h", fill: c.axis, fontSize: 11, position: "insideTopRight" }} />
                  <Tooltip cursor={{ fill: c.grid, opacity: 0.4 }} contentStyle={tip} formatter={(v) => [`${v} h`, "Estudo"]} labelFormatter={(l) => `Semana de ${l}`} />
                  <Bar dataKey="horas" fill={c.line} radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Notas nos simulados" description="Percentual de acertos por simulado" />
          <CardBody>
            {mockSeries.length === 0 ? <p className="py-10 text-center text-sm text-muted">Nenhum simulado finalizado ainda.</p> : (
              <div className="h-48" role="img" aria-label="Evolução das notas nos simulados">
                <ResponsiveContainer>
                  <LineChart data={mockSeries} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke={c.grid} vertical={false} />
                    <XAxis dataKey="n" tick={{ fill: c.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} unit="%" tick={{ fill: c.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <ReferenceLine y={target} stroke={c.ref} strokeDasharray="4 4" />
                    <Tooltip contentStyle={tip} formatter={(v) => [`${v}%`, "Nota"]} />
                    <Line dataKey="pct" stroke={c.line} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: c.surface }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <h2 className="pt-2 text-lg font-semibold">Análise de acertos e erros</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Matérias com mais erros" description="Mín. 3 respostas · tendência compara 1ª e 2ª metade das tentativas" />
          <CardBody>
            {ranking.length === 0 ? <p className="text-sm text-muted">Responda mais questões para ver a análise.</p> : (
              <ul className="space-y-2">{ranking.slice(0, 8).map((r) => (
                <li key={r.key} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 truncate">{byId.get(r.subjectId ?? "")?.short_name ?? "—"}</span>
                  <span className="tnum text-xs text-muted">{r.wrong} erro{r.wrong === 1 ? "" : "s"} / {r.answered}</span>
                  <Badge tone={band(r.pct, target) === "critico" ? "alert" : band(r.pct, target) === "meta" ? "primary" : "warn"}>{r.pct}%</Badge>
                  <span className="inline-flex w-24 items-center gap-1 text-xs text-muted"><TrendIcon t={r.trend} />{TREND_LABEL[r.trend]}</span>
                </li>
              ))}</ul>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Assuntos com dificuldade" description={`Abaixo de ${target}% (mín. 3 respostas)`} />
          <CardBody>
            {hardTopics.length === 0 ? <p className="text-sm text-muted">Nenhum assunto abaixo da meta com amostra suficiente.</p> : (
              <ul className="space-y-2">{hardTopics.map((t) => (
                <li key={t.key} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1"><span className="block truncate">{t.topic}</span><span className="text-xs text-muted">{byId.get(t.subjectId ?? "")?.short_name}</span></span>
                  <span className="tnum text-xs text-muted">{t.correct}/{t.answered}</span>
                  <Badge tone={(t.pct ?? 0) < 50 ? "alert" : "warn"}>{t.pct}%</Badge>
                </li>
              ))}</ul>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Questões que erro repetidamente" description="2 ou mais erros na mesma questão" />
          <CardBody>
            {repeated.length === 0 ? <p className="text-sm text-muted">Nenhuma questão errada mais de uma vez.</p> : (
              <ul className="space-y-2">{repeated.map((r) => (
                <li key={r.questionId} className="flex items-start gap-2 text-sm">
                  <Repeat2 size={15} className="mt-0.5 shrink-0 text-alert" />
                  <span className="line-clamp-2 flex-1">{questions[r.questionId]?.statement ?? "Questão excluída"}</span>
                  <Badge tone="alert">{r.errors}×</Badge>
                </li>
              ))}</ul>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Primeira tentativa × posteriores" description="Questões respondidas 2+ vezes (inclui revisões do caderno)" />
          <CardBody>
            {fvl.questions === 0 ? <p className="text-sm text-muted">Refaça questões (por exemplo, no caderno de erros) para medir sua evolução real.</p> : (
              <div className="flex items-center gap-4">
                <div className="text-center"><div className="text-xs text-muted">1ª tentativa</div><div className="tnum text-2xl font-semibold">{fvl.first}%</div></div>
                <ArrowRight className="text-muted" />
                <div className="text-center"><div className="text-xs text-muted">Depois</div><div className="tnum text-2xl font-semibold">{fvl.later}%</div></div>
                <Badge tone={(fvl.delta ?? 0) >= 5 ? "primary" : (fvl.delta ?? 0) <= -5 ? "alert" : "neutral"} className="ml-auto">{(fvl.delta ?? 0) >= 0 ? "+" : ""}{fvl.delta} p.p. · {fvl.questions} questões</Badge>
              </div>
            )}
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Por dificuldade" description="Onde você acerta as fáceis mas erra as médias e difíceis" />
          <CardBody className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {(["facil", "medio", "dificil"] as const).map((d) => (
                <div key={d} className="rounded-xl border p-3 text-center">
                  <div className="text-xs text-muted">{DIFF_LABEL[d]}</div>
                  <div className="tnum text-xl font-semibold">{diff[d].pct === null ? "—" : `${diff[d].pct}%`}</div>
                  <div className="tnum text-xs text-muted">{diff[d].correct}/{diff[d].answered}</div>
                </div>
              ))}
            </div>
            {gaps.length === 0 ? <p className="text-sm text-muted">Nenhum assunto com essa lacuna detectada (precisa de pelo menos 2 fáceis e 2 médias/difíceis).</p> : (
              <ul className="space-y-1.5 text-sm">{gaps.map((g) => (
                <li key={g.topic + g.subjectId} className={cn("flex flex-wrap items-center gap-2")}>
                  <Trophy size={14} className="text-warn" /><b>{g.topic}</b><span className="text-muted">({byId.get(g.subjectId ?? "")?.short_name})</span>
                  <span>fáceis {g.easyPct}% · médias/difíceis <span className="text-alert">{g.hardPct}%</span></span>
                </li>
              ))}</ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
