"use client";
import Link from "next/link";
import { useMemo } from "react";
import { CalendarCheck, Flame, Hourglass, Lightbulb, Repeat, Target, TrendingUp, Radar } from "lucide-react";
import { useApp, useRows, useSettings, useSubjects } from "@/components/app/context";
import { Badge, Card, Progress, Stat } from "@/components/ui/primitives";
import { cn } from "@/components/ui/cn";
import { TimerPanel } from "@/components/timer/timer-panel";
import { DaySessions } from "@/components/today/day-sessions";
import { ReviewsCard } from "@/components/today/reviews-card";
import { usePlanFor } from "@/components/shared/derived";
import { fmt, formatDuration, greeting, weekEndKey, weekStartKey } from "@/lib/domain/dates";
import { daysUntilExam, getPhase, PHASE_INFO } from "@/lib/domain/phases";
import { progressRatio, secondsByDay, streak, studiedDays, sumSecondsBetween } from "@/lib/domain/stats";
import { weeklyPlannedMinutes } from "@/lib/domain/plan";
import { recommendations } from "@/lib/monitor/adaptive";
import { QUOTES } from "@/lib/seed/defaults";

export default function TodayPage() {
  const { actions } = useApp();
  const settings = useSettings()!;
  const today = actions.today();
  const sessions = useRows("study_sessions");
  const reviews = useRows("review_schedule");
  const attempts = useRows("question_attempts");
  const topics = useRows("syllabus_topics");
  const notes = useRows("error_notebook");
  const updates = useRows("competition_updates");
  const plan = useRows("study_plan");
  const { all } = useSubjects();
  const dates = useMemo(() => [today], [today]);
  const rows = usePlanFor(dates)[today] ?? [];

  const phase = getPhase(today, settings);
  const days = daysUntilExam(today, settings);
  const byDay = useMemo(() => secondsByDay(sessions), [sessions]);
  const todaySec = byDay[today] ?? 0;
  const weekSec = sumSecondsBetween(sessions, weekStartKey(today), weekEndKey(today));
  const weekGoal = weeklyPlannedMinutes(plan) * 60;
  const streakN = useMemo(() => streak(studiedDays(sessions), today, settings.rest_weekdays), [sessions, today, settings.rest_weekdays]);
  const pendingReviews = reviews.filter((r) => r.status === "pendente" && r.due_date <= today).length;
  const recs = useMemo(() => {
    const newEditalTopics = topics.filter((t) => t.origin === "edital" && t.in_current_edital && t.status === "nao_estudado").length;
    return recommendations({ subjects: all, attempts, topics, reviews, notes, settings, today, boardName: settings.exam_board, newEditalTopics: settings.edital_published ? newEditalTopics : 0 });
  }, [all, attempts, topics, reviews, notes, settings, today]);
  const dayNum = Number(today.replaceAll("-", ""));
  const shownRecs = recs.length > 2 ? [recs[dayNum % recs.length], recs[(dayNum + 1) % recs.length]] : recs;
  const pendingEdital = updates.some((u) => u.kind === "edital_publicado" && u.reliability === "confirmado") && !settings.applied_version_id;

  return (
    <div className="space-y-4 animate-fade-in">
      <section className="pb-1">
        <p className="text-sm text-muted first-letter:uppercase">{fmt(new Date(), "EEEE, d 'de' MMMM")}</p>
        <h1 className="mt-0.5 text-[26px] font-semibold tracking-tight">{greeting()}!</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge tone="primary">{PHASE_INFO[phase].name}</Badge>
          {days === null ? <Badge>Data da prova a definir</Badge>
            : days >= 0 ? <Badge tone={days <= 42 ? "warn" : "neutral"} data-testid="countdown"><Hourglass size={12} />{days === 0 ? "A prova é hoje!" : `${days} dias para a prova`}{!settings.exam_date_confirmed && " (previsão)"}</Badge>
            : <Badge>Prova realizada</Badge>}
        </div>
      </section>

      {pendingEdital && (
        <Link href="/concurso" className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary-soft p-4 text-primary">
          <Radar size={20} className="shrink-0" />
          <span className="text-sm font-medium">Edital oficial publicado! Veja o que mudou e atualize seu plano com um clique.</span>
        </Link>
      )}

      <section className="grid grid-cols-3 gap-2.5 sm:gap-3 lg:grid-cols-4" aria-label="Resumo do dia">
        <Card className="col-span-3 p-4 lg:col-span-1">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted"><Target size={14} /> Hoje</div>
          <div className="tnum mt-1.5 text-2xl font-semibold tracking-tight" data-testid="today-time">{formatDuration(todaySec, { short: true })}<span className="text-sm font-normal text-muted"> / {formatDuration(settings.daily_goal_minutes * 60, { short: true })}</span></div>
          <Progress value={progressRatio(todaySec, settings.daily_goal_minutes * 60)} className="mt-2.5" label="Meta diária" />
        </Card>
        <Stat label="Revisões" icon={<Repeat size={14} />} value={pendingReviews} hint={pendingReviews ? "pendentes" : "em dia"} />
        <Card className="p-3.5 sm:p-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted"><CalendarCheck size={14} /> Semana</div>
          <div className="tnum mt-1.5 text-xl font-semibold tracking-tight sm:text-2xl">{Math.round(progressRatio(weekSec, weekGoal) * 100)}%</div>
          <div className="mt-1 truncate text-xs text-muted">{formatDuration(weekSec, { short: true })} de {formatDuration(weekGoal, { short: true })}</div>
        </Card>
        <Stat label="Sequência" icon={<Flame size={14} />} value={`${streakN} dia${streakN === 1 ? "" : "s"}`} hint="seguidos" />
      </section>

      <TimerPanel />

      {shownRecs.length > 0 && (
        <section className="space-y-2" aria-label="Recomendações">
          {shownRecs.map((r) => (
            <Card key={r.id} className={cn("flex items-start gap-3 p-3.5", r.tone === "alerta" && "border-alert/25", r.tone === "positivo" && "border-primary/25")}>
              {r.tone === "positivo" ? <TrendingUp size={17} className="mt-0.5 shrink-0 text-primary" /> : <Lightbulb size={17} className={cn("mt-0.5 shrink-0", r.tone === "alerta" ? "text-alert" : "text-warn")} />}
              <p className="flex-1 text-sm">{r.text}</p>
              {r.link && <Link href={r.link} className="shrink-0 text-sm font-medium text-primary">Ver</Link>}
            </Card>
          ))}
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <DaySessions rows={rows} />
        <ReviewsCard />
      </div>

      {settings.show_quotes && <p className="pt-2 text-center text-sm italic text-muted">“{QUOTES[dayNum % QUOTES.length]}”</p>}
    </div>
  );
}
