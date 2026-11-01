/**
 * Regras das videoaulas (puras, testáveis). Nada aqui inventa vídeos:
 * só filtra, ordena e descreve resultados reais vindos da YouTube Data API.
 */
import type { VideoResult } from "../types";
import { normalizeText } from "../domain/text";

/** Extrai o ID de 11 caracteres de links do YouTube (watch, youtu.be, shorts, embed, live). */
export function extractYoutubeId(raw: string): string | null {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  const host = u.hostname.replace(/^www\.|^m\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "youtube-nocookie.com" || host === "music.youtube.com") {
    if (u.pathname === "/watch") id = u.searchParams.get("v");
    else { const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/); id = m?.[1] ?? null; }
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

export const watchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;
export const embedUrl = (id: string) => `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1`;
export const searchUrl = (q: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;

/** Duração ISO 8601 da API (ex.: PT1H2M3S) → segundos. */
export function parseIsoDuration(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const m = iso.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  return Number(m[1] ?? 0) * 86400 + Number(m[2] ?? 0) * 3600 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0);
}

export function buildQuery(p: { subjectName: string; topic?: string | null }): string {
  const topic = (p.topic ?? "").replace(/\(.*?\)/g, " ").replace(/\s+/g, " ").trim();
  const subject = p.subjectName.replace(/\s*[—-].*$/, "").trim();
  return [topic, subject, "aula concurso"].filter(Boolean).join(" ").slice(0, 150);
}

const STOP = new Set(["de", "da", "do", "das", "dos", "e", "a", "o", "em", "no", "na", "aula", "concurso", "lei", "nocoes", "para", "com", "os", "as", "ao"]);
const toks = (s: string) => normalizeText(s).split(" ").filter((t) => t.length > 2 && !STOP.has(t));

export interface RawVideo {
  id: string;
  title: string;
  description?: string;
  channelTitle: string;
  channelId: string;
  thumbnail: string;
  publishedAt?: string | null;
  duration?: string | null;
  viewCount?: string | number | null;
  liveBroadcastContent?: string | null;
  rank: number; // posição no resultado da API (relevância do YouTube)
}

export interface RankContext {
  subjectName: string;
  topic?: string | null;
  board?: string | null;
  otherSubjects?: string[]; // nomes de outras matérias (para descartar vídeos de matéria diferente)
  lawSubject?: boolean; // matérias de lei envelhecem rápido
  now?: Date;
}

/** Filtra e ordena resultados reais da API, explicando cada escolha. */
export function rankVideos(raw: RawVideo[], ctx: RankContext): VideoResult[] {
  const now = (ctx.now ?? new Date()).getTime();
  const subjTok = toks(ctx.subjectName);
  const topicTok = toks(ctx.topic ?? "");
  const out: VideoResult[] = [];
  for (const v of raw) {
    if (!/^[A-Za-z0-9_-]{11}$/.test(v.id)) continue;
    if (v.liveBroadcastContent && v.liveBroadcastContent !== "none") continue; // ao vivo/agendado
    const dur = parseIsoDuration(v.duration);
    if (dur !== null && dur < 6 * 60) continue; // shorts e vídeos curtos não são aulas
    const text = normalizeText(`${v.title} ${v.description ?? ""}`);
    const title = normalizeText(v.title);
    const subjHits = subjTok.filter((t) => text.includes(t)).length;
    const topicHits = topicTok.filter((t) => text.includes(t)).length;
    if (subjHits === 0 && topicHits === 0) continue; // nada a ver com a matéria/assunto
    // título claramente de outra matéria e sem citar esta → descarta
    const other = (ctx.otherSubjects ?? []).find((o) => { const ot = toks(o); return ot.length > 0 && ot.every((t) => title.includes(t)); });
    if (other && !subjTok.some((t) => title.includes(t)) && topicHits === 0) continue;
    const reasons: string[] = [];
    let score = Math.max(0, 30 - v.rank); // ordem de relevância do próprio YouTube
    score += topicHits * 6 + subjHits * 3;
    if (topicTok.length && topicHits >= Math.ceil(topicTok.length / 2)) reasons.push("trata do assunto");
    if (/\baula\b|\baulao\b|\bcurso\b|\bteoria\b/.test(title)) { score += 6; reasons.push("aula"); }
    if (/concurso|pcmg|policia civil|investigador/.test(text)) { score += 6; reasons.push("foco em concursos"); }
    if (ctx.board && normalizeText(ctx.board).length >= 2 && new RegExp(`\\b${normalizeText(ctx.board)}\\b`).test(text)) { score += 8; reasons.push(`menciona a banca ${ctx.board}`); }
    if (dur !== null && dur >= 15 * 60 && dur <= 3 * 3600) { score += 5; reasons.push("aula completa"); }
    const views = Number(v.viewCount ?? 0);
    if (views > 0) score += Math.min(10, Math.log10(views) * 2);
    const ageYears = v.publishedAt ? (now - new Date(v.publishedAt).getTime()) / (365.25 * 86400000) : null;
    if (ageYears !== null && ageYears <= 2) { score += 5; reasons.push("recente"); }
    const outdated = ageYears !== null && ageYears > (ctx.lawSubject ? 4 : 7);
    if (outdated) score -= 8;
    out.push({
      youtubeId: v.id, url: watchUrl(v.id), title: v.title, channelTitle: v.channelTitle, channelId: v.channelId, thumbnail: v.thumbnail,
      durationSeconds: dur, publishedAt: v.publishedAt ?? null, viewCount: views || null, score: Math.round(score * 10) / 10, reasons, outdated,
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

export const LAW_SUBJECT_RE = /direito|legisla|lei|processo|penal|constitucional|administrativ|org[aâ]nica|humanos/i;
