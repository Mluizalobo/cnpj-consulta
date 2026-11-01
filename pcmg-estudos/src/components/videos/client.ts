"use client";
import type { AuthClient } from "@/lib/data/auth";
import type { VideoResult } from "@/lib/types";

export type SearchResponse = { ok: true; query: string; results: VideoResult[] } | { ok: false; code: "not_configured" | "quota" | "offline" | "erro"; error: string };

export async function searchVideos(auth: AuthClient, p: { subjectName: string; topic?: string | null; board?: string | null; otherSubjects?: string[]; query?: string; order?: "relevance" | "date" }): Promise<SearchResponse> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { ok: false, code: "offline", error: "Sem conexão. Mostrando apenas resultados já salvos." };
  try {
    const res = await fetch("/api/videos/buscar", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${(await auth.accessToken()) ?? ""}` }, body: JSON.stringify(p) });
    const body = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, query: body.query, results: body.results ?? [] };
    return { ok: false, code: body.code === "not_configured" ? "not_configured" : body.code === "quota" ? "quota" : "erro", error: body.error ?? `Erro ${res.status}` };
  } catch { return { ok: false, code: "offline", error: "Não foi possível falar com o servidor." }; }
}

export async function fetchOembed(auth: AuthClient, url: string) {
  const res = await fetch(`/api/videos/oembed?url=${encodeURIComponent(url)}`, { headers: { Authorization: `Bearer ${(await auth.accessToken()) ?? ""}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Não foi possível ler o link");
  return body as { youtubeId: string; title: string; channelTitle: string; thumbnail: string; url: string };
}
