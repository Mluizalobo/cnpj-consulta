"use client";
import { Cloud, CloudOff, RefreshCw, TriangleAlert } from "lucide-react";
import { useApp, useSync } from "./context";
import { cn } from "@/components/ui/cn";

/** Sincronizado · Sincronizando · Offline (com pendências) · Erro. Tocar força nova sincronização. */
export function SyncIndicator({ compact }: { compact?: boolean }) {
  const { engine } = useApp();
  const s = useSync();
  const map = {
    synced: { icon: Cloud, label: "Sincronizado", cls: "text-primary" },
    idle: { icon: Cloud, label: "Sincronizado", cls: "text-primary" },
    syncing: { icon: RefreshCw, label: "Sincronizando…", cls: "text-muted" },
    offline: { icon: CloudOff, label: s.pending ? `Offline · ${s.pending} pendente${s.pending > 1 ? "s" : ""}` : "Offline", cls: "text-warn" },
    error: { icon: TriangleAlert, label: "Erro ao sincronizar", cls: "text-alert" },
  }[s.status];
  const Icon = map.icon;
  return (
    <button type="button" onClick={() => void engine.sync()} title={s.error ?? (s.lastSyncedAt ? `Última sincronização: ${new Date(s.lastSyncedAt).toLocaleTimeString("pt-BR")}` : map.label)}
      className={cn("inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-medium hover:bg-surface-2", map.cls)} data-testid="sync-indicator" data-status={s.status} aria-label={map.label}>
      <Icon size={15} className={cn(s.status === "syncing" && "animate-spin")} />
      {!compact && <span className="hidden sm:inline">{map.label}</span>}
    </button>
  );
}
