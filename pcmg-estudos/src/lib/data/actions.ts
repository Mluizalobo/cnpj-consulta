import type {
  Activity, DateKey, Difficulty, ErrorNote, MockDistributionItem, MockExam, MockExamQuestion, Option, Question,
  QuestionAttempt, ReviewItem, StudyPlanSlot, StudySession, Subject, SyllabusTopic, TableName, TopicStatus,
  UserNotification, UserSettings,
} from "../types";
import type { SyncEngine } from "./sync-engine";
import { newId, stableId } from "../domain/ids";
import { addDaysKey, todayKey } from "../domain/dates";
import { getPhase } from "../domain/phases";
import type { DayItem } from "../domain/plan";
import { adjustToStudyDay, buildReviewsForSession, redistributeReviews, reviewState } from "../domain/reviews";
import { contentHash } from "../domain/text";
import { examDistribution, scaleDistribution, scoreMock, selectMockQuestions, mockElapsed, type Rng } from "../domain/mock";
import { buildBackup, planMerge, PERSONAL_TABLES, type Backup } from "../domain/backup";
import type { ParsedImportRow } from "../domain/importer";
import { buildDefaults, SUBJECT_SEEDS, subjectId as seedSubjectId } from "../seed/defaults";
import { SEED_QUESTIONS } from "../seed/questions";
import { PRELIM_SYLLABUS } from "../seed/syllabus";

export interface Clock { now(): Date }
const systemClock: Clock = { now: () => new Date() };

export interface QuestionDraft {
  subject_id: string | null; topic: string | null; statement: string;
  option_a: string; option_b: string; option_c: string; option_d: string; option_e: string;
  correct_option: Option; explanation: string | null; difficulty: Difficulty; board: string | null; year: number | null;
  tags: string[]; syllabus_topic_id?: string | null;
}

export interface CompleteInput {
  topic?: string | null; notes?: string | null; theorySeconds: number; practiceSeconds: number;
  questionsDone?: number; questionsCorrect?: number; syllabusTopicId?: string | null;
}

export type Actions = ReturnType<typeof createActions>;

export function createActions(engine: SyncEngine, clock: Clock = systemClock) {
  const nowIso = () => clock.now().toISOString();
  const today = () => todayKey(clock.now());
  const uid = () => {
    const u = engine.state.userId;
    if (!u) throw new Error("Usuária não autenticada");
    return u;
  };
  const base = () => ({ user_id: uid(), created_at: nowIso(), updated_at: nowIso() });
  const settings = (): UserSettings => {
    const s = engine.row("user_settings", uid());
    if (!s) throw new Error("Configurações ainda não carregadas");
    return s;
  };
  const subjectsSorted = () => engine.rows("subjects").sort((a, b) => a.sort_order - b.sort_order);

  // ------------------------------------------------------------ Inicialização
  /** Cria matérias, plano, configurações e banco inicial — apenas se ainda não existirem no servidor. */
  function seedIfNeeded(): boolean {
    if (!engine.state.serverLoaded) return false;
    const u = uid();
    if (engine.row("user_settings", u)) return false;
    const d = buildDefaults(u, today(), nowIso());
    engine.upsert("profiles", d.profile);
    engine.upsert("user_settings", d.settings);
    engine.upsert("subjects", d.subjects);
    engine.upsert("study_plan", d.plan);
    engine.upsert("syllabus_topics", buildPrelimSyllabus(u));
    engine.upsert("questions", buildSeedQuestions(u));
    return true;
  }

  function buildPrelimSyllabus(u: string): SyllabusTopic[] {
    const out: SyllabusTopic[] = [];
    for (const s of SUBJECT_SEEDS) {
      const sid = seedSubjectId(u, s.slug);
      (PRELIM_SYLLABUS[s.slug] ?? []).forEach(([theme, items], i) => {
        const tid = stableId("topic", u, s.slug, i);
        out.push(topicRow({ id: tid, subject_id: sid, parent_id: null, level: 1, code: `${i + 1}`, title: theme, sort_order: i, origin: "preliminar" }));
        items.forEach((it, j) =>
          out.push(topicRow({ id: stableId("topic", u, s.slug, i, j), subject_id: sid, parent_id: tid, level: 2, code: `${i + 1}.${j + 1}`, title: it, sort_order: j, origin: "preliminar" })));
      });
    }
    return out;
  }

  function topicRow(p: Pick<SyllabusTopic, "id" | "subject_id" | "parent_id" | "level" | "code" | "title" | "sort_order" | "origin"> & Partial<SyllabusTopic>): SyllabusTopic {
    return {
      ...base(), status: "nao_estudado", priority: false, notes: null, manual_seconds: 0, manual_questions: 0, manual_correct: 0,
      in_current_edital: true, version_id: null, last_studied_at: null, ...p,
    };
  }

  function buildSeedQuestions(u: string): Question[] {
    const out: Question[] = [];
    for (const [slug, list] of Object.entries(SEED_QUESTIONS)) {
      list.forEach(([topic, difficulty, statement, opts, correct, explanation], i) => {
        out.push({
          ...base(), id: stableId("seedq", u, slug, i), subject_id: seedSubjectId(u, slug), syllabus_topic_id: null, topic, statement,
          option_a: opts[0], option_b: opts[1], option_c: opts[2], option_d: opts[3], option_e: opts[4], correct_option: correct,
          explanation, difficulty, board: "Autoral (questão original)", year: null, tags: ["autoral"], origin: "autoral",
          favorite: false, needs_review: false, status: "nao_respondida", times_answered: 0, last_answered_at: null,
          content_hash: contentHash(statement, opts),
        });
      });
    }
    return out;
  }

  // ------------------------------------------------------------ Sessões
  const plannedSessionId = (key: string) => stableId("session", uid(), key);

  function newSession(p: Partial<StudySession> & Pick<StudySession, "date" | "activity">): StudySession {
    return {
      ...base(), id: newId(), subject_id: null, slot_key: null, review_id: null, syllabus_topic_id: null, label: null, topic: null, notes: null,
      phase: getPhase(p.date, settings()), planned_minutes: settings().session_minutes, theory_seconds: 0, practice_seconds: 0,
      total_seconds: 0, questions_done: 0, questions_correct: 0, status: "em_andamento", source: "timer", started_at: nowIso(), completed_at: null, ...p,
    };
  }

  function startPlannedSession(item: DayItem): StudySession {
    const id = plannedSessionId(item.key);
    const existing = engine.row("study_sessions", id);
    if (existing) return existing;
    const s = newSession({ id, date: item.date, subject_id: item.subjectId, slot_key: item.key, activity: item.activity, label: item.label, planned_minutes: item.minutes });
    engine.upsert("study_sessions", s);
    return s;
  }

  function startAdhocSession(p: { subjectId: string | null; activity: Activity; minutes: number; label?: string; reviewId?: string | null; date?: DateKey }): StudySession {
    const subj = p.subjectId ? engine.row("subjects", p.subjectId) : undefined;
    const s = newSession({ date: p.date ?? today(), subject_id: p.subjectId, activity: p.activity, planned_minutes: p.minutes, label: p.label ?? subj?.name ?? null, review_id: p.reviewId ?? null });
    engine.upsert("study_sessions", s);
    return s;
  }

  function saveSessionProgress(sessionId: string, theorySeconds: number, practiceSeconds: number) {
    const s = engine.row("study_sessions", sessionId);
    if (!s || s.status === "concluida") return;
    engine.patch("study_sessions", sessionId, {
      theory_seconds: Math.round(theorySeconds), practice_seconds: Math.round(practiceSeconds),
      total_seconds: Math.min(86400, Math.round(theorySeconds + practiceSeconds)),
    });
  }

  /** Conclui a sessão, registra o tempo efetivo e gera as revisões D+1/D+7/D+30. */
  function completeSession(sessionId: string, input: CompleteInput): { session: StudySession; reviews: ReviewItem[] } {
    const s = engine.row("study_sessions", sessionId);
    if (!s) throw new Error("Sessão não encontrada");
    const done = Math.max(0, input.questionsDone ?? 0);
    const correct = Math.min(done, Math.max(0, input.questionsCorrect ?? 0));
    const theory = Math.max(0, Math.round(input.theorySeconds));
    const practice = Math.max(0, Math.round(input.practiceSeconds));
    const topicRowRef = input.syllabusTopicId ? engine.row("syllabus_topics", input.syllabusTopicId) : undefined;
    const topic = (input.topic ?? "").trim() || topicRowRef?.title || null;
    const updated: StudySession = {
      ...s, topic, notes: (input.notes ?? "").trim() || null, theory_seconds: theory, practice_seconds: practice,
      total_seconds: Math.min(86400, theory + practice), questions_done: done, questions_correct: correct,
      syllabus_topic_id: input.syllabusTopicId ?? s.syllabus_topic_id, status: "concluida", completed_at: nowIso(),
    };
    engine.upsert("study_sessions", updated);
    let reviews: ReviewItem[] = [];
    if (["teoria_questoes", "teoria", "questoes"].includes(updated.activity) && (updated.subject_id || updated.syllabus_topic_id) && updated.total_seconds > 0) {
      const st = settings();
      reviews = buildReviewsForSession(updated, { intervals: st.review_intervals, restWeekdays: st.rest_weekdays, userId: uid(), nowIso: nowIso() }, engine.rows("review_schedule"))
        .map((r) => ({ ...r, syllabus_topic_id: updated.syllabus_topic_id }));
      if (reviews.length) engine.upsert("review_schedule", reviews);
    }
    if (topicRowRef && topicRowRef.status === "nao_estudado") engine.patch("syllabus_topics", topicRowRef.id, { status: "estudado", last_studied_at: nowIso() });
    else if (topicRowRef) engine.patch("syllabus_topics", topicRowRef.id, { last_studied_at: nowIso() });
    return { session: updated, reviews };
  }

  /** Marca uma sessão planejada como concluída sem usar o cronômetro. */
  function completePlannedManually(item: DayItem, minutes: number, input: Omit<CompleteInput, "theorySeconds" | "practiceSeconds">) {
    const s = startPlannedSession(item);
    const total = Math.max(0, minutes) * 60;
    const theoryShare = item.minutes > 0 ? item.theoryMinutes / item.minutes : 1;
    engine.patch("study_sessions", s.id, { source: "manual" });
    return completeSession(s.id, { ...input, theorySeconds: Math.round(total * theoryShare), practiceSeconds: Math.round(total * (1 - theoryShare)) });
  }

  function logManualSession(p: { date: DateKey; subjectId: string | null; activity: Activity; minutes: number } & Omit<CompleteInput, "theorySeconds" | "practiceSeconds">) {
    const s = startAdhocSession({ subjectId: p.subjectId, activity: p.activity, minutes: p.minutes, date: p.date });
    engine.patch("study_sessions", s.id, { source: "manual" });
    const total = Math.max(0, p.minutes) * 60;
    const isPractice = p.activity === "questoes";
    return completeSession(s.id, { ...p, theorySeconds: isPractice ? 0 : total, practiceSeconds: isPractice ? total : 0 });
  }

  /** Reabre uma sessão planejada (ex.: marcada por engano). Revisões já criadas são mantidas. */
  function reopenSession(sessionId: string) {
    engine.patch("study_sessions", sessionId, { status: "em_andamento", completed_at: null });
  }

  function deleteSession(sessionId: string) {
    const reviews = engine.rows("review_schedule").filter((r) => r.session_id === sessionId).map((r) => r.id);
    engine.remove("review_schedule", reviews);
    engine.remove("study_sessions", sessionId);
  }

  // ------------------------------------------------------------ Revisões
  /** Conclui a revisão. Se houve tempo cronometrado, registra uma sessão de "revisão" (conta nas horas). */
  function completeReview(reviewId: string, seconds = 0, sessionId?: string) {
    const r = engine.row("review_schedule", reviewId);
    if (!r) return;
    engine.patch("review_schedule", reviewId, { status: "concluida", completed_at: nowIso() });
    if (seconds > 0) {
      const sid = sessionId && engine.row("study_sessions", sessionId) ? sessionId
        : startAdhocSession({ subjectId: r.subject_id, activity: "revisao", minutes: settings().review_minutes, reviewId, label: r.topic ? `Revisão: ${r.topic}` : "Revisão" }).id;
      completeSession(sid, { theorySeconds: seconds, practiceSeconds: 0, topic: r.topic });
    } else if (sessionId) deleteSession(sessionId);
    if (r.syllabus_topic_id) {
      const t = engine.row("syllabus_topics", r.syllabus_topic_id);
      if (t && (t.status === "nao_estudado" || t.status === "estudado")) engine.patch("syllabus_topics", t.id, { status: "revisado", last_studied_at: nowIso() });
    }
  }

  function reopenReview(reviewId: string) {
    engine.patch("review_schedule", reviewId, { status: "pendente", completed_at: null });
  }

  function postponeReview(reviewId: string, date: DateKey) {
    const r = engine.row("review_schedule", reviewId);
    if (!r) return;
    engine.patch("review_schedule", reviewId, { due_date: adjustToStudyDay(date, settings().rest_weekdays), reschedule_count: r.reschedule_count + 1 });
  }

  /** Reorganiza revisões atrasadas a partir de hoje (limite diário). Não apaga nenhuma. */
  function redistributeOverdue(): number {
    const t = today();
    const st = settings();
    const pending = engine.rows("review_schedule").filter((r) => r.status === "pendente");
    const overdue = pending.filter((r) => reviewState(r, t) === "atrasada");
    const load: Record<string, number> = {};
    for (const r of pending) if (reviewState(r, t) !== "atrasada") load[r.due_date] = (load[r.due_date] ?? 0) + 1;
    const plan = redistributeReviews(overdue, t, st.max_reviews_per_day, st.rest_weekdays, load);
    engine.upsert("review_schedule", plan.map((p) => {
      const r = engine.row("review_schedule", p.id)!;
      return { ...r, due_date: p.due_date, reschedule_count: r.reschedule_count + 1 };
    }));
    return plan.length;
  }

  /** Revisões para um conteúdo do edital verticalizado (sem sessão de origem). */
  function createTopicReviews(topicId: string, baseDate: DateKey = today()): ReviewItem[] {
    const t = engine.row("syllabus_topics", topicId);
    if (!t) return [];
    const st = settings();
    const out: ReviewItem[] = st.review_intervals.map((interval): ReviewItem => {
      const due = adjustToStudyDay(addDaysKey(baseDate, interval), st.rest_weekdays);
      return {
        ...base(), id: stableId("topic-review", topicId, baseDate, interval), session_id: null, subject_id: t.subject_id, syllabus_topic_id: t.id,
        topic: t.title, interval_days: interval, base_date: baseDate, original_due_date: due, due_date: due, status: "pendente", completed_at: null, reschedule_count: 0,
      };
    }).filter((r) => !engine.row("review_schedule", r.id));
    engine.upsert("review_schedule", out);
    return out;
  }

  // ------------------------------------------------------------ Questões
  function createQuestion(d: QuestionDraft, origin: Question["origin"] = "manual"): Question {
    const q: Question = {
      ...base(), id: newId(), ...d, syllabus_topic_id: d.syllabus_topic_id ?? null, topic: d.topic?.trim() || null,
      explanation: d.explanation?.trim() || null, board: d.board?.trim() || null, origin, favorite: false, needs_review: false,
      status: "nao_respondida", times_answered: 0, last_answered_at: null,
      content_hash: contentHash(d.statement, [d.option_a, d.option_b, d.option_c, d.option_d, d.option_e]),
    };
    if (engine.rows("questions").some((x) => x.content_hash === q.content_hash)) throw new Error("Já existe uma questão com o mesmo enunciado e alternativas.");
    engine.upsert("questions", q);
    return q;
  }

  function updateQuestion(id: string, d: QuestionDraft) {
    const hash = contentHash(d.statement, [d.option_a, d.option_b, d.option_c, d.option_d, d.option_e]);
    if (engine.rows("questions").some((x) => x.id !== id && x.content_hash === hash)) throw new Error("Já existe outra questão idêntica.");
    engine.patch("questions", id, { ...d, topic: d.topic?.trim() || null, explanation: d.explanation?.trim() || null, content_hash: hash });
  }

  /** Exclui a questão. O histórico de respostas é preservado (fica sem vínculo). */
  function deleteQuestion(id: string) { engine.remove("questions", id); }
  function toggleFavorite(id: string) { const q = engine.row("questions", id); if (q) engine.patch("questions", id, { favorite: !q.favorite }); }
  function toggleNeedsReview(id: string) { const q = engine.row("questions", id); if (q) engine.patch("questions", id, { needs_review: !q.needs_review }); }
  function setQuestionTags(id: string, tags: string[]) { engine.patch("questions", id, { tags: [...new Set(tags)] }); }

  function importQuestions(rows: ParsedImportRow[]): number {
    const existing = new Set(engine.rows("questions").map((q) => q.content_hash));
    const list: Question[] = rows.filter((r) => !existing.has(r.data.hash)).map((r) => ({
      ...base(), id: newId(), subject_id: r.data.subject_id, syllabus_topic_id: null, topic: r.data.assunto || null, statement: r.data.enunciado,
      option_a: r.data.a, option_b: r.data.b, option_c: r.data.c, option_d: r.data.d, option_e: r.data.e, correct_option: r.data.correct_option,
      explanation: r.data.explicacao || null, difficulty: r.data.dificuldade, board: r.data.banca || null, year: r.data.ano, tags: r.data.tags,
      origin: "importada", favorite: false, needs_review: false, status: "nao_respondida", times_answered: 0, last_answered_at: null, content_hash: r.data.hash,
    }));
    engine.upsert("questions", list);
    return list.length;
  }

  function attemptRow(q: Question, option: Option | null, mode: QuestionAttempt["mode"], extra: Partial<QuestionAttempt> = {}): QuestionAttempt {
    return {
      ...base(), id: newId(), question_id: q.id, subject_id: q.subject_id, topic: q.topic, selected_option: option, correct_option: q.correct_option,
      is_correct: option !== null && option === q.correct_option, difficulty: q.difficulty, mode, mock_exam_id: null, error_note_id: null, answered_at: nowIso(), ...extra,
    };
  }

  /** Registra a resposta no modo estudo. Retorna se acertou e, se configurado, adiciona ao caderno. */
  function answerQuestion(questionId: string, option: Option): { correct: boolean; attempt: QuestionAttempt; noteId: string | null } {
    const q = engine.row("questions", questionId);
    if (!q) throw new Error("Questão não encontrada");
    const a = attemptRow(q, option, "treino");
    engine.upsert("question_attempts", a);
    engine.patch("questions", q.id, { status: a.is_correct ? "correta" : "incorreta", times_answered: q.times_answered + 1, last_answered_at: a.answered_at });
    let noteId: string | null = null;
    if (!a.is_correct && settings().auto_add_errors) noteId = addToNotebook(q.id, option).id;
    return { correct: a.is_correct, attempt: a, noteId };
  }

  // ------------------------------------------------------------ Caderno de erros
  const noteIdFor = (questionId: string) => stableId("note", uid(), questionId);
  const optionText = (q: Question, o: Option | null) => (o ? `${o}) ${q[`option_${o.toLowerCase()}` as keyof Question]}` : "Em branco");

  function addToNotebook(questionId: string, myAnswer: Option | null): ErrorNote {
    const q = engine.row("questions", questionId);
    if (!q) throw new Error("Questão não encontrada");
    const id = noteIdFor(questionId);
    const cur = engine.row("error_notebook", id);
    if (cur) {
      const updated: ErrorNote = { ...cur, occurrences: cur.occurrences + 1, last_error_at: nowIso(), my_answer: optionText(q, myAnswer), status: cur.status === "dominado" ? "revisando" : cur.status };
      engine.upsert("error_notebook", updated);
      return updated;
    }
    const n: ErrorNote = {
      ...base(), id, question_id: q.id, subject_id: q.subject_id, topic: q.topic, statement: q.statement, my_answer: optionText(q, myAnswer),
      correct_answer: optionText(q, q.correct_option), explanation: q.explanation, personal_note: null, error_date: today(), last_error_at: nowIso(),
      occurrences: 1, review_count: 0, last_reviewed_at: null, status: "pendente",
    };
    engine.upsert("error_notebook", n);
    return n;
  }

  const isInNotebook = (questionId: string) => !!engine.row("error_notebook", noteIdFor(questionId));

  function createManualNote(p: Pick<ErrorNote, "subject_id" | "topic" | "statement" | "my_answer" | "correct_answer" | "explanation" | "personal_note">): ErrorNote {
    const n: ErrorNote = { ...base(), id: newId(), question_id: null, ...p, error_date: today(), last_error_at: nowIso(), occurrences: 1, review_count: 0, last_reviewed_at: null, status: "pendente" };
    engine.upsert("error_notebook", n);
    return n;
  }
  function updateNote(id: string, changes: Partial<ErrorNote>) { engine.patch("error_notebook", id, changes); }
  function deleteNote(id: string) { engine.remove("error_notebook", id); }

  function reviewNote(id: string) {
    const n = engine.row("error_notebook", id);
    if (!n) return;
    engine.patch("error_notebook", id, { review_count: n.review_count + 1, last_reviewed_at: nowIso(), status: n.status === "pendente" ? "revisando" : n.status });
  }
  function setNoteStatus(id: string, status: ErrorNote["status"]) { engine.patch("error_notebook", id, { status }); }

  /**
   * Refaz a questão do caderno ANTES de ver o gabarito. Registra uma tentativa do tipo "revisao"
   * (separada do histórico de treino) e conta como revisão da anotação. O erro original permanece.
   */
  function retryNoteQuestion(noteId: string, option: Option): { correct: boolean; attempt: QuestionAttempt } {
    const n = engine.row("error_notebook", noteId);
    if (!n?.question_id) throw new Error("Esta anotação não está ligada a uma questão do banco");
    const q = engine.row("questions", n.question_id);
    if (!q) throw new Error("A questão original foi excluída");
    const a = attemptRow(q, option, "revisao", { error_note_id: noteId });
    engine.upsert("question_attempts", a);
    reviewNote(noteId);
    return { correct: a.is_correct, attempt: a };
  }

  // ------------------------------------------------------------ Simulados
  function createMock(p: { kind: MockExam["kind"]; title?: string; total?: number; subjectIds?: string[]; minutes?: number; rng?: Rng }) {
    const subjects = subjectsSorted();
    let dist: MockDistributionItem[] = examDistribution(subjects);
    if (p.subjectIds?.length) dist = dist.filter((d) => p.subjectIds!.includes(d.subject_id));
    const fullTotal = dist.reduce((s, d) => s + d.count, 0);
    if (p.total && p.total !== fullTotal) dist = scaleDistribution(dist, p.total);
    const sel = selectMockQuestions(dist, engine.rows("questions"), p.rng);
    if (sel.picks.length === 0) throw new Error("Não há questões no banco para montar o simulado.");
    const st = settings();
    const id = newId();
    const minutes = p.minutes ?? (p.kind === "completo" ? st.mock_duration_minutes : Math.max(10, Math.round((st.mock_duration_minutes * sel.picks.length) / Math.max(1, st.exam_total_questions))));
    const count = engine.rows("mock_exams").length + 1;
    const mock: MockExam = {
      ...base(), id, title: p.title?.trim() || `${p.kind === "completo" ? "Simulado completo" : "Simulado personalizado"} nº ${count}`, kind: p.kind,
      status: "em_andamento", started_at: nowIso(), finished_at: null, time_limit_seconds: minutes * 60, elapsed_seconds: 0, resumed_at: nowIso(),
      total_questions: sel.picks.length, answered_count: 0, correct_count: null, current_index: 0, distribution: dist,
    };
    engine.upsert("mock_exams", mock);
    engine.upsert("mock_exam_questions", sel.picks.map((pk, i): MockExamQuestion => ({
      ...base(), id: newId(), mock_exam_id: id, question_id: pk.question.id, position: i, subject_id: pk.subject_id,
      correct_option: pk.question.correct_option, selected_option: null, flagged: false, is_correct: null, answered_at: null,
    })));
    return { mock, shortages: sel.shortages };
  }

  const mockQuestions = (mockId: string) => engine.rows("mock_exam_questions").filter((q) => q.mock_exam_id === mockId).sort((a, b) => a.position - b.position);

  function answerMock(mqId: string, option: Option | null) {
    const mq = engine.row("mock_exam_questions", mqId);
    if (!mq) return;
    const m = engine.row("mock_exams", mq.mock_exam_id);
    if (!m || m.status === "finalizado") return;
    engine.patch("mock_exam_questions", mqId, { selected_option: option, answered_at: option ? nowIso() : null });
    const answeredCount = mockQuestions(m.id).filter((q) => q.selected_option).length;
    engine.patch("mock_exams", m.id, { answered_count: answeredCount });
  }
  function flagMock(mqId: string) { const mq = engine.row("mock_exam_questions", mqId); if (mq) engine.patch("mock_exam_questions", mqId, { flagged: !mq.flagged }); }
  function setMockIndex(mockId: string, i: number) { engine.patch("mock_exams", mockId, { current_index: i }); }
  function pauseMock(mockId: string) {
    const m = engine.row("mock_exams", mockId);
    if (!m || !m.resumed_at) return;
    engine.patch("mock_exams", mockId, { elapsed_seconds: mockElapsed(m, clock.now().getTime()), resumed_at: null });
  }
  function resumeMock(mockId: string) {
    const m = engine.row("mock_exams", mockId);
    if (!m || m.resumed_at || m.status === "finalizado") return;
    engine.patch("mock_exams", mockId, { resumed_at: nowIso() });
  }

  /** Entrega o simulado: corrige, salva o resultado e registra as respostas no histórico. */
  function finalizeMock(mockId: string) {
    const m = engine.row("mock_exams", mockId);
    if (!m) throw new Error("Simulado não encontrado");
    if (m.status === "finalizado") return scoreMock(mockQuestions(mockId));
    const qs = mockQuestions(mockId);
    const score = scoreMock(qs);
    const elapsed = Math.min(m.time_limit_seconds, mockElapsed(m, clock.now().getTime()));
    engine.upsert("mock_exam_questions", qs.map((q) => ({ ...q, is_correct: q.selected_option ? q.selected_option === q.correct_option : null })));
    const attempts: QuestionAttempt[] = [];
    for (const mq of qs) {
      if (!mq.selected_option) continue; // em branco: não vira tentativa (não conta como erro nas estatísticas)
      const q = mq.question_id ? engine.row("questions", mq.question_id) : undefined;
      const a: QuestionAttempt = {
        ...base(), id: stableId("mock-attempt", mq.id), question_id: mq.question_id, subject_id: mq.subject_id, topic: q?.topic ?? null,
        selected_option: mq.selected_option, correct_option: mq.correct_option, is_correct: mq.selected_option === mq.correct_option,
        difficulty: q?.difficulty ?? null, mode: "simulado", mock_exam_id: mockId, error_note_id: null, answered_at: mq.answered_at ?? nowIso(),
      };
      attempts.push(a);
      if (q) engine.patch("questions", q.id, { status: a.is_correct ? "correta" : "incorreta", times_answered: q.times_answered + 1, last_answered_at: a.answered_at });
    }
    engine.upsert("question_attempts", attempts);
    engine.patch("mock_exams", mockId, { status: "finalizado", finished_at: nowIso(), elapsed_seconds: elapsed, resumed_at: null, correct_count: score.correct, answered_count: score.answered });
    return score;
  }

  function addMockErrorsToNotebook(mockId: string): number {
    let n = 0;
    for (const mq of mockQuestions(mockId)) {
      if (mq.question_id && mq.selected_option && mq.selected_option !== mq.correct_option && engine.row("questions", mq.question_id)) {
        if (!isInNotebook(mq.question_id)) n++;
        addToNotebook(mq.question_id, mq.selected_option);
      }
    }
    return n;
  }

  function deleteMock(mockId: string) {
    engine.remove("mock_exam_questions", mockQuestions(mockId).map((q) => q.id));
    engine.remove("mock_exams", mockId);
  }

  // ------------------------------------------------------------ Configurações, matérias e plano
  function updateSettings(changes: Partial<UserSettings>) { engine.patch("user_settings", uid(), changes); }

  function addSubject(p: { name: string; short_name?: string; exam_questions: number; color?: string }): Subject {
    const s: Subject = {
      ...base(), id: newId(), slug: null, name: p.name.trim(), short_name: (p.short_name || p.name).trim().slice(0, 80), color: p.color ?? "#2E6B4B",
      exam_questions: Math.max(0, Math.round(p.exam_questions)), sort_order: engine.rows("subjects").length, active: true,
    };
    engine.upsert("subjects", s);
    return s;
  }
  function updateSubject(id: string, changes: Partial<Subject>) { engine.patch("subjects", id, changes); }

  function setPlanSlot(slot: Partial<StudyPlanSlot> & Pick<StudyPlanSlot, "weekday" | "position" | "slot_type">) {
    const id = slot.id ?? newId();
    const cur = engine.row("study_plan", id);
    engine.upsert("study_plan", { ...base(), ...cur, subject_id: null, duration_minutes: settings().session_minutes, ...slot, id } as StudyPlanSlot);
  }
  function removePlanSlot(id: string) { engine.remove("study_plan", id); }
  function replacePlan(slots: Omit<StudyPlanSlot, "id" | "user_id" | "created_at" | "updated_at">[]) {
    const old = engine.rows("study_plan").map((p) => p.id);
    engine.remove("study_plan", old);
    engine.upsert("study_plan", slots.map((s) => ({ ...base(), id: newId(), ...s })));
  }

  // ------------------------------------------------------------ Edital verticalizado
  function setTopicStatus(id: string, status: TopicStatus) { engine.patch("syllabus_topics", id, { status, last_studied_at: status === "nao_estudado" ? null : nowIso() }); }
  function toggleTopicPriority(id: string) { const t = engine.row("syllabus_topics", id); if (t) engine.patch("syllabus_topics", id, { priority: !t.priority }); }
  function updateTopic(id: string, changes: Partial<SyllabusTopic>) { engine.patch("syllabus_topics", id, changes); }
  function addTopicStudy(id: string, p: { minutes: number; questions: number; correct: number }) {
    const t = engine.row("syllabus_topics", id);
    if (!t) return;
    const q = Math.max(0, Math.round(p.questions));
    engine.patch("syllabus_topics", id, {
      manual_seconds: t.manual_seconds + Math.max(0, Math.round(p.minutes * 60)), manual_questions: t.manual_questions + q,
      manual_correct: t.manual_correct + Math.min(q, Math.max(0, Math.round(p.correct))),
      status: t.status === "nao_estudado" && p.minutes > 0 ? "estudado" : t.status, last_studied_at: nowIso(),
    });
  }
  function addTopic(p: { subject_id: string; parent_id: string | null; title: string }): SyllabusTopic {
    const parent = p.parent_id ? engine.row("syllabus_topics", p.parent_id) : undefined;
    const siblings = engine.rows("syllabus_topics").filter((t) => t.subject_id === p.subject_id && t.parent_id === p.parent_id);
    const t = topicRow({ id: newId(), subject_id: p.subject_id, parent_id: p.parent_id, level: parent ? parent.level + 1 : 1, code: null, title: p.title.trim(), sort_order: siblings.length, origin: "manual" });
    engine.upsert("syllabus_topics", t);
    return t;
  }
  function deleteTopic(id: string) {
    const all = engine.rows("syllabus_topics");
    const ids = new Set([id]);
    let grew = true;
    while (grew) { grew = false; for (const t of all) if (t.parent_id && ids.has(t.parent_id) && !ids.has(t.id)) { ids.add(t.id); grew = true; } }
    engine.remove("syllabus_topics", [...ids]);
  }
  function linkQuestionToTopic(questionId: string, topicId: string | null) { engine.patch("questions", questionId, { syllabus_topic_id: topicId }); }

  // ------------------------------------------------------------ Notificações
  function notify(p: Pick<UserNotification, "kind" | "title"> & Partial<UserNotification>, id = newId()): UserNotification | null {
    if (engine.row("user_notifications", id)) return null;
    const n: UserNotification = { ...base(), id, body: null, link: null, source_update_id: null, read_at: null, ...p };
    engine.upsert("user_notifications", n);
    return n;
  }
  function markNotificationRead(id: string) { engine.patch("user_notifications", id, { read_at: nowIso() }); }
  function markAllNotificationsRead() {
    const unread = engine.rows("user_notifications").filter((n) => !n.read_at);
    engine.upsert("user_notifications", unread.map((n) => ({ ...n, read_at: nowIso() })));
  }

  // ------------------------------------------------------------ Backup
  function exportBackup(): Backup { return buildBackup(engine.state.data as never, clock.now()); }

  /**
   * Restaura um backup. "mesclar" adiciona o que falta e atualiza o que for mais novo.
   * "substituir" apaga os registros atuais que NÃO estão no backup (só após confirmação explícita na tela).
   */
  function importBackup(b: Backup, mode: "mesclar" | "substituir"): { added: number; removed: number } {
    const u = uid();
    let added = 0, removed = 0;
    // ordem: pais antes de filhos
    for (const t of PERSONAL_TABLES) {
      const incoming = (b.data[t] ?? []).map((r) => ({ ...r, user_id: u, ...(t === "user_settings" || t === "profiles" ? { id: u } : {}) }));
      const current = engine.state.data[t] as Record<string, { id: string; updated_at?: string }>;
      const rows = mode === "mesclar" ? planMerge(current, incoming) : incoming;
      if (rows.length) { engine.upsert(t as TableName, rows as never); added += rows.length; }
    }
    if (mode === "substituir") {
      for (const t of [...PERSONAL_TABLES].reverse()) {
        if (t === "user_settings" || t === "profiles") continue;
        const keep = new Set((b.data[t] ?? []).map((r) => r.id));
        const del = Object.keys(engine.state.data[t]).filter((id) => !keep.has(id));
        if (del.length) { engine.remove(t, del); removed += del.length; }
      }
    }
    return { added, removed };
  }

  return {
    engine, settings, subjectsSorted, today, nowIso, uid,
    seedIfNeeded, buildSeedQuestions, buildPrelimSyllabus, topicRow,
    plannedSessionId, startPlannedSession, startAdhocSession, saveSessionProgress, completeSession, completePlannedManually,
    logManualSession, reopenSession, deleteSession,
    completeReview, reopenReview, postponeReview, redistributeOverdue, createTopicReviews,
    createQuestion, updateQuestion, deleteQuestion, toggleFavorite, toggleNeedsReview, setQuestionTags, importQuestions, answerQuestion,
    addToNotebook, isInNotebook, noteIdFor, createManualNote, updateNote, deleteNote, reviewNote, setNoteStatus, retryNoteQuestion,
    createMock, mockQuestions, answerMock, flagMock, setMockIndex, pauseMock, resumeMock, finalizeMock, addMockErrorsToNotebook, deleteMock,
    updateSettings, addSubject, updateSubject, setPlanSlot, removePlanSlot, replacePlan,
    setTopicStatus, toggleTopicPriority, updateTopic, addTopicStudy, addTopic, deleteTopic, linkQuestionToTopic,
    notify, markNotificationRead, markAllNotificationsRead,
    exportBackup, importBackup,
  };
}
