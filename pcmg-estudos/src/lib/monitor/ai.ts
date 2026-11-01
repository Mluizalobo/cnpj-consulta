/**
 * IA OPCIONAL para completar campos que as regras não encontraram.
 * - Só roda no servidor e só se GEMINI_API_KEY estiver configurada (camada gratuita do Google AI Studio).
 * - Cada valor sugerido precisa vir com um trecho literal do documento; se o trecho não existir, é descartado.
 * - Qualquer falha da IA é ignorada: o resultado das regras continua valendo.
 */
import { z } from "zod";
import { normalizeText } from "../domain/text";
import type { EditalData } from "./parse-edital";

export interface AiProvider { name: string; complete(prompt: string): Promise<string> }

export function geminiProvider(): AiProvider | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  return {
    name: `Gemini (${model})`,
    async complete(prompt) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 45_000);
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST", signal: ctrl.signal,
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0 } }),
        });
        if (!res.ok) throw new Error(`IA respondeu ${res.status}`);
        const j = await res.json();
        return j?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      } finally { clearTimeout(t); }
    },
  };
}

const ev = z.object({ value: z.union([z.string(), z.number()]).nullable(), evidence: z.string().max(400).nullable() });
const aiSchema = z.object({
  board: ev.optional(), examDate: ev.optional(), totalQuestions: ev.optional(), durationMinutes: ev.optional(), vacancies: ev.optional(),
  subjects: z.array(z.object({ name: z.string(), questions: z.number().int().min(0).max(300), evidence: z.string().max(400) })).max(40).optional(),
});

const present = (pagesNorm: string, evidence: string | null | undefined) => !!evidence && evidence.length >= 6 && pagesNorm.includes(normalizeText(evidence).slice(0, 120));

export async function refineWithAi(data: EditalData, pages: string[], provider: AiProvider | null): Promise<{ data: EditalData; used: boolean; notes: string[] }> {
  const notes: string[] = [];
  if (!provider) return { data, used: false, notes };
  const missing = (["board", "examDate", "totalQuestions", "durationMinutes", "vacancies"] as const).filter((k) => !data[k]);
  if (!data.subjects.length) missing.push("subjects" as never);
  if (missing.length === 0) return { data, used: false, notes };
  const text = pages.map((p, i) => `--- página ${i + 1} ---\n${p}`).join("\n").slice(0, 60_000);
  const prompt = `Você extrai dados de editais de concurso. Responda SOMENTE JSON com as chaves: ${missing.join(", ")}.
Para cada chave simples use {"value": ..., "evidence": "trecho LITERAL copiado do documento"}; use null se não houver no texto.
"examDate" no formato AAAA-MM-DD; "durationMinutes" e "totalQuestions" e "vacancies" como números; "subjects" como lista de {"name","questions","evidence"} apenas para o cargo de Investigador de Polícia.
Nunca invente. Documento:\n${text}`;
  try {
    const raw = await provider.complete(prompt);
    const parsed = aiSchema.safeParse(JSON.parse(raw.replace(/^```json|```$/g, "").trim()));
    if (!parsed.success) { notes.push("IA retornou formato inválido; usando apenas as regras."); return { data, used: false, notes }; }
    const norm = normalizeText(pages.join(" "));
    const out: EditalData = { ...data };
    const r = parsed.data;
    const take = <K extends "board" | "examDate" | "totalQuestions" | "durationMinutes" | "vacancies">(k: K, conv: (v: string | number) => EditalData[K] extends infer F ? (F extends { value: infer V } ? V : never) : never) => {
      const f = r[k];
      if (!f || f.value === null || out[k]) return;
      if (!present(norm, f.evidence)) { notes.push(`IA sugeriu "${k}" sem trecho comprovável: descartado.`); return; }
      (out as unknown as Record<string, unknown>)[k] = { value: conv(f.value), page: null, confidence: 0.6, snippet: f.evidence ?? undefined };
      notes.push(`"${k}" completado pela IA (confiança média, confira).`);
    };
    take("board", (v) => String(v) as never);
    take("examDate", (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : null) as never);
    take("totalQuestions", (v) => Number(v) as never);
    take("durationMinutes", (v) => Number(v) as never);
    take("vacancies", (v) => Number(v) as never);
    if (!out.subjects.length && r.subjects?.length) {
      const ok = r.subjects.filter((s) => present(norm, s.evidence));
      if (ok.length) { out.subjects = ok.map((s) => ({ name: s.name, slug: null, questions: s.questions, weight: null, page: null })); notes.push("Quadro de questões completado pela IA (confira)."); }
    }
    return { data: out, used: true, notes };
  } catch (e) {
    notes.push(`IA indisponível (${(e as Error).message}); usando apenas as regras.`);
    return { data, used: false, notes };
  }
}

/** Resumo em linguagem simples (sem IA). */
export function plainSummary(d: EditalData, docType: string): string {
  const parts: string[] = [];
  const br = (iso: string) => iso.split("-").reverse().join("/");
  if (docType === "retificacao") parts.push("Retificação (correção) do edital.");
  if (d.editalNumber) parts.push(`Edital nº ${d.editalNumber.value}.`);
  if (d.cargo) parts.push(`Cargo: ${d.cargo.value}.`);
  if (d.board) parts.push(`Banca: ${d.board.value}.`);
  if (d.vacancies) parts.push(`${d.vacancies.value.toLocaleString("pt-BR")} vagas.`);
  if (d.registration) parts.push(`Inscrições de ${br(d.registration.value.start)} a ${br(d.registration.value.end)}.`);
  if (d.fee) parts.push(`Taxa: R$ ${d.fee.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}.`);
  if (d.examDate) parts.push(`Prova objetiva em ${br(d.examDate.value)}${d.examTime ? ` às ${d.examTime.value}` : ""}${d.durationMinutes ? `, com ${Math.floor(d.durationMinutes.value / 60)}h${d.durationMinutes.value % 60 ? String(d.durationMinutes.value % 60).padStart(2, "0") : ""} de duração` : ""}.`);
  if (d.totalQuestions) parts.push(`${d.totalQuestions.value} questões${d.subjects.length ? ` em ${d.subjects.length} matérias` : ""}.`);
  if (d.minScorePct) parts.push(`Nota mínima: ${d.minScorePct.value}% dos pontos.`);
  if (d.stages) parts.push(`Etapas: ${d.stages.value.join(", ")}.`);
  return parts.join(" ") || "Documento identificado, mas sem informações estruturadas suficientes.";
}
