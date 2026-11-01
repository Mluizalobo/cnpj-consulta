"use client";
import { Pause, Play, RotateCcw, Square, SkipForward, Timer as TimerIcon } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/app/context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { useConfirm } from "@/components/ui/dialog";
import { cn } from "@/components/ui/cn";
import { formatClock } from "@/lib/domain/dates";
import { BLOCK_LABEL, blockElapsed, blockRemaining, secondsByType, totalElapsed, totalPlanned } from "@/lib/domain/timer";
import { useNow } from "@/components/shared/use-now";
import { useTimer } from "./timer-store";
import { FinishDialog } from "./finish-dialog";

function Ring({ value, children }: { value: number; children: React.ReactNode }) {
  const r = 52, c = 2 * Math.PI * r;
  return (
    <div className="relative grid h-36 w-36 shrink-0 place-items-center sm:h-40 sm:w-40">
      <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" className="stroke-surface-2" strokeWidth="8" />
        <circle cx="60" cy="60" r={r} fill="none" className="stroke-primary transition-[stroke-dashoffset] duration-700" strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))} />
      </svg>
      <div className="relative text-center">{children}</div>
    </div>
  );
}

/** Painel completo do cronômetro (tela Hoje). */
export function TimerPanel() {
  const { actions } = useApp();
  const confirm = useConfirm();
  const t = useTimer();
  const timer = t.timer;
  const now = useNow(!!timer && timer.runningSince !== null);
  if (!timer) return null;
  const block = timer.blocks[timer.index];
  const remaining = blockRemaining(timer, now);
  const progress = block ? blockElapsed(timer, now) / block.seconds : 1;
  const running = timer.runningSince !== null;
  const sec = secondsByType(timer, now);

  const finish = async () => {
    t.pause();
    if (timer.kind === "revisao") {
      const ok = await confirm({ title: "Concluir revisão?", description: `Tempo registrado: ${formatClock(totalElapsed(timer, Date.now()))}.`, confirmLabel: "Concluir" });
      if (!ok) return;
      if (timer.reviewId) actions.completeReview(timer.reviewId, Math.round(totalElapsed(timer, Date.now())), timer.sessionId);
      else actions.deleteSession(timer.sessionId);
      t.clear();
      toast.success("Revisão concluída");
      return;
    }
    t.setFinishing(true);
  };
  const doReset = async () => {
    if (await confirm({ title: "Reiniciar o cronômetro?", description: "O tempo desta sessão volta para zero.", confirmLabel: "Reiniciar", danger: true })) t.reset();
  };
  const cancel = async () => {
    if (!(await confirm({ title: "Descartar esta sessão?", description: "O tempo não será registrado. A sessão planejada volta a ficar pendente.", confirmLabel: "Descartar", danger: true }))) return;
    actions.deleteSession(timer.sessionId);
    t.clear();
  };

  return (
    <Card className="overflow-hidden" data-testid="timer-panel">
      <div className="flex items-center justify-between border-b px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <TimerIcon size={16} className="text-primary" />
          <span className="truncate text-sm font-semibold">{timer.label}</span>
        </div>
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", running ? "bg-primary-soft text-primary" : "bg-surface-2 text-muted")}>{running ? "Em andamento" : timer.finished ? "Concluído" : "Pausado"}</span>
      </div>
      <div className="flex flex-col items-center gap-5 p-4 sm:flex-row sm:p-5">
        <Ring value={progress}>
          <div className="text-xs font-medium uppercase tracking-wide text-muted">{block ? BLOCK_LABEL[block.type] : "—"}</div>
          <div className="tnum text-[32px] font-semibold leading-none tracking-tight" aria-live="off" data-testid="timer-remaining">{formatClock(remaining)}</div>
          <div className="mt-1 text-xs text-muted">restantes</div>
        </Ring>
        <div className="w-full flex-1 space-y-3">
          <div className="flex gap-2">
            {timer.blocks.map((b, i) => (
              <button key={i} type="button" onClick={() => t.switchTo(i)} disabled={i === timer.index}
                className={cn("flex-1 rounded-xl border px-3 py-2 text-left transition-colors", i === timer.index ? "border-primary bg-primary-soft" : "hover:bg-surface-2")}>
                <div className="text-xs text-muted">{BLOCK_LABEL[b.type]} · {Math.round(b.seconds / 60)} min</div>
                <div className="tnum text-sm font-semibold">{formatClock(blockElapsed(timer, now, i))}</div>
              </button>
            ))}
          </div>
          <div className="tnum text-xs text-muted">Total estudado: {formatClock(totalElapsed(timer, now))} de {formatClock(totalPlanned(timer))} · teoria {formatClock(sec.teoria + sec.revisao)} · questões {formatClock(sec.questoes)}</div>
          <div className="flex flex-wrap gap-2">
            {running ? <Button onClick={t.pause} variant="secondary"><Pause size={16} /> Pausar</Button>
              : <Button onClick={t.resume} disabled={timer.finished}><Play size={16} /> {totalElapsed(timer, now) > 0 ? "Retomar" : "Iniciar"}</Button>}
            {timer.index < timer.blocks.length - 1 && <Button variant="outline" onClick={() => t.switchTo(timer.index + 1)}><SkipForward size={16} /> Ir para {BLOCK_LABEL[timer.blocks[timer.index + 1].type].toLowerCase()}</Button>}
            <Button variant="soft" onClick={finish}><Square size={15} /> Encerrar</Button>
            <Button variant="ghost" size="icon" onClick={doReset} aria-label="Reiniciar cronômetro"><RotateCcw size={16} /></Button>
          </div>
          <button type="button" onClick={cancel} className="text-xs text-muted underline-offset-2 hover:underline">Descartar sessão</button>
        </div>
      </div>
      {t.finishing && timer.kind === "estudo" && (
        <FinishDialog
          target={{ sessionId: timer.sessionId, subjectId: timer.subjectId, label: timer.label, theorySeconds: sec.teoria + sec.revisao, practiceSeconds: sec.questoes }}
          onClose={() => t.setFinishing(false)} onDone={() => t.clear()} />
      )}
    </Card>
  );
}

/** Barra compacta do cronômetro, visível em todas as páginas. */
export function MiniTimer({ onOpen }: { onOpen: () => void }) {
  const t = useTimer();
  const timer = t.timer;
  const now = useNow(!!timer && timer.runningSince !== null);
  if (!timer) return null;
  const block = timer.blocks[timer.index];
  const running = timer.runningSince !== null;
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-surface/95 px-3 py-2 shadow-pop backdrop-blur">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <span className={cn("h-2 w-2 shrink-0 rounded-full", running ? "animate-pulse bg-primary" : "bg-muted")} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{timer.label}</span>
          <span className="block text-xs text-muted">{block ? BLOCK_LABEL[block.type] : ""}</span>
        </span>
      </button>
      <span className="tnum text-base font-semibold">{formatClock(blockRemaining(timer, now))}</span>
      <Button size="icon" variant={running ? "secondary" : "primary"} className="h-9 w-9" onClick={running ? t.pause : t.resume} disabled={timer.finished} aria-label={running ? "Pausar" : "Retomar"}>
        {running ? <Pause size={16} /> : <Play size={16} />}
      </Button>
    </div>
  );
}
