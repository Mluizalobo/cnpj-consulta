"use client";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Flag, Pause, Play, Send, LayoutGrid } from "lucide-react";
import { toast } from "sonner";
import { useApp, useRows, useTable, useSubjects } from "@/components/app/context";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState } from "@/components/ui/primitives";
import { Dialog, useConfirm } from "@/components/ui/dialog";
import { cn } from "@/components/ui/cn";
import { useNow } from "@/components/shared/use-now";
import { formatClock } from "@/lib/domain/dates";
import { mockElapsed } from "@/lib/domain/mock";
import { OPTIONS } from "@/lib/types";
import { optionText } from "@/components/questions/labels";

function ExamInner() {
  const id = useSearchParams().get("id") ?? "";
  const router = useRouter();
  const { actions } = useApp();
  const confirm = useConfirm();
  const mock = useTable("mock_exams")[id];
  const allMq = useRows("mock_exam_questions");
  const questions = useTable("questions");
  const { byId } = useSubjects();
  const [grid, setGrid] = useState(false);
  const finishing = useRef(false);
  const mqs = useMemo(() => allMq.filter((q) => q.mock_exam_id === id).sort((a, b) => a.position - b.position), [allMq, id]);
  const running = !!mock?.resumed_at && mock.status === "em_andamento";
  const now = useNow(running);
  const elapsed = mock ? mockElapsed(mock, now) : 0;
  const remaining = mock ? Math.max(0, mock.time_limit_seconds - elapsed) : 0;

  useEffect(() => { if (mock?.status === "finalizado") router.replace(`/simulados/resultado?id=${id}`); }, [mock?.status, id, router]);
  useEffect(() => {
    if (mock && mock.status === "em_andamento" && remaining <= 0 && !finishing.current) {
      finishing.current = true;
      actions.finalizeMock(id);
      toast("Tempo esgotado! Simulado entregue automaticamente.");
    }
  }, [remaining, mock, id, actions]);

  if (!mock) return <EmptyState title="Simulado não encontrado" action={<Button onClick={() => router.push("/simulados")}>Voltar</Button>} />;
  const idx = Math.min(mock.current_index, Math.max(0, mqs.length - 1));
  const mq = mqs[idx];
  const q = mq?.question_id ? questions[mq.question_id] : undefined;
  const answered = mqs.filter((x) => x.selected_option).length;
  const flagged = mqs.filter((x) => x.flagged).length;
  const go = (i: number) => { actions.setMockIndex(id, Math.max(0, Math.min(mqs.length - 1, i))); setGrid(false); window.scrollTo({ top: 0 }); };
  const finish = async () => {
    const blank = mqs.length - answered;
    if (!(await confirm({ title: "Entregar simulado?", description: <>Respondidas: <b>{answered}</b> de {mqs.length}.{blank ? <> <b>{blank}</b> em branco (não pontuam).</> : null}{flagged ? <> {flagged} marcadas para revisar.</> : null} Depois da entrega não é possível alterar.</>, confirmLabel: "Entregar" }))) return;
    finishing.current = true;
    actions.finalizeMock(id);
    router.replace(`/simulados/resultado?id=${id}`);
  };
  const low = remaining < 15 * 60;

  return (
    <div className="space-y-4" data-testid="exam">
      <div className="pt-safe sticky top-14 z-10 -mx-4 border-b bg-bg/90 px-4 py-2 backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{mock.title}</div>
            <div className="tnum text-xs text-muted">{answered}/{mqs.length} respondidas{flagged ? ` · ${flagged} marcadas` : ""}</div>
          </div>
          <span className={cn("tnum rounded-lg px-2 py-1 text-lg font-semibold", low ? "bg-alert-soft text-alert" : "bg-surface-2")} data-testid="exam-clock" aria-label="Tempo restante">{formatClock(remaining)}</span>
          <Button size="icon" variant="ghost" onClick={() => (running ? actions.pauseMock(id) : actions.resumeMock(id))} aria-label={running ? "Pausar" : "Retomar"}>{running ? <Pause size={18} /> : <Play size={18} />}</Button>
          <Button size="icon" variant="ghost" onClick={() => setGrid(true)} aria-label="Mapa de questões"><LayoutGrid size={18} /></Button>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-2"><div className="h-full bg-primary transition-[width]" style={{ width: `${(answered / Math.max(1, mqs.length)) * 100}%` }} /></div>
      </div>

      {!running && (
        <Card className="flex items-center justify-between gap-3 border-warn/40 bg-warn-soft p-3 text-sm text-warn">
          Simulado pausado. O cronômetro está parado.
          <Button size="sm" onClick={() => actions.resumeMock(id)}><Play size={14} /> Retomar</Button>
        </Card>
      )}

      {mq && (
        <Card className={cn("overflow-hidden", !running && "pointer-events-none opacity-50 blur-[2px]")} aria-hidden={!running}>
          <div className="flex items-center gap-2 border-b px-4 py-3 sm:px-5">
            <span className="text-sm font-semibold">Questão {idx + 1}</span>
            <Badge>{byId.get(mq.subject_id ?? "")?.short_name ?? "—"}</Badge>
            <button type="button" onClick={() => actions.flagMock(mq.id)} className={cn("ml-auto inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium", mq.flagged ? "bg-warn-soft text-warn" : "text-muted hover:bg-surface-2")} aria-pressed={mq.flagged} data-testid="flag-question">
              <Flag size={14} className={cn(mq.flagged && "fill-current")} /> {mq.flagged ? "Marcada" : "Revisar depois"}
            </button>
          </div>
          <div className="space-y-4 p-4 sm:p-5">
            {q ? <p className="whitespace-pre-line text-[15px] leading-relaxed">{q.statement}</p> : <p className="text-sm text-muted">Esta questão foi excluída do banco.</p>}
            {q && (
              <div className="space-y-2" role="radiogroup" aria-label="Alternativas">
                {OPTIONS.map((o) => (
                  <button key={o} type="button" role="radio" aria-checked={mq.selected_option === o} data-option={o}
                    onClick={() => actions.answerMock(mq.id, mq.selected_option === o ? null : o)}
                    className={cn("flex w-full items-start gap-3 rounded-xl border p-3 text-left text-[15px] transition-colors", mq.selected_option === o ? "border-primary bg-primary-soft" : "hover:bg-surface-2")}>
                    <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-lg border text-sm font-semibold", mq.selected_option === o && "border-primary bg-primary text-primary-fg")}>{o}</span>
                    <span className="pt-0.5">{optionText(q, o)}</span>
                  </button>
                ))}
                <p className="text-xs text-muted">Toque de novo na alternativa para deixá-la em branco. As respostas são salvas automaticamente.</p>
              </div>
            )}
          </div>
        </Card>
      )}

      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={() => go(idx - 1)} disabled={idx === 0}><ChevronLeft size={16} /> Anterior</Button>
        {idx < mqs.length - 1 ? <Button className="flex-1" onClick={() => go(idx + 1)} data-testid="next-question">Próxima <ChevronRight size={16} /></Button>
          : <Button className="flex-1" onClick={finish} data-testid="finish-exam"><Send size={16} /> Entregar</Button>}
      </div>
      <div className="text-center"><button type="button" onClick={finish} className="text-sm text-muted underline-offset-2 hover:underline">Entregar simulado agora</button></div>

      <Dialog open={grid} onOpenChange={setGrid} title="Mapa de questões" description={`${answered} respondidas · ${mqs.length - answered} em branco · ${flagged} marcadas`}>
        <div className="grid grid-cols-7 gap-1.5 sm:grid-cols-10">
          {mqs.map((x, i) => (
            <button key={x.id} type="button" onClick={() => go(i)} aria-label={`Questão ${i + 1}${x.selected_option ? ", respondida" : ", em branco"}${x.flagged ? ", marcada" : ""}`}
              className={cn("relative grid h-10 place-items-center rounded-lg border text-sm tnum", x.selected_option ? "border-primary bg-primary-soft font-semibold text-primary" : "text-muted", i === idx && "ring-2 ring-primary")}>
              {i + 1}{x.flagged && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-warn" />}
            </button>
          ))}
        </div>
        <div className="mt-3 flex gap-3 text-xs text-muted"><span>■ respondida</span><span>□ em branco</span><span className="text-warn">● marcada</span></div>
      </Dialog>
    </div>
  );
}
export default function ExamPage() { return <Suspense><ExamInner /></Suspense>; }
