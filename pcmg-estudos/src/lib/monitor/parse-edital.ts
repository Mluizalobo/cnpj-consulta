/**
 * Interpretação de editais SEM IA (expressões regulares e regras).
 * Cada informação extraída guarda a página de origem e um grau de confiança.
 */
import { normalizeText } from "../domain/text";
import { extractEditalNumber } from "./classify";
import { aliasSlug } from "./match";

export interface Field<T> { value: T; page: number | null; confidence: number; snippet?: string }
export interface EditalSubject { name: string; slug: string | null; questions: number | null; weight: number | null; page: number | null }
export interface SyllabusNode { code: string | null; title: string; children: SyllabusNode[] }
export interface SyllabusSubject { name: string; slug: string | null; page: number | null; topics: SyllabusNode[] }
export interface ScheduleItem { date: string; event: string; page: number | null }

export interface EditalData {
  editalNumber: Field<string> | null;
  cargo: Field<string> | null;
  board: Field<string> | null;
  vacancies: Field<number> | null;
  education: Field<string> | null;
  requirements: Field<string[]> | null;
  salary: Field<number> | null;
  fee: Field<number> | null;
  registration: Field<{ start: string; end: string }> | null;
  examDate: Field<string> | null;
  examTime: Field<string> | null;
  durationMinutes: Field<number> | null;
  stages: Field<string[]> | null;
  approval: Field<string> | null;
  minScorePct: Field<number> | null;
  totalQuestions: Field<number> | null;
  subjects: EditalSubject[];
  syllabus: SyllabusSubject[];
  legislation: string[];
  schedule: ScheduleItem[];
  warnings: string[];
}

const MONTHS: Record<string, number> = { janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };
export function toIsoDate(s: string): string | null {
  let m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = normalizeText(s).match(/(\d{1,2}) de (janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro) de (\d{4})/);
  if (m) return `${m[3]}-${String(MONTHS[m[2]]).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}
const DATE_RE = /(\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}º?\s+de\s+[a-zç]+\s+de\s+\d{4})/i;
const money = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));

const BOARDS: [RegExp, string][] = [
  [/Funda[çc][ãa]o Get[uú]lio Vargas|\bFGV\b/i, "FGV"],
  [/Cebraspe|\bCESPE\b/i, "Cebraspe"],
  [/\bIBFC\b/i, "IBFC"],
  [/\bFUMARC\b/i, "Fumarc"],
  [/\bVUNESP\b/i, "Vunesp"],
  [/Funda[çc][ãa]o Carlos Chagas|\bFCC\b/i, "FCC"],
  [/Consulplan/i, "Consulplan"],
  [/\bIBADE\b/i, "Ibade"],
  [/Instituto AOCP|\bAOCP\b/i, "Instituto AOCP"],
  [/Instituto Consulplan/i, "Consulplan"],
  [/\bIDECAN\b/i, "Idecan"],
  [/Funda[çc][ãa]o Cesgranrio|Cesgranrio/i, "Cesgranrio"],
];

const STAGES: [RegExp, string][] = [
  [/prova objetiva/i, "Prova objetiva"],
  [/prova discursiva|prova de reda[çc][ãa]o/i, "Prova discursiva"],
  [/aptid[ãa]o f[íi]sica|teste f[íi]sico|\bTAF\b/i, "Prova de aptidão física"],
  [/avalia[çc][ãa]o psicol[óo]gica|exame psicot[ée]cnico/i, "Avaliação psicológica"],
  [/exame m[ée]dico|avalia[çc][ãa]o m[ée]dica|exames? de sa[úu]de/i, "Exame médico"],
  [/toxicol[óo]gico/i, "Exame toxicológico"],
  [/investiga[çc][ãa]o social|sindic[âa]ncia de vida/i, "Investigação social"],
  [/avalia[çc][ãa]o de t[íi]tulos|prova de t[íi]tulos/i, "Avaliação de títulos"],
  [/curso de forma[çc][ãa]o/i, "Curso de formação policial"],
];

interface Located { match: RegExpMatchArray; page: number }
function locate(pages: string[], re: RegExp): Located | null {
  for (let i = 0; i < pages.length; i++) {
    const m = pages[i].match(re);
    if (m) return { match: m, page: i + 1 };
  }
  return null;
}
const flat = (s: string) => s.replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ");
const field = <T>(value: T, page: number | null, confidence: number, snippet?: string): Field<T> => ({ value, page, confidence, snippet: snippet?.slice(0, 280) });

/** Divide o texto em páginas (PDF) — aceita também "\f" como quebra. */
export const splitPages = (text: string) => text.split(/\f|\\f/).map((p) => p.trim()).filter(Boolean);

export function parseEdital(pagesIn: string[]): EditalData {
  const pages = pagesIn.map((p) => p.replace(/\r/g, ""));
  const flatPages = pages.map(flat);
  const all = flatPages.join(" ");
  const warnings: string[] = [];

  const num = extractEditalNumber(all);
  const numLoc = num ? locate(flatPages, /EDITAL\s+N/i) : null;

  const cargoLoc = locate(flatPages, /(Investigador(?:es)? de Pol[íi]cia(?:\s+I{1,3}\b)?)/i);

  let board: Field<string> | null = null;
  for (const [re, name] of BOARDS) {
    const ctx = locate(flatPages, new RegExp(`(organiza|execu|realiza|responsabilidade|banca)[^.]{0,160}(${re.source})`, "i"));
    if (ctx) { board = field(name, ctx.page, 0.95, ctx.match[0]); break; }
  }
  if (!board) for (const [re, name] of BOARDS) { const l = locate(flatPages, re); if (l) { board = field(name, l.page, 0.6, l.match[0]); break; } }

  const vacLoc = locate(flatPages, /(\d{1,3}(?:\.\d{3})+|\d+)\s*(?:\([^)]{2,60}\)\s*)?vagas/i);
  const vacancies = vacLoc ? field(Number(vacLoc.match[1].replace(/\./g, "")), vacLoc.page, 0.85, vacLoc.match[0]) : null;

  const eduLoc = locate(flatPages, /(curso de n[íi]vel superior|n[íi]vel superior|curso superior|bacharel[a-z]*)[^.]{0,140}/i);
  const education = eduLoc ? field(eduLoc.match[0].trim(), eduLoc.page, 0.8, eduLoc.match[0]) : null;

  // Requisitos: linhas numeradas após o título "REQUISITOS"
  let requirements: Field<string[]> | null = null;
  for (let i = 0; i < pages.length && !requirements; i++) {
    const idx = pages[i].search(/REQUISITOS/i);
    if (idx < 0) continue;
    const after = pages[i].slice(idx).split("\n").slice(1);
    const items: string[] = [];
    for (const line of after) {
      if (/^\s*\d+\.?\s+[A-ZÀ-Ú][A-ZÀ-Ú ]{3,}$/.test(line.trim()) && items.length) break; // próximo título (linha em maiúsculas)
      const m = line.match(/^\s*\d+(?:\.\d+)+\s+(.+)$/);
      if (m) items.push(m[1].trim());
      if (items.length >= 12) break;
    }
    if (items.length) requirements = field(items, i + 1, 0.75);
  }

  const salLoc = locate(flatPages, /(remunera[çc][ãa]o|vencimento|subs[íi]dio)[^$]{0,120}?R\$\s*([\d.]+,\d{2})/i);
  const salary = salLoc ? field(money(salLoc.match[2]), salLoc.page, 0.85, salLoc.match[0]) : null;
  const feeLoc = locate(flatPages, /taxa de inscri[çc][ãa]o[^$]{0,120}?R\$\s*([\d.]+,\d{2})/i);
  const fee = feeLoc ? field(money(feeLoc.match[1]), feeLoc.page, 0.9, feeLoc.match[0]) : null;

  const regLoc = locate(flatPages, new RegExp(`inscri[çc][õo]es[^.]{0,160}?${DATE_RE.source}\\s*(?:a|at[ée]|e|ao)\\s*${DATE_RE.source}`, "i"));
  const registration = regLoc && toIsoDate(regLoc.match[1]) && toIsoDate(regLoc.match[2])
    ? field({ start: toIsoDate(regLoc.match[1])!, end: toIsoDate(regLoc.match[2])! }, regLoc.page, 0.85, regLoc.match[0]) : null;

  const examLoc = locate(flatPages, new RegExp(`prova(?:s)? objetiva(?:s)?[^.]{0,120}?(?:realizada|aplicada|ocorrer[áa])[^.]{0,40}?${DATE_RE.source}`, "i"))
    ?? locate(flatPages, new RegExp(`${DATE_RE.source}[^.\\n]{0,40}(?:aplica[çc][ãa]o|realiza[çc][ãa]o) da prova objetiva`, "i"));
  const examDate = examLoc && toIsoDate(examLoc.match[1]) ? field(toIsoDate(examLoc.match[1])!, examLoc.page, 0.9, examLoc.match[0]) : null;

  const timeLoc = locate(flatPages, /(?:in[íi]cio|hor[áa]rio)[^.]{0,30}?(\d{1,2})\s*h\s*(\d{2})?/i);
  const examTime = timeLoc ? field(`${timeLoc.match[1].padStart(2, "0")}:${timeLoc.match[2] ?? "00"}`, timeLoc.page, 0.7, timeLoc.match[0]) : null;

  const durLoc = locate(flatPages, /dura[çc][ãa]o(?: total)?(?: de| m[áa]xima de)?\s*(\d{1,2})\s*(?:horas?|h)(?:\s*e\s*(\d{1,2})\s*min(?:utos)?|(\d{2}))?/i);
  const durationMinutes = durLoc ? field(Number(durLoc.match[1]) * 60 + Number(durLoc.match[2] ?? durLoc.match[3] ?? 0), durLoc.page, 0.85, durLoc.match[0]) : null;

  const stagesFound: string[] = [];
  let stagesPage: number | null = null;
  const stagesLoc = locate(flatPages, /(?:(?:etapas?|fases?)[^.]{0,60}(?:composto|seguintes|compreender)|(?:composto|compreender[áa]|constitu[íi]do)[^.]{0,60}(?:etapas?|fases?))[^.]{0,600}\./i);
  const stageText = stagesLoc ? stagesLoc.match[0] : all;
  for (const [re, name] of STAGES) if (re.test(stageText)) stagesFound.push(name);
  if (stagesLoc) stagesPage = stagesLoc.page;
  const stages = stagesFound.length ? field(stagesFound, stagesPage, stagesLoc ? 0.85 : 0.55) : null;

  const apprLoc = locate(flatPages, /[^.]*(considerado aprovado|ser[áa] eliminado|ser[áa]o considerados habilitados|considerado habilitado)[^.]*\./i);
  const apprText = apprLoc ? apprLoc.match[0].trim().replace(/^\d+\s+/, "") : "";
  const approval = apprLoc ? field(apprText, apprLoc.page, 0.8, apprText) : null;
  const minPct = apprLoc?.match[0].match(/(\d{1,3}(?:,\d+)?)\s*%/);
  const minScorePct = minPct ? field(Number(minPct[1].replace(",", ".")), apprLoc!.page, 0.8) : null;

  const tqLoc = locate(flatPages, /prova objetiva[^.]{0,80}?(\d{2,3})\s*(?:\([^)]*\)\s*)?quest[õo]es/i) ?? locate(flatPages, /(\d{2,3})\s*(?:\([^)]*\)\s*)?quest[õo]es de m[úu]ltipla escolha/i);
  const totalQuestions = tqLoc ? field(Number(tqLoc.match[1]), tqLoc.page, 0.85, tqLoc.match[0]) : null;

  const subjects = parseDistribution(pages);
  const sumSubjects = subjects.reduce((s, x) => s + (x.questions ?? 0), 0);
  if (totalQuestions && subjects.length && sumSubjects !== totalQuestions.value) warnings.push(`A soma do quadro (${sumSubjects}) difere do total informado (${totalQuestions.value}). Confira no documento.`);
  if (!subjects.length) warnings.push("Quadro de distribuição das questões não identificado automaticamente.");

  const syllabus = parseSyllabus(pages);
  if (!syllabus.length) warnings.push("Conteúdo programático não identificado automaticamente.");

  const legislation = [...new Set([...all.matchAll(/((?:Lei Complementar|Lei|Decreto(?:-Lei)?|Emenda Constitucional)(?: Estadual| Federal)?\s+n[º°o.]?\s*[\d.]+\/\d{2,4})/gi)]
    .map((m) => m[1].replace(/\s+/g, " ").replace(/n[º°o.]\s*/i, "nº ")))];
  for (const m of all.matchAll(/(Constitui[çc][ãa]o (?:Federal|da Rep[úu]blica|do Estado de Minas Gerais))/gi)) if (!legislation.includes(m[1])) legislation.push(m[1]);

  const schedule = parseSchedule(pages);

  return {
    editalNumber: num ? field(num, numLoc?.page ?? 1, 0.95) : null,
    cargo: cargoLoc ? field(cargoLoc.match[1], cargoLoc.page, 0.9) : null,
    board, vacancies, education, requirements, salary, fee, registration, examDate, examTime, durationMinutes, stages,
    approval, minScorePct, totalQuestions, subjects, syllabus, legislation, schedule, warnings,
  };
}

function parseDistribution(pages: string[]): EditalSubject[] {
  const out: EditalSubject[] = [];
  for (let i = 0; i < pages.length; i++) {
    const lines = pages[i].split("\n");
    let inTable = false;
    for (const line of lines) {
      if (/(quadro|distribui[çc][ãa]o)[^\n]{0,60}(quest[õo]es|provas)|disciplinas?\s+(n[º°]\s*de\s*)?quest[õo]es/i.test(line)) { inTable = true; continue; }
      if (!inTable) continue;
      if (/^\s*total\b/i.test(line)) { inTable = false; continue; }
      const m = line.match(/^\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ ,()º°nN.\/\-–\d]*?[A-Za-zÀ-ÿ)])\s+(\d{1,3})(?:\s+(\d+(?:,\d+)?))?(?:\s+\d+(?:,\d+)?)*\s*$/);
      if (m && !/^(disciplina|mat[ée]ria|conte[úu]do)/i.test(m[1])) {
        out.push({ name: m[1].trim(), slug: aliasSlug(m[1]), questions: Number(m[2]), weight: m[3] ? Number(m[3].replace(",", ".")) : null, page: i + 1 });
      } else if (out.length && line.trim() && !/^\s*(disciplina|mat[ée]ria)/i.test(line)) {
        if (/^\s*\d+(\.\d+)*\s/.test(line)) inTable = false; // novo item do edital
      }
    }
  }
  return out;
}

/** Converte "1. A. 2. B. 2.1 C." em árvore hierárquica. */
export function parseTopicList(text: string): SyllabusNode[] {
  const t = flat(text).trim();
  const re = /(?:^|\s)(\d{1,2}(?:\.\d{1,2}){0,3})\.?\s+(?=[A-ZÀ-Ú])/g;
  const marks: { code: string; start: number; textStart: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) marks.push({ code: m[1], start: m.index, textStart: m.index + m[0].length });
  if (marks.length === 0) {
    return t.split(/;\s+|\.\s+(?=[A-ZÀ-Ú])/).map((s) => s.trim().replace(/[.;]$/, "")).filter((s) => s.length > 2).map((title) => ({ code: null, title, children: [] }));
  }
  const roots: SyllabusNode[] = [];
  const stack: { depth: number; node: SyllabusNode }[] = [];
  marks.forEach((mk, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].start : t.length;
    const title = t.slice(mk.textStart, end).trim().replace(/[.;]\s*$/, "");
    if (!title) return;
    const depth = mk.code.split(".").length;
    const node: SyllabusNode = { code: mk.code, title, children: [] };
    while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
    if (stack.length) stack[stack.length - 1].node.children.push(node); else roots.push(node);
    stack.push({ depth, node });
  });
  return roots;
}

function parseSyllabus(pages: string[]): SyllabusSubject[] {
  // Começa no "CONTEÚDO PROGRAMÁTICO"; se houver vários cargos, procura a seção de Investigador.
  let startPage = -1, startIdx = 0;
  for (let i = 0; i < pages.length; i++) {
    const idx = pages[i].search(/CONTE[ÚU]DO PROGRAM[ÁA]TICO|CONTE[ÚU]DOS PROGRAM[ÁA]TICOS|OBJETOS DE AVALIA[ÇC][ÃA]O/i);
    if (idx >= 0) { startPage = i; startIdx = idx; break; }
  }
  if (startPage < 0) return [];
  const chunks: { text: string; page: number }[] = [];
  for (let i = startPage; i < pages.length; i++) chunks.push({ text: i === startPage ? pages[i].slice(startIdx) : pages[i], page: i + 1 });
  let lines: { line: string; page: number }[] = chunks.flatMap((c) => c.text.split("\n").map((line) => ({ line, page: c.page })));
  const invIdx = lines.findIndex((l, i) => i > 0 && /^\s*(CARGO\s*:?\s*)?INVESTIGADOR DE POL[ÍI]CIA/i.test(l.line));
  if (invIdx > 0) {
    lines = lines.slice(invIdx + 1);
    const nextCargo = lines.findIndex((l) => /^\s*(CARGO\s*:?\s*)?(DELEGADO|ESCRIV[ÃA]O|PERITO|M[ÉE]DICO)/i.test(l.line));
    if (nextCargo > 0) lines = lines.slice(0, nextCargo);
  }
  const out: SyllabusSubject[] = [];
  let cur: { name: string; page: number; buf: string[] } | null = null;
  const push = () => { if (cur) out.push({ name: cur.name, slug: aliasSlug(cur.name), page: cur.page, topics: parseTopicList(cur.buf.join(" ")) }); };
  for (const { line, page } of lines.slice(1)) {
    if (/^\s*ANEXO\s+[IVX]+/i.test(line)) break; // próximo anexo (ex.: cronograma)
    const h = line.match(/^\s*([A-ZÀ-Ú][A-ZÀ-Ú ,()º°\-–\d/]{3,90}?)\s*[:\-–]\s*(.*)$/);
    const isHeading = h && h[1] === h[1].toUpperCase() && !/^\d/.test(h[1]);
    const plainHeading = !h && /^\s*[A-ZÀ-Ú][A-ZÀ-Ú ,()º°\-–\d/]{3,90}\s*$/.test(line) && line.trim() === line.trim().toUpperCase();
    if (isHeading || plainHeading) {
      push();
      cur = { name: (isHeading ? h![1] : line).trim(), page, buf: isHeading && h![2] ? [h![2]] : [] };
    } else if (cur) cur.buf.push(line);
  }
  push();
  return out.filter((s) => s.topics.length > 0);
}

function parseSchedule(pages: string[]): ScheduleItem[] {
  const out: ScheduleItem[] = [];
  for (let i = 0; i < pages.length; i++) {
    const idx = pages[i].search(/CRONOGRAMA/i);
    if (idx < 0) continue;
    for (const line of pages[i].slice(idx).split("\n").slice(1)) {
      const m = line.match(/^\s*(\d{1,2}\/\d{1,2}\/\d{4})(?:\s*(?:a|at[ée])\s*\d{1,2}\/\d{1,2}\/\d{4})?\s*[-–:]?\s*(.{3,160})$/);
      if (m) out.push({ date: toIsoDate(m[1])!, event: m[2].trim(), page: i + 1 });
      const m2 = !m && line.match(/^\s*(.{3,160}?)\s*[-–:]?\s+(\d{1,2}\/\d{1,2}\/\d{4})\s*$/);
      if (m2) out.push({ date: toIsoDate(m2[2])!, event: m2[1].trim(), page: i + 1 });
    }
  }
  return out;
}

/** Retificação: pares "onde se lê ... leia-se ...". */
export function parseRectification(pages: string[]): { item: string | null; before: string; after: string; page: number }[] {
  const out: { item: string | null; before: string; after: string; page: number }[] = [];
  pages.forEach((p, i) => {
    const re = /(?:\b(?:no|na)\s+([^"“]{1,120}?),\s*)?onde se l[êe]\s*:?\s*["“]([^"”]+)["”]\s*,?\s*leia-se\s*:?\s*["“]([^"”]+)["”]/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(flat(p)))) out.push({ item: m[1]?.trim() ?? null, before: m[2].trim(), after: m[3].trim(), page: i + 1 });
  });
  return out;
}

/**
 * Aplica uma retificação sobre os dados do edital anterior (gera a nova versão consolidada).
 * Campos reconhecidos: data da prova, quantidade de questões, conteúdo programático (itens), taxa, vagas.
 */
export function applyRectification(prev: EditalData, pages: string[]): { data: EditalData; applied: string[]; unresolved: string[] } {
  const data: EditalData = JSON.parse(JSON.stringify(prev));
  const applied: string[] = [], unresolved: string[] = [];
  for (const r of parseRectification(pages)) {
    const afterDate = toIsoDate(r.after), beforeDate = toIsoDate(r.before);
    if (afterDate && beforeDate && /prova/i.test(r.before + r.after + (r.item ?? ""))) {
      data.examDate = { value: afterDate, page: r.page, confidence: 0.9, snippet: r.after };
      applied.push(`Data da prova: ${beforeDate} → ${afterDate}`);
      continue;
    }
    const subjInItem = r.item ? data.syllabus.find((s) => normalizeText(r.item!).includes(normalizeText(s.name))) : undefined;
    if (subjInItem || /anexo/i.test(r.item ?? "")) {
      const target = subjInItem ?? data.syllabus.find((s) => normalizeText(r.after).includes(normalizeText(s.topics[0]?.title ?? "§§")));
      if (target) {
        const beforeTopics = parseTopicList(r.before).map((t) => normalizeText(t.title));
        const newTopics = parseTopicList(r.after);
        target.topics = [...target.topics.filter((t) => !beforeTopics.includes(normalizeText(t.title))), ...newTopics]
          .sort((a, b) => (Number(a.code?.split(".")[0] ?? 99) - Number(b.code?.split(".")[0] ?? 99)));
        applied.push(`Conteúdo de ${target.name} alterado`);
        continue;
      }
    }
    const q = r.after.match(/(\d{2,3})\s*quest/i);
    if (q && /quest/i.test(r.before)) { data.totalQuestions = { value: Number(q[1]), page: r.page, confidence: 0.85 }; applied.push(`Total de questões → ${q[1]}`); continue; }
    unresolved.push(`${r.item ? r.item + ": " : ""}"${r.before}" → "${r.after}"`);
  }
  // Campos que a retificação menciona diretamente (sem "onde se lê")
  const re = parseEdital(pages);
  if (!applied.some((a) => a.startsWith("Data da prova")) && re.examDate && re.examDate.value !== prev.examDate?.value && !parseRectification(pages).length) {
    data.examDate = re.examDate; applied.push(`Data da prova → ${re.examDate.value}`);
  }
  return { data, applied, unresolved };
}
