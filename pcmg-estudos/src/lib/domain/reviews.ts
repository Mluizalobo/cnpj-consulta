import type { DateKey, ReviewItem, StudySession } from "../types";
import { addDaysKey, diffDays, weekdayOf } from "./dates";
import { stableId } from "./ids";

/** Se a data cair em dia de descanso (ex.: domingo), passa para o próximo dia de estudo. */
export function adjustToStudyDay(date: DateKey, restWeekdays: number[] = [0]): DateKey {
  let d = date;
  for (let i = 0; i < 7 && restWeekdays.includes(weekdayOf(d)); i++) d = addDaysKey(d, 1);
  return d;
}

export const reviewId = (sessionId: string, interval: number) => stableId("review", sessionId, interval);

export interface ReviewOptions { intervals: number[]; restWeekdays: number[]; userId: string; nowIso: string }

/** Gera revisões D+1, D+7, D+30 (ou intervalos configurados) para uma sessão concluída. */
export function buildReviewsForSession(
  session: Pick<StudySession, "id" | "date" | "subject_id" | "topic"> & { syllabus_topic_id?: string | null },
  opts: ReviewOptions,
  existing: Pick<ReviewItem, "id">[] = [],
): ReviewItem[] {
  const existingIds = new Set(existing.map((r) => r.id));
  const intervals = [...new Set(opts.intervals.filter((n) => Number.isFinite(n) && n > 0))].sort((a, b) => a - b);
  return intervals
    .map((interval) => {
      const id = reviewId(session.id, interval);
      const due = adjustToStudyDay(addDaysKey(session.date, interval), opts.restWeekdays);
      return {
        id, user_id: opts.userId, created_at: opts.nowIso, updated_at: opts.nowIso,
        session_id: session.id, subject_id: session.subject_id, syllabus_topic_id: session.syllabus_topic_id ?? null, topic: session.topic,
        interval_days: interval, base_date: session.date, original_due_date: due, due_date: due,
        status: "pendente", completed_at: null, reschedule_count: 0,
      } satisfies ReviewItem;
    })
    .filter((r) => !existingIds.has(r.id));
}

export type ReviewState = "concluida" | "atrasada" | "hoje" | "futura";
export function reviewState(r: Pick<ReviewItem, "status" | "due_date">, today: DateKey): ReviewState {
  if (r.status === "concluida") return "concluida";
  const d = diffDays(r.due_date, today);
  if (d < 0) return "atrasada";
  if (d === 0) return "hoje";
  return "futura";
}

/**
 * Redistribui revisões pendentes (atrasadas/acumuladas) a partir de hoje,
 * respeitando um limite diário e os dias de descanso. Não apaga nada:
 * só altera a data prevista (a data original fica registrada).
 */
export function redistributeReviews<T extends Pick<ReviewItem, "id" | "due_date" | "original_due_date">>(
  reviews: T[], today: DateKey, maxPerDay: number, restWeekdays: number[] = [0],
  alreadyScheduled: Record<DateKey, number> = {},
): { id: string; due_date: DateKey }[] {
  const per = Math.max(1, maxPerDay);
  const ordered = [...reviews].sort((a, b) => a.original_due_date.localeCompare(b.original_due_date) || a.due_date.localeCompare(b.due_date));
  const load: Record<DateKey, number> = { ...alreadyScheduled };
  const out: { id: string; due_date: DateKey }[] = [];
  let day = adjustToStudyDay(today, restWeekdays);
  for (const r of ordered) {
    let guard = 0;
    while ((load[day] ?? 0) >= per && guard++ < 3650) day = adjustToStudyDay(addDaysKey(day, 1), restWeekdays);
    load[day] = (load[day] ?? 0) + 1;
    out.push({ id: r.id, due_date: day });
  }
  return out;
}
