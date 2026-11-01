"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { E2E_MODE, SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";
import { mockAuth, supabaseAuth, type AuthClient } from "./auth";
import type { Backend } from "./backend";
import { SupabaseBackend } from "./supabase-backend";
import { MemoryBackend } from "./memory-backend";

let sb: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  if (!sb) {
    sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
    });
  }
  return sb;
}

let auth: AuthClient | null = null;
export function getAuth(): AuthClient {
  if (!auth) auth = E2E_MODE ? mockAuth() : supabaseAuth(supabase());
  return auth;
}

let backend: Backend | null = null;
export function getBackend(): Backend {
  if (!backend) {
    if (E2E_MODE) {
      const mem = new MemoryBackend("pcmg-e2e-server");
      // Gancho SOMENTE para testes automatizados: simula o servidor publicando dados do concurso.
      (window as unknown as { __pcmgE2E?: unknown }).__pcmgE2E = { serverInsert: (t: string, rows: never[]) => mem.serverInsert(t as never, rows) };
      backend = mem;
    } else backend = new SupabaseBackend(supabase());
  }
  return backend;
}
