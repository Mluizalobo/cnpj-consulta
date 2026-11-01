/**
 * Análise avançada de acertos e erros.
 * Regra de ouro: só tentativas efetivamente respondidas entram nas contas.
 * Tentativas de "revisao" (refazer questão do caderno de erros) ficam separadas
 * e nunca apagam/alteram o erro original.
 */
import type { DateKey, Difficulty, Option, Question, QuestionAttempt } from "../types";
import { addDaysKey, fmt, weekStartKey } from "./dates";
import { attemptDate, pct } from "./stats";

export type AttemptLike = Pick<QuestionAttempt, "question_id" | "subject_id" | "topic" | "selected_option" | "is_correct" | "mode" | "answered_at" | "difficulty">;

export const answered = <T extends Pick<QuestionAttempt, "selected_option">>(list: T[]) => list.filter((a) => a.selected_option !== null);
const chrono = <T extends Pick<QuestionAttempt, "answered_at">>(list: T[]) => [...list].sort((a, b) => a.answered_at.localeCompare(b.answered_at));

export type Trend = "melhorando" | "estagnada" | "piorando" | "dados_insuficientes";
export const TREND_LABEL: Record<Trend, string> = {
  melhorando: "Melhorando", estagnada: "Estável", piorando: "Piorando", dados_insuficientes: "Poucos dados",
};

/** Compara a 1ª metade com a 2ª metade das tentativas (ordem cronológica). */
export function trendOf(results: boolean[], minSample = 4, threshold = 10): { trend: Trend; before: number | null; after: number | null } {
  if (results.length < minSample) return { trend: "dados_insuficientes", before: null, after: null };
  const mid = Math.floor(results.length / 2);
  const a = results.slice(0, mid), b = results.slice(mid);
  const before = pct(a.filter(Boolean).length, a.length)!;
  const after = pct(b.filter(Boolean).length, b.length)!;
  const d = after - before;
  return { trend: d >= threshold ? "melhorando" : d <= -threshold ? "piorando" : "estagnada", before, after };
}

export interface QuestionStats {
  attempts: number;
  correct: number;
  wrong: number;
  pct: number | null;
  lastAt: string | null;
  firstCorrect: boolean | null;
  history: { at: string; selected: Option; correct: boolean; mode: QuestionAttempt["mode"] }[];
  reviewAttempts: number;
  reviewCorrect: number;
}

/** Estatísticas individuais de uma questão (tentativas de treino/simulado + revisões à parte). */
export function questionStats(attempts: AttemptLike[]): QuestionStats {
  const all = chrono(answered(attempts));
  const main = all.filter((a) => a.mode !== "revisao");
  const rev = all.filter((a) => a.mode === "revisao");
  const correct = main.filter((a) => a.is_correct).length;
  return {
    attempts: main.length, correct, wrong: main.length - correct, pct: pct(correct, main.length),
    lastAt: all.length ? all[all.length - 1].answered_at : null,
    firstCorrect: main.length ? main[0].is_correct : null,
    history: all.map((a) => ({ at: a.answered_at, selected: a.selected_option as Option, correct: a.is_correct, mode: a.mode })),
    reviewAttempts: rev.length, reviewCorrect: rev.filter((a) => a.is_correct).length,
  };
}

export type QuestionClass = "inedita" | "acertada" | "errada";
export interface QuestionState { cls: QuestionClass; answered: boolean; revised: boolean; label: string }

/** Inédita (nunca respondida) · acertada/errada (última tentativa) · revisada (refeita no caderno). */
export function questionState(attempts: AttemptLike[]): QuestionState {
  const all = chrono(answered(attempts));
  const main = all.filter((a) => a.mode !== "revisao");
  const revised = all.some((a) => a.mode === "revisao");
  if (main.length === 0 && !revised) return { cls: "inedita", answered: false, revised: false, label: "Inédita" };
  const last = (main.length ? main : all)[(main.length ? main : all).length - 1];
  const cls: QuestionClass = last.is_correct ? "acertada" : "errada";
  return { cls, answered: true, revised, label: (cls === "acertada" ? "Acertada" : "Errada") + (revised ? " · revisada" : "") };
}

export function groupByQuestion(attempts: AttemptLike[]): Map<string, AttemptLike[]> {
  const m = new Map<string, AttemptLike[]>();
  for (const a of attempts) {
    if (!a.question_id) continue;
    const l = m.get(a.question_id) ?? [];
    l.push(a);
    m.set(a.question_id, l);
  }
  return m;
}

/** Questões que erro repetidamente (2+ erros em treino/simulado). */
export function repeatedErrors(attempts: AttemptLike[], minErrors = 2) {
  const out: { questionId: string; subjectId: string | null; topic: string | null; errors: number; attempts: number; lastWrongAt: string }[] = [];
  for (const [qid, list] of groupByQuestion(attempts)) {
    const main = chrono(answered(list)).filter((a) => a.mode !== "revisao");
    const wrong = main.filter((a) => !a.is_correct);
    if (wrong.length >= minErrors) {
      out.push({ questionId: qid, subjectId: main[0].subject_id, topic: main[0].topic, errors: wrong.length, attempts: main.length, lastWrongAt: wrong[wrong.length - 1].answered_at });
    }
  }
  return out.sort((a, b) => b.errors - a.errors || b.lastWrongAt.localeCompare(a.lastWrongAt));
}

/** Primeira tentativa × tentativas posteriores (apenas questões respondidas 2+ vezes). */
export function firstVsLater(attempts: AttemptLike[]) {
  let firstN = 0, firstC = 0, laterN = 0, laterC = 0, questions = 0;
  for (const [, list] of groupByQuestion(attempts)) {
    const main = chrono(answered(list)); // inclui revisões como tentativas posteriores
    if (main.length < 2) continue;
    questions++;
    firstN++; if (main[0].is_correct) firstC++;
    for (const a of main.slice(1)) { laterN++; if (a.is_correct) laterC++; }
  }
  const first = pct(firstC, firstN), later = pct(laterC, laterN);
  return { questions, first, later, delta: first !== null && later !== null ? Math.round((later - first) * 10) / 10 : null };
}

export interface GroupStat { key: string; subjectId: string | null; topic: string | null; answered: number; correct: number; wrong: number; pct: number | null; trend: Trend }

function groupStats(attempts: AttemptLike[], keyFn: (a: AttemptLike) => string): GroupStat[] {
  const m = new Map<string, AttemptLike[]>();
  for (const a of chrono(answered(attempts)).filter((x) => x.mode !== "revisao")) {
    const k = keyFn(a);
    const l = m.get(k) ?? []; l.push(a); m.set(k, l);
  }
  return [...m.entries()].map(([key, list]) => {
    const correct = list.filter((a) => a.is_correct).length;
    return {
      key, subjectId: list[0].subject_id, topic: list[0].topic, answered: list.length, correct, wrong: list.length - correct,
      pct: pct(correct, list.length), trend: trendOf(list.map((a) => a.is_correct), 6).trend,
    };
  });
}

/** Matérias com maior índice de erros (ordenadas pelo % de erros, com amostra mínima). */
export function subjectErrorRanking(attempts: AttemptLike[], minSample = 1): GroupStat[] {
  return groupStats(attempts, (a) => a.subject_id ?? "sem_materia")
    .filter((g) => g.answered >= minSample)
    .sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101) || b.wrong - a.wrong);
}

const topicKey = (a: AttemptLike) => `${a.subject_id ?? ""}::${(a.topic ?? "Sem assunto").trim() || "Sem assunto"}`;

/** Assuntos com dificuldade: % abaixo da meta, com amostra mínima. */
export function difficultTopics(attempts: AttemptLike[], target = 70, minSample = 3): GroupStat[] {
  return groupStats(attempts, topicKey)
    .filter((g) => g.answered >= minSample && (g.pct ?? 100) < target)
    .sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0) || b.answered - a.answered);
}

/** Assuntos em que acerto as fáceis, mas erro médias e difíceis. */
export function difficultyGaps(attempts: AttemptLike[], minEach = 2, easyMin = 70, hardMax = 60) {
  const by = new Map<string, { subjectId: string | null; topic: string; easy: [number, number]; hard: [number, number] }>();
  for (const a of answered(attempts).filter((x) => x.mode !== "revisao" && x.difficulty)) {
    const k = topicKey(a);
    const g = by.get(k) ?? { subjectId: a.subject_id, topic: (a.topic ?? "Sem assunto").trim() || "Sem assunto", easy: [0, 0], hard: [0, 0] };
    const slot = a.difficulty === "facil" ? g.easy : g.hard;
    slot[0]++; if (a.is_correct) slot[1]++;
    by.set(k, g);
  }
  return [...by.values()]
    .map((g) => ({ subjectId: g.subjectId, topic: g.topic, easyPct: pct(g.easy[1], g.easy[0]), easyN: g.easy[0], hardPct: pct(g.hard[1], g.hard[0]), hardN: g.hard[0] }))
    .filter((g) => g.easyN >= minEach && g.hardN >= minEach && (g.easyPct ?? 0) >= easyMin && (g.hardPct ?? 100) < hardMax)
    .sort((a, b) => ((b.easyPct ?? 0) - (b.hardPct ?? 0)) - ((a.easyPct ?? 0) - (a.hardPct ?? 0)));
}

export const difficultyBreakdown = (attempts: AttemptLike[]) => {
  const out: Record<Difficulty, { answered: number; correct: number; pct: number | null }> = {
    facil: { answered: 0, correct: 0, pct: null }, medio: { answered: 0, correct: 0, pct: null }, dificil: { answered: 0, correct: 0, pct: null },
  };
  for (const a of answered(attempts).filter((x) => x.mode !== "revisao" && x.difficulty)) {
    out[a.difficulty!].answered++; if (a.is_correct) out[a.difficulty!].correct++;
  }
  for (const k of Object.keys(out) as Difficulty[]) out[k].pct = pct(out[k].correct, out[k].answered);
  return out;
};

export interface SeriesPoint { key: string; label: string; correct: number; wrong: number; answered: number; pct: number | null }

/** Série semanal ou mensal de acertos e erros (geral ou de uma matéria). */
export function timeSeries(attempts: AttemptLike[], period: "semana" | "mes", opts: { subjectId?: string | null; periods?: number; today?: DateKey; includeReview?: boolean } = {}): SeriesPoint[] {
  const n = opts.periods ?? (period === "semana" ? 12 : 6);
  const today = opts.today ?? attemptDate({ answered_at: new Date().toISOString() });
  const keys: string[] = [];
  if (period === "semana") {
    let k = weekStartKey(today);
    for (let i = 0; i < n; i++) { keys.unshift(k); k = addDaysKey(k, -7); }
  } else {
    const [y, m] = today.split("-").map(Number);
    for (let i = n - 1; i >= 0; i--) { const d = new Date(y, m - 1 - i, 1); keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); }
  }
  const map = new Map(keys.map((k) => [k, { correct: 0, wrong: 0 }]));
  for (const a of answered(attempts)) {
    if (!opts.includeReview && a.mode === "revisao") continue;
    if (opts.subjectId && a.subject_id !== opts.subjectId) continue;
    const d = attemptDate(a);
    const k = period === "semana" ? weekStartKey(d) : d.slice(0, 7);
    const b = map.get(k);
    if (!b) continue;
    if (a.is_correct) b.correct++; else b.wrong++;
  }
  return keys.map((k) => {
    const b = map.get(k)!;
    const label = period === "semana" ? fmt(k, "dd/MM") : fmt(k + "-01", "MMM/yy");
    return { key: k, label, correct: b.correct, wrong: b.wrong, answered: b.correct + b.wrong, pct: pct(b.correct, b.correct + b.wrong) };
  });
}

/** Resumo dos estados das questões do banco. */
export function bankStateSummary(questions: Pick<Question, "id">[], attempts: AttemptLike[]) {
  const by = groupByQuestion(attempts);
  const out = { inedita: 0, respondida: 0, acertada: 0, errada: 0, revisada: 0 };
  for (const q of questions) {
    const st = questionState(by.get(q.id) ?? []);
    if (st.cls === "inedita") out.inedita++;
    else { out.respondida++; out[st.cls]++; }
    if (st.revised) out.revisada++;
  }
  return out;
}
