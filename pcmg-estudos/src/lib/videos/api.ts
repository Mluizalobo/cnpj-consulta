/** Chamadas reais à YouTube Data API v3 e ao oEmbed do YouTube (lado do servidor). */
import { buildQuery, extractYoutubeId, LAW_SUBJECT_RE, rankVideos, type RawVideo } from "./youtube";
import type { VideoResult } from "../types";

type FetchFn = typeof fetch;
const API = "https://www.googleapis.com/youtube/v3";

export class YoutubeNotConfigured extends Error { constructor() { super("YOUTUBE_API_KEY não configurada"); } }
export class YoutubeQuotaError extends Error { constructor() { super("Cota diária da API do YouTube esgotada. Tente amanhã ou use a busca direta no YouTube."); } }

export interface SearchParams { subjectName: string; topic?: string | null; board?: string | null; otherSubjects?: string[]; query?: string; order?: "relevance" | "date" }

export async function searchYoutube(p: SearchParams, opts: { key?: string; fetch?: FetchFn; now?: Date } = {}): Promise<{ query: string; results: VideoResult[] }> {
  const key = opts.key ?? process.env.YOUTUBE_API_KEY;
  if (!key) throw new YoutubeNotConfigured();
  const f = opts.fetch ?? fetch;
  const query = (p.query?.trim() || buildQuery(p)).slice(0, 150);
  const sp = new URLSearchParams({ part: "snippet", type: "video", maxResults: "25", q: query, relevanceLanguage: "pt", regionCode: "BR", safeSearch: "strict", videoEmbeddable: "true", order: p.order === "date" ? "date" : "relevance", key });
  const r1 = await f(`${API}/search?${sp}`);
  if (r1.status === 403) throw new YoutubeQuotaError();
  if (!r1.ok) throw new Error(`YouTube respondeu ${r1.status}`);
  const j1 = await r1.json() as { items?: { id?: { videoId?: string }; snippet?: { title: string; description: string; channelTitle: string; channelId: string; publishedAt: string; liveBroadcastContent: string; thumbnails?: Record<string, { url: string }> } }[] };
  const items = (j1.items ?? []).filter((i) => i.id?.videoId && i.snippet);
  if (!items.length) return { query, results: [] };
  const ids = items.map((i) => i.id!.videoId!);
  const r2 = await f(`${API}/videos?${new URLSearchParams({ part: "contentDetails,statistics", id: ids.join(","), key })}`);
  const details = new Map<string, { duration?: string; views?: string }>();
  if (r2.ok) {
    const j2 = await r2.json() as { items?: { id: string; contentDetails?: { duration?: string }; statistics?: { viewCount?: string } }[] };
    for (const d of j2.items ?? []) details.set(d.id, { duration: d.contentDetails?.duration, views: d.statistics?.viewCount });
  }
  const raw: RawVideo[] = items.map((i, rank) => {
    const s = i.snippet!;
    const th = s.thumbnails ?? {};
    return {
      id: i.id!.videoId!, title: decode(s.title), description: decode(s.description), channelTitle: decode(s.channelTitle), channelId: s.channelId,
      thumbnail: th.medium?.url ?? th.high?.url ?? th.default?.url ?? `https://i.ytimg.com/vi/${i.id!.videoId}/mqdefault.jpg`,
      publishedAt: s.publishedAt, liveBroadcastContent: s.liveBroadcastContent, duration: details.get(i.id!.videoId!)?.duration ?? null,
      viewCount: details.get(i.id!.videoId!)?.views ?? null, rank,
    };
  });
  return { query, results: rankVideos(raw, { subjectName: p.subjectName, topic: p.topic, board: p.board, otherSubjects: p.otherSubjects, lawSubject: LAW_SUBJECT_RE.test(p.subjectName), now: opts.now }).slice(0, 12) };
}

const decode = (s: string) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

/** Metadados de um link do YouTube via oEmbed (público, gratuito, sem chave). */
export async function youtubeOembed(url: string, f: FetchFn = fetch): Promise<{ youtubeId: string; title: string; channelTitle: string; thumbnail: string; url: string }> {
  const id = extractYoutubeId(url);
  if (!id) throw new Error("Link do YouTube inválido");
  const canonical = `https://www.youtube.com/watch?v=${id}`;
  const r = await f(`https://www.youtube.com/oembed?${new URLSearchParams({ url: canonical, format: "json" })}`);
  if (r.status === 404 || r.status === 401 || r.status === 403) throw new Error("Vídeo não encontrado, privado ou com incorporação desativada");
  if (!r.ok) throw new Error(`YouTube respondeu ${r.status}`);
  const j = await r.json() as { title?: string; author_name?: string; thumbnail_url?: string };
  if (!j.title) throw new Error("Vídeo não encontrado");
  return { youtubeId: id, title: j.title, channelTitle: j.author_name ?? "", thumbnail: j.thumbnail_url ?? `https://i.ytimg.com/vi/${id}/mqdefault.jpg`, url: canonical };
}
