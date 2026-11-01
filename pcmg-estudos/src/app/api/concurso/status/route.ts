import { json } from "@/lib/server/guard";

export const dynamic = "force-dynamic";

/** Informa ao app quais recursos do servidor estão ativos (sem revelar segredos). */
export async function GET() {
  return json({
    monitoring: !!process.env.SUPABASE_SERVICE_ROLE_KEY && !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    cron: !!process.env.CRON_SECRET,
    ai: !!process.env.GEMINI_API_KEY,
  });
}
