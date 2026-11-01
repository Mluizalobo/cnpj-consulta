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
  if (!backend) backend = E2E_MODE ? new MemoryBackend("pcmg-e2e-server") : new SupabaseBackend(supabase());
  return backend;
}
