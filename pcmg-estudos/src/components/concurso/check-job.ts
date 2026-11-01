"use client";
import { create } from "zustand";
import type { SyncEngine } from "@/lib/data/sync-engine";
import type { AuthClient } from "@/lib/data/auth";
import type { CompetitionVersion, UserSettings } from "@/lib/types";

export const CHECK_STEPS = [
  "Consultando fontes oficiais…",
  "Verificando novos documentos…",
  "Analisando conteúdo programático…",
  "Comparando com seu planejamento…",
  "Calculando nova distribuição de estudos…",
  "Sua atualização está pronta!",
];

export type CheckOutcome = { kind: "pronto"; versionId: string } | { kind: "sem_novidades"; message: string } | { kind: "erro"; message: string };

interface JobState {
  running: boolean;
  step: number;
  notes: string[];
  outcome: CheckOutcome | null;
  run(engine: SyncEngine, auth: AuthClient, settings: UserSettings): Promise<void>;
  reset(): void;
}

/** Versão oficial confirmada mais recente que ainda não foi aplicada ao plano. */
export function pendingVersion(versions: CompetitionVersion[], settings: UserSettings): CompetitionVersion | null {
  const confirmed = versions.filter((v) => v.reliability === "confirmado").sort((a, b) => b.version_number - a.version_number);
  const latest = confirmed[0];
  if (!latest || latest.id === settings.applied_version_id) return null;
  return latest;
}

/** Processo assíncrono: a tela continua usável e o progresso sobrevive à troca de página. */
export const useCheckJob = create<JobState>((set, get) => ({
  running: false, step: 0, notes: [], outcome: null,
  reset: () => set({ running: false, step: 0, notes: [], outcome: null }),
  async run(engine, auth, settings) {
    if (get().running) return;
    set({ running: true, step: 0, notes: [], outcome: null });
    const note = (n: string) => set({ notes: [...get().notes, n] });
    try {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        note("Sem conexão: usando as informações já baixadas. A verificação nas fontes será feita quando a internet voltar.");
      } else {
        const token = await auth.accessToken();
        const res = await fetch("/api/concurso/verificar", { method: "POST", headers: { Authorization: `Bearer ${token ?? ""}` } }).catch(() => null);
        if (!res) note("Não foi possível falar com o servidor agora. Usando as últimas informações sincronizadas.");
        else {
          const body = await res.json().catch(() => ({}));
          if (res.ok) note(body.message ?? "Fontes consultadas.");
          else if (body.code === "not_configured") note("O monitoramento automático ainda não foi ativado no servidor (veja o README). Usando as informações disponíveis.");
          else note(body.error ?? `Falha na verificação (${res.status}).`);
        }
      }
      set({ step: 1 });
      await engine.pull();
      set({ step: 2 });
      const v = pendingVersion(engine.rows("competition_versions"), engine.row("user_settings", settings.id) ?? settings);
      await new Promise((r) => setTimeout(r, 250));
      set({ step: 3 });
      if (!v) {
        set({ step: 5, running: false, outcome: { kind: "sem_novidades", message: "Não encontramos alterações oficiais desde a última verificação." } });
        return;
      }
      await new Promise((r) => setTimeout(r, 250));
      set({ step: 4 });
      await new Promise((r) => setTimeout(r, 250));
      set({ step: 5, running: false, outcome: { kind: "pronto", versionId: v.id } });
    } catch (e) {
      set({ running: false, outcome: { kind: "erro", message: (e as Error).message } });
    }
  },
}));
