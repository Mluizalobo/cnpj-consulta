"use client";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { createTimer, pause, reset, resume, switchTo, tick, type TimerBlock, type TimerData, type TimerEvent } from "@/lib/domain/timer";

/** Estado do cronômetro fica no aparelho (preferência de interface), as horas vão para o banco. */
interface TimerStore {
  timer: TimerData | null;
  finishing: boolean; // diálogo de conclusão aberto
  start(p: { sessionId: string; kind: "estudo" | "revisao"; reviewId?: string | null; subjectId: string | null; label: string; blocks: TimerBlock[] }): void;
  pause(): void;
  resume(): void;
  reset(): void;
  switchTo(i: number): void;
  tick(autoAdvance: boolean): TimerEvent[];
  setFinishing(v: boolean): void;
  clear(): void;
}

export const useTimer = create<TimerStore>()(
  persist(
    (set, get) => ({
      timer: null,
      finishing: false,
      start: (p) => set({ timer: createTimer(p, Date.now()), finishing: false }),
      pause: () => { const t = get().timer; if (t) set({ timer: pause(t, Date.now()) }); },
      resume: () => { const t = get().timer; if (t) set({ timer: resume(t, Date.now()) }); },
      reset: () => { const t = get().timer; if (t) set({ timer: reset(t, Date.now()) }); },
      switchTo: (i) => { const t = get().timer; if (t) set({ timer: switchTo(t, i, Date.now()) }); },
      tick: (autoAdvance) => {
        const t = get().timer;
        if (!t || t.runningSince === null) return [];
        const r = tick(t, Date.now(), autoAdvance);
        if (r.events.length) set({ timer: r.timer });
        return r.events;
      },
      setFinishing: (v) => set({ finishing: v }),
      clear: () => set({ timer: null, finishing: false }),
    }),
    { name: "pcmg-timer", storage: createJSONStorage(() => localStorage), partialize: (s) => ({ timer: s.timer }) },
  ),
);
