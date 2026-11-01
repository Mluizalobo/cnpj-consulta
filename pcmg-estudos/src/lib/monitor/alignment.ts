/** Verifica se o banco de questões está alinhado ao edital atual. Nunca exclui questões: só etiqueta. */
import type { Question, Subject, SyllabusTopic } from "../types";
import { jaccard } from "./match";

export const ALIGN_TAGS = {
  fora: "Conteúdo fora do edital atual",
  legislacao: "Legislação precisa ser atualizada",
  reclassificar: "Reclassificação necessária",
  valida: "Questão válida para o edital atual",
} as const;
const ALL_TAGS: string[] = Object.values(ALIGN_TAGS);

const LAW_RE = /(Lei(?: Complementar)?|Decreto(?:-Lei)?)\s+(?:Estadual\s+|Federal\s+)?n?[º°o.]?\s*([\d.]+)\s*\/\s*(\d{2,4})/gi;
const lawKey = (num: string, year: string) => `${num.replace(/\./g, "")}/${year.length === 2 ? (Number(year) > 50 ? "19" : "20") + year : year}`;
export function lawsIn(text: string): string[] {
  return [...new Set([...text.matchAll(LAW_RE)].map((m) => lawKey(m[2], m[3])))];
}

export interface AlignmentResult {
  updates: { id: string; tags: string[]; tag: string }[];
  counts: Record<keyof typeof ALIGN_TAGS, number>;
  topicsWithFewQuestions: { subjectId: string; topic: string; count: number }[];
}

export function alignQuestions(questions: Question[], subjects: Subject[], topics: SyllabusTopic[], editalLegislation: string[], minPerTopic = 3): AlignmentResult {
  const activeIds = new Set(subjects.filter((s) => s.active && s.exam_questions > 0).map((s) => s.id));
  const inEdital = topics.filter((t) => t.in_current_edital);
  const editalLaws = new Set(editalLegislation.flatMap(lawsIn));
  const counts = { fora: 0, legislacao: 0, reclassificar: 0, valida: 0 };
  const updates: AlignmentResult["updates"] = [];
  const perTopic = new Map<string, number>();
  for (const q of questions) {
    let tag: string = ALIGN_TAGS.valida;
    let key: keyof typeof ALIGN_TAGS = "valida";
    const subjTopics = inEdital.filter((t) => t.subject_id === q.subject_id);
    const linked = q.syllabus_topic_id ? inEdital.find((t) => t.id === q.syllabus_topic_id) : undefined;
    const best = linked ?? subjTopics.map((t) => ({ t, s: jaccard(t.title, `${q.topic ?? ""}`) })).sort((a, b) => b.s - a.s).find((x) => x.s >= 0.25)?.t;
    const laws = lawsIn(`${q.statement} ${q.explanation ?? ""}`);
    if (!q.subject_id || !activeIds.has(q.subject_id)) { tag = ALIGN_TAGS.fora; key = "fora"; }
    else if (laws.length && editalLaws.size && laws.some((l) => !editalLaws.has(l))) { tag = ALIGN_TAGS.legislacao; key = "legislacao"; }
    else if (subjTopics.length && !best) { tag = ALIGN_TAGS.reclassificar; key = "reclassificar"; }
    if (best) perTopic.set(best.id, (perTopic.get(best.id) ?? 0) + 1);
    counts[key]++;
    const tags = [...q.tags.filter((t) => !ALL_TAGS.includes(t)), tag];
    if (tags.join("|") !== q.tags.join("|")) updates.push({ id: q.id, tags, tag });
  }
  const leaves = inEdital.filter((t) => !inEdital.some((c) => c.parent_id === t.id));
  const topicsWithFewQuestions = leaves.map((t) => ({ subjectId: t.subject_id, topic: t.title, count: perTopic.get(t.id) ?? 0 })).filter((x) => x.count < minPerTopic);
  return { updates, counts, topicsWithFewQuestions };
}
