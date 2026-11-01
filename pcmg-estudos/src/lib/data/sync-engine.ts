import { createStore, type StoreApi } from "zustand/vanilla";
import { PUBLIC_TABLES, TABLES, type DataTables, type TableName, type TableRowMap } from "../types";
import { isNetworkError, type AnyRow, type Backend } from "./backend";
import type { Persistence } from "./persistence";

export type SyncStatus = "idle" | "syncing" | "synced" | "offline" | "error";
export interface SyncInfo { status: SyncStatus; pending: number; lastSyncedAt: string | null; error: string | null }
export interface DataState {
  userId: string | null;
  ready: boolean; // dados disponíveis (cache local ou servidor)
  serverLoaded: boolean; // já sincronizou com o servidor ao menos uma vez nesta sessão
  data: DataTables;
  sync: SyncInfo;
}

interface Op { seq: number; table: TableName; type: "upsert" | "remove"; id: string; row?: AnyRow; attempts: number }
interface Cache { data: DataTables; cursors: Partial<Record<TableName, string>>; delCursor: string | null; savedAt: string }

const emptyData = (): DataTables => Object.fromEntries(TABLES.map((t) => [t, {}])) as unknown as DataTables;
const OVERLAP_MS = 30_000;
const minus = (iso: string, ms: number) => new Date(new Date(iso).getTime() - ms).toISOString();
const maxIso = (a: string | null | undefined, b: string | null | undefined) => (!a ? b ?? null : !b ? a : a > b ? a : b);

/**
 * Motor de sincronização "local primeiro":
 * 1) cada alteração é aplicada na tela na hora e gravada numa fila persistente (IndexedDB);
 * 2) a fila é enviada ao Supabase assim que possível (se cair a internet, aguarda e tenta de novo);
 * 3) periodicamente busca no servidor o que mudou em outros aparelhos (incremental, por updated_at).
 * O servidor é a fonte oficial; o cache local serve para abrir rápido e funcionar offline.
 */
export class SyncEngine {
  readonly store: StoreApi<DataState>;
  private outbox: Op[] = [];
  private seq = 0;
  private cursors: Partial<Record<TableName, string>> = {};
  private delCursor: string | null = null;
  private flushing: Promise<void> | null = null;
  private pulling: Promise<void> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private backoff = 2000;
  private stopped = false;

  constructor(private backend: Backend, private persistence: Persistence, private opts: { debounceMs?: number; autoRetry?: boolean } = {}) {
    this.store = createStore<DataState>(() => ({
      userId: null, ready: false, serverLoaded: false, data: emptyData(),
      sync: { status: "idle", pending: 0, lastSyncedAt: null, error: null },
    }));
  }

  private key(k: string) { return `pcmg:${this.store.getState().userId}:${k}`; }
  get state() { return this.store.getState(); }
  rows<T extends TableName>(t: T): TableRowMap[T][] { return Object.values(this.state.data[t]) as TableRowMap[T][]; }
  row<T extends TableName>(t: T, id: string): TableRowMap[T] | undefined { return this.state.data[t][id] as TableRowMap[T] | undefined; }

  async start(userId: string): Promise<void> {
    this.stopped = false;
    this.store.setState({ userId, ready: false, serverLoaded: false, data: emptyData() });
    const [cache, outbox] = await Promise.all([this.persistence.load<Cache>(this.key("cache")), this.persistence.load<Op[]>(this.key("outbox"))]);
    this.outbox = outbox ?? [];
    this.seq = this.outbox.reduce((m, o) => Math.max(m, o.seq), 0);
    if (cache?.data) {
      this.cursors = cache.cursors ?? {};
      this.delCursor = cache.delCursor ?? null;
      const data = { ...emptyData(), ...cache.data };
      // reaplica alterações pendentes sobre o cache
      for (const op of this.outbox) this.applyLocal(data, op);
      this.store.setState({ data, ready: true });
    }
    this.setSync({ pending: this.outbox.length });
    await this.sync();
  }

  stop() {
    this.stopped = true;
    for (const t of [this.retryTimer, this.saveTimer, this.flushTimer]) if (t) clearTimeout(t);
  }

  /** Puxa novidades do servidor e envia a fila. */
  async sync(): Promise<void> {
    await this.pull();
    await this.flush();
  }

  private setSync(p: Partial<SyncInfo>) {
    const cur = this.state.sync;
    const next = { ...cur, ...p, pending: p.pending ?? this.outbox.length };
    this.store.setState({ sync: next });
  }

  private applyLocal(data: DataTables, op: Op) {
    const t = { ...(data[op.table] as unknown as Record<string, AnyRow>) };
    if (op.type === "upsert" && op.row) t[op.id] = { ...t[op.id], ...op.row };
    else delete t[op.id];
    (data as unknown as Record<string, unknown>)[op.table] = t;
  }

  // ---------------- Escrita ----------------
  upsert<T extends TableName>(table: T, input: TableRowMap[T] | TableRowMap[T][]): void {
    if (PUBLIC_TABLES.includes(table)) throw new Error(`Tabela somente leitura: ${table}`);
    const rows = (Array.isArray(input) ? input : [input]) as unknown as AnyRow[];
    if (rows.length === 0) return;
    const now = new Date().toISOString();
    const uid = this.state.userId;
    const data = { ...this.state.data };
    for (const r of rows) {
      const row = { ...r, user_id: (r.user_id as string) ?? uid, updated_at: now, created_at: (r.created_at as string) ?? now };
      const op: Op = { seq: ++this.seq, table, type: "upsert", id: row.id, row, attempts: 0 };
      this.outbox.push(op);
      this.applyLocal(data, op);
    }
    this.commitLocal(data);
  }

  /** Atualiza campos de um registro existente. */
  patch<T extends TableName>(table: T, id: string, changes: Partial<TableRowMap[T]>): void {
    const cur = this.row(table, id);
    if (!cur) return;
    this.upsert(table, { ...cur, ...changes } as TableRowMap[T]);
  }

  remove(table: TableName, ids: string | string[]): void {
    const list = Array.isArray(ids) ? ids : [ids];
    if (list.length === 0) return;
    const data = { ...this.state.data };
    for (const id of list) {
      const op: Op = { seq: ++this.seq, table, type: "remove", id, attempts: 0 };
      this.outbox.push(op);
      this.applyLocal(data, op);
    }
    this.commitLocal(data);
  }

  private commitLocal(data: DataTables) {
    this.store.setState({ data });
    this.setSync({ pending: this.outbox.length });
    void this.persistence.save(this.key("outbox"), this.outbox);
    this.scheduleSave();
    if (this.flushTimer) clearTimeout(this.flushTimer);
    const ms = this.opts.debounceMs ?? 250;
    if (ms <= 0) void this.flush();
    else this.flushTimer = setTimeout(() => void this.flush(), ms);
  }

  private scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.saveCache(), 400);
  }

  async saveCache() {
    if (!this.state.userId) return;
    const cache: Cache = { data: this.state.data, cursors: this.cursors, delCursor: this.delCursor, savedAt: new Date().toISOString() };
    await this.persistence.save(this.key("cache"), cache);
  }

  // ---------------- Envio da fila ----------------
  flush(): Promise<void> {
    if (this.flushing) return this.flushing.then(() => (this.outbox.length ? this.flush() : undefined));
    this.flushing = this.doFlush().finally(() => { this.flushing = null; });
    return this.flushing;
  }

  private async doFlush() {
    if (this.outbox.length === 0) { if (this.state.serverLoaded) this.setSync({ status: "synced", error: null }); return; }
    this.setSync({ status: "syncing" });
    try {
      while (this.outbox.length > 0 && !this.stopped) {
        const first = this.outbox[0];
        let n = 1;
        while (n < this.outbox.length && n < 500 && this.outbox[n].table === first.table && this.outbox[n].type === first.type) n++;
        const batch = this.outbox.slice(0, n);
        if (first.type === "upsert") {
          const byId = new Map<string, AnyRow>();
          for (const op of batch) byId.set(op.id, { ...byId.get(op.id), ...op.row! });
          await this.backend.upsert(first.table, [...byId.values()]);
        } else {
          await this.backend.remove(first.table, [...new Set(batch.map((o) => o.id))]);
        }
        this.outbox.splice(0, n);
        await this.persistence.save(this.key("outbox"), this.outbox);
        this.setSync({ pending: this.outbox.length });
      }
      this.backoff = 2000;
      this.setSync({ status: "synced", error: null, lastSyncedAt: new Date().toISOString() });
    } catch (e) {
      const net = isNetworkError(e) || (typeof navigator !== "undefined" && navigator.onLine === false);
      if (!net && this.outbox[0]) this.outbox[0].attempts++;
      this.setSync({ status: net ? "offline" : "error", error: net ? null : (e as Error).message });
      this.scheduleRetry();
    }
  }

  private scheduleRetry() {
    if (this.opts.autoRetry === false || this.stopped) return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => void this.sync(), this.backoff);
    this.backoff = Math.min(this.backoff * 2, 60_000);
  }

  // ---------------- Recebimento ----------------
  pull(): Promise<void> {
    if (this.pulling) return this.pulling;
    this.pulling = this.doPull().finally(() => { this.pulling = null; });
    return this.pulling;
  }

  private async doPull() {
    if (!this.state.userId) return;
    if (this.outbox.length === 0) this.setSync({ status: "syncing" });
    try {
      const results = await Promise.all(
        TABLES.map(async (t) => [t, await this.backend.fetchChanges(t, this.cursors[t] ? minus(this.cursors[t]!, OVERLAP_MS) : null)] as const),
      );
      const deletions = await this.backend.fetchDeletions(this.delCursor ? minus(this.delCursor, OVERLAP_MS) : null);
      const pendingIds = new Set(this.outbox.map((o) => `${o.table}:${o.id}`));
      const data = { ...this.state.data };
      let changed = false;
      for (const [t, rows] of results) {
        if (rows.length === 0) continue;
        const tbl = { ...(data[t] as unknown as Record<string, AnyRow>) };
        for (const r of rows) {
          this.cursors[t] = maxIso(this.cursors[t], r.updated_at as string) ?? undefined;
          if (pendingIds.has(`${t}:${r.id}`)) continue; // alteração local ainda não enviada tem prioridade
          tbl[r.id] = r;
          changed = true;
        }
        (data as unknown as Record<string, unknown>)[t] = tbl;
      }
      for (const d of deletions) {
        this.delCursor = maxIso(this.delCursor, d.deleted_at);
        const t = d.table_name as TableName;
        if (!TABLES.includes(t) || pendingIds.has(`${t}:${d.record_id}`)) continue;
        if (data[t][d.record_id]) {
          const tbl = { ...(data[t] as unknown as Record<string, AnyRow>) };
          delete tbl[d.record_id];
          (data as unknown as Record<string, unknown>)[t] = tbl;
          changed = true;
        }
      }
      this.store.setState({ data: changed ? data : this.state.data, ready: true, serverLoaded: true });
      if (this.outbox.length === 0) this.setSync({ status: "synced", error: null, lastSyncedAt: new Date().toISOString() });
      if (changed) this.scheduleSave(); else void this.saveCache();
    } catch (e) {
      const net = isNetworkError(e) || (typeof navigator !== "undefined" && navigator.onLine === false);
      this.setSync({ status: net ? "offline" : "error", error: net ? null : (e as Error).message });
      if (!this.state.ready && this.state.data) this.store.setState({ ready: false });
      this.scheduleRetry();
    }
  }

  /** Esquece dados locais deste usuário (ao sair da conta). Não afeta o servidor. */
  async clearLocal() {
    if (!this.state.userId) return;
    if (this.outbox.length > 0) throw new Error("Há alterações ainda não sincronizadas");
    await this.persistence.remove(this.key("cache"));
    await this.persistence.remove(this.key("outbox"));
  }

  pendingCount() { return this.outbox.length; }
}
