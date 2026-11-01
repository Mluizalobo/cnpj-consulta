import type { TableName } from "../types";
import { PUBLIC_TABLES } from "../types";
import { NetworkError, type AnyRow, type Backend, type Deletion } from "./backend";

/**
 * Servidor em memória que imita o Supabase (updated_at do servidor, registro de exclusões).
 * Usado SOMENTE em testes automatizados e no modo E2E. Nunca em produção.
 */
export class MemoryBackend implements Backend {
  tables: Partial<Record<TableName, Map<string, AnyRow>>> = {};
  deletions: Deletion[] = [];
  online = true;
  failNext: string | null = null;
  calls = { upsert: 0, remove: 0, fetch: 0 };
  private clock = Date.now();
  constructor(private persistKey?: string) {
    if (persistKey && typeof localStorage !== "undefined") {
      try {
        const raw = localStorage.getItem(persistKey);
        if (raw) {
          const p = JSON.parse(raw);
          for (const [t, rows] of Object.entries(p.tables ?? {})) this.tables[t as TableName] = new Map((rows as AnyRow[]).map((r) => [r.id, r]));
          this.deletions = p.deletions ?? [];
        }
      } catch { /* ignora */ }
    }
  }
  private persist() {
    if (!this.persistKey || typeof localStorage === "undefined") return;
    const tables = Object.fromEntries(Object.entries(this.tables).map(([t, m]) => [t, [...m!.values()]]));
    localStorage.setItem(this.persistKey, JSON.stringify({ tables, deletions: this.deletions }));
  }
  private now() { this.clock = Math.max(this.clock + 1, Date.now()); return new Date(this.clock).toISOString(); }
  private t(table: TableName) { return (this.tables[table] ??= new Map()); }
  private guard() {
    if (!this.online) throw new NetworkError("Failed to fetch");
    if (this.failNext) { const m = this.failNext; this.failNext = null; throw new Error(m); }
  }
  async fetchChanges(table: TableName, since: string | null) {
    this.guard(); this.calls.fetch++;
    return [...this.t(table).values()].filter((r) => !since || (r.updated_at as string) > since).map((r) => ({ ...r }));
  }
  async fetchDeletions(since: string | null) {
    this.guard();
    return this.deletions.filter((d) => !since || d.deleted_at > since);
  }
  async upsert(table: TableName, rows: AnyRow[]) {
    this.guard(); this.calls.upsert++;
    if (PUBLIC_TABLES.includes(table)) throw new Error("permission denied for table " + table);
    for (const r of rows) this.t(table).set(r.id, { ...this.t(table).get(r.id), ...r, updated_at: this.now() });
    this.persist();
  }
  async remove(table: TableName, ids: string[]) {
    this.guard(); this.calls.remove++;
    for (const id of ids) if (this.t(table).delete(id)) this.deletions.push({ table_name: table, record_id: id, deleted_at: this.now() });
    this.persist();
  }
  /** Simula o servidor publicando dados (ex.: monitoramento do concurso). */
  serverInsert(table: TableName, rows: AnyRow[]) {
    for (const r of rows) this.t(table).set(r.id, { ...r, updated_at: this.now() });
    this.persist();
  }
}
