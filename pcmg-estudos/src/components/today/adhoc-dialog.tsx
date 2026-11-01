"use client";
import { useState } from "react";
import { toast } from "sonner";
import { useApp, useSettings, useSubjects } from "@/components/app/context";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Segmented, Select } from "@/components/ui/primitives";
import { useTimer } from "@/components/timer/timer-store";
import type { Activity } from "@/lib/types";
import { splitFor } from "@/lib/domain/plan";
import { getPhase } from "@/lib/domain/phases";

/** Estudo fora do plano: iniciar cronômetro ou registrar algo que já foi feito. */
export function AdhocDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { actions } = useApp();
  const settings = useSettings();
  const { active } = useSubjects();
  const startTimer = useTimer((s) => s.start);
  const [mode, setMode] = useState<"timer" | "manual">("timer");
  const [subjectId, setSubjectId] = useState("");
  const [activity, setActivity] = useState<Activity>("teoria_questoes");
  const [minutes, setMinutes] = useState("60");
  const [date, setDate] = useState(actions.today());
  const [topic, setTopic] = useState("");
  if (!settings) return null;
  const m = Number(minutes);
  const ok = !!subjectId && m > 0 && m <= 600;
  const submit = () => {
    const subj = active.find((s) => s.id === subjectId);
    if (mode === "timer") {
      const s = actions.startAdhocSession({ subjectId, activity, minutes: m });
      const sp = splitFor(getPhase(actions.today(), settings), m, settings);
      const blocks = activity === "teoria_questoes" ? [{ type: "teoria" as const, seconds: sp.theory * 60 }, { type: "questoes" as const, seconds: sp.questions * 60 }]
        : [{ type: activity === "questoes" ? ("questoes" as const) : activity === "revisao" ? ("revisao" as const) : ("teoria" as const), seconds: m * 60 }];
      startTimer({ sessionId: s.id, kind: "estudo", subjectId, label: subj?.name ?? "Estudo avulso", blocks });
      toast.success("Cronômetro iniciado");
    } else {
      const r = actions.logManualSession({ date, subjectId, activity, minutes: m, topic });
      toast.success(r.reviews.length ? `Estudo registrado · ${r.reviews.length} revisões agendadas` : "Estudo registrado");
    }
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Estudo avulso" description="Fora do plano do dia"
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={submit} disabled={!ok}>{mode === "timer" ? "Iniciar cronômetro" : "Registrar"}</Button></>}>
      <div className="space-y-4">
        <Segmented value={mode} onChange={setMode} options={[{ value: "timer", label: "Cronometrar agora" }, { value: "manual", label: "Já estudei" }]} />
        <Field label="Matéria"><Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} aria-label="Matéria"><option value="">Selecione…</option>{active.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Atividade"><Select value={activity} onChange={(e) => setActivity(e.target.value as Activity)} aria-label="Atividade">
            <option value="teoria_questoes">Teoria + questões</option><option value="teoria">Teoria</option><option value="questoes">Questões</option><option value="revisao">Revisão</option>
          </Select></Field>
          <Field label="Minutos"><Input type="number" inputMode="numeric" min={1} max={600} value={minutes} onChange={(e) => setMinutes(e.target.value)} aria-label="Minutos" /></Field>
        </div>
        {mode === "manual" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Data"><Input type="date" value={date} max={actions.today()} onChange={(e) => setDate(e.target.value)} aria-label="Data" /></Field>
            <Field label="Assunto"><Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Opcional" aria-label="Assunto" /></Field>
          </div>
        )}
      </div>
    </Dialog>
  );
}
