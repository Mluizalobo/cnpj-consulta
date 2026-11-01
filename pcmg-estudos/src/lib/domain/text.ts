export const stripAccents = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

export const normalizeText = (s: string): string =>
  stripAccents(s).toLowerCase().replace(/\s+/g, " ").replace(/[^\p{L}\p{N} ]/gu, "").trim();

/** Hash simples e estável (FNV-1a 32 bits, em hexadecimal) para detectar questões duplicadas. */
export function contentHash(statement: string, options: string[] = []): string {
  const input = normalizeText(statement) + "||" + options.map(normalizeText).join("|");
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0") + input.length.toString(16);
}
