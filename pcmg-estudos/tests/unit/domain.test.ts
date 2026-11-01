import { describe, expect, it } from "vitest";
import { addDaysKey, formatClock, greeting, weekdayOf } from "@/lib/domain/dates";
import { daysUntilExam, finalStretchStart, getPhase } from "@/lib/domain/phases";
import { getDayItems, rotationSubject, splitFor, weeklyPlannedMinutes } from "@/lib/domain/plan";
import { adjustToStudyDay, buildReviewsForSession, redistributeReviews, reviewState } from "@/lib/domain/reviews";
import { accuracyBySubject, band, overallAccuracy, pct, progressRatio, streak, studiedDays } from "@/lib/domain/stats";
import { examDistribution, scaleDistribution, scoreMock, seededRng, selectMockQuestions } from "@/lib/domain/mock";
import { SEED_QUESTIONS } from "@/lib/seed/questions";
import { SUBJECT_SEEDS } from "@/lib/seed/defaults";
import { attempt, defaults, session, UID, NOW } from "../helpers";
import type { Question } from "@/lib/types";

describe("datas e saudação", () => {
  it("saudação dinâmica", () => {
    expect(greeting(new Date(2026, 10, 2, 8))).toBe("Bom dia");
    expect(greeting(new Date(2026, 10, 2, 14))).toBe("Boa tarde");
    expect(greeting(new Date(2026, 10, 2, 21))).toBe("Boa noite");
    expect(greeting(new Date(2026, 10, 2, 2))).toBe("Boa noite");
  });
  it("relógio", () => {
    expect(formatClock(35 * 60)).toBe("35:00");
    expect(formatClock(3725)).toBe("1:02:05");
  });
});

describe("fases e contagem regressiva", () => {
  const { settings } = defaults("2026-11-02");
  it("dias restantes", () => {
    expect(daysUntilExam("2026-11-02", settings)).toBe(195);
    expect(daysUntilExam("2026-11-02", { exam_date: null })).toBeNull();
  });
  it("reta final = 6 semanas antes da prova", () => {
    expect(finalStretchStart(settings)).toBe("2027-04-04");
  });
  it("identifica a fase", () => {
    expect(getPhase("2026-11-10", settings)).toBe(1);
    expect(getPhase("2026-12-15", settings)).toBe(2);
    expect(getPhase("2027-04-03", settings)).toBe(2);
    expect(getPhase("2027-04-04", settings)).toBe(3);
    expect(getPhase("2027-06-01", { ...settings, exam_date: null })).toBe(2);
    expect(getPhase("2027-06-01", { ...settings, exam_date: null, edital_date: null })).toBe(1);
  });
  it("recalcula fases ao adiar a prova", () => {
    const adiada = { ...settings, exam_date: "2027-08-01" };
    expect(getPhase("2027-04-10", adiada)).toBe(2);
  });
});

describe("plano de estudos", () => {
  const d = defaults("2026-11-02");
  const ctx = { settings: d.settings, subjects: d.subjects, plan: d.plan };
  const name = (id: string | null) => d.subjects.find((s) => s.id === id)?.short_name;
  it("12 horas semanais e domingo livre", () => {
    expect(weeklyPlannedMinutes(d.plan)).toBe(720);
    expect(getDayItems("2026-11-08", ctx)).toEqual([]); // domingo
  });
  it("segunda: Português + Dir. Administrativo, 35/25 na fase 1", () => {
    const items = getDayItems("2026-11-02", ctx);
    expect(items.map((i) => name(i.subjectId))).toEqual(["Português", "Dir. Administrativo"]);
    expect(items[0].theoryMinutes).toBe(35);
    expect(items[0].questionsMinutes).toBe(25);
  });
  it("sábado: revisão da semana + questões misturadas", () => {
    expect(getDayItems("2026-11-07", ctx).map((i) => i.activity)).toEqual(["revisao", "questoes"]);
  });
  it("rotação de sexta na fase 1 alterna Medicina Legal e Criminologia", () => {
    const a = getDayItems("2026-11-06", ctx)[1];
    const b = getDayItems("2026-11-13", ctx)[1];
    const c = getDayItems("2026-11-20", ctx)[1];
    expect(a.rotation).toBe(true);
    expect([name(a.subjectId), name(b.subjectId), name(c.subjectId)]).toEqual(["Medicina Legal", "Criminologia", "Medicina Legal"]);
  });
  it("rotação da fase 2 percorre 5 matérias", () => {
    const names = [0, 1, 2, 3, 4, 5].map((w) => name(rotationSubject(addDaysKey("2026-12-18", w * 7), ctx).subject?.id ?? null));
    expect(names).toEqual(["Medicina Legal", "Criminologia", "Leg. Extravagante", "Direitos Humanos", "Lei Orgânica PCMG", "Medicina Legal"]);
  });
  it("fase 3: sexta escolhe a matéria mais fraca e sábado vira simulado", () => {
    const penal = d.subjects.find((s) => s.slug === "dir-penal")!;
    const port = d.subjects.find((s) => s.slug === "portugues")!;
    const acc = { [penal.id]: { answered: 10, correct: 4, pct: 40 }, [port.id]: { answered: 10, correct: 9, pct: 90 } };
    const fri = getDayItems("2027-04-09", { ...ctx, accuracy: acc });
    expect(name(fri[1].subjectId)).toBe("Dir. Penal");
    const sat = getDayItems("2027-04-10", ctx);
    expect(sat).toHaveLength(1);
    expect(sat[0].activity).toBe("simulado");
    expect(splitFor(3, 60, d.settings)).toEqual({ theory: 15, questions: 45 });
  });
});

describe("revisão espaçada", () => {
  const opts = { intervals: [1, 7, 30], restWeekdays: [0], userId: UID, nowIso: NOW };
  it("gera D+1, D+7 e D+30 vinculadas à sessão", () => {
    const r = buildReviewsForSession({ id: "s-1", date: "2026-11-02", subject_id: "sub", topic: "Crase" }, opts);
    expect(r.map((x) => x.due_date)).toEqual(["2026-11-03", "2026-11-09", "2026-12-02"]);
    expect(r.every((x) => x.session_id === "s-1" && x.topic === "Crase" && x.status === "pendente")).toBe(true);
  });
  it("domingo vai para segunda", () => {
    // sábado 07/11 + 1 = domingo 08/11 -> segunda 09/11
    const r = buildReviewsForSession({ id: "s-2", date: "2026-11-07", subject_id: null, topic: null }, opts);
    expect(r[0].due_date).toBe("2026-11-09");
    expect(weekdayOf(r[0].due_date)).toBe(1);
    expect(adjustToStudyDay("2026-11-08")).toBe("2026-11-09");
  });
  it("não duplica revisões já existentes (IDs determinísticos)", () => {
    const first = buildReviewsForSession({ id: "s-3", date: "2026-11-02", subject_id: null, topic: null }, opts);
    const again = buildReviewsForSession({ id: "s-3", date: "2026-11-02", subject_id: null, topic: null }, opts, first);
    expect(again).toHaveLength(0);
    const ids = buildReviewsForSession({ id: "s-3", date: "2026-11-02", subject_id: null, topic: null }, opts).map((r) => r.id);
    expect(ids).toEqual(first.map((r) => r.id));
  });
  it("estado: atrasada, hoje, futura e concluída", () => {
    expect(reviewState({ status: "pendente", due_date: "2026-11-01" }, "2026-11-02")).toBe("atrasada");
    expect(reviewState({ status: "pendente", due_date: "2026-11-02" }, "2026-11-02")).toBe("hoje");
    expect(reviewState({ status: "pendente", due_date: "2026-11-05" }, "2026-11-02")).toBe("futura");
    expect(reviewState({ status: "concluida", due_date: "2026-11-01" }, "2026-11-02")).toBe("concluida");
  });
  it("redistribui acumuladas respeitando o limite diário e domingos", () => {
    const list = Array.from({ length: 7 }, (_, i) => ({ id: `r${i}`, due_date: "2026-10-20", original_due_date: "2026-10-20" }));
    const out = redistributeReviews(list, "2026-11-07", 3); // sábado
    expect(out.filter((o) => o.due_date === "2026-11-07")).toHaveLength(3);
    expect(out.some((o) => o.due_date === "2026-11-08")).toBe(false); // domingo
    expect(out.filter((o) => o.due_date === "2026-11-09")).toHaveLength(3);
    expect(out.filter((o) => o.due_date === "2026-11-10")).toHaveLength(1);
  });
});

describe("estatísticas", () => {
  it("percentual de acertos", () => {
    expect(pct(7, 10)).toBe(70);
    expect(pct(2, 3)).toBe(66.7);
    expect(pct(0, 0)).toBeNull();
  });
  it("só conta questões respondidas e separa treino/simulado/revisão", () => {
    const list = [
      attempt({ subject_id: "s1", is_correct: true }),
      attempt({ subject_id: "s1", is_correct: false, selected_option: "B" }),
      attempt({ subject_id: "s1", is_correct: false, selected_option: null }), // em branco
      attempt({ subject_id: "s1", is_correct: true, mode: "simulado" }),
      attempt({ subject_id: "s1", is_correct: true, mode: "revisao" }),
    ];
    expect(accuracyBySubject(list).s1).toEqual({ answered: 3, correct: 2, pct: 66.7 });
    expect(accuracyBySubject(list, { mode: "treino" }).s1).toEqual({ answered: 2, correct: 1, pct: 50 });
    expect(overallAccuracy(list, { mode: "simulado" }).pct).toBe(100);
  });
  it("faixas visuais: crítico < 50 <= desenvolvimento < 70 <= meta", () => {
    expect(band(49.9)).toBe("critico");
    expect(band(50)).toBe("desenvolvimento");
    expect(band(69.99)).toBe("desenvolvimento");
    expect(band(70)).toBe("meta");
    expect(band(null)).toBe("sem_dados");
  });
  it("streak: domingo não quebra; hoje ainda não estudado não zera", () => {
    const sessions = ["2026-11-05", "2026-11-06", "2026-11-07", "2026-11-09"].map((date) => session({ date }));
    const days = studiedDays(sessions);
    expect(streak(days, "2026-11-09")).toBe(4);
    expect(streak(days, "2026-11-10")).toBe(4); // hoje sem estudo ainda
    expect(streak(days, "2026-11-11")).toBe(0); // ontem não estudou
  });
  it("progresso limitado a 0..1", () => {
    expect(progressRatio(90, 120)).toBe(0.75);
    expect(progressRatio(200, 120)).toBe(1);
    expect(progressRatio(10, 0)).toBe(0);
  });
});

describe("simulado", () => {
  const d = defaults();
  it("distribuição de 70 questões por matéria (prova de 2024)", () => {
    const dist = examDistribution(d.subjects);
    expect(dist.reduce((s, x) => s + x.count, 0)).toBe(70);
    expect(dist[0].count).toBe(10);
    const scaled = scaleDistribution(dist, 35);
    expect(scaled.reduce((s, x) => s + x.count, 0)).toBe(35);
    expect(scaled[0].count).toBe(5);
  });
  it("banco autoral tem exatamente a distribuição oficial de referência", () => {
    for (const s of SUBJECT_SEEDS) expect(SEED_QUESTIONS[s.slug]?.length, s.slug).toBe(s.questions);
  });
  it("seleciona aleatoriamente respeitando quantidades e informa faltas", () => {
    const s1 = d.subjects[0], s2 = d.subjects[1];
    const mk = (sid: string, i: number) => ({ id: `${sid}-${i}`, subject_id: sid, status: "nao_respondida" }) as Question;
    const bank = [...Array.from({ length: 12 }, (_, i) => mk(s1.id, i)), ...Array.from({ length: 3 }, (_, i) => mk(s2.id, i))];
    const sel = selectMockQuestions([{ subject_id: s1.id, count: 10 }, { subject_id: s2.id, count: 8 }], bank, seededRng(42));
    expect(sel.picks.filter((p) => p.subject_id === s1.id)).toHaveLength(10);
    expect(new Set(sel.picks.map((p) => p.question.id)).size).toBe(13);
    expect(sel.shortages).toEqual([{ subject_id: s2.id, wanted: 8, available: 3 }]);
  });
  it("nota: em branco não pontua, mas aparece separado de erro", () => {
    const r = scoreMock([
      { subject_id: "a", selected_option: "A", correct_option: "A" },
      { subject_id: "a", selected_option: "B", correct_option: "A" },
      { subject_id: "b", selected_option: null, correct_option: "C" },
      { subject_id: "b", selected_option: "C", correct_option: "C" },
    ]);
    expect(r).toMatchObject({ total: 4, answered: 3, correct: 2, pct: 50 });
    expect(r.bySubject.find((x) => x.subject_id === "b")).toMatchObject({ total: 2, answered: 1, correct: 1, pct: 50 });
  });
});
