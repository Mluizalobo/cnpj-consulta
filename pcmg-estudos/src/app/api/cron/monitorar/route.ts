import { runMonitor } from "@/lib/monitor/pipeline";
import { httpFetcher } from "@/lib/monitor/fetcher";
import { geminiProvider } from "@/lib/monitor/ai";
import { supabaseMonitorStore } from "@/lib/monitor/supabase-store";
import { json, safeEqual } from "@/lib/server/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Verificação automática. Chamada pelo Vercel Cron (diária) e, opcionalmente, pelo GitHub Actions.
 * Protegida por CRON_SECRET (cabeçalho Authorization: Bearer <segredo>).
 */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return json({ error: "Não autorizado" }, 401);
  const store = supabaseMonitorStore();
  if (!store) return json({ error: "Monitoramento não configurado (falta SUPABASE_SERVICE_ROLE_KEY)." }, 503);
  const last = await store.lastRunStartedAt("cron");
  if (last && Date.now() - new Date(last).getTime() < 50 * 60_000) return json({ skipped: true, reason: "Verificação recente" });
  const r = await runMonitor({ trigger: "cron", store, fetcher: httpFetcher, ai: geminiProvider() });
  return json({ status: r.status, newUpdates: r.newUpdates, newDocuments: r.newDocuments, editalFound: r.editalFound, errors: r.errors.length });
}
export const GET = handle;
export const POST = handle;
