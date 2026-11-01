/** Variáveis públicas (vão para o navegador). Chaves secretas NUNCA ficam aqui. */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
/** Modo de teste automatizado (Playwright). Usa servidor em memória; nunca ative em produção. */
export const E2E_MODE = process.env.NEXT_PUBLIC_E2E === "1";
export const isConfigured = () => E2E_MODE || (!!SUPABASE_URL && !!SUPABASE_ANON_KEY && !SUPABASE_URL.includes("SEU-PROJETO"));
