import type { DateKey, Phase, UserSettings } from "../types";
import { addDaysKey, diffDays } from "./dates";

type PhaseSettings = Pick<UserSettings, "study_start_date" | "edital_date" | "exam_date" | "final_stretch_weeks">;

export const PHASE_INFO: Record<Phase, { name: string; short: string; goal: string }> = {
  1: { name: "Fase 1 — Base", short: "Base", goal: "Estudar toda a teoria uma vez, com questões em todas as sessões." },
  2: { name: "Fase 2 — Aprofundamento", short: "Aprofundamento", goal: "Consolidar conteúdos e aumentar o desempenho em questões." },
  3: { name: "Fase 3 — Reta final", short: "Reta final", goal: "Questões, revisões, simulados e caderno de erros." },
};

export function finalStretchStart(s: PhaseSettings): DateKey | null {
  if (!s.exam_date) return null;
  return addDaysKey(s.exam_date, -Math.max(1, s.final_stretch_weeks || 6) * 7);
}

export function getPhase(date: DateKey, s: PhaseSettings): Phase {
  const fs = finalStretchStart(s);
  if (fs && diffDays(date, fs) >= 0) return 3;
  if (s.edital_date && diffDays(date, s.edital_date) >= 0) return 2;
  return 1;
}

/** Data em que a fase atual começou (usada para a rotação semanal). */
export function phaseStartDate(phase: Phase, s: PhaseSettings): DateKey {
  if (phase === 3) return finalStretchStart(s) ?? s.study_start_date;
  if (phase === 2) return s.edital_date ?? s.study_start_date;
  return s.study_start_date;
}

export function daysUntilExam(today: DateKey, s: Pick<UserSettings, "exam_date">): number | null {
  if (!s.exam_date) return null;
  return diffDays(s.exam_date, today);
}
