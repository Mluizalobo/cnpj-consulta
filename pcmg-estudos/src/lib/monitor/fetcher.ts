/** Busca HTTP segura para o monitoramento (somente no servidor). */
export interface FetchResult { url: string; status: number; contentType: string; bytes: Uint8Array }
export type Fetcher = (url: string) => Promise<FetchResult>;

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB
const TIMEOUT_MS = 20_000;

/** Bloqueia endereços internos (proteção contra SSRF) e protocolos não HTTP(S). */
export function assertSafeUrl(raw: string): URL {
  const u = new URL(raw);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Protocolo não permitido");
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || /^(127\.|10\.|192\.168\.|169\.254\.|0\.|::1|\[::1\])/.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) {
    throw new Error("Endereço interno não permitido");
  }
  return u;
}

export const httpFetcher: Fetcher = async (url) => {
  assertSafeUrl(url);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal, redirect: "follow",
      headers: { "User-Agent": "MeuConcursoPCMG/1.0 (monitor pessoal de estudos; 1 verificacao/dia)", Accept: "text/html,application/pdf,application/xhtml+xml,*/*;q=0.5" },
    });
    assertSafeUrl(res.url || url);
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_BYTES) throw new Error("Arquivo grande demais");
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_BYTES) { ctrl.abort(); throw new Error("Arquivo grande demais"); }
        chunks.push(value);
      }
    }
    const bytes = new Uint8Array(size);
    let off = 0;
    for (const c of chunks) { bytes.set(c, off); off += c.length; }
    return { url: res.url || url, status: res.status, contentType: res.headers.get("content-type") ?? "", bytes };
  } finally {
    clearTimeout(t);
  }
};

export async function sha256(bytes: Uint8Array | string): Promise<string> {
  const data = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  const buf = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
