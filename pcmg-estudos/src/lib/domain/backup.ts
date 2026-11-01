import { z } from "zod";
import { PUBLIC_TABLES, TABLES, type TableName } from "../types";

export const BACKUP_APP = "pcmg-estudos";
export const BACKUP_VERSION = 1;

export const PERSONAL_TABLES = TABLES.filter((t) => !PUBLIC_TABLES.includes(t));

const rowSchema = z.object({ id: z.string().uuid("ID inválido"), updated_at: z.string().optional() }).loose();

export const backupSchema = z.object({
  app: z.literal(BACKUP_APP, { error: "Este arquivo não é um backup do Meu Concurso PCMG" }),
  version: z.number().int().min(1).max(BACKUP_VERSION, { error: "Backup criado por uma versão mais nova do app" }),
  exported_at: z.string(),
  data: z.record(z.string(), z.array(rowSchema)),
});
export type Backup = z.infer<typeof backupSchema>;

export function buildBackup(data: Partial<Record<TableName, Record<string, unknown>>>, now = new Date()): Backup {
  const out: Backup["data"] = {};
  for (const t of PERSONAL_TABLES) out[t] = Object.values(data[t] ?? {}) as Backup["data"][string];
  return { app: BACKUP_APP, version: BACKUP_VERSION, exported_at: now.toISOString(), data: out };
}

export type BackupValidation =
  | { ok: true; backup: Backup; summary: { table: TableName; count: number }[]; unknownTables: string[] }
  | { ok: false; errors: string[] };

export function validateBackup(raw: unknown): BackupValidation {
  const p = backupSchema.safeParse(raw);
  if (!p.success) {
    return { ok: false, errors: p.error.issues.slice(0, 10).map((i) => `${i.path.join(".") || "arquivo"}: ${i.message}`) };
  }
  const unknownTables = Object.keys(p.data.data).filter((t) => !PERSONAL_TABLES.includes(t as TableName));
  const summary = PERSONAL_TABLES.map((t) => ({ table: t, count: p.data.data[t]?.length ?? 0 }));
  return { ok: true, backup: p.data, summary, unknownTables };
}

export const TABLE_LABEL: Record<TableName, string> = {
  profiles: "Perfil", user_settings: "Configurações", subjects: "Matérias", study_plan: "Plano semanal",
  study_sessions: "Sessões de estudo", review_schedule: "Revisões", questions: "Questões",
  question_attempts: "Respostas", error_notebook: "Caderno de erros", mock_exams: "Simulados",
  mock_exam_questions: "Questões de simulados", syllabus_topics: "Edital verticalizado",
  plan_update_history: "Atualizações do plano", user_notifications: "Notificações", syllabus_import_jobs: "Análises de edital",
  video_lessons: "Videoaulas", video_search_cache: "Buscas de videoaulas",
  competition_sources: "Fontes", competition_documents: "Documentos", competition_updates: "Novidades",
  competition_versions: "Versões do edital", monitoring_logs: "Verificações",
};

/**
 * Mescla: registros do backup só substituem os atuais quando são mais recentes
 * (ou não existem). Nada é apagado.
 */
export function planMerge<T extends { id: string; updated_at?: string }>(current: Record<string, T>, incoming: T[]): T[] {
  return incoming.filter((r) => {
    const cur = current[r.id];
    if (!cur) return true;
    if (!r.updated_at || !cur.updated_at) return false;
    return new Date(r.updated_at).getTime() > new Date(cur.updated_at).getTime();
  });
}
