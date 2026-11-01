"use client";
import { createContext, useContext, useMemo } from "react";
import { useStore } from "zustand";
import type { SyncEngine } from "@/lib/data/sync-engine";
import type { Actions } from "@/lib/data/actions";
import type { AuthClient, AuthUser } from "@/lib/data/auth";
import type { TableName, TableRowMap, UserSettings, Subject } from "@/lib/types";

export interface AppCtx { engine: SyncEngine; actions: Actions; user: AuthUser; auth: AuthClient }
export const AppContext = createContext<AppCtx | null>(null);
export function useApp(): AppCtx {
  const c = useContext(AppContext);
  if (!c) throw new Error("AppContext ausente");
  return c;
}

/** Tabela inteira (referência estável enquanto não muda). */
export function useTable<T extends TableName>(t: T): Record<string, TableRowMap[T]> {
  const { engine } = useApp();
  return useStore(engine.store, (s) => s.data[t]) as Record<string, TableRowMap[T]>;
}
export function useRows<T extends TableName>(t: T): TableRowMap[T][] {
  const tbl = useTable(t);
  return useMemo(() => Object.values(tbl), [tbl]);
}
export function useSettings(): UserSettings | undefined {
  const { engine, user } = useApp();
  return useStore(engine.store, (s) => s.data.user_settings[user.id]);
}
export function useSubjects(): { all: Subject[]; active: Subject[]; byId: Map<string, Subject> } {
  const tbl = useTable("subjects");
  return useMemo(() => {
    const all = Object.values(tbl).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    return { all, active: all.filter((s) => s.active), byId: new Map(all.map((s) => [s.id, s])) };
  }, [tbl]);
}
export function useSync() {
  const { engine } = useApp();
  return useStore(engine.store, (s) => s.sync);
}
