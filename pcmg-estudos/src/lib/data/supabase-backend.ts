import type { SupabaseClient } from "@supabase/supabase-js";
import type { TableName } from "../types";
import { NetworkError, type AnyRow, type Backend, type Deletion } from "./backend";

const PAGE = 1000;
/** Colunas pesadas que não precisam ir para o app. */
const SELECT: Partial<Record<TableName, string>> = {};

function check(error: { message: string; code?: string } | null) {
  if (!error) return;
  if (!error.code && /fetch|network/i.test(error.message)) throw new NetworkError(error.message);
  throw new Error(`${error.message}${error.code ? ` (${error.code})` : ""}`);
}

export class SupabaseBackend implements Backend {
  constructor(private sb: SupabaseClient) {}

  async fetchChanges(table: TableName, since: string | null): Promise<AnyRow[]> {
    const out: AnyRow[] = [];
    for (let from = 0; ; from += PAGE) {
      let q = this.sb.from(table).select(SELECT[table] ?? "*").order("updated_at", { ascending: true }).order("id").range(from, from + PAGE - 1);
      if (since) q = q.gt("updated_at", since);
      const { data, error } = await q;
      check(error);
      const rows = (data ?? []) as unknown as AnyRow[];
      out.push(...rows);
      if (rows.length < PAGE) break;
    }
    return out;
  }

  async fetchDeletions(since: string | null): Promise<Deletion[]> {
    let q = this.sb.from("deleted_records").select("table_name, record_id, deleted_at").order("deleted_at").limit(5000);
    if (since) q = q.gt("deleted_at", since);
    const { data, error } = await q;
    check(error);
    return (data ?? []) as Deletion[];
  }

  async upsert(table: TableName, rows: AnyRow[]): Promise<void> {
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await this.sb.from(table).upsert(rows.slice(i, i + 500), { onConflict: "id" });
      check(error);
    }
  }

  async remove(table: TableName, ids: string[]): Promise<void> {
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await this.sb.from(table).delete().in("id", ids.slice(i, i + 200));
      check(error);
    }
  }
}
