import { runMonitor } from "@/lib/monitor/pipeline";
import { httpFetcher } from "@/lib/monitor/fetcher";
import { geminiProvider } from "@/lib/monitor/ai";
import { supabaseMonitorStore } from "@/lib/monitor/supabase-store";
import { json, rateLimit, requireUser } from "@/lib/server/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Botão "Verificar atualizações agora" (exige login). */
export async function POST(req: Request) {
  const g = await requireUser(req);
  if (g.error) return g.error;
  const store = supabaseMonitorStore();
  if (!store) return json({ error: "Monitoramento não configurado no servidor (falta SUPABASE_SERVICE_ROLE_KEY).", code: "not_configured" }, 503);
  if (!rateLimit(`verificar:${g.user.id}`, 3, 10 * 60_000)) return json({ error: "Muitas verificações seguidas. Tente de novo em alguns minutos.", code: "rate_limited" }, 429);
  const last = await store.lastRunStartedAt("manual");
  if (last && Date.now() - new Date(last).getTime() < 2 * 60_000) return json({ error: "Uma verificação acabou de ser feita. Aguarde 2 minutos.", code: "rate_limited" }, 429);
  try {
    const r = await runMonitor({ trigger: "manual", store, fetcher: httpFetcher, ai: geminiProvider() });
    return json(r);
  } catch (e) {
    return json({ error: "Falha ao verificar as fontes. Tente novamente mais tarde.", detail: String((e as Error).message).slice(0, 200) }, 500);
  }
}
