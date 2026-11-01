import { describe, expect, it } from "vitest";
import { blockRemaining, createTimer, pause, reset, resume, secondsByType, switchTo, tick, totalElapsed } from "@/lib/domain/timer";
import { parseCsv, parseJson, validateRows, CSV_TEMPLATE, JSON_TEMPLATE } from "@/lib/domain/importer";
import { buildBackup, planMerge, validateBackup } from "@/lib/domain/backup";
import { contentHash } from "@/lib/domain/text";
import { defaults } from "../helpers";

const T0 = 1_000_000;
const mk = () => createTimer({ sessionId: "s", kind: "estudo", subjectId: null, label: "Português",
  blocks: [{ type: "teoria", seconds: 35 * 60 }, { type: "questoes", seconds: 25 * 60 }] }, T0);

describe("cronômetro", () => {
  it("conta pelo relógio: atualizar a página não reinicia", () => {
    const t = mk();
    const restored = JSON.parse(JSON.stringify(t)); // simula salvar e recarregar
    expect(Math.round(totalElapsed(restored, T0 + 600_000))).toBe(600);
    expect(Math.round(blockRemaining(restored, T0 + 600_000))).toBe(25 * 60);
  });
  it("pausa e retoma sem contar o tempo pausado", () => {
    let t = pause(mk(), T0 + 60_000);
    t = resume(t, T0 + 600_000);
    expect(Math.round(totalElapsed(t, T0 + 660_000))).toBe(120);
  });
  it("ao fim da teoria avisa e passa para questões levando o excedente", () => {
    const { timer, events } = tick(mk(), T0 + (35 * 60 + 30) * 1000);
    expect(events[0]).toMatchObject({ type: "block_end", block: { type: "teoria" } });
    expect(timer.index).toBe(1);
    expect(Math.round(blockRemaining(timer, T0 + (35 * 60 + 30) * 1000))).toBe(25 * 60 - 30);
  });
  it("ao fim do último bloco, pausa e conclui sem contar além do previsto", () => {
    const { timer, events } = tick(mk(), T0 + 2 * 3600 * 1000);
    expect(events.map((e) => e.type)).toEqual(["block_end", "block_end", "done"]);
    expect(timer.finished).toBe(true);
    expect(secondsByType(timer, T0 + 3 * 3600 * 1000)).toEqual({ teoria: 2100, questoes: 1500, revisao: 0 });
  });
  it("sem avanço automático, pausa entre blocos", () => {
    const { timer } = tick(mk(), T0 + 36 * 60 * 1000, false);
    expect(timer.index).toBe(1);
    expect(timer.runningSince).toBeNull();
  });
  it("alternância manual e reinício", () => {
    let t = switchTo(mk(), 1, T0 + 10 * 60_000);
    expect(secondsByType(t, T0 + 15 * 60_000)).toEqual({ teoria: 600, questoes: 300, revisao: 0 });
    t = reset(t, T0 + 20 * 60_000);
    expect(totalElapsed(t, T0 + 20 * 60_000)).toBe(0);
  });
});

describe("importação de questões", () => {
  const { subjects } = defaults();
  const row = { enunciado: "Qual alternativa está correta quanto à crase?", materia: "Português", assunto: "Crase",
    a: "um", b: "dois", c: "três", d: "quatro", e: "cinco", gabarito: "c", dificuldade: "Médio", ano: "2025", tags: "crase;regência" };
  it("valida, normaliza e reconhece a matéria pelo nome curto", () => {
    const r = validateRows([row], subjects);
    expect(r.errors).toEqual([]);
    expect(r.valid[0].data).toMatchObject({ correct_option: "C", dificuldade: "medio", ano: 2025, tags: ["crase", "regência"] });
    expect(r.valid[0].data.subject_id).toBe(subjects[0].id);
  });
  it("informa linhas com erro", () => {
    const r = validateRows([{ ...row, gabarito: "F" }, { ...row, materia: "Astronomia" }, { ...row, enunciado: "" }, { ...row, b: "um" }], subjects);
    expect(r.valid).toHaveLength(0);
    expect(r.errors.map((e) => e.line)).toEqual([2, 3, 4, 5]);
    expect(r.errors[0].messages[0]).toMatch(/Gabarito/);
    expect(r.errors[1].messages[0]).toMatch(/não encontrada/);
    expect(r.errors[3].messages[0]).toMatch(/repetidas/);
  });
  it("evita duplicações no arquivo e no banco", () => {
    const hash = contentHash(row.enunciado, [row.a, row.b, row.c, row.d, row.e]);
    const r = validateRows([row, row], subjects);
    expect(r.valid).toHaveLength(1);
    expect(r.duplicates[0].reason).toMatch(/dentro do arquivo/);
    const r2 = validateRows([row], subjects, new Set([hash]));
    expect(r2.duplicates[0].reason).toMatch(/Já existe/);
  });
  it("lê CSV (vírgula ou ponto e vírgula) e JSON, inclusive os modelos", () => {
    expect(validateRows(parseCsv(CSV_TEMPLATE).rows, subjects).valid).toHaveLength(1);
    expect(validateRows(parseJson(JSON_TEMPLATE).rows, subjects).valid).toHaveLength(1);
    const semi = "enunciado;materia;a;b;c;d;e;gabarito\nTexto do enunciado aqui;Informática;1;2;3;4;5;A\n";
    expect(validateRows(parseCsv(semi).rows, subjects).valid).toHaveLength(1);
    expect(parseJson("{oops").parseErrors[0]).toMatch(/JSON inválido/);
  });
});

describe("backup", () => {
  const d = defaults();
  const tables = { subjects: Object.fromEntries(d.subjects.map((s) => [s.id, s])), user_settings: { [d.settings.id]: d.settings } };
  it("exporta e valida o próprio backup", () => {
    const b = buildBackup(tables);
    const v = validateBackup(JSON.parse(JSON.stringify(b)));
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.summary.find((s) => s.table === "subjects")?.count).toBe(12);
  });
  it("rejeita arquivos que não são backup", () => {
    const v = validateBackup({ foo: 1 });
    expect(v.ok).toBe(false);
    const v2 = validateBackup({ app: "pcmg-estudos", version: 1, exported_at: "x", data: { subjects: [{ id: "nao-uuid" }] } });
    expect(v2.ok).toBe(false);
  });
  it("mescla sem sobrescrever dados mais novos", () => {
    const cur = { a: { id: "a", updated_at: "2026-11-02T00:00:00Z" }, b: { id: "b", updated_at: "2026-11-01T00:00:00Z" } };
    const inc = [{ id: "a", updated_at: "2026-10-01T00:00:00Z" }, { id: "b", updated_at: "2026-11-05T00:00:00Z" }, { id: "c", updated_at: "2026-11-05T00:00:00Z" }];
    expect(planMerge(cur, inc).map((r) => r.id)).toEqual(["b", "c"]);
  });
});
