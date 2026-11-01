import type { CompetitionDocument, CompetitionSource, CompetitionUpdate, CompetitionVersion, MonitoringLog } from "../types";

/** Onde o monitor grava seus resultados. Produção: Supabase (chave secreta, só no servidor). */
export interface MonitorStore {
  listSources(): Promise<(CompetitionSource & { last_hash?: string | null })[]>;
  updateSource(id: string, p: { last_checked_at: string; last_status: string; last_hash?: string | null }): Promise<void>;
  findDocumentByHash(hash: string): Promise<CompetitionDocument | null>;
  insertDocument(doc: Omit<CompetitionDocument, "created_at" | "updated_at">, pages: string[]): Promise<void>;
  insertUpdate(u: Omit<CompetitionUpdate, "created_at" | "updated_at"> & { dedupe_key: string }): Promise<boolean>;
  latestVersion(): Promise<CompetitionVersion | null>;
  insertVersion(v: Omit<CompetitionVersion, "created_at" | "updated_at">): Promise<void>;
  insertLog(l: Omit<MonitoringLog, "created_at" | "updated_at">): Promise<void>;
  updateLog(id: string, p: Partial<MonitoringLog>): Promise<void>;
  lastRunStartedAt(trigger?: MonitoringLog["trigger"]): Promise<string | null>;
}

export class MemoryMonitorStore implements MonitorStore {
  sources: (CompetitionSource & { last_hash?: string | null })[] = [];
  documents: CompetitionDocument[] = [];
  texts = new Map<string, string[]>();
  updates: (CompetitionUpdate & { dedupe_key: string })[] = [];
  versions: CompetitionVersion[] = [];
  logs: MonitoringLog[] = [];
  private ts = () => new Date().toISOString();
  async listSources() { return this.sources.filter((s) => s.active); }
  async updateSource(id: string, p: { last_checked_at: string; last_status: string; last_hash?: string | null }) {
    const s = this.sources.find((x) => x.id === id); if (s) Object.assign(s, p);
  }
  async findDocumentByHash(hash: string) { return this.documents.find((d) => d.content_hash === hash) ?? null; }
  async insertDocument(doc: Omit<CompetitionDocument, "created_at" | "updated_at">, pages: string[]) {
    if (this.documents.some((d) => d.content_hash === doc.content_hash)) throw new Error("duplicate key value violates unique constraint");
    this.documents.push({ ...doc, created_at: this.ts(), updated_at: this.ts() }); this.texts.set(doc.id, pages);
  }
  async insertUpdate(u: Omit<CompetitionUpdate, "created_at" | "updated_at"> & { dedupe_key: string }) {
    if (this.updates.some((x) => x.dedupe_key === u.dedupe_key)) return false;
    this.updates.push({ ...u, created_at: this.ts(), updated_at: this.ts() }); return true;
  }
  async latestVersion() { return [...this.versions].sort((a, b) => b.version_number - a.version_number)[0] ?? null; }
  async insertVersion(v: Omit<CompetitionVersion, "created_at" | "updated_at">) { this.versions.push({ ...v, created_at: this.ts(), updated_at: this.ts() }); }
  async insertLog(l: Omit<MonitoringLog, "created_at" | "updated_at">) { this.logs.push({ ...l, created_at: this.ts(), updated_at: this.ts() }); }
  async updateLog(id: string, p: Partial<MonitoringLog>) { const l = this.logs.find((x) => x.id === id); if (l) Object.assign(l, p); }
  async lastRunStartedAt(trigger?: MonitoringLog["trigger"]) {
    return [...this.logs].filter((l) => !trigger || l.trigger === trigger).sort((a, b) => b.started_at.localeCompare(a.started_at))[0]?.started_at ?? null;
  }
}
