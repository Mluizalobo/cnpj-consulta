import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { MonitorStore } from "./store";

/** Store do monitor com a chave SECRETA (service role). Só roda no servidor. */
export function supabaseMonitorStore(): MonitorStore | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const sb: SupabaseClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const ok = <T>(r: { data: T; error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); return r.data; };
  return {
    async listSources() { return ok(await sb.from("competition_sources").select("*").eq("active", true).order("kind")) ?? []; },
    async updateSource(id, p) { ok(await sb.from("competition_sources").update(p).eq("id", id)); },
    async findDocumentByHash(hash) { return ok(await sb.from("competition_documents").select("*").eq("content_hash", hash).maybeSingle()); },
    async insertDocument(doc, pages) {
      ok(await sb.from("competition_documents").insert(doc));
      ok(await sb.from("competition_document_texts").insert({ document_id: doc.id, pages }));
    },
    async insertUpdate(u) {
      const r = await sb.from("competition_updates").insert(u);
      if (r.error && /duplicate key/.test(r.error.message)) return false;
      ok(r); return true;
    },
    async latestVersion() { return ok(await sb.from("competition_versions").select("*").order("version_number", { ascending: false }).limit(1).maybeSingle()); },
    async insertVersion(v) { ok(await sb.from("competition_versions").insert(v)); },
    async insertLog(l) { ok(await sb.from("monitoring_logs").insert(l)); },
    async updateLog(id, p) { ok(await sb.from("monitoring_logs").update(p).eq("id", id)); },
    async lastRunStartedAt(trigger) {
      let q = sb.from("monitoring_logs").select("started_at").order("started_at", { ascending: false }).limit(1);
      if (trigger) q = q.eq("trigger", trigger);
      return (ok(await q.maybeSingle()) as { started_at: string } | null)?.started_at ?? null;
    },
  };
}

/** Valida o token da usuária logada (para a verificação manual). */
export async function verifyUserToken(token: string | null): Promise<{ id: string; email: string | null } | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !anon) return null;
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}
