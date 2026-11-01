import type { SyllabusTopic } from "@/lib/types";
/** Próximo conteúdo a estudar da matéria: primeiro item do edital ainda não estudado (na ordem do edital). */
export function nextTopicFor(topics: SyllabusTopic[], subjectId: string): SyllabusTopic | null {
  const list = topics.filter((t) => t.subject_id === subjectId && t.in_current_edital);
  const leaves = list.filter((t) => !list.some((c) => c.parent_id === t.id))
    .sort((a, b) => (a.code ?? "").localeCompare(b.code ?? "", "pt", { numeric: true }) || a.sort_order - b.sort_order);
  return leaves.find((t) => t.status === "nao_estudado") ?? leaves[0] ?? null;
}
