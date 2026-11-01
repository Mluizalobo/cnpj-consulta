import type { PlanUpdateHistory, StudyPlanSlot, Subject, SyllabusTopic, UserSettings } from "../types";
import type { Actions } from "../data/actions";
import { stableId } from "../domain/ids";
import { normalizeText } from "../domain/text";
import { getPhase } from "../domain/phases";
import { WEEKDAY_SHORT } from "../domain/dates";
import type { EditalData, SyllabusNode } from "./parse-edital";
import { compareEdital, type Comparison } from "./compare";
import { computePriorities, forecast, generateWeeklyPlan, strategyText, type Forecast, type GeneratedPlan, type SubjectPriority } from "./adaptive";
import { alignQuestions, type AlignmentResult } from "./alignment";
import { topicSimilarity } from "./match";

const PALETTE = ["#4F6F8F", "#8F5B7A", "#6E7F3A", "#3A7F78", "#A0583C", "#5B5B8F", "#7A6A3A"];

export interface UpdateMeta { versionId: string | null; documentId: string | null; title: string; sourceUrl: string | null; publishedAt: string | null; confirmed: boolean }

export interface UpdatePreview {
  meta: UpdateMeta;
  edital: EditalData;
  comparison: Comparison;
  subjectsAfter: Subject[];
  topicsAfter: SyllabusTopic[];
  topicsOutOfEdital: string[];
  priorities: SubjectPriority[];
  plan: GeneratedPlan;
  forecast: Forecast;
  strategy: string;
  settingsChanges: Partial<UserSettings>;
  alignment: AlignmentResult;
  reviewsAffected: number;
  planDiff: { weekday: number; label: string; before: string[]; after: string[] }[];
  summary: { added: number; removed: number; renamed: number; questionsChanged: number; newTopics: number; preserved: string[] };
}

function buildTopics(uid: string, subjectId: string, nodes: SyllabusNode[], versionId: string | null, existing: SyllabusTopic[], now: string, parent: SyllabusTopic | null = null, path = ""): SyllabusTopic[] {
  const out: SyllabusTopic[] = [];
  nodes.forEach((n, i) => {
    const p = path + "/" + normalizeText(n.title);
    const id = stableId("edtopic", uid, subjectId, p);
    const prev = existing.find((e) => e.id === id) ?? existing.filter((e) => e.subject_id === subjectId).map((e) => ({ e, s: topicSimilarity(e.title, n.title) })).sort((a, b) => b.s - a.s).find((x) => x.s >= 0.6)?.e;
    const t: SyllabusTopic = {
      id, user_id: uid, created_at: prev?.created_at ?? now, updated_at: now, subject_id: subjectId, parent_id: parent?.id ?? null,
      level: parent ? parent.level + 1 : 1, code: n.code, title: n.title, sort_order: i, origin: "edital", version_id: versionId, in_current_edital: true,
      status: prev?.status ?? "nao_estudado", priority: prev?.priority ?? false, notes: prev?.notes ?? null, manual_seconds: prev?.manual_seconds ?? 0,
      manual_questions: prev?.manual_questions ?? 0, manual_correct: prev?.manual_correct ?? 0, last_studied_at: prev?.last_studied_at ?? null,
    };
    out.push(t, ...buildTopics(uid, subjectId, n.children, versionId, existing, now, t, p));
  });
  return out;
}

export function buildUpdatePreview(a: Actions, edital: EditalData, meta: UpdateMeta, previous: EditalData | null = null): UpdatePreview {
  const e = a.engine;
  const uid = a.uid();
  const now = a.nowIso();
  const today = a.today();
  const settings = a.settings();
  const subjects = e.rows("subjects");
  const topics = e.rows("syllabus_topics");
  const comparison = compareEdital(edital, { subjects, settings, topics, previous });

  // Matérias depois da atualização
  const byId = new Map(subjects.map((s) => [s.id, s]));
  const subjectsAfter: Subject[] = subjects.map((s) => ({ ...s }));
  let colorIdx = 0;
  for (const m of comparison.mapping) {
    if (m.subjectId) {
      const s = subjectsAfter.find((x) => x.id === m.subjectId)!;
      if (m.questions !== null) s.exam_questions = m.questions;
      if (m.status === "renomeada") { s.name = m.editalName; if (!s.slug) s.short_name = m.editalName.slice(0, 40); }
      s.active = true;
    } else {
      const id = stableId("edsubject", uid, normalizeText(m.editalName));
      if (!byId.has(id)) subjectsAfter.push({
        id, user_id: uid, created_at: now, updated_at: now, slug: null, name: m.editalName, short_name: m.editalName.replace(/^No[çc][õo]es de /i, "").slice(0, 40),
        color: PALETTE[colorIdx++ % PALETTE.length], exam_questions: m.questions ?? 0, sort_order: subjectsAfter.length, active: true,
      });
      m.subjectId = id;
    }
  }
  for (const id of comparison.removedSubjectIds) { const s = subjectsAfter.find((x) => x.id === id)!; s.active = false; }

  // Conteúdos (edital verticalizado)
  const newTopicRows = comparison.mapping.flatMap((m) => (m.topics.length ? buildTopics(uid, m.subjectId!, m.topics, meta.versionId, topics, now) : []));
  const newIds = new Set(newTopicRows.map((t) => t.id));
  const subjectsWithSyllabus = new Set(comparison.mapping.filter((m) => m.topics.length).map((m) => m.subjectId));
  const topicsOut = topics.filter((t) => !newIds.has(t.id) && t.in_current_edital && (subjectsWithSyllabus.has(t.subject_id) || comparison.removedSubjectIds.includes(t.subject_id)));
  const topicsAfter = [...topics.filter((t) => !newIds.has(t.id)).map((t) => (topicsOut.includes(t) ? { ...t, in_current_edital: false } : t)), ...newTopicRows];

  const settingsChanges: Partial<UserSettings> = { edital_published: true };
  if (meta.publishedAt) settingsChanges.edital_date = meta.publishedAt;
  if (edital.board) { settingsChanges.exam_board = edital.board.value; settingsChanges.exam_board_confirmed = meta.confirmed; }
  if (edital.examDate) { settingsChanges.exam_date = edital.examDate.value; settingsChanges.exam_date_confirmed = meta.confirmed; }
  if (edital.durationMinutes) settingsChanges.mock_duration_minutes = edital.durationMinutes.value;
  const totalAfter = subjectsAfter.filter((s) => s.active).reduce((s, x) => s + x.exam_questions, 0);
  if (totalAfter) settingsChanges.exam_total_questions = totalAfter;
  if (meta.versionId) settingsChanges.applied_version_id = meta.versionId;
  const settingsAfter = { ...settings, ...settingsChanges } as UserSettings;

  const priorities = computePriorities({
    subjects: subjectsAfter, attempts: e.rows("question_attempts"), topics: topicsAfter, reviews: e.rows("review_schedule"),
    notes: e.rows("error_notebook"), settings: settingsAfter, today,
  });
  const plan = generateWeeklyPlan(priorities, settings.session_minutes);
  settingsChanges.rotation = { phase1: settings.rotation.phase1, phase2: plan.rotation };
  const fc = forecast({ today, settings: settingsAfter, plan: plan.slots, topics: topicsAfter });
  const strategy = strategyText(fc, getPhase(today, settingsAfter));

  const alignment = alignQuestions(e.rows("questions"), subjectsAfter, topicsAfter, edital.legislation);
  const removedSet = new Set(comparison.removedSubjectIds);
  const reviewsAffected = e.rows("review_schedule").filter((r) => r.status === "pendente" && ((r.subject_id && removedSet.has(r.subject_id)) || (settingsAfter.exam_date && r.due_date > settingsAfter.exam_date))).length;

  const nameOf = (id: string | null, list: Subject[]) => list.find((s) => s.id === id)?.short_name ?? "—";
  const label = (s: Pick<StudyPlanSlot, "slot_type" | "subject_id">, list: Subject[]) =>
    s.slot_type === "subject" ? nameOf(s.subject_id, list) : s.slot_type === "rotation" ? "Rotativa" : s.slot_type === "weekly_review" ? "Revisão" : "Questões";
  const currentPlan = e.rows("study_plan");
  const planDiff = [1, 2, 3, 4, 5, 6].map((wd) => ({
    weekday: wd, label: WEEKDAY_SHORT[wd],
    before: currentPlan.filter((p) => p.weekday === wd).sort((x, y) => x.position - y.position).map((p) => label(p, subjects)),
    after: plan.slots.filter((p) => p.weekday === wd).sort((x, y) => x.position - y.position).map((p) => label(p, subjectsAfter)),
  }));

  return {
    meta, edital, comparison, subjectsAfter, topicsAfter, topicsOutOfEdital: topicsOut.map((t) => t.id), priorities, plan, forecast: fc, strategy,
    settingsChanges, alignment, reviewsAffected, planDiff,
    summary: {
      added: comparison.mapping.filter((m) => m.status === "adicionada").length,
      removed: comparison.removedSubjectIds.length,
      renamed: comparison.mapping.filter((m) => m.status === "renomeada").length,
      questionsChanged: comparison.changes.filter((c) => c.category === "questoes").length,
      newTopics: comparison.newTopics.length,
      preserved: [
        "Todo o histórico de sessões, horas e sequência de dias",
        "Todas as respostas, simulados e o caderno de erros",
        "Revisões já programadas (nenhuma é apagada)",
        "Questões do banco (apenas recebem etiquetas de alinhamento)",
        "Status de estudo dos conteúdos equivalentes",
      ],
    },
  };
}

/** Aplica tudo de uma vez. Guarda um retrato do estado anterior no histórico. */
export function applyUpdatePreview(a: Actions, p: UpdatePreview): PlanUpdateHistory {
  const e = a.engine;
  const uid = a.uid();
  const now = a.nowIso();
  const before = {
    settings: a.settings(), subjects: e.rows("subjects"), plan: e.rows("study_plan"),
    topicsInEdital: e.rows("syllabus_topics").filter((t) => t.in_current_edital).map((t) => t.id),
  };
  const history: PlanUpdateHistory = {
    id: stableId("planupdate", uid, p.meta.versionId ?? p.meta.documentId ?? p.meta.title, now), user_id: uid, created_at: now, updated_at: now,
    version_id: p.meta.versionId, document_id: p.meta.documentId, title: p.meta.title,
    summary: `${p.summary.added} matérias adicionadas, ${p.summary.removed} desativadas, ${p.summary.questionsChanged} com nova quantidade de questões, ${p.summary.newTopics} conteúdos novos.`,
    changes: p.comparison.changes, snapshot_before: before, applied_at: now,
  };
  e.upsert("plan_update_history", history);
  // 1) matérias (novas e alteradas). Matérias removidas ficam inativas, com histórico preservado.
  e.upsert("subjects", p.subjectsAfter);
  // 2) edital verticalizado
  e.upsert("syllabus_topics", p.topicsAfter.filter((t) => {
    const cur = e.row("syllabus_topics", t.id);
    return !cur || cur.in_current_edital !== t.in_current_edital || cur.version_id !== t.version_id || cur.title !== t.title;
  }));
  // 3) configurações (banca, data, duração, rotação, versão aplicada)
  a.updateSettings(p.settingsChanges);
  // 4) cronograma semanal
  a.replacePlan(p.plan.slots);
  // 5) alinhamento do banco de questões (somente etiquetas)
  for (const u of p.alignment.updates) a.setQuestionTags(u.id, u.tags);
  // 6) revisões: reorganiza as atrasadas, sem apagar nenhuma
  a.redistributeOverdue();
  a.notify({ kind: "plano", title: "Seu planejamento foi atualizado", body: history.summary, link: "/concurso" }, stableId("notif-plan", history.id));
  return history;
}

/** Desfaz uma atualização restaurando matérias, plano e configurações do retrato salvo. */
export function revertUpdate(a: Actions, historyId: string) {
  const h = a.engine.row("plan_update_history", historyId);
  if (!h) throw new Error("Atualização não encontrada");
  const snap = h.snapshot_before as { settings: UserSettings; subjects: Subject[]; plan: StudyPlanSlot[]; topicsInEdital: string[] };
  a.engine.upsert("subjects", snap.subjects);
  const keep = new Set(snap.topicsInEdital);
  a.engine.upsert("syllabus_topics", a.engine.rows("syllabus_topics").filter((t) => t.in_current_edital !== keep.has(t.id)).map((t) => ({ ...t, in_current_edital: keep.has(t.id) })));
  a.engine.upsert("user_settings", snap.settings);
  a.engine.remove("study_plan", a.engine.rows("study_plan").map((p) => p.id));
  a.engine.upsert("study_plan", snap.plan);
  a.notify({ kind: "plano", title: "Atualização desfeita", body: `O plano voltou ao estado anterior a "${h.title}".`, link: "/concurso" });
}
