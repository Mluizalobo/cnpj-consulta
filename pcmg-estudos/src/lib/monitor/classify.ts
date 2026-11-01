import type { DocType, Reliability, SourceKind } from "../types";
import { normalizeText } from "../domain/text";

/** Domínios considerados oficiais (governo de MG, PCMG, imprensa oficial e banca). */
export const OFFICIAL_DOMAINS = ["mg.gov.br", "policiacivil.mg.gov.br", "jornalminasgerais.mg.gov.br", "fgv.br", "conhecimento.fgv.br"];
export const isOfficialUrl = (url: string) => {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return OFFICIAL_DOMAINS.some((d) => h === d || h.endsWith("." + d));
  } catch { return false; }
};

export const MIN_COMPETITION_YEAR = 2026;

const OTHER_CARGOS = ["delegado de policia", "escrivao de policia", "perito criminal", "medico legista", "medico-legista", "analista da policia civil", "tecnico assistente da policia civil", "auxiliar de necropsia"];

export interface Classification {
  docType: DocType;
  cargoMatch: "investigador" | "multi_cargo" | "outro_cargo" | "indefinido";
  aboutPcmg: boolean;
  isOfficial: boolean;
  year: number | null;
  editalNumber: string | null;
  confidence: number;
  reliability: Reliability;
  outdated: boolean;
  usableForPlan: boolean;
  reasons: string[];
}

const count = (text: string, needle: string) => text.split(needle).length - 1;

export function extractEditalNumber(text: string): string | null {
  const m = text.match(/EDITAL\s+(?:DE\s+[A-ZÀ-Ú ]+?\s+)?N[º°o.]?\s*[:\-]?\s*(\d{1,4}\s*\/\s*\d{4})/i);
  return m ? m[1].replace(/\s+/g, "") : null;
}

export function classifyDocument(input: { title?: string; text: string; url: string; sourceKind: SourceKind }): Classification {
  const reasons: string[] = [];
  const raw = input.text || "";
  const head = normalizeText(((input.title ?? "") + " " + raw.slice(0, 1500)).replace(/[-–—]/g, " "));
  const full = normalizeText(raw.replace(/[-–—]/g, " "));

  const aboutPcmg = /policia civil (do estado )?de minas gerais|\bpcmg\b|policia civil do estado de minas/.test(full);
  if (!aboutPcmg) reasons.push("Não menciona a Polícia Civil de Minas Gerais");

  // Cargo
  const inv = count(full, "investigador de policia") + count(full, "investigadores de policia");
  // O cargo é definido pela linha-título do concurso ("CONCURSO PÚBLICO PARA ... CARGO DE ..."), quando existe.
  const titleLines = raw.split("\n").slice(0, 40).filter((l) => /concurso p[úu]blico|provimento|cargos?\s+de/i.test(l));
  const cargoHead = titleLines.length ? normalizeText(((input.title ?? "") + " " + titleLines.join(" ")).replace(/[-–—]/g, " ")) : head;
  const invHead = /investigador(es)? de policia/.test(cargoHead);
  const othersHead = OTHER_CARGOS.filter((c) => cargoHead.includes(normalizeText(c)));
  let cargoMatch: Classification["cargoMatch"];
  if (inv === 0) cargoMatch = othersHead.length || OTHER_CARGOS.some((c) => full.includes(normalizeText(c))) ? "outro_cargo" : "indefinido";
  else if (invHead && othersHead.length) cargoMatch = "multi_cargo";
  else if (invHead) cargoMatch = "investigador";
  else if (othersHead.length) cargoMatch = "outro_cargo"; // ex.: edital de Delegado que cita investigadores de passagem
  else cargoMatch = "investigador";
  if (cargoMatch === "outro_cargo") reasons.push(`Documento de outro cargo (${othersHead.join(", ") || "não é Investigador"})`);
  if (cargoMatch === "multi_cargo") reasons.push("Edital com vários cargos: apenas a parte de Investigador será considerada");

  // Tipo
  let docType: DocType = "outro";
  if (input.sourceKind === "secundaria") docType = "noticia";
  else if (/retifica/.test(head)) docType = "retificacao";
  else if (/edital/.test(head) && /(abertura|torna publica a abertura|realizacao de concurso|concurso publico para (o )?(provimento|cargo))/.test(head)) docType = "edital_abertura";
  else if (/cronograma/.test(head)) docType = "cronograma";
  else if (/convoca/.test(head)) docType = "convocacao";
  else if (/resultado|gabarito|classificacao final|homologa/.test(head)) docType = "resultado";
  else if (/comunicado|aviso|nota oficial|comissao/.test(head)) docType = "comunicado";

  // Ano
  const editalNumber = extractEditalNumber(raw);
  let year: number | null = editalNumber ? Number(editalNumber.split("/")[1]) : null;
  if (!year) {
    const years = [...raw.matchAll(/\b(20[1-3]\d)\b/g)].map((m) => Number(m[1]));
    year = years.length ? Math.max(...years) : null;
  }
  const outdated = year !== null && year < MIN_COMPETITION_YEAR;
  if (outdated) reasons.push(`Documento de ${year}: concurso anterior, não será usado no plano atual`);

  const isOfficial = input.sourceKind !== "secundaria" && isOfficialUrl(input.url);
  if (!isOfficial) reasons.push(input.sourceKind === "secundaria" ? "Fonte secundária (cursinho/notícia): usada apenas como pista" : "Endereço fora dos domínios oficiais");

  let confidence = 0.2;
  if (aboutPcmg) confidence += 0.25;
  if (cargoMatch === "investigador") confidence += 0.25;
  if (cargoMatch === "multi_cargo") confidence += 0.15;
  if (isOfficial) confidence += 0.2;
  if (editalNumber) confidence += 0.1;
  if (outdated || cargoMatch === "outro_cargo") confidence = Math.min(confidence, 0.3);
  confidence = Math.round(Math.min(1, confidence) * 1000) / 1000;

  const relevant = aboutPcmg && (cargoMatch === "investigador" || cargoMatch === "multi_cargo") && !outdated;
  const reliability: Reliability = !isOfficial ? "preliminar" : relevant && confidence >= 0.7 ? "confirmado" : "aguardando_confirmacao";
  const usableForPlan = isOfficial && relevant && reliability === "confirmado" && (docType === "edital_abertura" || docType === "retificacao");
  return { docType, cargoMatch, aboutPcmg, isOfficial, year, editalNumber, confidence, reliability, outdated, usableForPlan, reasons };
}
