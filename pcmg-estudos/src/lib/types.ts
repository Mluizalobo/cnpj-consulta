/** Data no formato AAAA-MM-DD (fuso local do aparelho). */
export type DateKey = string;

export type Option = "A" | "B" | "C" | "D" | "E";
export const OPTIONS: Option[] = ["A", "B", "C", "D", "E"];

export interface BaseRow {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface Profile extends BaseRow {
  display_name: string | null;
}

export type Phase = 1 | 2 | 3;
export interface PhaseSplit { theory: number; questions: number }

export interface TimerPrefs {
  sound: boolean;
  vibrate: boolean;
  autoAdvance: boolean;
  notifications: boolean;
}

export interface UserSettings extends BaseRow {
  study_start_date: DateKey;
  edital_date: DateKey | null;
  edital_published: boolean;
  exam_date: DateKey | null;
  exam_date_confirmed: boolean;
  final_stretch_weeks: number;
  target_accuracy: number;
  daily_goal_minutes: number;
  session_minutes: number;
  phase_splits: Record<"1" | "2" | "3", PhaseSplit>;
  rotation: { phase1: string[]; phase2: string[] };
  review_intervals: number[];
  review_minutes: number;
  max_reviews_per_day: number;
  rest_weekdays: number[];
  mock_duration_minutes: number;
  auto_add_errors: boolean;
  show_quotes: boolean;
  timer: TimerPrefs;
  exam_board: string | null;
  exam_board_confirmed: boolean;
  exam_total_questions: number;
  applied_version_id: string | null;
  competition_check_frequency: "diaria" | "duas_vezes" | "a_cada_6h";
}

export interface Subject extends BaseRow {
  slug: string | null;
  name: string;
  short_name: string;
  color: string;
  exam_questions: number;
  sort_order: number;
  active: boolean;
}

export type SlotType = "subject" | "rotation" | "weekly_review" | "mixed_questions";
export interface StudyPlanSlot extends BaseRow {
  weekday: number; // 0 = domingo ... 6 = sábado
  position: number;
  slot_type: SlotType;
  subject_id: string | null;
  duration_minutes: number;
}

export type Activity = "teoria_questoes" | "teoria" | "questoes" | "revisao" | "simulado";
export type SessionStatus = "em_andamento" | "concluida";
export interface StudySession extends BaseRow {
  date: DateKey;
  subject_id: string | null;
  slot_key: string | null;
  review_id: string | null;
  syllabus_topic_id: string | null;
  activity: Activity;
  label: string | null;
  topic: string | null;
  notes: string | null;
  phase: Phase;
  planned_minutes: number;
  theory_seconds: number;
  practice_seconds: number;
  total_seconds: number;
  questions_done: number;
  questions_correct: number;
  status: SessionStatus;
  source: "timer" | "manual";
  started_at: string | null;
  completed_at: string | null;
}

export type ReviewStatus = "pendente" | "concluida";
export interface ReviewItem extends BaseRow {
  session_id: string | null;
  subject_id: string | null;
  syllabus_topic_id: string | null;
  topic: string | null;
  interval_days: number;
  base_date: DateKey;
  original_due_date: DateKey;
  due_date: DateKey;
  status: ReviewStatus;
  completed_at: string | null;
  reschedule_count: number;
}

export type Difficulty = "facil" | "medio" | "dificil";
export type QuestionStatus = "nao_respondida" | "correta" | "incorreta";
export interface Question extends BaseRow {
  subject_id: string | null;
  syllabus_topic_id: string | null;
  topic: string | null;
  statement: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  option_e: string;
  correct_option: Option;
  explanation: string | null;
  difficulty: Difficulty;
  board: string | null;
  year: number | null;
  tags: string[];
  origin: "autoral" | "manual" | "importada";
  favorite: boolean;
  needs_review: boolean;
  status: QuestionStatus;
  times_answered: number;
  last_answered_at: string | null;
  content_hash: string;
}

export type AttemptMode = "treino" | "simulado" | "revisao";
export interface QuestionAttempt extends BaseRow {
  question_id: string | null;
  subject_id: string | null;
  topic: string | null;
  selected_option: Option | null;
  correct_option: Option;
  is_correct: boolean;
  difficulty: Difficulty | null;
  mode: AttemptMode;
  mock_exam_id: string | null;
  error_note_id: string | null;
  answered_at: string;
}

export type NoteStatus = "pendente" | "revisando" | "dominado";
export interface ErrorNote extends BaseRow {
  question_id: string | null;
  subject_id: string | null;
  topic: string | null;
  statement: string | null;
  my_answer: string | null;
  correct_answer: string | null;
  explanation: string | null;
  personal_note: string | null;
  error_date: DateKey;
  last_error_at: string;
  occurrences: number;
  review_count: number;
  last_reviewed_at: string | null;
  status: NoteStatus;
}

export interface MockDistributionItem { subject_id: string; count: number }
export interface MockExam extends BaseRow {
  title: string;
  kind: "completo" | "personalizado";
  status: "em_andamento" | "finalizado";
  started_at: string;
  finished_at: string | null;
  time_limit_seconds: number;
  elapsed_seconds: number;
  resumed_at: string | null; // quando não nulo, o cronômetro está correndo
  total_questions: number;
  answered_count: number;
  correct_count: number | null;
  current_index: number;
  distribution: MockDistributionItem[];
}

export interface MockExamQuestion extends BaseRow {
  mock_exam_id: string;
  question_id: string | null;
  position: number;
  subject_id: string | null;
  correct_option: Option;
  selected_option: Option | null;
  flagged: boolean;
  is_correct: boolean | null;
  answered_at: string | null;
}

export type TopicStatus = "nao_estudado" | "estudado" | "revisado" | "dominado";
/** Edital verticalizado: Matéria → Tema → Subtema → Item. */
export interface SyllabusTopic extends BaseRow {
  subject_id: string;
  parent_id: string | null;
  level: number; // 1 = tema, 2 = subtema, 3 = item
  code: string | null;
  title: string;
  sort_order: number;
  status: TopicStatus;
  priority: boolean;
  notes: string | null;
  manual_seconds: number;
  manual_questions: number;
  manual_correct: number;
  in_current_edital: boolean;
  origin: "preliminar" | "edital" | "manual";
  version_id: string | null;
  last_studied_at: string | null;
}

export interface PlanUpdateHistory extends BaseRow {
  version_id: string | null;
  document_id: string | null;
  title: string;
  summary: string;
  changes: unknown;
  snapshot_before: unknown;
  applied_at: string;
}

export interface UserNotification extends BaseRow {
  kind: "concurso" | "edital" | "plano" | "sistema";
  title: string;
  body: string | null;
  link: string | null;
  source_update_id: string | null;
  read_at: string | null;
}

export interface SyllabusImportJob extends BaseRow {
  document_id: string | null;
  source_name: string | null;
  status: "analisado" | "aplicado" | "descartado" | "erro";
  analysis: unknown;
  error: string | null;
}

/* ---------- Dados públicos do concurso (somente leitura no app; escritos pelo servidor) ---------- */
export type SourceKind = "oficial" | "banca" | "diario_oficial" | "secundaria";
export type Reliability = "confirmado" | "preliminar" | "aguardando_confirmacao";

export interface CompetitionSource {
  id: string;
  name: string;
  url: string;
  kind: SourceKind;
  active: boolean;
  last_checked_at: string | null;
  last_status: string | null;
  created_at: string;
  updated_at: string;
}

export type DocType = "edital_abertura" | "retificacao" | "comunicado" | "cronograma" | "convocacao" | "resultado" | "noticia" | "outro";
export interface CompetitionDocument {
  id: string;
  source_id: string | null;
  source_name: string;
  source_kind: SourceKind;
  url: string;
  title: string;
  doc_type: DocType;
  content_hash: string;
  published_at: string | null;
  fetched_at: string;
  cargo_match: "investigador" | "multi_cargo" | "outro_cargo" | "indefinido";
  is_official: boolean;
  confidence: number;
  reliability: Reliability;
  year: number | null;
  edital_number: string | null;
  text_excerpt: string | null;
  page_count: number | null;
  parsed: unknown;
  created_at: string;
  updated_at: string;
}

export type UpdateState = "nova_informacao" | "novo_documento" | "alteracao_importante" | "edital_publicado" | "pista_nao_oficial";
export interface CompetitionUpdate {
  id: string;
  document_id: string | null;
  kind: UpdateState;
  title: string;
  summary: string;
  details: unknown;
  reliability: Reliability;
  source_url: string | null;
  source_kind: SourceKind;
  detected_at: string;
  created_at: string;
  updated_at: string;
}

export interface CompetitionVersion {
  id: string;
  version_number: number;
  document_id: string | null;
  base_version_id: string | null;
  label: string;
  data: unknown;
  diff: unknown;
  reliability: Reliability;
  created_at: string;
  updated_at: string;
}

export interface MonitoringLog {
  id: string;
  run_id: string;
  trigger: "cron" | "manual" | "teste";
  status: "ok" | "erro" | "parcial" | "ignorado";
  sources_checked: number;
  documents_found: number;
  new_documents: number;
  message: string | null;
  errors: unknown;
  started_at: string;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TableRowMap {
  profiles: Profile;
  user_settings: UserSettings;
  subjects: Subject;
  study_plan: StudyPlanSlot;
  study_sessions: StudySession;
  review_schedule: ReviewItem;
  questions: Question;
  question_attempts: QuestionAttempt;
  error_notebook: ErrorNote;
  mock_exams: MockExam;
  mock_exam_questions: MockExamQuestion;
  syllabus_topics: SyllabusTopic;
  plan_update_history: PlanUpdateHistory;
  user_notifications: UserNotification;
  syllabus_import_jobs: SyllabusImportJob;
  competition_sources: CompetitionSource;
  competition_documents: CompetitionDocument;
  competition_updates: CompetitionUpdate;
  competition_versions: CompetitionVersion;
  monitoring_logs: MonitoringLog;
}
export type TableName = keyof TableRowMap;

/** Ordem importa: tabelas "pai" antes das "filhas" (chaves estrangeiras). */
export const TABLES: TableName[] = [
  "profiles",
  "user_settings",
  "subjects",
  "study_plan",
  "study_sessions",
  "review_schedule",
  "questions",
  "question_attempts",
  "error_notebook",
  "mock_exams",
  "mock_exam_questions",
  "syllabus_topics",
  "plan_update_history",
  "user_notifications",
  "syllabus_import_jobs",
  "competition_sources",
  "competition_documents",
  "competition_updates",
  "competition_versions",
  "monitoring_logs",
];

/** Tabelas públicas do concurso: o app só lê; quem escreve é o servidor (monitoramento). */
export const PUBLIC_TABLES: TableName[] = [
  "competition_sources", "competition_documents", "competition_updates", "competition_versions", "monitoring_logs",
];
export const isPersonalTable = (t: TableName) => !PUBLIC_TABLES.includes(t);

export type DataTables = { [K in TableName]: Record<string, TableRowMap[K]> };
