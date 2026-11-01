import { buildDefaults } from "@/lib/seed/defaults";
import type { QuestionAttempt, StudySession } from "@/lib/types";

export const UID = "00000000-0000-4000-8000-000000000001";
export const NOW = "2026-11-02T12:00:00.000Z";
export const defaults = (today = "2026-11-02") => buildDefaults(UID, today, NOW);

export function attempt(p: Partial<QuestionAttempt>): QuestionAttempt {
  return {
    id: Math.random().toString(36), user_id: UID, created_at: NOW, updated_at: NOW,
    question_id: "q1", subject_id: "s1", topic: "Crase", selected_option: "A", correct_option: "A", is_correct: true,
    difficulty: "medio", mode: "treino", mock_exam_id: null, error_note_id: null, answered_at: "2026-11-02T10:00:00.000Z", ...p,
  };
}

export function session(p: Partial<StudySession>): StudySession {
  return {
    id: Math.random().toString(36), user_id: UID, created_at: NOW, updated_at: NOW, date: "2026-11-02", subject_id: "s1",
    slot_key: null, review_id: null, syllabus_topic_id: null, activity: "teoria_questoes", label: null, topic: null, notes: null,
    phase: 1, planned_minutes: 60, theory_seconds: 0, practice_seconds: 0, total_seconds: 3600, questions_done: 0, questions_correct: 0,
    status: "concluida", source: "timer", started_at: null, completed_at: null, ...p,
  };
}
