"use client";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { useApp, useRows } from "@/components/app/context";
import { formatDuration } from "@/lib/domain/dates";

export interface FinishTarget {
  sessionId: string;
  subjectId: string | null;
  label: string;
  theorySeconds: number;
  practiceSeconds: number;
  editableMinutes?: boolean; // sem cronômetro: a usuária informa o tempo
  plannedMinutes?: number;
}

/** Registro ao concluir: conteúdo estudado, questões feitas e tempo efetivo. Gera as revisões. */
export function FinishDialog({ target, onClose, onDone }: { target: FinishTarget | null; onClose: () => void; onDone?: () => void }) {
  const { actions } = useApp();
  const topics = useRows("syllabus_topics");
  const [topic, setTopic] = useState("");
  const [topicId, setTopicId] = useState("");
  const [done, setDone] = useState("");
  const [correct, setCorrect] = useState("");
  const [notes, setNotes] = useState("");
  const [minutes, setMinutes] = useState("");
  useEffect(() => {
    if (!target) return;
    setTopic(""); setTopicId(""); setDone(""); setCorrect(""); setNotes("");
    setMinutes(String(target.editableMinutes ? target.plannedMinutes ?? 60 : Math.round((target.theorySeconds + target.practiceSeconds) / 60)));
  }, [target]);
  const subjectTopics = useMemo(
    () => topics.filter((t) => t.subject_id === target?.subjectId && t.in_current_edital).sort((a, b) => (a.code ?? "").localeCompare(b.code ?? "", "pt", { numeric: true })),
    [topics, target?.subjectId],
  );
  if (!target) return null;
  const total = target.theorySeconds + target.practiceSeconds;
  const nDone = Number(done || 0), nCorrect = Number(correct || 0);
  const invalid = nCorrect > nDone || nDone < 0 || (target.editableMinutes && !(Number(minutes) > 0));

  const submit = () => {
    try {
      let th = target.theorySeconds, pr = target.practiceSeconds;
      if (target.editableMinutes) {
        const sec = Number(minutes) * 60;
        const share = total > 0 ? target.theorySeconds / total : 0.58;
        th = Math.round(sec * share); pr = sec - th;
      }
      const r = actions.completeSession(target.sessionId, { topic, syllabusTopicId: topicId || null, notes, questionsDone: nDone, questionsCorrect: nCorrect, theorySeconds: th, practiceSeconds: pr });
      toast.success(r.reviews.length ? `Sessão registrada · ${r.reviews.length} revisões agendadas (D+1, D+7, D+30)` : "Sessão registrada");
      onDone?.();
      onClose();
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Concluir sessão" description={target.label}
      footer={<><Button variant="outline" onClick={onClose}>Voltar</Button><Button onClick={submit} disabled={invalid}>Salvar e concluir</Button></>}>
      <div className="space-y-4">
        {!target.editableMinutes ? (
          <div className="grid grid-cols-3 gap-2 rounded-xl bg-surface-2 p-3 text-center text-sm">
            <div><div className="text-muted">Teoria</div><div className="tnum font-semibold">{formatDuration(target.theorySeconds)}</div></div>
            <div><div className="text-muted">Questões</div><div className="tnum font-semibold">{formatDuration(target.practiceSeconds)}</div></div>
            <div><div className="text-muted">Total</div><div className="tnum font-semibold">{formatDuration(total)}</div></div>
          </div>
        ) : (
          <Field label="Tempo efetivamente estudado (minutos)" htmlFor="fin-min"><Input id="fin-min" type="number" inputMode="numeric" min={1} max={600} value={minutes} onChange={(e) => setMinutes(e.target.value)} /></Field>
        )}
        {subjectTopics.length > 0 && (
          <Field label="Conteúdo do edital (opcional)" hint="Marca o conteúdo como estudado no edital verticalizado.">
            <Select value={topicId} onChange={(e) => setTopicId(e.target.value)} aria-label="Conteúdo do edital">
              <option value="">— Não vincular —</option>
              {subjectTopics.map((t) => <option key={t.id} value={t.id}>{"  ".repeat(t.level - 1)}{t.code ? `${t.code} ` : ""}{t.title}</option>)}
            </Select>
          </Field>
        )}
        <Field label="O que você estudou?" hint="Ex.: Crase — casos obrigatórios. Usado nas revisões." htmlFor="fin-topic">
          <Input id="fin-topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Assunto ou tópico" maxLength={200} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Questões feitas" htmlFor="fin-done"><Input id="fin-done" type="number" inputMode="numeric" min={0} value={done} onChange={(e) => setDone(e.target.value)} /></Field>
          <Field label="Acertos" htmlFor="fin-ok" error={nCorrect > nDone ? "Maior que o total" : undefined}><Input id="fin-ok" type="number" inputMode="numeric" min={0} value={correct} onChange={(e) => setCorrect(e.target.value)} /></Field>
        </div>
        <Field label="Anotações (opcional)" htmlFor="fin-notes"><Textarea id="fin-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} /></Field>
      </div>
    </Dialog>
  );
}
