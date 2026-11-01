import { describe, expect, it } from "vitest";
import { MemoryBackend } from "@/lib/data/memory-backend";
import { MemoryPersistence } from "@/lib/data/persistence";
import { SyncEngine } from "@/lib/data/sync-engine";
import { createActions } from "@/lib/data/actions";
import { getDayItems } from "@/lib/domain/plan";
import { seededRng } from "@/lib/domain/mock";
import { validateBackup } from "@/lib/domain/backup";
import { questionStats, questionState } from "@/lib/domain/analytics";
import { accuracyBySubject } from "@/lib/domain/stats";
import { UID } from "../helpers";

const clockAt = (iso: string) => ({ now: () => new Date(iso) });

async function device(server: MemoryBackend, persistence = new MemoryPersistence(), iso = "2026-11-02T13:00:00") {
  const engine = new SyncEngine(server, persistence, { debounceMs: 0, autoRetry: false });
  await engine.start(UID);
  const actions = createActions(engine, clockAt(iso));
  return { engine, actions, persistence };
}

async function seeded() {
  const server = new MemoryBackend();
  const a = await device(server);
  expect(a.actions.seedIfNeeded()).toBe(true);
  await a.engine.flush();
  return { server, a };
}

describe("persistência e sincronização entre aparelhos", () => {
  it("dados iniciais vão para o servidor e aparecem no outro aparelho, sem duplicar", async () => {
    const { server, a } = await seeded();
    expect(server.tables.subjects?.size).toBe(12);
    expect(server.tables.questions?.size).toBe(70);
    const b = await device(server);
    expect(b.engine.rows("subjects")).toHaveLength(12);
    expect(b.actions.seedIfNeeded()).toBe(false); // já existe: não semeia de novo
    expect(a.actions.seedIfNeeded()).toBe(false);
  });

  it("não semeia antes de conseguir falar com o servidor (evita sobrescrever dados)", async () => {
    const server = new MemoryBackend();
    server.online = false;
    const a = await device(server);
    expect(a.engine.state.serverLoaded).toBe(false);
    expect(a.actions.seedIfNeeded()).toBe(false);
  });

  it("alteração num aparelho chega no outro; exclusões também", async () => {
    const { server, a } = await seeded();
    const b = await device(server);
    const q = a.engine.rows("questions")[0];
    a.actions.toggleFavorite(q.id);
    await a.engine.flush();
    await b.engine.pull();
    expect(b.engine.row("questions", q.id)?.favorite).toBe(true);
    b.actions.deleteQuestion(q.id);
    await b.engine.flush();
    await a.engine.pull();
    expect(a.engine.row("questions", q.id)).toBeUndefined();
  });

  it("offline: guarda na fila, mostra status e envia quando a internet volta (sobrevive a recarregar)", async () => {
    const { server, a } = await seeded();
    server.online = false;
    const s = a.actions.logManualSession({ date: "2026-11-02", subjectId: a.engine.rows("subjects")[0].id, activity: "teoria_questoes", minutes: 60, topic: "Crase" });
    await a.engine.flush();
    expect(a.engine.state.sync.status).toBe("offline");
    expect(a.engine.pendingCount()).toBeGreaterThan(0);
    // recarrega a página ainda offline: dados e fila continuam lá
    const reloaded = await device(server, a.persistence);
    expect(reloaded.engine.row("study_sessions", s.session.id)?.status).toBe("concluida");
    server.online = true;
    await reloaded.engine.sync();
    expect(reloaded.engine.state.sync.status).toBe("synced");
    expect(server.tables.study_sessions?.get(s.session.id)).toBeDefined();
    expect(server.tables.review_schedule?.size).toBe(3);
  });

  it("erro do servidor fica visível e não perde a alteração", async () => {
    const { server, a } = await seeded();
    server.failNext = "violates check constraint";
    const seen: { status: string; error: string | null }[] = [];
    const unsub = a.engine.store.subscribe((st) => seen.push({ status: st.sync.status, error: st.sync.error }));
    a.actions.updateSettings({ target_accuracy: 75 });
    await a.engine.flush();
    unsub();
    expect(seen.some((x) => x.status === "error" && /check constraint/.test(x.error ?? ""))).toBe(true);
    await a.engine.flush();
    expect(a.engine.state.sync.status).toBe("synced");
    expect(server.tables.user_settings?.get(UID)?.target_accuracy).toBe(75);
  });

  it("alteração local pendente não é sobrescrita por dado antigo do servidor", async () => {
    const { server, a } = await seeded();
    server.online = false;
    a.actions.updateSettings({ daily_goal_minutes: 90 });
    server.online = true;
    // servidor tem valor antigo; pull acontece antes do envio
    await a.engine.pull();
    expect(a.actions.settings().daily_goal_minutes).toBe(90);
  });
});

describe("fluxo de estudo", () => {
  it("iniciar sessão planejada, salvar progresso, concluir e gerar revisões D+1/D+7/D+30", async () => {
    const { a } = await seeded();
    const st = a.actions.settings();
    const items = getDayItems("2026-11-02", { settings: st, subjects: a.engine.rows("subjects"), plan: a.engine.rows("study_plan") });
    const s = a.actions.startPlannedSession(items[0]);
    expect(a.actions.startPlannedSession(items[0]).id).toBe(s.id); // não duplica
    a.actions.saveSessionProgress(s.id, 600, 0);
    expect(a.engine.row("study_sessions", s.id)?.total_seconds).toBe(600);
    const { reviews } = a.actions.completeSession(s.id, { topic: "Crase", theorySeconds: 2100, practiceSeconds: 1500, questionsDone: 10, questionsCorrect: 7 });
    expect(reviews.map((r) => r.due_date)).toEqual(["2026-11-03", "2026-11-09", "2026-12-02"]);
    const saved = a.engine.row("study_sessions", s.id)!;
    expect(saved).toMatchObject({ status: "concluida", total_seconds: 3600, topic: "Crase", questions_correct: 7 });
    // concluir de novo não duplica revisões
    a.actions.completeSession(s.id, { topic: "Crase", theorySeconds: 2100, practiceSeconds: 1500 });
    expect(a.engine.rows("review_schedule")).toHaveLength(3);
  });

  it("revisões: concluir, adiar (domingo vira segunda) e redistribuir atrasadas", async () => {
    const { a } = await seeded();
    const sub = a.engine.rows("subjects")[0].id;
    a.actions.logManualSession({ date: "2026-10-01", subjectId: sub, activity: "teoria_questoes", minutes: 60, topic: "A" });
    a.actions.logManualSession({ date: "2026-10-02", subjectId: sub, activity: "teoria_questoes", minutes: 60, topic: "B" });
    const rs = a.engine.rows("review_schedule");
    expect(rs).toHaveLength(6);
    a.actions.postponeReview(rs[0].id, "2026-11-08");
    expect(a.engine.row("review_schedule", rs[0].id)).toMatchObject({ due_date: "2026-11-09", reschedule_count: 1 });
    a.actions.completeReview(rs[1].id, 900);
    expect(a.engine.row("review_schedule", rs[1].id)?.status).toBe("concluida");
    expect(a.engine.rows("study_sessions").some((s) => s.activity === "revisao" && s.total_seconds === 900)).toBe(true);
    const moved = a.actions.redistributeOverdue();
    expect(moved).toBeGreaterThan(0);
    expect(a.engine.rows("review_schedule").filter((r) => r.status === "pendente" && r.due_date < "2026-11-02")).toHaveLength(0);
    expect(a.engine.rows("review_schedule")).toHaveLength(6 + 0); // nada apagado
  });
});

describe("questões, caderno de erros e análise", () => {
  it("cadastrar, responder, errar e adicionar ao caderno; revisar refazendo a questão", async () => {
    const { a } = await seeded();
    const sub = a.engine.rows("subjects")[0].id;
    const q = a.actions.createQuestion({ subject_id: sub, topic: "Crase", statement: "Questão de teste criada manualmente", option_a: "1", option_b: "2", option_c: "3", option_d: "4", option_e: "5", correct_option: "B", explanation: "Porque sim", difficulty: "medio", board: null, year: null, tags: [] });
    expect(() => a.actions.createQuestion({ ...q, syllabus_topic_id: null })).toThrow(/Já existe/);
    const r1 = a.actions.answerQuestion(q.id, "A");
    expect(r1.correct).toBe(false);
    expect(a.engine.row("questions", q.id)).toMatchObject({ status: "incorreta", times_answered: 1 });
    expect(r1.noteId).toBeNull(); // auto_add_errors desativado por padrão: apenas oferece
    const note = a.actions.addToNotebook(q.id, "A");
    expect(note).toMatchObject({ my_answer: "A) 1", correct_answer: "B) 2", status: "pendente", occurrences: 1 });
    a.actions.answerQuestion(q.id, "C");
    a.actions.addToNotebook(q.id, "C");
    expect(a.engine.row("error_notebook", note.id)?.occurrences).toBe(2);
    // revisão: tenta de novo antes de ver o gabarito
    const rv = a.actions.retryNoteQuestion(note.id, "B");
    expect(rv.correct).toBe(true);
    expect(a.engine.row("error_notebook", note.id)).toMatchObject({ review_count: 1, status: "revisando" });
    const attempts = a.engine.rows("question_attempts").filter((x) => x.question_id === q.id);
    expect(attempts.map((x) => x.mode).sort()).toEqual(["revisao", "treino", "treino"]);
    expect(questionStats(attempts)).toMatchObject({ attempts: 2, wrong: 2, reviewAttempts: 1, reviewCorrect: 1 });
    expect(questionState(attempts)).toMatchObject({ cls: "errada", revised: true });
    expect(accuracyBySubject(a.engine.rows("question_attempts"))[sub]).toEqual({ answered: 2, correct: 0, pct: 0 });
    a.actions.setNoteStatus(note.id, "dominado");
    expect(a.engine.row("error_notebook", note.id)?.status).toBe("dominado");
  });

  it("inclusão automática no caderno quando configurada", async () => {
    const { a } = await seeded();
    a.actions.updateSettings({ auto_add_errors: true });
    const q = a.engine.rows("questions")[0];
    const wrong = (["A", "B", "C", "D", "E"] as const).find((o) => o !== q.correct_option)!;
    const r = a.actions.answerQuestion(q.id, wrong);
    expect(r.noteId).not.toBeNull();
  });
});

describe("simulado", () => {
  it("cria simulado de 70 questões, salva respostas, finaliza e registra histórico", async () => {
    const { server, a } = await seeded();
    const { mock, shortages } = a.actions.createMock({ kind: "completo", rng: seededRng(7) });
    expect(shortages).toEqual([]);
    expect(mock).toMatchObject({ total_questions: 70, time_limit_seconds: 270 * 60, status: "em_andamento" });
    const qs = a.actions.mockQuestions(mock.id);
    // responde 60: 40 certas, 20 erradas, 10 em branco
    qs.slice(0, 40).forEach((q) => a.actions.answerMock(q.id, q.correct_option));
    qs.slice(40, 60).forEach((q) => a.actions.answerMock(q.id, q.correct_option === "A" ? "B" : "A"));
    a.actions.flagMock(qs[5].id);
    expect(a.engine.row("mock_exams", mock.id)?.answered_count).toBe(60);
    const score = a.actions.finalizeMock(mock.id);
    expect(score).toMatchObject({ total: 70, answered: 60, correct: 40, pct: 57.1 });
    expect(a.engine.row("mock_exams", mock.id)).toMatchObject({ status: "finalizado", correct_count: 40 });
    const att = a.engine.rows("question_attempts").filter((x) => x.mock_exam_id === mock.id);
    expect(att).toHaveLength(60); // em branco não vira tentativa (não é erro)
    expect(att.every((x) => x.mode === "simulado")).toBe(true);
    expect(a.actions.addMockErrorsToNotebook(mock.id)).toBe(20);
    // respostas não mudam depois de entregue
    a.actions.answerMock(qs[65].id, "A");
    expect(a.engine.row("mock_exam_questions", qs[65].id)?.selected_option).toBeNull();
    await a.engine.flush();
    expect(server.tables.mock_exams?.get(mock.id)?.status).toBe("finalizado");
  });

  it("simulado personalizado proporcional e pausa do cronômetro", async () => {
    const { a } = await seeded();
    const { mock } = a.actions.createMock({ kind: "personalizado", total: 14, rng: seededRng(1) });
    expect(mock.total_questions).toBe(14);
    a.actions.pauseMock(mock.id);
    expect(a.engine.row("mock_exams", mock.id)?.resumed_at).toBeNull();
    a.actions.resumeMock(mock.id);
    expect(a.engine.row("mock_exams", mock.id)?.resumed_at).not.toBeNull();
  });
});

describe("backup e restauração", () => {
  it("exporta tudo, valida e restaura em outra conta vazia (mesclar)", async () => {
    const { a } = await seeded();
    a.actions.logManualSession({ date: "2026-11-02", subjectId: a.engine.rows("subjects")[0].id, activity: "teoria_questoes", minutes: 45, topic: "Crase" });
    const backup = JSON.parse(JSON.stringify(a.actions.exportBackup()));
    const v = validateBackup(backup);
    expect(v.ok).toBe(true);
    const fresh = await device(new MemoryBackend());
    const res = fresh.actions.importBackup(backup, "mesclar");
    expect(res.removed).toBe(0);
    expect(fresh.engine.rows("questions")).toHaveLength(70);
    expect(fresh.engine.rows("review_schedule")).toHaveLength(3);
    expect(fresh.actions.settings().study_start_date).toBe("2026-11-02");
  });

  it("mesclar nunca apaga; substituir remove apenas o que não está no backup", async () => {
    const { a } = await seeded();
    const backup = a.actions.exportBackup();
    const extra = a.actions.addSubject({ name: "Estatística", exam_questions: 4 });
    expect(a.actions.importBackup(backup, "mesclar").removed).toBe(0);
    expect(a.engine.row("subjects", extra.id)).toBeDefined();
    const r = a.actions.importBackup(backup, "substituir");
    expect(r.removed).toBe(1);
    expect(a.engine.row("subjects", extra.id)).toBeUndefined();
  });
});

describe("videoaulas na biblioteca pessoal", () => {
  it("salva sem duplicar, marca assistida sem marcar domínio e registra histórico", async () => {
    const { a } = await seeded();
    const topic = a.engine.rows("syllabus_topics").find((t) => t.title === "Crase")!;
    const v = { youtubeId: "dQw4w9WgXcQ", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "Aula de crase", channelTitle: "Canal" };
    const r1 = a.actions.saveVideo(v, { subjectId: topic.subject_id, topicId: topic.id });
    const r2 = a.actions.saveVideo(v, { watchLater: true });
    expect(r1.id).toBe(r2.id);
    expect(a.engine.rows("video_lessons")).toHaveLength(1);
    expect(a.engine.row("video_lessons", r1.id)).toMatchObject({ watch_later: true, syllabus_topic_id: topic.id });
    a.actions.logVideoOpen(r1.id);
    a.actions.setVideoWatched(r1.id, true);
    expect(a.engine.row("video_lessons", r1.id)).toMatchObject({ watch_later: false });
    expect(a.engine.row("video_lessons", r1.id)?.history).toHaveLength(1);
    expect(a.engine.row("syllabus_topics", topic.id)?.status).toBe("nao_estudado"); // assistir ≠ dominar
    a.actions.cacheVideoSearch("crase aula", topic.subject_id, topic.id, []);
    expect(a.actions.cachedSearch("Crase aula")?.results).toEqual([]);
  });
});
