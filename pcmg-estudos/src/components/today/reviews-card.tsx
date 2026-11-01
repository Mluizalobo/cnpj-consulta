"use client";
import { useMemo, useState } from "react";
import { CalendarClock, Check, ChevronDown, Play, Repeat, Shuffle } from "lucide-react";
import { toast } from "sonner";
import { useApp, useRows, useSettings, useSubjects, useTable } from "@/components/app/context";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader, EmptyState, Field, Input } from "@/components/ui/primitives";
import { Dialog, useConfirm } from "@/components/ui/dialog";
import { cn } from "@/components/ui/cn";
import { addDaysKey, diffDays, fmt } from "@/lib/domain/dates";
import { reviewState } from "@/lib/domain/reviews";
import { attemptDate } from "@/lib/domain/stats";
import type { ReviewItem } from "@/lib/types";
import { useTimer } from "@/components/timer/timer-store";

export function ReviewsCard() {
  const { actions } = useApp();
  const settings = useSettings();
  const rows = useRows("review_schedule");
  const sessions = useTable("study_sessions");
  const { byId } = useSubjects();
  const startTimer = useTimer((s) => s.start);
  const timer = useTimer((s) => s.timer);
  const confirm = useConfirm();
  const today = actions.today();
  const [open, setOpen] = useState<string | null>(null);
  const [postpone, setPostpone] = useState<ReviewItem | null>(null);
  const [newDate, setNewDate] = useState("");

  const list = useMemo(() => rows.filter((r) => r.status === "pendente" && r.due_date <= today).sort((a, b) => a.due_date.localeCompare(b.due_date)), [rows, today]);
  const doneToday = rows.filter((r) => r.status === "concluida" && r.completed_at && attemptDate({ answered_at: r.completed_at }) === today).length;
  const overdue = list.filter((r) => reviewState(r, today) === "atrasada").length;
  const heavy = overdue >= Math.max(5, (settings?.max_reviews_per_day ?? 6));

  const start = async (r: ReviewItem) => {
    if (timer && !(await confirm({ title: "Já existe um cronômetro ativo", description: "Iniciar a revisão vai substituí-lo.", confirmLabel: "Iniciar revisão" }))) return;
    const s = actions.startAdhocSession({ subjectId: r.subject_id, activity: "revisao", minutes: settings?.review_minutes ?? 20, reviewId: r.id, label: `Revisão: ${r.topic ?? byId.get(r.subject_id ?? "")?.short_name ?? ""}` });
    startTimer({ sessionId: s.id, kind: "revisao", reviewId: r.id, subjectId: r.subject_id, label: s.label ?? "Revisão", blocks: [{ type: "revisao", seconds: (settings?.review_minutes ?? 20) * 60 }] });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const redistribute = async () => {
    if (!(await confirm({ title: "Reorganizar revisões atrasadas?", description: `As ${overdue} revisões atrasadas serão redistribuídas a partir de hoje, com no máximo ${settings?.max_reviews_per_day ?? 6} por dia e sem domingos. Nada é apagado.`, confirmLabel: "Reorganizar" }))) return;
    const n = actions.redistributeOverdue();
    toast.success(`${n} revisões reorganizadas`);
  };

  return (
    <Card>
      <CardHeader title="Revisões do dia" description={list.length ? `${list.length} pendente${list.length > 1 ? "s" : ""}${overdue ? ` · ${overdue} atrasada${overdue > 1 ? "s" : ""}` : ""}${doneToday ? ` · ${doneToday} feita${doneToday > 1 ? "s" : ""} hoje` : ""}` : doneToday ? `${doneToday} feita(s) hoje` : undefined} />
      {heavy && (
        <div className="mx-4 mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-warn-soft px-3 py-2.5 text-sm text-warn sm:mx-5">
          <span>Revisões acumuladas. Que tal redistribuir?</span>
          <Button size="sm" variant="outline" onClick={redistribute}><Shuffle size={14} /> Reorganizar</Button>
        </div>
      )}
      {list.length === 0 ? (
        <EmptyState icon={<Repeat size={20} />} title="Nenhuma revisão para hoje" description="Ao concluir um estudo, o app agenda revisões em 1, 7 e 30 dias." />
      ) : (
        <ul className="divide-y px-1 pb-1 pt-2">
          {list.map((r) => {
            const subj = r.subject_id ? byId.get(r.subject_id) : undefined;
            const late = diffDays(today, r.due_date);
            const origin = r.session_id ? sessions[r.session_id] : undefined;
            const expanded = open === r.id;
            return (
              <li key={r.id} className="px-3 py-3 sm:px-4" data-testid="review-item">
                <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
                  <button type="button" onClick={() => setOpen(expanded ? null : r.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-expanded={expanded}>
                    <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: subj?.color ?? "rgb(var(--muted))" }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{r.topic || subj?.name || "Revisão"}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                        <span>{subj?.short_name ?? "Geral"}</span><span>·</span><span>D+{r.interval_days}</span>
                        {late > 0 && <Badge tone="alert">atrasada {late} dia{late > 1 ? "s" : ""}</Badge>}
                      </span>
                    </span>
                    <ChevronDown size={16} className={cn("shrink-0 text-muted transition-transform", expanded && "rotate-180")} />
                  </button>
                  <div className="flex w-full gap-2 sm:w-auto">
                    <Button size="sm" onClick={() => start(r)} className="flex-1 sm:flex-none"><Play size={14} /> Iniciar</Button>
                    <Button size="sm" variant="outline" onClick={() => { actions.completeReview(r.id); toast.success("Revisão concluída"); }} className="flex-1 sm:flex-none"><Check size={14} /> Concluir</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setPostpone(r); setNewDate(addDaysKey(today, 1)); }} aria-label="Adiar"><CalendarClock size={15} /></Button>
                  </div>
                </div>
                {expanded && (
                  <div className="ml-4 mt-3 space-y-1 rounded-xl bg-surface-2 p-3 text-sm animate-fade-in">
                    <div><span className="text-muted">Matéria:</span> {subj?.name ?? "—"}</div>
                    <div><span className="text-muted">Conteúdo:</span> {r.topic ?? "—"}</div>
                    <div><span className="text-muted">Estudado em:</span> {fmt(r.base_date, "dd/MM/yyyy")}{origin?.notes ? ` — ${origin.notes}` : ""}</div>
                    <div><span className="text-muted">Prevista para:</span> {fmt(r.due_date, "dd/MM/yyyy")}{r.original_due_date !== r.due_date ? ` (original: ${fmt(r.original_due_date, "dd/MM")})` : ""}</div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Dialog open={!!postpone} onOpenChange={(o) => !o && setPostpone(null)} title="Adiar revisão" size="sm"
        footer={<><Button variant="outline" onClick={() => setPostpone(null)}>Cancelar</Button><Button disabled={!newDate || newDate < today} onClick={() => { actions.postponeReview(postpone!.id, newDate); toast.success("Revisão adiada"); setPostpone(null); }}>Adiar</Button></>}>
        <Field label="Nova data" hint="Se cair num domingo, vai para segunda-feira."><Input type="date" min={today} value={newDate} onChange={(e) => setNewDate(e.target.value)} aria-label="Nova data" /></Field>
        <div className="mt-3 flex flex-wrap gap-2">{[1, 2, 3, 7].map((n) => <Button key={n} size="sm" variant="secondary" onClick={() => setNewDate(addDaysKey(today, n))}>+{n} dia{n > 1 ? "s" : ""}</Button>)}</div>
      </Dialog>
    </Card>
  );
}
