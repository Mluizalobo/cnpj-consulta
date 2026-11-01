import type { StudyPlanSlot, Subject, UserSettings, Profile } from "../types";
import { stableId } from "../domain/ids";
import type { DateKey } from "../types";

export interface SubjectSeed { slug: string; name: string; short: string; questions: number; color: string }

/** Distribuição de referência: prova de 2024 (70 questões). Editável nas Configurações. */
export const SUBJECT_SEEDS: SubjectSeed[] = [
  { slug: "portugues", name: "Língua Portuguesa", short: "Português", questions: 10, color: "#2E6B4B" },
  { slug: "informatica", name: "Informática", short: "Informática", questions: 8, color: "#3B6E8F" },
  { slug: "dir-administrativo", name: "Direito Administrativo", short: "Dir. Administrativo", questions: 6, color: "#7A6A3A" },
  { slug: "dir-constitucional", name: "Direito Constitucional", short: "Dir. Constitucional", questions: 6, color: "#5B5B8F" },
  { slug: "raciocinio-logico", name: "Raciocínio Lógico", short: "Raciocínio Lógico", questions: 6, color: "#8F5B7A" },
  { slug: "lei-organica", name: "Lei Orgânica da PCMG — LC Estadual nº 129/2013", short: "Lei Orgânica PCMG", questions: 6, color: "#173D2B" },
  { slug: "dir-penal", name: "Direito Penal", short: "Dir. Penal", questions: 5, color: "#A0583C" },
  { slug: "processo-penal", name: "Direito Processual Penal", short: "Processo Penal", questions: 5, color: "#6E7F3A" },
  { slug: "medicina-legal", name: "Medicina Legal", short: "Medicina Legal", questions: 5, color: "#3A7F78" },
  { slug: "criminologia", name: "Criminologia", short: "Criminologia", questions: 5, color: "#7F4F3A" },
  { slug: "legislacao-extravagante", name: "Legislação Penal Extravagante", short: "Leg. Extravagante", questions: 4, color: "#4F6F8F" },
  { slug: "direitos-humanos", name: "Direitos Humanos", short: "Direitos Humanos", questions: 4, color: "#8F7A4F" },
];

export const subjectId = (userId: string, slug: string) => stableId("subject", userId, slug);

/** Plano semanal fixo (weekday: 0 = domingo). */
export const PLAN_SEED: { weekday: number; position: number; slot_type: StudyPlanSlot["slot_type"]; slug?: string }[] = [
  { weekday: 1, position: 0, slot_type: "subject", slug: "portugues" },
  { weekday: 1, position: 1, slot_type: "subject", slug: "dir-administrativo" },
  { weekday: 2, position: 0, slot_type: "subject", slug: "informatica" },
  { weekday: 2, position: 1, slot_type: "subject", slug: "dir-penal" },
  { weekday: 3, position: 0, slot_type: "subject", slug: "dir-constitucional" },
  { weekday: 3, position: 1, slot_type: "subject", slug: "raciocinio-logico" },
  { weekday: 4, position: 0, slot_type: "subject", slug: "portugues" },
  { weekday: 4, position: 1, slot_type: "subject", slug: "processo-penal" },
  { weekday: 5, position: 0, slot_type: "subject", slug: "informatica" },
  { weekday: 5, position: 1, slot_type: "rotation" },
  { weekday: 6, position: 0, slot_type: "weekly_review" },
  { weekday: 6, position: 1, slot_type: "mixed_questions" },
];

export const ROTATION_PHASE1 = ["medicina-legal", "criminologia"];
export const ROTATION_PHASE2 = ["medicina-legal", "criminologia", "legislacao-extravagante", "direitos-humanos", "lei-organica"];

/**
 * Datas iniciais: são PREVISÕES editáveis (não oficiais), claramente marcadas no app.
 * - edital previsto para dezembro/2026 (anúncio do governo);
 * - prova prevista entre abril e junho/2027 — usamos 16/05/2027 como referência provisória.
 */
export const DEFAULT_EDITAL_FORECAST: DateKey = "2026-12-15";
export const DEFAULT_EXAM_FORECAST: DateKey = "2027-05-16";

export function buildDefaults(userId: string, today: DateKey, nowIso: string) {
  const base = { user_id: userId, created_at: nowIso, updated_at: nowIso };
  const subjects: Subject[] = SUBJECT_SEEDS.map((s, i) => ({
    ...base, id: subjectId(userId, s.slug), slug: s.slug, name: s.name, short_name: s.short, color: s.color,
    exam_questions: s.questions, sort_order: i, active: true,
  }));
  const plan: StudyPlanSlot[] = PLAN_SEED.map((p) => ({
    ...base, id: stableId("plan", userId, p.weekday, p.position), weekday: p.weekday, position: p.position,
    slot_type: p.slot_type, subject_id: p.slug ? subjectId(userId, p.slug) : null, duration_minutes: 60,
  }));
  const settings: UserSettings = {
    ...base, id: userId,
    study_start_date: today, edital_date: DEFAULT_EDITAL_FORECAST, edital_published: false,
    exam_date: DEFAULT_EXAM_FORECAST, exam_date_confirmed: false, final_stretch_weeks: 6,
    target_accuracy: 70, daily_goal_minutes: 120, session_minutes: 60,
    phase_splits: { "1": { theory: 35, questions: 25 }, "2": { theory: 30, questions: 30 }, "3": { theory: 15, questions: 45 } },
    rotation: { phase1: ROTATION_PHASE1.map((s) => subjectId(userId, s)), phase2: ROTATION_PHASE2.map((s) => subjectId(userId, s)) },
    review_intervals: [1, 7, 30], review_minutes: 20, max_reviews_per_day: 6, rest_weekdays: [0],
    mock_duration_minutes: 270, auto_add_errors: false, show_quotes: true,
    timer: { sound: true, vibrate: true, autoAdvance: true, notifications: false },
    exam_board: "FGV", exam_board_confirmed: false, exam_total_questions: 70, applied_version_id: null,
    competition_check_frequency: "diaria",
  };
  const profile: Profile = { ...base, id: userId, display_name: null };
  return { subjects, plan, settings, profile };
}

export const QUOTES = [
  "Constância vence intensidade.",
  "Um bloco de cada vez. Hoje conta.",
  "Revisar é aprender de novo, só que mais rápido.",
  "Errar no treino é acertar na prova.",
  "Disciplina é escolher o que você quer mais, não o que quer agora.",
  "Pequenos avanços diários somam uma aprovação.",
  "Foco no processo; o resultado acompanha.",
  "Duas horas bem feitas valem mais que seis distraídas.",
];
