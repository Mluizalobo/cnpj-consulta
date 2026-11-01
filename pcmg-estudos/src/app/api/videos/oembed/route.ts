import { json, rateLimit, requireUser } from "@/lib/server/guard";
import { youtubeOembed } from "@/lib/videos/api";

export const dynamic = "force-dynamic";

/** Lê título, canal e miniatura de um link do YouTube (gratuito, sem chave). */
export async function GET(req: Request) {
  const g = await requireUser(req);
  if (g.error) return g.error;
  if (!rateLimit(`oembed:${g.user.id}`, 60, 60 * 60_000)) return json({ error: "Muitas consultas. Aguarde." }, 429);
  const url = new URL(req.url).searchParams.get("url") ?? "";
  try { return json(await youtubeOembed(url)); } catch (e) { return json({ error: (e as Error).message }, 400); }
}
