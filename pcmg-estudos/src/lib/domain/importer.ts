import Papa from "papaparse";
import { z } from "zod";
import type { Difficulty, Option, Subject } from "../types";
import { contentHash, normalizeText } from "./text";

export const CSV_HEADERS = [
  "enunciado", "materia", "assunto", "a", "b", "c", "d", "e", "gabarito", "explicacao", "dificuldade", "banca", "ano", "tags",
] as const;

const ALIASES: Record<string, (typeof CSV_HEADERS)[number]> = {
  enunciado: "enunciado", statement: "enunciado", pergunta: "enunciado",
  materia: "materia", disciplina: "materia", subject: "materia",
  assunto: "assunto", topico: "assunto", topic: "assunto",
  a: "a", alternativa_a: "a", option_a: "a",
  b: "b", alternativa_b: "b", option_b: "b",
  c: "c", alternativa_c: "c", option_c: "c",
  d: "d", alternativa_d: "d", option_d: "d",
  e: "e", alternativa_e: "e", option_e: "e",
  gabarito: "gabarito", resposta: "gabarito", correct_option: "gabarito", correta: "gabarito",
  explicacao: "explicacao", comentario: "explicacao", explanation: "explicacao",
  dificuldade: "dificuldade", nivel: "dificuldade", difficulty: "dificuldade",
  banca: "banca", board: "banca", ano: "ano", year: "ano", tags: "tags", etiquetas: "tags",
};

const DIFF_MAP: Record<string, Difficulty> = {
  facil: "facil", easy: "facil", medio: "medio", media: "medio", medium: "medio", dificil: "dificil", hard: "dificil",
};

const text = (min: number, label: string) => z.string({ error: `${label} é obrigatório` }).trim().min(min, `${label} é obrigatório`);

export const questionInputSchema = z.object({
  enunciado: text(10, "Enunciado").max(8000, "Enunciado muito longo (máx. 8000 caracteres)"),
  materia: text(2, "Matéria"),
  assunto: z.string().trim().max(200).optional().default(""),
  a: text(1, "Alternativa A").max(2000), b: text(1, "Alternativa B").max(2000), c: text(1, "Alternativa C").max(2000),
  d: text(1, "Alternativa D").max(2000), e: text(1, "Alternativa E").max(2000),
  gabarito: z.string().trim().toUpperCase().refine((v) => ["A", "B", "C", "D", "E"].includes(v), "Gabarito deve ser A, B, C, D ou E"),
  explicacao: z.string().trim().max(8000).optional().default(""),
  dificuldade: z.string().trim().optional().default("medio")
    .transform((v) => normalizeText(v || "medio").replace(/ /g, ""))
    .refine((v) => v in DIFF_MAP, "Dificuldade deve ser fácil, médio ou difícil")
    .transform((v) => DIFF_MAP[v]),
  banca: z.string().trim().max(120).optional().default(""),
  ano: z.union([z.string(), z.number()]).optional()
    .transform((v) => (v === undefined || v === "" ? null : Number(v)))
    .refine((v) => v === null || (Number.isInteger(v) && v >= 1950 && v <= 2100), "Ano inválido"),
  tags: z.union([z.string(), z.array(z.string())]).optional()
    .transform((v) => (Array.isArray(v) ? v : (v ?? "").split(/[;|,]/)).map((t) => t.trim()).filter(Boolean).slice(0, 20)),
});
export type QuestionInput = z.output<typeof questionInputSchema>;

export interface ParsedImportRow {
  line: number;
  data: QuestionInput & { subject_id: string; correct_option: Option; hash: string };
}
export interface ImportError { line: number; messages: string[] }
export interface ImportResult {
  valid: ParsedImportRow[];
  errors: ImportError[];
  duplicates: { line: number; reason: string }[];
  total: number;
}

function normalizeKeys(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    const key = ALIASES[normalizeText(k).replace(/ /g, "_")];
    if (key) out[key] = typeof v === "string" ? v : v ?? undefined;
  }
  return out;
}

export function matchSubject(name: string, subjects: Pick<Subject, "id" | "name" | "short_name" | "slug">[]): string | null {
  const n = normalizeText(name);
  if (!n) return null;
  for (const s of subjects) {
    const cands = [s.name, s.short_name, s.slug ?? ""].map(normalizeText).filter(Boolean);
    if (cands.includes(n)) return s.id;
  }
  for (const s of subjects) {
    const sn = normalizeText(s.name);
    if (sn.includes(n) || n.includes(sn)) return s.id;
  }
  return null;
}

export function validateRows(
  rows: Record<string, unknown>[],
  subjects: Pick<Subject, "id" | "name" | "short_name" | "slug">[],
  existingHashes: Set<string> = new Set(),
  firstLine = 2,
): ImportResult {
  const res: ImportResult = { valid: [], errors: [], duplicates: [], total: rows.length };
  const seen = new Set<string>();
  rows.forEach((raw, i) => {
    const line = i + firstLine;
    const parsed = questionInputSchema.safeParse(normalizeKeys(raw));
    if (!parsed.success) {
      res.errors.push({ line, messages: parsed.error.issues.map((iss) => iss.message) });
      return;
    }
    const d = parsed.data;
    const subject_id = matchSubject(d.materia, subjects);
    if (!subject_id) {
      res.errors.push({ line, messages: [`Matéria "${d.materia}" não encontrada. Use o nome de uma matéria cadastrada.`] });
      return;
    }
    const options = [d.a, d.b, d.c, d.d, d.e];
    if (new Set(options.map(normalizeText)).size < 5) {
      res.errors.push({ line, messages: ["Há alternativas repetidas"] });
      return;
    }
    const hash = contentHash(d.enunciado, options);
    if (existingHashes.has(hash)) { res.duplicates.push({ line, reason: "Já existe no seu banco de questões" }); return; }
    if (seen.has(hash)) { res.duplicates.push({ line, reason: "Repetida dentro do arquivo" }); return; }
    seen.add(hash);
    res.valid.push({ line, data: { ...d, subject_id, correct_option: d.gabarito as Option, hash } });
  });
  return res;
}

export function parseCsv(content: string): { rows: Record<string, unknown>[]; parseErrors: string[] } {
  const out = Papa.parse<Record<string, unknown>>(content.replace(/^﻿/, ""), {
    header: true, skipEmptyLines: "greedy", transformHeader: (h) => h.trim(),
    delimitersToGuess: [",", ";", "\t"],
  });
  return { rows: out.data, parseErrors: out.errors.map((e) => `Linha ${(e.row ?? 0) + 2}: ${e.message}`) };
}

export function parseJson(content: string): { rows: Record<string, unknown>[]; parseErrors: string[] } {
  try {
    const data = JSON.parse(content.replace(/^﻿/, ""));
    const arr = Array.isArray(data) ? data : Array.isArray(data?.questoes) ? data.questoes : Array.isArray(data?.questions) ? data.questions : null;
    if (!arr) return { rows: [], parseErrors: ["O JSON deve ser uma lista de questões (ou um objeto com a chave \"questoes\")."] };
    return { rows: arr.filter((r: unknown) => r && typeof r === "object"), parseErrors: [] };
  } catch (e) {
    return { rows: [], parseErrors: [`JSON inválido: ${(e as Error).message}`] };
  }
}

export const CSV_TEMPLATE =
  CSV_HEADERS.join(",") + "\n" +
  [
    "\"Texto do enunciado da questão (mínimo de 10 caracteres)\"", "\"Língua Portuguesa\"", "\"Crase\"",
    "\"Alternativa A\"", "\"Alternativa B\"", "\"Alternativa C\"", "\"Alternativa D\"", "\"Alternativa E\"",
    "C", "\"Explicação do gabarito\"", "medio", "\"Autoral\"", "2026", "\"crase;regência\"",
  ].join(",") + "\n";

export const JSON_TEMPLATE = JSON.stringify([
  {
    enunciado: "Texto do enunciado da questão (mínimo de 10 caracteres)",
    materia: "Língua Portuguesa", assunto: "Crase",
    a: "Alternativa A", b: "Alternativa B", c: "Alternativa C", d: "Alternativa D", e: "Alternativa E",
    gabarito: "C", explicacao: "Explicação do gabarito", dificuldade: "medio", banca: "Autoral", ano: 2026, tags: ["crase", "regência"],
  },
], null, 2);

export function questionsToCsv(rows: { [k in (typeof CSV_HEADERS)[number]]: string | number | null }[]): string {
  return Papa.unparse({ fields: [...CSV_HEADERS], data: rows.map((r) => CSV_HEADERS.map((h) => r[h] ?? "")) });
}
