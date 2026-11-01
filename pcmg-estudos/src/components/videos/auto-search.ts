"use client";
import { useCallback } from "react";
import { useApp } from "@/components/app/context";
import { buildQuery } from "@/lib/videos/youtube";
import { searchVideos } from "./client";

/**
 * Busca videoaulas para conteúdos do edital ainda sem recomendações (limite por execução,
 * para respeitar a cota gratuita da API). Novos conteúdos do edital têm prioridade.
 */
export function useVideoAutoSearch() {
  const { actions, engine, auth } = useApp();
  return useCallback(async (limit = 10): Promise<{ searched: number; empty: string[]; error?: string }> => {
    const settings = actions.settings();
    const subjects = engine.rows("subjects").filter((s) => s.active);
    const byId = new Map(subjects.map((s) => [s.id, s]));
    const topics = engine.rows("syllabus_topics").filter((t) => t.in_current_edital && byId.has(t.subject_id));
    const leaves = topics.filter((t) => !topics.some((c) => c.parent_id === t.id));
    const cachedTopics = new Set(engine.rows("video_search_cache").map((c) => c.syllabus_topic_id));
    const withVideos = new Set(engine.rows("video_lessons").map((v) => v.syllabus_topic_id));
    const queue = leaves.filter((t) => !cachedTopics.has(t.id) && !withVideos.has(t.id))
      .sort((a, b) => Number(b.origin === "edital") - Number(a.origin === "edital") || Number(a.status !== "nao_estudado") - Number(b.status !== "nao_estudado") || (byId.get(b.subject_id)!.exam_questions - byId.get(a.subject_id)!.exam_questions))
      .slice(0, limit);
    const empty: string[] = [];
    let searched = 0;
    for (const t of queue) {
      const s = byId.get(t.subject_id)!;
      const q = buildQuery({ subjectName: s.name, topic: t.title });
      const r = await searchVideos(auth, { subjectName: s.name, topic: t.title, board: settings.exam_board, otherSubjects: subjects.filter((x) => x.id !== s.id).map((x) => x.name), query: q });
      if (!r.ok) return { searched, empty, error: r.error };
      actions.cacheVideoSearch(q, s.id, t.id, r.results);
      if (!r.results.length) empty.push(`${s.short_name}: ${t.title}`);
      searched++;
    }
    return { searched, empty };
  }, [actions, engine, auth]);
}
