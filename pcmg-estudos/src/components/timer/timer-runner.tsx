"use client";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useApp, useSettings } from "@/components/app/context";
import { BLOCK_LABEL, secondsByType } from "@/lib/domain/timer";
import { useTimer } from "./timer-store";
import { beep, systemNotify, vibrate } from "./alerts";

/** Componente invisível: avança o cronômetro, dispara avisos e salva o progresso na sessão. */
export function TimerRunner() {
  const { actions, engine } = useApp();
  const settings = useSettings();
  const timer = useTimer((s) => s.timer);
  const lastSave = useRef(0);

  useEffect(() => {
    if (!timer) return;
    // sessão foi concluída/excluída em outro aparelho: encerra o cronômetro local
    const s = engine.row("study_sessions", timer.sessionId);
    if (!s || s.status === "concluida") { if (!useTimer.getState().finishing) useTimer.getState().clear(); }
  }, [timer, engine]);

  useEffect(() => {
    const prefs = settings?.timer;
    const id = setInterval(() => {
      const events = useTimer.getState().tick(prefs?.autoAdvance ?? true);
      for (const ev of events) {
        if (ev.type === "block_end") {
          const msg = ev.next ? `Fim do bloco de ${BLOCK_LABEL[ev.block.type].toLowerCase()}. Agora: ${BLOCK_LABEL[ev.next.type].toLowerCase()}.` : `Bloco de ${BLOCK_LABEL[ev.block.type].toLowerCase()} concluído.`;
          toast(msg);
          if (prefs?.sound !== false) beep();
          if (prefs?.vibrate !== false) vibrate();
          if (prefs?.notifications && document.visibilityState !== "visible") void systemNotify("PCMG Estudos", msg);
        }
        if (ev.type === "done") { toast.success("Sessão completa! Registre o que você estudou."); useTimer.getState().setFinishing(true); }
      }
      const t = useTimer.getState().timer;
      if (t && t.kind === "estudo" && Date.now() - lastSave.current > 60_000) {
        lastSave.current = Date.now();
        const sec = secondsByType(t, Date.now());
        actions.saveSessionProgress(t.sessionId, sec.teoria + sec.revisao, sec.questoes);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [settings?.timer, actions]);

  useEffect(() => {
    if (timer?.runningSince === null && timer.kind === "estudo") {
      const sec = secondsByType(timer, Date.now());
      actions.saveSessionProgress(timer.sessionId, sec.teoria + sec.revisao, sec.questoes);
    }
  }, [timer?.runningSince, timer, actions]);
  return null;
}
