/** Extração de texto de PDF (sem IA) e de páginas HTML. */
/** Decide pela assinatura real do arquivo (%PDF); extensão e content-type nem sempre são confiáveis. */
export const isPdf = (_contentType: string, bytes: Uint8Array, _url = "") =>
  bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF

export async function extractPdfPages(bytes: Uint8Array): Promise<string[]> {
  if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) throw new Error("Arquivo não é um PDF válido");
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = (Array.isArray(text) ? text : [text]).map((p) => p.replace(/\u0000/g, ""));
  if (pages.join("").trim().length < 50) throw new Error("PDF sem texto extraível (possivelmente digitalizado como imagem)");
  return pages;
}

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ordm: "º", ordf: "ª", ccedil: "ç", atilde: "ã", otilde: "õ", aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", acirc: "â", ecirc: "ê", ocirc: "ô", agrave: "à", Ccedil: "Ç", Atilde: "Ã", Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú" };
export const decodeEntities = (s: string) =>
  s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") { const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
    return ENT[e] ?? m;
  });

export function htmlToText(html: string): string {
  return decodeEntities(
    html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)[^>]*>/gi, "\n").replace(/<[^>]+>/g, " "),
  ).replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

export function extractLinks(html: string, baseUrl: string): { href: string; text: string }[] {
  const out: { href: string; text: string }[] = [];
  const re = /<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const href = new URL(decodeEntities(m[1]), baseUrl).toString();
      out.push({ href, text: htmlToText(m[2]).slice(0, 300) });
    } catch { /* ignora */ }
  }
  return out;
}

/** Links que parecem tratar do concurso de Investigador da PCMG. */
export function relevantLinks(links: { href: string; text: string }[]): { href: string; text: string }[] {
  const seen = new Set<string>();
  return links.filter((l) => {
    const s = `${l.text} ${decodeURIComponent(l.href)}`.toLowerCase();
    const topic = /(investigador|pcmg|pol[ií]cia civil|policia-civil|concurso)/.test(s);
    const doc = /(edital|retifica|comunicado|cronograma|convoca|concurso|\.pdf)/.test(s);
    if (!topic || !doc || seen.has(l.href)) return false;
    seen.add(l.href);
    return true;
  }).slice(0, 15);
}
