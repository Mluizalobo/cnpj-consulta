import type { Subject, SyllabusTopic, UserSettings } from "../types";
import { normalizeText } from "../domain/text";
import type { EditalData, SyllabusNode } from "./parse-edital";
import { aliasSlug, jaccard, sameSubjectName, topicSimilarity } from "./match";

export type Impact = "alto" | "medio" | "baixo";
export type ChangeKind = "adicionado" | "removido" | "alterado" | "renomeado" | "mantido" | "confirmado" | "informativo";
export interface Change {
  id: string;
  category: "banca" | "materia" | "questoes" | "peso" | "prova" | "duracao" | "aprovacao" | "legislacao" | "cronograma" | "conteudo" | "vagas" | "inscricoes" | "total";
  label: string;
  before: string;
  after: string;
  kind: ChangeKind;
  impact: Impact;
  page: number | null;
}

export interface SubjectMapping {
  editalName: string;
  questions: number | null;
  weight: number | null;
  subjectId: string | null; // matéria existente correspondente
  status: "mantida" | "renomeada" | "adicionada";
  topics: SyllabusNode[];
}

export interface Comparison {
  changes: Change[];
  mapping: SubjectMapping[];
  removedSubjectIds: string[];
  newTopics: { subjectName: string; title: string }[];
  removedTopics: { subjectId: string; title: string; id: string }[];
  legislationAdded: string[];
  legislationRemoved: string[];
  totals: { before: number; after: number };
}

export interface CurrentState {
  subjects: Subject[];
  settings: UserSettings;
  topics: SyllabusTopic[];
  previous?: EditalData | null;
}

const fmtDate = (iso: string | null | undefined) => (iso ? iso.split("-").reverse().join("/") : "—");
const pctOf = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 10000) / 100 : 0);
const pctLabel = (p: number) => `${p.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

export function flattenTopics(nodes: SyllabusNode[], prefix = ""): { code: string | null; title: string; path: string }[] {
  return nodes.flatMap((n) => [{ code: n.code, title: n.title, path: prefix + n.title }, ...flattenTopics(n.children, prefix + n.title + " › ")]);
}

export function matchSubjects(edital: EditalData, subjects: Subject[]): { mapping: SubjectMapping[]; removed: Subject[] } {
  const active = subjects.filter((s) => s.active);
  const used = new Set<string>();
  const names = new Map<string, { questions: number | null; weight: number | null; topics: SyllabusNode[] }>();
  // matérias do quadro + do conteúdo programático
  for (const s of edital.subjects) names.set(s.name, { questions: s.questions, weight: s.weight, topics: [] });
  for (const sy of edital.syllabus) {
    const key = [...names.keys()].find((n) => (aliasSlug(n) && aliasSlug(n) === sy.slug) || normalizeText(n) === normalizeText(sy.name) || jaccard(n, sy.name) >= 0.6);
    if (key) names.get(key)!.topics = sy.topics;
    else names.set(sy.name, { questions: null, weight: null, topics: sy.topics });
  }
  const mapping: SubjectMapping[] = [];
  const pending: { name: string; v: { questions: number | null; weight: number | null; topics: SyllabusNode[] } }[] = [];
  for (const [name, v] of names) {
    const slug = aliasSlug(name);
    let subj = slug ? active.find((s) => s.slug === slug && !used.has(s.id)) : undefined;
    if (!subj) subj = active.find((s) => !used.has(s.id) && (normalizeText(s.name) === normalizeText(name) || jaccard(s.name, name) >= 0.6 || jaccard(s.short_name, name) >= 0.6));
    if (subj) {
      used.add(subj.id);
      const renamed = !sameSubjectName(subj.name, name) && !sameSubjectName(subj.short_name, name);
      mapping.push({ editalName: name, questions: v.questions, weight: v.weight, subjectId: subj.id, status: renamed ? "renomeada" : "mantida", topics: v.topics });
    }
    else pending.push({ name, v });
  }
  // renomeações: matérias antigas não encontradas x novas com nome parecido
  for (const p of pending) {
    const cand = active.filter((s) => !used.has(s.id) && s.exam_questions > 0)
      .map((s) => ({ s, score: Math.max(jaccard(s.name, p.name), jaccard(s.short_name, p.name)) }))
      .sort((a, b) => b.score - a.score)[0];
    if (cand && cand.score >= 0.3) { used.add(cand.s.id); mapping.push({ editalName: p.name, questions: p.v.questions, weight: p.v.weight, subjectId: cand.s.id, status: "renomeada", topics: p.v.topics }); }
    else mapping.push({ editalName: p.name, questions: p.v.questions, weight: p.v.weight, subjectId: null, status: "adicionada", topics: p.v.topics });
  }
  const removed = active.filter((s) => !used.has(s.id) && s.exam_questions > 0);
  return { mapping, removed };
}

export function compareEdital(edital: EditalData, cur: CurrentState): Comparison {
  const changes: Change[] = [];
  const add = (c: Omit<Change, "id">) => changes.push({ ...c, id: `${c.category}:${c.label}:${changes.length}` });
  const st = cur.settings;
  const prev = cur.previous ?? null;

  // Banca
  if (edital.board) {
    const before = st.exam_board ? `${st.exam_board}${st.exam_board_confirmed ? "" : " (prevista)"}` : "—";
    const same = normalizeText(st.exam_board ?? "") === normalizeText(edital.board.value);
    add({ category: "banca", label: "Banca organizadora", before, after: `${edital.board.value} (confirmada)`, kind: same ? (st.exam_board_confirmed ? "mantido" : "confirmado") : "alterado", impact: same ? "baixo" : "alto", page: edital.board.page });
  }
  // Data da prova
  if (edital.examDate) {
    const before = st.exam_date ? `${fmtDate(st.exam_date)}${st.exam_date_confirmed ? "" : " (previsão)"}` : "A definir";
    const same = st.exam_date === edital.examDate.value;
    add({ category: "prova", label: "Data da prova", before, after: fmtDate(edital.examDate.value), kind: same ? (st.exam_date_confirmed ? "mantido" : "confirmado") : "alterado", impact: same ? "baixo" : "alto", page: edital.examDate.page });
  }
  if (edital.durationMinutes && edital.durationMinutes.value !== st.mock_duration_minutes) {
    const h = (m: number) => `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, "0") : ""}`;
    add({ category: "duracao", label: "Duração da prova", before: h(st.mock_duration_minutes), after: h(edital.durationMinutes.value), kind: "alterado", impact: "medio", page: edital.durationMinutes.page });
  }
  const beforeTotal = cur.subjects.filter((s) => s.active).reduce((s, x) => s + x.exam_questions, 0);
  const afterTotal = edital.totalQuestions?.value ?? edital.subjects.reduce((s, x) => s + (x.questions ?? 0), 0);
  if (afterTotal && afterTotal !== beforeTotal) add({ category: "total", label: "Total de questões", before: String(beforeTotal), after: String(afterTotal), kind: "alterado", impact: "alto", page: edital.totalQuestions?.page ?? null });
  if (edital.approval) {
    const before = prev?.approval?.value ?? "Não informado (meta pessoal: " + st.target_accuracy + "%)";
    if (!prev?.approval || normalizeText(prev.approval.value) !== normalizeText(edital.approval.value))
      add({ category: "aprovacao", label: "Critério de aprovação", before, after: edital.approval.value, kind: prev?.approval ? "alterado" : "informativo", impact: "medio", page: edital.approval.page });
  }
  if (edital.vacancies && edital.vacancies.value !== prev?.vacancies?.value)
    add({ category: "vagas", label: "Número de vagas", before: prev?.vacancies ? String(prev.vacancies.value) : "≈ 3.000 (anúncio, não oficial)", after: edital.vacancies.value.toLocaleString("pt-BR"), kind: prev?.vacancies ? "alterado" : "confirmado", impact: "baixo", page: edital.vacancies.page });
  if (edital.registration && JSON.stringify(edital.registration.value) !== JSON.stringify(prev?.registration?.value))
    add({ category: "inscricoes", label: "Período de inscrição", before: prev?.registration ? `${fmtDate(prev.registration.value.start)} a ${fmtDate(prev.registration.value.end)}` : "—", after: `${fmtDate(edital.registration.value.start)} a ${fmtDate(edital.registration.value.end)}`, kind: prev?.registration ? "alterado" : "informativo", impact: "baixo", page: edital.registration.page });

  // Matérias
  const { mapping, removed } = matchSubjects(edital, cur.subjects);
  const byId = new Map(cur.subjects.map((s) => [s.id, s]));
  for (const m of mapping) {
    const s = m.subjectId ? byId.get(m.subjectId) : undefined;
    if (m.status === "adicionada") add({ category: "materia", label: `Nova matéria: ${m.editalName}`, before: "—", after: m.questions !== null ? `${m.questions} questões` : "no conteúdo programático", kind: "adicionado", impact: "alto", page: edital.subjects.find((x) => x.name === m.editalName)?.page ?? null });
    if (m.status === "renomeada" && s) add({ category: "materia", label: `Matéria renomeada`, before: s.name, after: m.editalName, kind: "renomeado", impact: "baixo", page: null });
    if (s && m.questions !== null && m.questions !== s.exam_questions) {
      add({ category: "questoes", label: s.short_name, before: `${s.exam_questions} questões`, after: `${m.questions} questões`, kind: "alterado", impact: Math.abs(m.questions - s.exam_questions) >= 2 ? "alto" : "medio", page: edital.subjects.find((x) => x.name === m.editalName)?.page ?? null });
    }
    if (s && m.questions !== null && afterTotal) {
      const pb = pctOf(s.exam_questions, beforeTotal), pa = pctOf(m.questions, afterTotal);
      if (Math.abs(pa - pb) >= 0.5) add({ category: "peso", label: `Peso de ${s.short_name}`, before: pctLabel(pb), after: pctLabel(pa), kind: "alterado", impact: Math.abs(pa - pb) >= 2 ? "medio" : "baixo", page: null });
    }
    if (m.weight !== null && m.weight !== 1) add({ category: "peso", label: `Peso por questão — ${m.editalName}`, before: "1", after: String(m.weight), kind: "alterado", impact: "medio", page: null });
  }
  for (const s of removed) add({ category: "materia", label: `Matéria removida: ${s.name}`, before: `${s.exam_questions} questões`, after: "—", kind: "removido", impact: "alto", page: null });

  // Conteúdos
  const newTopics: Comparison["newTopics"] = [];
  const removedTopics: Comparison["removedTopics"] = [];
  for (const m of mapping) {
    const existing = m.subjectId ? cur.topics.filter((t) => t.subject_id === m.subjectId && t.in_current_edital) : [];
    const flatNew = flattenTopics(m.topics);
    for (const t of flatNew) if (!existing.some((e) => topicSimilarity(e.title, t.title) >= 0.5)) newTopics.push({ subjectName: m.editalName, title: t.title });
    for (const e of existing) if (flatNew.length && !flatNew.some((t) => topicSimilarity(e.title, t.title) >= 0.5)) removedTopics.push({ subjectId: e.subject_id, title: e.title, id: e.id });
  }
  if (newTopics.length) add({ category: "conteudo", label: "Conteúdos novos ou não cadastrados", before: "—", after: `${newTopics.length} itens`, kind: "adicionado", impact: newTopics.length > 10 ? "alto" : "medio", page: edital.syllabus[0]?.page ?? null });
  if (removedTopics.length) add({ category: "conteudo", label: "Conteúdos que não constam no edital", before: `${removedTopics.length} itens`, after: "fora do edital (preservados)", kind: "removido", impact: "medio", page: null });

  // Legislação
  const prevLaw = prev?.legislation ?? [];
  const legislationAdded = edital.legislation.filter((l) => !prevLaw.includes(l));
  const legislationRemoved = prev ? prevLaw.filter((l) => !edital.legislation.includes(l)) : [];
  if (legislationAdded.length) add({ category: "legislacao", label: "Legislação citada", before: prev ? `${prevLaw.length} normas` : "—", after: legislationAdded.join("; "), kind: prev ? "adicionado" : "informativo", impact: "medio", page: null });
  if (legislationRemoved.length) add({ category: "legislacao", label: "Legislação retirada", before: legislationRemoved.join("; "), after: "—", kind: "removido", impact: "medio", page: null });

  // Cronograma
  const prevSched = new Map((prev?.schedule ?? []).map((s) => [normalizeText(s.event), s.date]));
  for (const s of edital.schedule) {
    const old = prevSched.get(normalizeText(s.event));
    if (prev && old && old !== s.date) add({ category: "cronograma", label: s.event, before: fmtDate(old), after: fmtDate(s.date), kind: "alterado", impact: /prova/i.test(s.event) ? "alto" : "baixo", page: s.page });
    else if (!prev || !old) add({ category: "cronograma", label: s.event, before: "—", after: fmtDate(s.date), kind: "informativo", impact: "baixo", page: s.page });
  }

  return {
    changes, mapping, removedSubjectIds: removed.map((s) => s.id), newTopics, removedTopics,
    legislationAdded, legislationRemoved, totals: { before: beforeTotal, after: afterTotal },
  };
}

/** Compara duas versões do edital (ex.: original x retificado). */
export function diffEditalVersions(a: EditalData, b: EditalData): { field: string; before: string; after: string }[] {
  const out: { field: string; before: string; after: string }[] = [];
  const cmp = (field: string, x: unknown, y: unknown) => {
    const sx = x === null || x === undefined ? "—" : typeof x === "object" ? JSON.stringify(x) : String(x);
    const sy = y === null || y === undefined ? "—" : typeof y === "object" ? JSON.stringify(y) : String(y);
    if (sx !== sy) out.push({ field, before: sx, after: sy });
  };
  cmp("Banca", a.board?.value, b.board?.value);
  cmp("Data da prova", a.examDate?.value, b.examDate?.value);
  cmp("Duração (min)", a.durationMinutes?.value, b.durationMinutes?.value);
  cmp("Total de questões", a.totalQuestions?.value, b.totalQuestions?.value);
  cmp("Vagas", a.vacancies?.value, b.vacancies?.value);
  cmp("Inscrições", a.registration?.value, b.registration?.value);
  const qa = Object.fromEntries(a.subjects.map((s) => [s.name, s.questions]));
  for (const s of b.subjects) cmp(`Questões — ${s.name}`, qa[s.name], s.questions);
  for (const s of a.subjects) if (!b.subjects.some((x) => x.name === s.name)) cmp(`Questões — ${s.name}`, s.questions, null);
  const ta = Object.fromEntries(a.syllabus.map((s) => [s.name, flattenTopics(s.topics).map((t) => t.title).join("; ")]));
  for (const s of b.syllabus) cmp(`Conteúdo — ${s.name}`, ta[s.name], flattenTopics(s.topics).map((t) => t.title).join("; "));
  return out;
}
