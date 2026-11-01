import type { MockDistributionItem, MockExamQuestion, Option, Question, Subject } from "../types";
import { pct } from "./stats";

export type Rng = () => number;

/** Embaralhamento Fisher–Yates com gerador opcional (para testes determinísticos). */
export function shuffle<T>(arr: T[], rng: Rng = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function seededRng(seed: number): Rng {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
    return s / 0x100000000;
  };
}

/** Distribuição oficial a partir das matérias ativas (quantidade de questões de cada uma). */
export function examDistribution(subjects: Subject[]): MockDistributionItem[] {
  return subjects
    .filter((s) => s.active && s.exam_questions > 0)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((s) => ({ subject_id: s.id, count: s.exam_questions }));
}

/** Reduz/expande a distribuição para N questões preservando a proporção (maiores restos). */
export function scaleDistribution(dist: MockDistributionItem[], total: number): MockDistributionItem[] {
  const sum = dist.reduce((s, d) => s + d.count, 0);
  if (sum === 0 || total <= 0) return dist.map((d) => ({ ...d, count: 0 }));
  const raw = dist.map((d) => ({ ...d, exact: (d.count * total) / sum }));
  const base = raw.map((r) => ({ subject_id: r.subject_id, count: Math.floor(r.exact), rem: r.exact - Math.floor(r.exact) }));
  let left = total - base.reduce((s, b) => s + b.count, 0);
  const order = [...base.keys()].sort((i, j) => base[j].rem - base[i].rem || dist[j].count - dist[i].count);
  for (const i of order) { if (left <= 0) break; base[i].count++; left--; }
  return base.map(({ subject_id, count }) => ({ subject_id, count }));
}

export interface MockSelection {
  picks: { question: Question; subject_id: string }[];
  shortages: { subject_id: string; wanted: number; available: number }[];
}

/**
 * Seleciona questões aleatórias respeitando a quantidade por matéria.
 * Prioriza questões ainda não respondidas e, depois, as erradas.
 */
export function selectMockQuestions(dist: MockDistributionItem[], bank: Question[], rng: Rng = Math.random): MockSelection {
  const picks: MockSelection["picks"] = [];
  const shortages: MockSelection["shortages"] = [];
  for (const d of dist) {
    if (d.count <= 0) continue;
    const pool = bank.filter((q) => q.subject_id === d.subject_id);
    const tier = (q: Question) => (q.status === "nao_respondida" ? 0 : q.status === "incorreta" ? 1 : 2);
    const ordered = [0, 1, 2].flatMap((t) => shuffle(pool.filter((q) => tier(q) === t), rng));
    const chosen = ordered.slice(0, d.count);
    if (chosen.length < d.count) shortages.push({ subject_id: d.subject_id, wanted: d.count, available: chosen.length });
    chosen.forEach((q) => picks.push({ question: q, subject_id: d.subject_id }));
  }
  return { picks, shortages };
}

export interface MockScore {
  total: number;
  answered: number;
  correct: number;
  pct: number | null;
  bySubject: { subject_id: string | null; total: number; answered: number; correct: number; pct: number | null }[];
}

/** Nota do simulado: questões em branco contam como erro (como na prova). */
export function scoreMock(questions: Pick<MockExamQuestion, "subject_id" | "selected_option" | "correct_option">[]): MockScore {
  const by = new Map<string | null, { total: number; answered: number; correct: number }>();
  let correct = 0, answered = 0;
  for (const q of questions) {
    const s = by.get(q.subject_id) ?? { total: 0, answered: 0, correct: 0 };
    s.total++;
    if (q.selected_option) { s.answered++; answered++; }
    if (q.selected_option && q.selected_option === q.correct_option) { s.correct++; correct++; }
    by.set(q.subject_id, s);
  }
  return {
    total: questions.length, answered, correct, pct: pct(correct, questions.length),
    bySubject: [...by.entries()].map(([subject_id, v]) => ({ subject_id, ...v, pct: pct(v.correct, v.total) })),
  };
}

export const isOption = (v: unknown): v is Option => typeof v === "string" && ["A", "B", "C", "D", "E"].includes(v);

/** Segundos decorridos de um simulado (pausável). */
export function mockElapsed(m: { elapsed_seconds: number; resumed_at: string | null }, nowMs: number = Date.now()): number {
  const running = m.resumed_at ? Math.max(0, (nowMs - new Date(m.resumed_at).getTime()) / 1000) : 0;
  return Math.floor(m.elapsed_seconds + running);
}
