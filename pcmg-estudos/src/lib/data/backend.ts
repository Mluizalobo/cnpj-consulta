import type { TableName } from "../types";

export type AnyRow = { id: string; updated_at?: string; [k: string]: unknown };
export interface Deletion { table_name: string; record_id: string; deleted_at: string }

/** Contrato do servidor de dados. Implementações: Supabase (produção) e memória (testes/E2E). */
export interface Backend {
  fetchChanges(table: TableName, since: string | null): Promise<AnyRow[]>;
  fetchDeletions(since: string | null): Promise<Deletion[]>;
  upsert(table: TableName, rows: AnyRow[]): Promise<void>;
  remove(table: TableName, ids: string[]): Promise<void>;
}

/** Erro de rede (sem internet): a operação fica na fila para depois. */
export class NetworkError extends Error {
  constructor(msg = "Sem conexão") { super(msg); this.name = "NetworkError"; }
}

export const isNetworkError = (e: unknown): boolean => {
  if (e instanceof NetworkError) return true;
  const m = String((e as Error)?.message ?? e);
  return /Failed to fetch|NetworkError|network|fetch failed|Load failed|ECONNREFUSED|ENOTFOUND|timeout/i.test(m);
};
