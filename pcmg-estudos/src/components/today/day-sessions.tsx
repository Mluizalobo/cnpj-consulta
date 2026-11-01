"use client";
import { useState } from "react";
import { Check, Play, RotateCw, Clock3, Sparkles, Plus } from "lucide-react";
import { toast } from "sonner";
import { useApp, useSubjects } from "@/components/app/context";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui/primitives";
import { cn } from "@/components/ui/cn";
import { useConfirm } from "@/components/ui/dialog";
import { ACTIVITY_LABEL, type DayItem } from "@/lib/domain/plan";
import { formatDuration } from "@/lib/domain/dates";
import type { StudySession } from "@/lib/types";
import { useTimer } from "@/components/timer/timer-store";
import { FinishDialog, type FinishTarget } from "@/components/timer/finish-dialog";
import { useRouter } from "next/navigation";
import { AdhocDialog } from "./adhoc-dialog";

export function DaySessions({ rows, isToday = true }: { rows: { item: DayItem; session: StudySession | undefined }[]; isToday?: boolean }) {
  const { actions } = useApp();
  const { byId } = useSubjects();
  const timer = useTimer((s) => s.timer);
  const startTimer = useTimer((s) => s.start);
  const confirm = useConfirm();
  const router = useRouter();
  const [finish, setFinish] = useState<FinishTarget | null>(null);
  const [adhoc, setAdhoc] = useState(false);

  const start = async (item: DayItem) => {
    if (item.activity === "simulado") { router.push("/simulados?novo=completo"); return; }
    if (timer && !(await confirm({ title: "Já existe um cronômetro ativo", description: `"${timer.label}" está em andamento. Iniciar outra sessão vai substituí-lo (o tempo já salvo é mantido).`, confirmLabel: "Iniciar mesmo assim" }))) return;
    const s = actions.startPlannedSession(item);
    const blocks = item.activity === "revisao" ? [{ type: "revisao" as const, seconds: item.minutes * 60 }]
      : item.activity === "questoes" ? [{ type: "questoes" as const, seconds: item.minutes * 60 }]
      : [{ type: "teoria" as const, seconds: item.theoryMinutes * 60 }, { type: "questoes" as const, seconds: item.questionsMinutes * 60 }];
    startTimer({ sessionId: s.id, kind: "estudo", subjectId: item.subjectId, label: item.label, blocks });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const markDone = (item: DayItem) => {
    const s = actions.startPlannedSession(item);
    setFinish({ sessionId: s.id, subjectId: item.subjectId, label: item.label, theorySeconds: item.theoryMinutes * 60, practiceSeconds: item.questionsMinutes * 60, editableMinutes: true, plannedMinutes: item.minutes });
  };
  const reopen = async (s: StudySession) => {
    if (await confirm({ title: "Reabrir sessão?", description: "Ela volta a ficar pendente. As revisões já criadas continuam agendadas.", confirmLabel: "Reabrir" })) { actions.reopenSession(s.id); toast("Sessão reaberta"); }
  };

  return (
    <Card>
      <CardHeader title="Sessões do dia" description={rows.length ? `${rows.filter((r) => r.session?.status === "concluida").length} de ${rows.length} concluídas` : undefined}
        action={isToday ? <Button size="sm" variant="ghost" onClick={() => setAdhoc(true)}><Plus size={15} /> Avulsa</Button> : undefined} />
      {rows.length === 0 ? (
        <EmptyState icon={<Sparkles size={20} />} title="Dia livre" description="Nenhuma sessão planejada para hoje. Descanse — ou registre um estudo avulso." />
      ) : (
        <ul className="divide-y px-1 pb-1 pt-2">
          {rows.map(({ item, session }) => {
            const subject = item.subjectId ? byId.get(item.subjectId) : undefined;
            const status = session?.status === "concluida" ? "concluida" : session ? "em_andamento" : "pendente";
            const isActiveTimer = !!timer && timer.sessionId === session?.id;
            return (
              <li key={item.key} className="flex flex-wrap items-center gap-3 px-3 py-3 sm:flex-nowrap sm:px-4" data-testid="day-item">
                <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: subject?.color ?? "rgb(var(--muted))" }} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={cn("font-medium", status === "concluida" && "text-muted line-through decoration-1")}>{item.label}</span>
                    {item.rotation && <Badge tone="outline" title={item.rotationReason}>rotativa</Badge>}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                    <span className="inline-flex items-center gap-1"><Clock3 size={12} />{formatDuration(item.minutes * 60)}</span>
                    <span>·</span>
                    <span>{item.activity === "teoria_questoes" ? `${item.theoryMinutes} min teoria + ${item.questionsMinutes} min questões` : ACTIVITY_LABEL[item.activity]}</span>
                    {session?.status === "concluida" && <><span>·</span><span className="text-primary">feito em {formatDuration(session.total_seconds)}</span></>}
                  </div>
                </div>
                <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto">
                  {status === "concluida" ? (
                    <>
                      <Badge tone="primary"><Check size={12} /> Concluída</Badge>
                      <Button size="sm" variant="ghost" onClick={() => reopen(session!)} aria-label="Reabrir sessão"><RotateCw size={14} /></Button>
                    </>
                  ) : (
                    <>
                      {status === "em_andamento" && !isActiveTimer && <Badge tone="warn">Em andamento</Badge>}
                      {isActiveTimer ? <Badge tone="primary">Cronômetro ativo</Badge> : isToday && (
                        <Button size="sm" onClick={() => start(item)} className="flex-1 sm:flex-none"><Play size={14} /> {item.activity === "simulado" ? "Abrir simulado" : status === "em_andamento" ? "Retomar" : "Iniciar"}</Button>
                      )}
                      {item.activity !== "simulado" && <Button size="sm" variant="outline" onClick={() => markDone(item)} className="flex-1 sm:flex-none"><Check size={14} /> Concluir</Button>}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <FinishDialog target={finish} onClose={() => setFinish(null)} />
      <AdhocDialog open={adhoc} onOpenChange={setAdhoc} />
    </Card>
  );
}
