/**
 * Planejamento adaptativo: combina peso na prova, desempenho real, cobertura do edital,
 * revisões pendentes, frequência de erros e tempo restante para priorizar as matérias.
 */
import type { DateKey, ErrorNote, QuestionAttempt, ReviewItem, StudyPlanSlot, Subject, SyllabusTopic, UserSettings } from "../types";
import { addDaysKey, diffDays, weekdayOf } from "../domain/dates";
import { filterAttempts, pct } from "../domain/stats";
import { difficultTopics, subjectErrorRanking, trendOf } from "../domain/analytics";
import { weeklyPlannedMinutes } from "../domain/plan";

export interface PriorityInput {
  subjects: Subject[];
  attempts: QuestionAttempt[];
  topics: SyllabusTopic[];
  reviews: ReviewItem[];
  notes: ErrorNote[];
  settings: UserSettings;
  today: DateKey;
}

export interface SubjectPriority {
  subjectId: string;
  name: string;
  weightPct: number;
  answered: number;
  accuracy: number | null;
  accuracyAdj: number; // estimativa suavizada (amostras pequenas puxam para 50%)
  coverage: number; // fração de conteúdos já estudados
  pendingTopics: number;
  pendingReviews: number;
  openErrors: number;
  score: number;
  share: number; // fração recomendada do tempo semanal
  reasons: string[];
}

const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));

export function computePriorities(inp: PriorityInput): SubjectPriority[] {
  const active = inp.subjects.filter((s) => s.active && s.exam_questions > 0);
  const total = active.reduce((s, x) => s + x.exam_questions, 0) || 1;
  const target = inp.settings.target_accuracy || 70;
  const days = inp.settings.exam_date ? Math.max(0, diffDays(inp.settings.exam_date, inp.today)) : 365;
  // Perto da prova, desempenho pesa mais que cobertura (já deu tempo de ver a teoria).
  const urgency = clamp(1 - days / 180);
  const wPerf = 0.4 + 0.2 * urgency, wCov = 0.3 - 0.15 * urgency, wErr = 0.15, wRev = 0.15 - 0.05 * urgency;
  const recent = filterAttempts(inp.attempts, { since: addDaysKey(inp.today, -90) });
  const K = 10; // força da suavização
  const raw = active.map((s) => {
    const att = recent.filter((a) => a.subject_id === s.id);
    const correct = att.filter((a) => a.is_correct).length;
    const accuracy = pct(correct, att.length);
    const accuracyAdj = ((correct + 0.5 * K) / (att.length + K)) * 100;
    const topics = inp.topics.filter((t) => t.subject_id === s.id && t.in_current_edital);
    const leaves = topics.filter((t) => !topics.some((c) => c.parent_id === t.id));
    const studied = leaves.filter((t) => t.status !== "nao_estudado").length;
    const coverage = leaves.length ? studied / leaves.length : 0;
    const pendingReviews = inp.reviews.filter((r) => r.subject_id === s.id && r.status === "pendente" && r.due_date <= inp.today).length;
    const openErrors = inp.notes.filter((n) => n.subject_id === s.id && n.status !== "dominado").length;
    const weightPct = (s.exam_questions / total) * 100;
    const perfGap = clamp((target - accuracyAdj) / target);
    const need = wPerf * perfGap + wCov * (1 - coverage) + wErr * clamp(openErrors / 10) + wRev * clamp(pendingReviews / 5);
    // Peso da prova é multiplicador; o piso (0.35) garante que nenhuma matéria seja abandonada.
    const score = (weightPct / 100) * (0.35 + need);
    const reasons: string[] = [];
    if (accuracy !== null && att.length >= 5 && accuracy < 50) reasons.push(`acertos baixos (${accuracy}%)`);
    else if (accuracy !== null && att.length >= 5 && accuracy < target) reasons.push(`abaixo da meta (${accuracy}%)`);
    if (att.length < 5) reasons.push("poucas questões resolvidas");
    if (leaves.length && coverage < 0.5) reasons.push(`${leaves.length - studied} conteúdos não estudados`);
    if (openErrors >= 3) reasons.push(`${openErrors} erros em aberto`);
    if (pendingReviews >= 2) reasons.push(`${pendingReviews} revisões pendentes`);
    if (weightPct >= 10) reasons.push(`peso alto (${weightPct.toFixed(1).replace(".", ",")}%)`);
    return { subjectId: s.id, name: s.short_name, weightPct, answered: att.length, accuracy, accuracyAdj, coverage, pendingTopics: leaves.length - studied, pendingReviews, openErrors, score, share: 0, reasons };
  });
  const sum = raw.reduce((s, r) => s + r.score, 0) || 1;
  return raw.map((r) => ({ ...r, share: r.score / sum })).sort((a, b) => b.score - a.score);
}

export interface GeneratedPlan {
  slots: Omit<StudyPlanSlot, "id" | "user_id" | "created_at" | "updated_at">[];
  rotation: string[]; // matérias que entram na rotação de sexta
  allocation: { subjectId: string; name: string; sessions: number }[];
}

/**
 * Gera o plano semanal: 9 sessões fixas de 1h (seg–sex, 2 por dia, sendo a 2ª de sexta rotativa),
 * sábado com revisão + questões. Matérias mais prioritárias recebem até 2 sessões;
 * as demais entram na rotação de sexta — nenhuma fica de fora.
 */
export function generateWeeklyPlan(priorities: SubjectPriority[], minutes = 60): GeneratedPlan {
  const FIXED = 9;
  const list = priorities.filter((p) => p.share > 0);
  const exact = list.map((p) => ({ p, exact: p.share * (FIXED + 1) }));
  const alloc = exact.map((e) => ({ p: e.p, n: Math.min(2, Math.floor(e.exact)), rem: e.exact - Math.floor(e.exact) }));
  let used = alloc.reduce((s, a) => s + a.n, 0);
  while (used > FIXED) { const a = [...alloc].filter((x) => x.n > 0).sort((x, y) => x.p.score - y.p.score)[0]; a.n--; used--; }
  for (const a of [...alloc].sort((x, y) => y.rem - x.rem || y.p.score - x.p.score)) { if (used >= FIXED) break; if (a.n < 2) { a.n++; used++; } }
  for (const a of [...alloc].sort((x, y) => y.p.score - x.p.score)) { if (used >= FIXED) break; if (a.n < 2) { a.n++; used++; } }
  // distribui sem repetir a matéria no mesmo dia: segunda sessão da matéria vai para outro dia
  const queue: string[] = [];
  const sorted = [...alloc].filter((a) => a.n > 0).sort((x, y) => y.p.score - x.p.score);
  for (const a of sorted) queue.push(a.p.subjectId);
  for (const a of sorted) if (a.n > 1) queue.push(a.p.subjectId);
  const days = [1, 2, 3, 4, 5];
  const grid: Record<number, string[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  let di = 0;
  for (const sid of queue) {
    for (let tries = 0; tries < 10; tries++) {
      const d = days[di % 5];
      const cap = d === 5 ? 1 : 2;
      di++;
      if (grid[d].length < cap && !grid[d].includes(sid)) { grid[d].push(sid); break; }
    }
  }
  const slots: GeneratedPlan["slots"] = [];
  for (const d of days) grid[d].forEach((sid, i) => slots.push({ weekday: d, position: i, slot_type: "subject", subject_id: sid, duration_minutes: minutes }));
  slots.push({ weekday: 5, position: grid[5].length, slot_type: "rotation", subject_id: null, duration_minutes: minutes });
  slots.push({ weekday: 6, position: 0, slot_type: "weekly_review", subject_id: null, duration_minutes: minutes });
  slots.push({ weekday: 6, position: 1, slot_type: "mixed_questions", subject_id: null, duration_minutes: minutes });
  const fixedSet = new Set(queue);
  const rotation = [...list].filter((p) => !fixedSet.has(p.subjectId)).map((p) => p.subjectId);
  const rot = rotation.length ? rotation : list.slice(-3).map((p) => p.subjectId);
  return {
    slots, rotation: rot,
    allocation: list.map((p) => ({ subjectId: p.subjectId, name: p.name, sessions: alloc.find((a) => a.p.subjectId === p.subjectId)?.n ?? 0 })),
  };
}

export interface Forecast {
  daysLeft: number | null;
  studyDaysLeft: number | null;
  hoursAvailable: number | null;
  theoryHoursAvailable: number | null;
  pendingTopics: number;
  totalTopics: number;
  estimatedHoursNeeded: number;
  theoryCompletionDate: DateKey | null;
  fitsBeforeExam: boolean | null;
}

/** Quanto tempo resta, quanto conteúdo falta e se a teoria cabe até a prova. */
export function forecast(p: { today: DateKey; settings: UserSettings; plan: Pick<StudyPlanSlot, "weekday" | "duration_minutes" | "slot_type">[]; topics: SyllabusTopic[]; hoursPerTopic?: number }): Forecast {
  const { today, settings, plan } = p;
  const leaves = p.topics.filter((t) => t.in_current_edital && !p.topics.some((c) => c.parent_id === t.id));
  const pending = leaves.filter((t) => t.status === "nao_estudado").length;
  const hpt = p.hoursPerTopic ?? 1.5;
  const byWeekday: Record<number, number> = {};
  for (const s of plan) byWeekday[s.weekday] = (byWeekday[s.weekday] ?? 0) + s.duration_minutes;
  const theoryShare = (settings.phase_splits?.["2"]?.theory ?? 30) / 60;
  const weeklyTheoryH = (plan.filter((s) => s.slot_type === "subject" || s.slot_type === "rotation").reduce((x, s) => x + s.duration_minutes, 0) / 60) * theoryShare;
  let theoryDate: DateKey | null = null;
  if (weeklyTheoryH > 0) theoryDate = addDaysKey(today, Math.ceil(((pending * hpt) / weeklyTheoryH) * 7));
  if (!settings.exam_date) {
    return { daysLeft: null, studyDaysLeft: null, hoursAvailable: null, theoryHoursAvailable: null, pendingTopics: pending, totalTopics: leaves.length, estimatedHoursNeeded: pending * hpt, theoryCompletionDate: theoryDate, fitsBeforeExam: null };
  }
  const daysLeft = Math.max(0, diffDays(settings.exam_date, today));
  let studyDays = 0, minutes = 0;
  for (let i = 0; i < daysLeft; i++) {
    const wd = weekdayOf(addDaysKey(today, i));
    if (byWeekday[wd]) { studyDays++; minutes += byWeekday[wd]; }
  }
  const hoursAvailable = Math.round((minutes / 60) * 10) / 10;
  const theoryHoursAvailable = Math.round(hoursAvailable * theoryShare * 10) / 10;
  return {
    daysLeft, studyDaysLeft: studyDays, hoursAvailable, theoryHoursAvailable, pendingTopics: pending, totalTopics: leaves.length,
    estimatedHoursNeeded: Math.round(pending * hpt * 10) / 10, theoryCompletionDate: theoryDate,
    fitsBeforeExam: theoryDate ? theoryDate <= addDaysKey(settings.exam_date, -42) : true,
  };
}

export function strategyText(f: Forecast, phase: 1 | 2 | 3): string {
  if (f.daysLeft !== null && f.daysLeft <= 42) return "Reta final: priorize questões, revisões, simulados aos sábados e o caderno de erros. Teoria apenas para lacunas.";
  if (f.fitsBeforeExam === false) return "O conteúdo pendente não cabe inteiro antes da reta final: foque nos conteúdos de maior peso e nas matérias abaixo da meta, e use resumos/lei seca para os itens de menor incidência.";
  if (phase === 1) return "Base: estude toda a teoria uma vez, com questões em todas as sessões. Mantenha as revisões em dia.";
  return "Aprofundamento: equilibre teoria e questões (30/30), resolva questões da banca e reforce as matérias abaixo da meta de acertos.";
}

export interface Recommendation { id: string; text: string; tone: "alerta" | "positivo" | "info"; link?: string }

/** Recomendações para a tela Hoje — sempre baseadas em dados reais do app. */
export function recommendations(inp: PriorityInput & { boardName?: string | null; newEditalTopics?: number }): Recommendation[] {
  const out: Recommendation[] = [];
  const target = inp.settings.target_accuracy || 70;
  const names = new Map(inp.subjects.map((s) => [s.id, s.short_name]));
  const ranking = subjectErrorRanking(filterAttempts(inp.attempts, { since: addDaysKey(inp.today, -60) }) as never, 8);
  const worst = ranking.find((r) => r.pct !== null && r.pct < 50 && r.subjectId && names.has(r.subjectId));
  if (worst) out.push({ id: `fraca:${worst.subjectId}`, tone: "alerta", text: `${names.get(worst.subjectId!)} está com ${fmtPct(worst.pct!)} de acertos em ${worst.answered} questões. Vamos reforçar essa matéria?`, link: "/questoes" });
  const best = [...ranking].reverse().find((r) => r.pct !== null && r.pct >= target + 5 && r.answered >= 20 && r.subjectId && names.has(r.subjectId));
  if (best) out.push({ id: `forte:${best.subjectId}`, tone: "positivo", text: `Você está acertando ${fmtPct(best.pct!)} em ${names.get(best.subjectId!)}. Dá para manter a revisão e dedicar mais tempo a outras matérias.` });
  const hard = difficultTopics(filterAttempts(inp.attempts, { since: addDaysKey(inp.today, -60) }) as never, target, 4)[0];
  if (hard && hard.subjectId && names.has(hard.subjectId)) out.push({ id: `assunto:${hard.key}`, tone: "alerta", text: `Assunto que pede reforço: "${hard.topic}" (${names.get(hard.subjectId)}) — ${fmtPct(hard.pct!)} de acertos.`, link: "/caderno" });
  if (inp.newEditalTopics && inp.newEditalTopics > 0) out.push({ id: "edital-novos", tone: "info", text: `O edital trouxe ${inp.newEditalTopics} conteúdos novos. Eles já estão no Edital Verticalizado e foram considerados na prioridade.`, link: "/edital" });
  const pr = computePriorities(inp);
  const gap = pr.filter((p) => p.pendingTopics >= 5).sort((a, b) => b.pendingTopics - a.pendingTopics)[0];
  if (gap) out.push({ id: `pend:${gap.subjectId}`, tone: "info", text: `Você tem ${gap.pendingTopics} conteúdos ainda não estudados em ${gap.name}.`, link: "/edital" });
  if (inp.boardName) {
    const boardAtt = filterAttempts(inp.attempts).filter((a) => a.mode !== "revisao");
    const tr = trendOf(boardAtt.slice(-40).map((a) => a.is_correct), 20);
    if (tr.trend === "melhorando") out.push({ id: "tendencia", tone: "positivo", text: `Seu desempenho está melhorando: de ${fmtPct(tr.before!)} para ${fmtPct(tr.after!)} nas questões mais recentes.` });
  }
  const overdue = inp.reviews.filter((r) => r.status === "pendente" && r.due_date < inp.today).length;
  if (overdue >= 5) out.push({ id: "revisoes", tone: "alerta", text: `${overdue} revisões estão atrasadas. Que tal reorganizá-las?`, link: "/plano" });
  return out;
}

const fmtPct = (p: number) => `${p.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
export const planMinutes = weeklyPlannedMinutes;
