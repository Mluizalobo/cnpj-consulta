import { z } from "zod";
import { json, rateLimit, requireUser } from "@/lib/server/guard";
import { searchYoutube, YoutubeNotConfigured, YoutubeQuotaError } from "@/lib/videos/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({
  subjectName: z.string().trim().min(2).max(200),
  topic: z.string().trim().max(300).nullable().optional(),
  board: z.string().trim().max(60).nullable().optional(),
  otherSubjects: z.array(z.string().max(200)).max(40).optional(),
  query: z.string().trim().max(150).optional(),
  order: z.enum(["relevance", "date"]).optional(),
});

/** Busca videoaulas no YouTube (exige login). A chave da API fica só no servidor. */
export async function POST(req: Request) {
  const g = await requireUser(req);
  if (g.error) return g.error;
  if (!rateLimit(`videos:${g.user.id}`, 30, 60 * 60_000)) return json({ error: "Muitas buscas na última hora. Aguarde um pouco." }, 429);
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: "Parâmetros inválidos" }, 400);
  try {
    return json(await searchYoutube(p.data));
  } catch (e) {
    if (e instanceof YoutubeNotConfigured) return json({ error: "Busca automática desativada: falta configurar YOUTUBE_API_KEY no servidor.", code: "not_configured" }, 503);
    if (e instanceof YoutubeQuotaError) return json({ error: e.message, code: "quota" }, 429);
    return json({ error: "Não foi possível consultar o YouTube agora." }, 502);
  }
}
