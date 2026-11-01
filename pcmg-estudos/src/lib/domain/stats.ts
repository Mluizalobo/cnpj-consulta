import type { DateKey, ErrorNote, QuestionAttempt, StudySession } from "../types";
import { addDaysKey, diffDays, weekdayOf } from "./dates";
import type { SubjectAccuracy } from "./plan";

/** Percentual com 1 casa decimal; null quando não há questões respondidas. */
export function pct(correct: number, total: number): number | null {
  if (!total || total <= 0) return null;
  return Math.round((correct / total) * 1000) / 10;
}

export type ModeFilter = "treino" | "simulado" | "todos";
export interface AttemptFilter { since?: DateKey | null; mode?: ModeFilter }

export const attemptDate = (a: Pick<QuestionAttempt, "answered_at">): DateKey => {
  const d = new Date(a.answered_at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function filterAttempts<T extends Pick<QuestionAttempt, "answered_at" | "mode" | "selected_option">>(attempts: T[], f: AttemptFilter = {}): T[] {
  return attempts.filter((a) => {
    if (a.selected_option === null) return false; // só questões efetivamente respondidas
    // "todos" = treino + simulado. Revisões do caderno de erros ficam à parte (não recontam o erro original).
    if (a.mode === "revisao") return false;
    if (f.mode && f.mode !== "todos" && a.mode !== f.mode) return false;
    if (f.since && attemptDate(a) < f.since) return false;
    return true;
  });
}

export function accuracyBySubject(attempts: QuestionAttempt[], f: AttemptFilter = {}): Record<string, SubjectAccuracy> {
  const out: Record<string, SubjectAccuracy> = {};
  for (const a of filterAttempts(attempts, f)) {
    const k = a.subject_id ?? "sem_materia";
    const cur = out[k] ?? { answered: 0, correct: 0, pct: null };
    cur.answered += 1;
    if (a.is_correct) cur.correct += 1;
    out[k] = cur;
  }
  for (const k of Object.keys(out)) out[k].pct = pct(out[k].correct, out[k].answered);
  return out;
}

export function overallAccuracy(attempts: QuestionAttempt[], f: AttemptFilter = {}): SubjectAccuracy {
  const list = filterAttempts(attempts, f);
  const correct = list.filter((a) => a.is_correct).length;
  return { answered: list.length, correct, pct: pct(correct, list.length) };
}

export type Band = "critico" | "desenvolvimento" | "meta" | "sem_dados";
export function band(p: number | null, target = 70): Band {
  if (p === null) return "sem_dados";
  if (p < 50) return "critico";
  if (p < target) return "desenvolvimento";
  return "meta";
}
export const BAND_LABEL: Record<Band, string> = {
  critico: "Crítico", desenvolvimento: "Em desenvolvimento", meta: "Meta atingida", sem_dados: "Sem dados",
};

/** Segundos estudados por dia (inclui sessões em andamento com tempo já salvo). */
export function secondsByDay(sessions: Pick<StudySession, "date" | "total_seconds">[]): Record<DateKey, number> {
  const out: Record<DateKey, number> = {};
  for (const s of sessions) out[s.date] = (out[s.date] ?? 0) + Math.max(0, s.total_seconds || 0);
  return out;
}

export const MIN_STUDY_SECONDS_FOR_STREAK = 10 * 60;

export function studiedDays(sessions: Pick<StudySession, "date" | "total_seconds" | "status">[]): Set<DateKey> {
  const by = secondsByDay(sessions);
  const set = new Set<DateKey>();
  for (const [d, sec] of Object.entries(by)) if (sec >= MIN_STUDY_SECONDS_FOR_STREAK) set.add(d);
  for (const s of sessions) if (s.status === "concluida" && s.total_seconds > 0) set.add(s.date);
  return set;
}

/**
 * Sequência de dias estudados. Dias de descanso (domingo) não quebram a sequência.
 * Se hoje ainda não teve estudo, a contagem começa ontem (o dia ainda não acabou).
 */
export function streak(days: Set<DateKey>, today: DateKey, restWeekdays: number[] = [0]): number {
  let count = 0;
  let d = today;
  if (!days.has(d)) d = addDaysKey(d, -1);
  for (let guard = 0; guard < 3660; guard++) {
    if (days.has(d)) count++;
    else if (!restWeekdays.includes(weekdayOf(d))) break;
    d = addDaysKey(d, -1);
  }
  return count;
}

export function sumSecondsBetween(sessions: Pick<StudySession, "date" | "total_seconds">[], from: DateKey, to: DateKey): number {
  return sessions.reduce((sum, s) => (s.date >= from && s.date <= to ? sum + (s.total_seconds || 0) : sum), 0);
}

export function progressRatio(done: number, goal: number): number {
  if (!goal || goal <= 0) return 0;
  return Math.max(0, Math.min(1, done / goal));
}

export interface AttentionPoint {
  subjectId: string | null;
  topic: string;
  errors: number;
  answered: number;
  pct: number | null;
  pendingNotes: number;
  score: number;
}

/** "Meus pontos de atenção": assuntos com mais erros recentes e anotações pendentes. */
export function attentionPoints(attempts: QuestionAttempt[], notes: ErrorNote[], today: DateKey, windowDays = 60, limit = 8): AttentionPoint[] {
  const since = addDaysKey(today, -windowDays);
  const map = new Map<string, AttentionPoint>();
  const keyOf = (s: string | null, t: string | null) => `${s ?? ""}::${(t ?? "Sem assunto").trim() || "Sem assunto"}`;
  for (const a of filterAttempts(attempts, { since })) {
    const k = keyOf(a.subject_id, a.topic);
    const p = map.get(k) ?? { subjectId: a.subject_id, topic: (a.topic ?? "Sem assunto").trim() || "Sem assunto", errors: 0, answered: 0, pct: null, pendingNotes: 0, score: 0 };
    p.answered++;
    if (!a.is_correct) p.errors++;
    map.set(k, p);
  }
  for (const n of notes) {
    if (n.status === "dominado") continue;
    const k = keyOf(n.subject_id, n.topic);
    const p = map.get(k) ?? { subjectId: n.subject_id, topic: (n.topic ?? "Sem assunto").trim() || "Sem assunto", errors: 0, answered: 0, pct: null, pendingNotes: 0, score: 0 };
    p.pendingNotes++;
    map.set(k, p);
  }
  const list = [...map.values()].map((p) => {
    p.pct = pct(p.answered - p.errors, p.answered);
    p.score = p.errors * 2 + p.pendingNotes + (p.pct !== null && p.answered >= 3 ? (100 - p.pct) / 25 : 0);
    return p;
  });
  return list.filter((p) => p.errors > 0 || p.pendingNotes > 0).sort((a, b) => b.score - a.score).slice(0, limit);
}

export const daysBetweenInclusive = (from: DateKey, to: DateKey) => diffDays(to, from) + 1;
