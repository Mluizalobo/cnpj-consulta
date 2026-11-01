import { normalizeText } from "../domain/text";

const STOP = new Set(["de", "da", "do", "das", "dos", "e", "a", "o", "as", "os", "em", "no", "na", "nocoes", "nocao", "lei", "n", "no", "conhecimentos", "basicos", "sobre", "ao", "aos", "para"]);
export const tokens = (s: string) => normalizeText(s).split(" ").filter((t) => t && !STOP.has(t));

export function jaccard(a: string, b: string): number {
  const A = new Set(tokens(a)), B = new Set(tokens(b));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Nomes alternativos usados em editais para a mesma matéria (chave = slug interno). */
export const SUBJECT_ALIASES: Record<string, string[]> = {
  portugues: ["lingua portuguesa", "portugues", "lingua portuguesa e interpretacao de textos"],
  informatica: ["informatica", "nocoes de informatica", "conhecimentos de informatica", "tecnologia da informacao"],
  "dir-administrativo": ["direito administrativo", "nocoes de direito administrativo"],
  "dir-constitucional": ["direito constitucional", "nocoes de direito constitucional"],
  "raciocinio-logico": ["raciocinio logico", "raciocinio logico matematico", "raciocinio logico e matematico", "raciocinio logico quantitativo"],
  "lei-organica": ["lei organica da pcmg", "lei organica da policia civil", "legislacao institucional", "lei complementar 129 2013", "legislacao estadual", "lei complementar n 129 2013"],
  "dir-penal": ["direito penal", "nocoes de direito penal"],
  "processo-penal": ["direito processual penal", "processo penal", "nocoes de direito processual penal"],
  "medicina-legal": ["medicina legal", "nocoes de medicina legal"],
  criminologia: ["criminologia", "nocoes de criminologia"],
  "legislacao-extravagante": ["legislacao penal extravagante", "legislacao penal especial", "legislacao especial", "leis penais especiais", "legislacao extravagante"],
  "direitos-humanos": ["direitos humanos", "nocoes de direitos humanos"],
};

const strip = (s: string) => normalizeText(s.replace(/\(.*?\)/g, " "));

/** Retorna o slug interno de uma matéria do edital, se reconhecida. */
export function aliasSlug(name: string): string | null {
  const n = strip(name);
  for (const [slug, list] of Object.entries(SUBJECT_ALIASES)) if (list.includes(n)) return slug;
  for (const [slug, list] of Object.entries(SUBJECT_ALIASES)) if (list.some((a) => n.startsWith(a) || (a.length > 8 && n.includes(a)))) return slug;
  return null;
}

export function isKnownSubjectHeading(name: string): boolean {
  return aliasSlug(name) !== null;
}

/**
 * Semelhança entre títulos de conteúdo: Jaccard ou "contido em" (ex.: "Crase" ⊂ "Emprego do sinal indicativo de crase").
 */
export function topicSimilarity(a: string, b: string): number {
  const A = new Set(tokens(a)), B = new Set(tokens(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const jac = inter / (A.size + B.size - inter);
  const small = Math.min(A.size, B.size), large = Math.max(A.size, B.size);
  const contain = inter / small;
  return contain === 1 && (small >= 2 || large <= 5) ? Math.max(jac, 0.8) : jac;
}

/** Nome do edital é exatamente um apelido conhecido (ou igual ao nome atual)? */
export const sameSubjectName = (a: string, b: string) => strip(a) === strip(b);
