import type { SupabaseClient } from "@supabase/supabase-js";

export interface AuthUser { id: string; email: string | null }
export interface AuthClient {
  getUser(): Promise<AuthUser | null>;
  onChange(cb: (u: AuthUser | null) => void): () => void;
  sendLink(email: string, redirectTo: string): Promise<void>;
  verifyCode(email: string, code: string): Promise<void>;
  signInWithPassword(email: string, password: string): Promise<void>;
  setPassword(password: string): Promise<void>;
  signOut(): Promise<void>;
  accessToken(): Promise<string | null>;
}

const msg = (e: { message?: string; status?: number } | null) => {
  if (!e) return null;
  const m = e.message ?? "Erro desconhecido";
  if (/rate limit|too many/i.test(m) || e.status === 429) return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  if (/invalid login credentials/i.test(m)) return "E-mail ou senha incorretos. Se ainda não criou uma senha, entre pelo link do e-mail e crie em Configurações.";
  if (/expired|invalid/i.test(m)) return "Código inválido ou expirado. Peça um novo link.";
  if (/password.*(at least|short|weak)/i.test(m)) return "Senha fraca: use pelo menos 8 caracteres.";
  if (/same.*password|different from the old/i.test(m)) return "A nova senha precisa ser diferente da atual.";
  if (/signups not allowed|not allowed/i.test(m)) return "Cadastro desativado para este e-mail.";
  if (/fetch/i.test(m)) return "Sem conexão com o servidor. Verifique sua internet.";
  return m;
};

export function supabaseAuth(sb: SupabaseClient): AuthClient {
  return {
    async getUser() {
      const { data } = await sb.auth.getSession();
      const u = data.session?.user;
      return u ? { id: u.id, email: u.email ?? null } : null;
    },
    onChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_e, session) => cb(session?.user ? { id: session.user.id, email: session.user.email ?? null } : null));
      return () => data.subscription.unsubscribe();
    },
    async sendLink(email, redirectTo) {
      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo, shouldCreateUser: true } });
      const m = msg(error); if (m) throw new Error(m);
    },
    async verifyCode(email, code) {
      const { error } = await sb.auth.verifyOtp({ email, token: code, type: "email" });
      const m = msg(error); if (m) throw new Error(m);
    },
    async signInWithPassword(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      const m = msg(error); if (m) throw new Error(m);
    },
    async setPassword(password) {
      const { error } = await sb.auth.updateUser({ password });
      const m = msg(error); if (m) throw new Error(m);
    },
    async signOut() { await sb.auth.signOut(); },
    async accessToken() { const { data } = await sb.auth.getSession(); return data.session?.access_token ?? null; },
  };
}

/** Login falso para testes E2E: código 123456. */
export function mockAuth(): AuthClient {
  const KEY = "pcmg-e2e-auth";
  const listeners = new Set<(u: AuthUser | null) => void>();
  const read = (): AuthUser | null => { try { return JSON.parse(localStorage.getItem(KEY) ?? "null"); } catch { return null; } };
  const emit = () => listeners.forEach((l) => l(read()));
  return {
    async getUser() { return read(); },
    onChange(cb) { listeners.add(cb); return () => listeners.delete(cb); },
    async sendLink() { /* nada */ },
    async verifyCode(email, code) {
      if (code !== "123456") throw new Error("Código inválido ou expirado. Peça um novo link.");
      localStorage.setItem(KEY, JSON.stringify({ id: "00000000-0000-4000-8000-0000000000e2", email }));
      emit();
    },
    async signInWithPassword(email, password) {
      if (localStorage.getItem(KEY + ":pw:" + email) !== password) throw new Error("E-mail ou senha incorretos. Se ainda não criou uma senha, entre pelo link do e-mail e crie em Configurações.");
      localStorage.setItem(KEY, JSON.stringify({ id: "00000000-0000-4000-8000-0000000000e2", email }));
      emit();
    },
    async setPassword(password) {
      const u = read();
      if (!u?.email) throw new Error("Não autenticado");
      if (password.length < 8) throw new Error("Senha fraca: use pelo menos 8 caracteres.");
      localStorage.setItem(KEY + ":pw:" + u.email, password);
    },
    async signOut() { localStorage.removeItem(KEY); emit(); },
    async accessToken() { return read() ? "e2e-token" : null; },
  };
}
