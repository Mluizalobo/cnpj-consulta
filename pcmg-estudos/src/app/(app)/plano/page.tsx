"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { addMonths, endOfMonth, startOfMonth } from "date-fns";
import { Check, ChevronLeft, ChevronRight, Circle, ClipboardCheck, Repeat, Settings2 } from "lucide-react";
import { useApp, useRows, useSettings, useSubjects } from "@/components/app/context";
import { Badge, Card, CardBody, CardHeader, PageHeader, Segmented } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { usePlanFor } from "@/components/shared/derived";
import { DaySessions } from "@/components/today/day-sessions";
import { addDaysKey, fmt, formatDuration, fromKey, toKey, weekDays, weekStartKey, WEEKDAY_SHORT } from "@/lib/domain/dates";
import { finalStretchStart, getPhase, PHASE_INFO } from "@/lib/domain/phases";
import { secondsByDay } from "@/lib/domain/stats";
import { attemptDate } from "@/lib/domain/stats";

export default function PlanPage() {
  const { actions } = useApp();
  const settings = useSettings()!;
  const today = actions.today();
  const [view, setView] = useState<"semana" | "mes">("semana");
  const [anchor, setAnchor] = useState(today);
  const [selected, setSelected] = useState<string | null>(null);
  const sessions = useRows("study_sessions");
  const reviews = useRows("review_schedule");
  const mocks = useRows("mock_exams");
  const { byId } = useSubjects();
  const secByDay = useMemo(() => secondsByDay(sessions), [sessions]);

  const days = useMemo(() => {
    if (view === "semana") return weekDays(anchor);
    const s = startOfMonth(fromKey(anchor)), e = endOfMonth(fromKey(anchor));
    const first = weekStartKey(toKey(s));
    const out: string[] = [];
    for (let d = first; d <= toKey(e) || out.length % 7 !== 0; d = addDaysKey(d, 1)) out.push(d);
    return out;
  }, [view, anchor]);
  const plan = usePlanFor(days);
  const reviewsByDay = useMemo(() => {
    const m: Record<string, { pending: number; done: number }> = {};
    for (const r of reviews) {
      const d = r.status === "concluida" && r.completed_at ? attemptDate({ answered_at: r.completed_at }) : r.due_date;
      m[d] ??= { pending: 0, done: 0 };
      if (r.status === "concluida") m[d].done++; else m[d].pending++;
    }
    return m;
  }, [reviews]);
  const mocksByDay = useMemo(() => {
    const m: Record<string, number> = {};
    for (const x of mocks) { const d = attemptDate({ answered_at: x.started_at }); m[d] = (m[d] ?? 0) + 1; }
    return m;
  }, [mocks]);
  const extraByDay = useMemo(() => {
    const m: Record<string, typeof sessions> = {};
    for (const s of sessions) if (!s.slot_key) (m[s.date] ??= []).push(s);
    return m;
  }, [sessions]);

  const move = (n: number) => setAnchor(view === "semana" ? addDaysKey(anchor, n * 7) : toKey(addMonths(fromKey(anchor), n)));
  const title = view === "semana" ? `${fmt(days[0], "d MMM")} – ${fmt(days[6], "d MMM yyyy")}` : fmt(anchor, "MMMM 'de' yyyy");
  const fs = finalStretchStart(settings);
  const sel = selected ?? (view === "semana" ? null : null);

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader title="Plano de estudos" description="12 horas semanais · domingo livre"
        action={<Link href="/configuracoes#planejamento"><Button variant="outline" size="sm"><Settings2 size={15} /> Editar distribuição</Button></Link>} />

      <Card>
        <CardBody className="grid gap-3 sm:grid-cols-3">
          {([1, 2, 3] as const).map((p) => {
            const current = getPhase(today, settings) === p;
            const range = p === 1 ? `${fmt(settings.study_start_date, "dd/MM/yy")} até o edital${settings.edital_date ? ` (${settings.edital_published ? "" : "prev. "}${fmt(settings.edital_date, "dd/MM/yy")})` : ""}`
              : p === 2 ? `edital até 6 semanas antes da prova` : fs ? `a partir de ${fmt(fs, "dd/MM/yy")}` : "6 semanas finais";
            return (
              <div key={p} className={cn("rounded-xl border p-3", current && "border-primary bg-primary-soft/60")}>
                <div className="flex items-center gap-2 text-sm font-semibold">{PHASE_INFO[p].name}{current && <Badge tone="primary">atual</Badge>}</div>
                <p className="mt-1 text-xs text-muted">{range}</p>
                <p className="mt-1.5 text-xs">{PHASE_INFO[p].goal}</p>
              </div>
            );
          })}
        </CardBody>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented value={view} onChange={(v) => { setView(v); setSelected(null); }} options={[{ value: "semana", label: "Semana" }, { value: "mes", label: "Mês" }]} />
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => move(-1)} aria-label="Anterior"><ChevronLeft size={18} /></Button>
          <span className="min-w-[150px] text-center text-sm font-medium first-letter:uppercase">{title}</span>
          <Button variant="ghost" size="icon" onClick={() => move(1)} aria-label="Próximo"><ChevronRight size={18} /></Button>
          {anchor !== today && <Button variant="ghost" size="sm" onClick={() => setAnchor(today)}>Hoje</Button>}
        </div>
      </div>

      {view === "semana" ? (
        <div className="grid gap-2.5 md:grid-cols-7">
          {days.map((d) => {
            const items = plan[d] ?? [];
            const done = items.filter((x) => x.session?.status === "concluida").length;
            const past = d < today;
            const rv = reviewsByDay[d];
            return (
              <button key={d} type="button" onClick={() => setSelected(d === selected ? null : d)}
                className={cn("rounded-2xl border bg-surface p-3 text-left shadow-card transition-colors hover:border-primary/40 md:min-h-[180px]", d === today && "ring-2 ring-primary/40", selected === d && "border-primary")}>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold">{WEEKDAY_SHORT[fromKey(d).getDay()]} <span className="font-normal text-muted">{fmt(d, "dd/MM")}</span></span>
                  {secByDay[d] ? <span className="tnum text-xs text-primary">{formatDuration(secByDay[d], { short: true })}</span> : null}
                </div>
                <ul className="mt-2 space-y-1.5">
                  {items.length === 0 && <li className="text-xs text-muted">Livre</li>}
                  {items.map(({ item, session }) => (
                    <li key={item.key} className="flex items-center gap-1.5 text-xs">
                      {session?.status === "concluida" ? <Check size={13} className="shrink-0 text-primary" /> : <Circle size={11} className={cn("shrink-0", past ? "text-alert" : "text-muted")} />}
                      <span className="truncate" style={{ color: item.subjectId ? byId.get(item.subjectId)?.color : undefined }}>{item.subjectId ? byId.get(item.subjectId)?.short_name : item.label}</span>
                    </li>
                  ))}
                  {(extraByDay[d] ?? []).filter((s) => s.activity !== "revisao").map((s) => <li key={s.id} className="flex items-center gap-1.5 text-xs text-muted"><Check size={13} className="text-primary" />{s.label ?? "Avulsa"}</li>)}
                </ul>
                <div className="mt-2 flex flex-wrap gap-1">
                  {items.length > 0 && <Badge tone={done === items.length ? "primary" : "neutral"}>{done}/{items.length}</Badge>}
                  {rv && (rv.pending > 0 || rv.done > 0) && <Badge tone={rv.pending && past ? "alert" : "outline"}><Repeat size={10} />{rv.done}/{rv.done + rv.pending}</Badge>}
                  {mocksByDay[d] && <Badge tone="warn"><ClipboardCheck size={10} />simulado</Badge>}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <Card className="p-2 sm:p-3">
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted">{[1, 2, 3, 4, 5, 6, 0].map((w) => <div key={w} className="py-1">{WEEKDAY_SHORT[w]}</div>)}</div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((d) => {
              const inMonth = d.slice(0, 7) === anchor.slice(0, 7);
              const items = plan[d] ?? [];
              const done = items.filter((x) => x.session?.status === "concluida").length;
              const sec = secByDay[d] ?? 0;
              const intensity = Math.min(1, sec / ((settings.daily_goal_minutes || 120) * 60));
              return (
                <button key={d} type="button" onClick={() => setSelected(d)} aria-label={fmt(d, "d 'de' MMMM")}
                  className={cn("flex aspect-square flex-col items-center justify-center rounded-lg text-sm transition-colors sm:aspect-auto sm:h-16", !inMonth && "opacity-35", d === today && "ring-2 ring-primary/50", selected === d && "outline outline-2 outline-primary")}
                  style={{ background: sec ? `rgb(var(--primary) / ${0.12 + intensity * 0.5})` : undefined }}>
                  <span className={cn("tnum", intensity > 0.6 && "font-semibold")}>{fromKey(d).getDate()}</span>
                  <span className="mt-0.5 flex gap-0.5">
                    {items.map((x) => <span key={x.item.key} className={cn("h-1 w-1 rounded-full", x.session?.status === "concluida" ? "bg-primary" : d < today ? "bg-alert/70" : "bg-muted/50")} />)}
                    {mocksByDay[d] ? <span className="h-1 w-1 rounded-full bg-warn" /> : null}
                  </span>
                  {sec > 0 && <span className="tnum hidden text-[10px] text-muted sm:block">{formatDuration(sec, { short: true })}</span>}
                  {done > 0 && done === items.length && <span className="sr-only">dia completo</span>}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-3 px-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" /> concluída</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-alert/70" /> não feita</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-muted/50" /> prevista</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-warn" /> simulado</span>
            <span>cor do dia = horas estudadas</span>
          </div>
        </Card>
      )}

      {sel && (
        <div className="space-y-3 animate-fade-in">
          <h2 className="text-base font-semibold first-letter:uppercase">{fmt(sel, "EEEE, d 'de' MMMM")}</h2>
          <DaySessions rows={plan[sel] ?? []} isToday={sel === today} />
          {(extraByDay[sel] ?? []).length > 0 && (
            <Card>
              <CardHeader title="Outros registros do dia" />
              <ul className="divide-y px-4 pb-2 pt-2 sm:px-5">
                {(extraByDay[sel] ?? []).map((s) => (
                  <li key={s.id} className="flex items-center justify-between py-2.5 text-sm">
                    <span>{s.label ?? "Estudo avulso"}{s.topic ? <span className="text-muted"> · {s.topic}</span> : null}</span>
                    <span className="tnum text-muted">{formatDuration(s.total_seconds)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
