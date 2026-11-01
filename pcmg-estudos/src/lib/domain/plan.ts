import type { Activity, DateKey, Phase, StudyPlanSlot, Subject, UserSettings } from "../types";
import { differenceInCalendarWeeks } from "date-fns";
import { fromKey, weekdayOf } from "./dates";
import { getPhase, phaseStartDate } from "./phases";

export interface SubjectAccuracy { answered: number; correct: number; pct: number | null }

export interface DayItem {
  key: string; // `${date}:${position}` — identifica a sessão planejada daquele dia
  date: DateKey;
  position: number;
  slotType: StudyPlanSlot["slot_type"] | "mock_exam";
  subjectId: string | null;
  activity: Activity;
  label: string;
  minutes: number;
  theoryMinutes: number;
  questionsMinutes: number;
  rotation: boolean;
  rotationReason?: string;
}

export interface PlanContext {
  settings: UserSettings;
  subjects: Subject[];
  plan: StudyPlanSlot[];
  accuracy?: Record<string, SubjectAccuracy>;
}

/** Proporção teoria/questões de uma sessão, ajustada à duração. */
export function splitFor(phase: Phase, minutes: number, settings: UserSettings): { theory: number; questions: number } {
  const base = settings.phase_splits?.[String(phase) as "1" | "2" | "3"] ?? { theory: 35, questions: 25 };
  const total = base.theory + base.questions || 60;
  const theory = Math.round((minutes * base.theory) / total);
  return { theory, questions: Math.max(0, minutes - theory) };
}

const MIN_SAMPLE = 5;

/** Escolhe a matéria mais fraca (menor % de acertos com amostra mínima). */
export function weakestSubject(
  candidates: Subject[],
  accuracy: Record<string, SubjectAccuracy> = {},
  fallback: Subject | null = null,
): { subject: Subject | null; reason: string } {
  const scored = candidates
    .map((s) => ({ s, a: accuracy[s.id] }))
    .filter((x) => x.a && x.a.answered >= MIN_SAMPLE && x.a.pct !== null)
    .sort((x, y) => (x.a!.pct! - y.a!.pct!) || (x.a!.answered - y.a!.answered) || (y.s.exam_questions - x.s.exam_questions));
  if (scored.length > 0) {
    const w = scored[0];
    return { subject: w.s, reason: `Menor desempenho: ${w.a!.pct!.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% em ${w.a!.answered} questões` };
  }
  // Sem dados suficientes: prioriza matérias com menos questões respondidas e maior peso na prova.
  const lessPracticed = [...candidates].sort(
    (x, y) => ((accuracy[x.id]?.answered ?? 0) - (accuracy[y.id]?.answered ?? 0)) || (y.exam_questions - x.exam_questions),
  );
  const s = lessPracticed[0] ?? fallback;
  return { subject: s ?? null, reason: "Poucos dados ainda: priorizando a matéria menos praticada" };
}

export function rotationSubject(date: DateKey, ctx: PlanContext, excludeIds: string[] = []): { subject: Subject | null; reason: string } {
  const { settings, subjects } = ctx;
  const phase = getPhase(date, settings);
  const active = subjects.filter((s) => s.active);
  const byId = new Map(active.map((s) => [s.id, s]));
  if (phase === 3) {
    const candidates = active.filter((s) => !excludeIds.includes(s.id));
    return weakestSubject(candidates, ctx.accuracy);
  }
  const list = (phase === 1 ? settings.rotation?.phase1 : settings.rotation?.phase2) ?? [];
  const valid = list.map((id) => byId.get(id)).filter((s): s is Subject => !!s);
  if (valid.length === 0) return { subject: null, reason: "Rotação sem matérias configuradas" };
  const start = phaseStartDate(phase, settings);
  const week = Math.max(0, differenceInCalendarWeeks(fromKey(date), fromKey(start), { weekStartsOn: 1 }));
  const s = valid[week % valid.length];
  return { subject: s, reason: `Rotação da ${phase === 1 ? "fase 1" : "fase 2"} (semana ${week + 1})` };
}

const SLOT_LABEL: Record<StudyPlanSlot["slot_type"], string> = {
  subject: "",
  rotation: "Matéria rotativa",
  weekly_review: "Revisão da semana",
  mixed_questions: "Questões misturadas",
};

/** Itens de estudo previstos para uma data, conforme plano semanal e fase. */
export function getDayItems(date: DateKey, ctx: PlanContext): DayItem[] {
  const { settings, subjects, plan } = ctx;
  const wd = weekdayOf(date);
  const phase = getPhase(date, settings);
  const byId = new Map(subjects.map((s) => [s.id, s]));
  const slots = plan.filter((p) => p.weekday === wd).sort((a, b) => a.position - b.position);
  if (slots.length === 0) return [];

  // Reta final: sábado vira simulado completo.
  if (phase === 3 && wd === 6) {
    const minutes = settings.mock_duration_minutes || 270;
    return [{
      key: `${date}:0`, date, position: 0, slotType: "mock_exam", subjectId: null, activity: "simulado",
      label: "Simulado completo (70 questões)", minutes, theoryMinutes: 0, questionsMinutes: minutes, rotation: false,
    }];
  }

  const fixedIds = slots.filter((s) => s.slot_type === "subject" && s.subject_id).map((s) => s.subject_id!);
  const items: DayItem[] = [];
  for (const slot of slots) {
    const minutes = slot.duration_minutes || settings.session_minutes || 60;
    const base = { key: `${date}:${slot.position}`, date, position: slot.position, slotType: slot.slot_type, minutes };
    if (slot.slot_type === "subject" || slot.slot_type === "rotation") {
      let subject: Subject | null = null;
      let reason: string | undefined;
      if (slot.slot_type === "subject") subject = slot.subject_id ? byId.get(slot.subject_id) ?? null : null;
      else ({ subject, reason } = rotationSubject(date, ctx, fixedIds));
      if (!subject || !subject.active) continue;
      const sp = splitFor(phase, minutes, settings);
      items.push({
        ...base, subjectId: subject.id, activity: "teoria_questoes", label: subject.name,
        theoryMinutes: sp.theory, questionsMinutes: sp.questions, rotation: slot.slot_type === "rotation", rotationReason: reason,
      });
    } else if (slot.slot_type === "weekly_review") {
      items.push({ ...base, subjectId: null, activity: "revisao", label: SLOT_LABEL.weekly_review, theoryMinutes: minutes, questionsMinutes: 0, rotation: false });
    } else {
      items.push({ ...base, subjectId: null, activity: "questoes", label: SLOT_LABEL.mixed_questions, theoryMinutes: 0, questionsMinutes: minutes, rotation: false });
    }
  }
  return items;
}

export const ACTIVITY_LABEL: Record<Activity, string> = {
  teoria_questoes: "Teoria + questões",
  teoria: "Teoria",
  questoes: "Questões",
  revisao: "Revisão",
  simulado: "Simulado",
};

export function weeklyPlannedMinutes(plan: StudyPlanSlot[]): number {
  return plan.reduce((sum, p) => sum + (p.duration_minutes || 0), 0);
}

export function restWeekdaysFromPlan(plan: StudyPlanSlot[]): number[] {
  const used = new Set(plan.map((p) => p.weekday));
  return [0, 1, 2, 3, 4, 5, 6].filter((d) => !used.has(d));
}
