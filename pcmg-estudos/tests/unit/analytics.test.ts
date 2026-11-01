import { describe, expect, it } from "vitest";
import { bankStateSummary, difficultTopics, difficultyGaps, firstVsLater, questionState, questionStats, repeatedErrors, subjectErrorRanking, timeSeries, trendOf } from "@/lib/domain/analytics";
import { attempt } from "../helpers";
import type { Question } from "@/lib/types";

const at = (day: number) => `2026-11-${String(day).padStart(2, "0")}T10:00:00.000Z`;

describe("análise de acertos e erros", () => {
  it("estatísticas por questão com histórico de alternativas; revisão fica à parte", () => {
    const list = [
      attempt({ selected_option: "B", is_correct: false, answered_at: at(1) }),
      attempt({ selected_option: "A", is_correct: true, answered_at: at(3) }),
      attempt({ selected_option: "C", is_correct: false, answered_at: at(5), mode: "revisao" }),
      attempt({ selected_option: null, is_correct: false, answered_at: at(6) }), // em branco: ignorada
    ];
    const s = questionStats(list);
    expect(s).toMatchObject({ attempts: 2, correct: 1, wrong: 1, pct: 50, firstCorrect: false, reviewAttempts: 1, reviewCorrect: 0 });
    expect(s.history.map((h) => h.selected)).toEqual(["B", "A", "C"]);
    expect(s.lastAt).toBe(at(5));
  });
  it("diferencia inédita, acertada, errada e revisada", () => {
    expect(questionState([]).cls).toBe("inedita");
    expect(questionState([attempt({ selected_option: null, is_correct: false })]).cls).toBe("inedita");
    expect(questionState([attempt({ is_correct: false, selected_option: "B" })]).label).toBe("Errada");
    const rev = questionState([attempt({ is_correct: false, selected_option: "B", answered_at: at(1) }), attempt({ is_correct: true, mode: "revisao", answered_at: at(2) })]);
    expect(rev).toMatchObject({ cls: "errada", revised: true }); // o erro original não é apagado pela revisão
    const qs = [{ id: "q1" }, { id: "q2" }] as Question[];
    expect(bankStateSummary(qs, [attempt({ question_id: "q1", is_correct: false, selected_option: "C" })])).toEqual({ inedita: 1, respondida: 1, acertada: 0, errada: 1, revisada: 0 });
  });
  it("tendência: melhorando, estável ou piorando", () => {
    expect(trendOf([false, false, true, true]).trend).toBe("melhorando");
    expect(trendOf([true, true, false, false]).trend).toBe("piorando");
    expect(trendOf([true, false, true, false]).trend).toBe("estagnada");
    expect(trendOf([true]).trend).toBe("dados_insuficientes");
  });
  it("questões erradas repetidamente e primeira × posteriores", () => {
    const list = [
      attempt({ question_id: "q1", is_correct: false, selected_option: "B", answered_at: at(1) }),
      attempt({ question_id: "q1", is_correct: false, selected_option: "C", answered_at: at(2) }),
      attempt({ question_id: "q1", is_correct: true, answered_at: at(3) }),
      attempt({ question_id: "q2", is_correct: false, selected_option: "B", answered_at: at(1) }),
      attempt({ question_id: "q2", is_correct: true, answered_at: at(4) }),
    ];
    expect(repeatedErrors(list).map((r) => [r.questionId, r.errors])).toEqual([["q1", 2]]);
    expect(firstVsLater(list)).toEqual({ questions: 2, first: 0, later: 66.7, delta: 66.7 });
  });
  it("matérias com mais erros e assuntos difíceis", () => {
    const list = [
      ...Array.from({ length: 4 }, (_, i) => attempt({ subject_id: "pen", topic: "Tentativa", is_correct: i === 0, selected_option: i === 0 ? "A" : "B" })),
      ...Array.from({ length: 4 }, () => attempt({ subject_id: "por", topic: "Crase", is_correct: true })),
    ];
    expect(subjectErrorRanking(list)[0]).toMatchObject({ subjectId: "pen", pct: 25, wrong: 3 });
    expect(difficultTopics(list).map((t) => t.topic)).toEqual(["Tentativa"]);
  });
  it("acerta fáceis mas erra médias/difíceis no mesmo assunto", () => {
    const list = [
      attempt({ topic: "Crase", difficulty: "facil", is_correct: true }), attempt({ topic: "Crase", difficulty: "facil", is_correct: true }),
      attempt({ topic: "Crase", difficulty: "medio", is_correct: false, selected_option: "B" }), attempt({ topic: "Crase", difficulty: "dificil", is_correct: false, selected_option: "B" }),
    ];
    expect(difficultyGaps(list)).toEqual([{ subjectId: "s1", topic: "Crase", easyPct: 100, easyN: 2, hardPct: 0, hardN: 2 }]);
  });
  it("série semanal e mensal de acertos e erros (geral e por matéria)", () => {
    const list = [
      attempt({ answered_at: "2026-11-02T10:00:00Z", is_correct: true }),
      attempt({ answered_at: "2026-11-03T10:00:00Z", is_correct: false, selected_option: "B", subject_id: "s2" }),
      attempt({ answered_at: "2026-10-20T10:00:00Z", is_correct: true }),
    ];
    const w = timeSeries(list, "semana", { today: "2026-11-04", periods: 3 });
    expect(w.map((p) => [p.key, p.correct, p.wrong])).toEqual([["2026-10-19", 1, 0], ["2026-10-26", 0, 0], ["2026-11-02", 1, 1]]);
    const m = timeSeries(list, "mes", { today: "2026-11-04", periods: 2, subjectId: "s1" });
    expect(m.map((p) => [p.key, p.correct, p.wrong])).toEqual([["2026-10", 1, 0], ["2026-11", 1, 0]]);
  });
});
