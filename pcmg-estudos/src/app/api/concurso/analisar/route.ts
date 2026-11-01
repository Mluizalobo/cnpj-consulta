import { analyzeUpload } from "@/lib/monitor/pipeline";
import { geminiProvider } from "@/lib/monitor/ai";
import { json, rateLimit, requireUser } from "@/lib/server/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX = 15 * 1024 * 1024;

/** Modo manual assistido: a usuária envia o PDF (ou cola o texto) do edital para análise. Nada é gravado aqui. */
export async function POST(req: Request) {
  const g = await requireUser(req);
  if (g.error) return g.error;
  if (!rateLimit(`analisar:${g.user.id}`, 10, 10 * 60_000)) return json({ error: "Muitas análises seguidas. Aguarde alguns minutos." }, 429);
  try {
    const form = await req.formData();
    const file = form.get("file");
    const text = String(form.get("text") ?? "");
    const url = String(form.get("url") ?? "").trim();
    if (url && !/^https:\/\//.test(url)) return json({ error: "Informe um endereço https válido." }, 400);
    let bytes: Uint8Array | undefined;
    if (file && typeof file === "object" && "arrayBuffer" in file) {
      if ((file as File).size > MAX) return json({ error: "Arquivo maior que 15 MB." }, 413);
      bytes = new Uint8Array(await (file as File).arrayBuffer());
    }
    if (!bytes && text.trim().length < 200) return json({ error: "Envie o PDF do edital ou cole o texto completo (mínimo de 200 caracteres)." }, 400);
    if (text.length > 2_000_000) return json({ error: "Texto muito longo." }, 413);
    const r = await analyzeUpload({ bytes, text, url: url || undefined, ai: geminiProvider() });
    return json(r);
  } catch (e) {
    return json({ error: (e as Error).message.slice(0, 200) }, 400);
  }
}
