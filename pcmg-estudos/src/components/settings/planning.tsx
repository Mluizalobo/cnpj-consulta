"use client";
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useApp, useRows, useSettings, useSubjects } from "@/components/app/context";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, Field, Input, Select } from "@/components/ui/primitives";
import { cn } from "@/components/ui/cn";
import { fmt, WEEKDAY_NAMES } from "@/lib/domain/dates";
import { finalStretchStart } from "@/lib/domain/phases";
import { weeklyPlannedMinutes } from "@/lib/domain/plan";
import type { SlotType, UserSettings } from "@/lib/types";

export function DatesCard() {
  const { actions } = useApp();
  const s = useSettings()!;
  const [f, setF] = useState(s);
  useEffect(() => setF(s), [s]);
  const fs = finalStretchStart(f);
  const invalid = (f.edital_date && f.edital_date < f.study_start_date) || (f.exam_date && f.exam_date <= f.study_start_date);
  const save = () => {
    actions.updateSettings({ study_start_date: f.study_start_date, edital_date: f.edital_date || null, edital_published: f.edital_published, exam_date: f.exam_date || null, exam_date_confirmed: f.exam_date_confirmed, final_stretch_weeks: f.final_stretch_weeks, exam_board: f.exam_board || null, exam_board_confirmed: f.exam_board_confirmed });
    toast.success("Datas atualizadas. As fases foram recalculadas — nenhum histórico foi alterado.");
  };
  return (
    <Card id="planejamento">
      <CardHeader title="Datas do concurso" description="Mudar as datas recalcula as fases e o planejamento futuro, sem apagar o histórico." />
      <CardBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Início dos estudos"><Input type="date" value={f.study_start_date} onChange={(e) => setF({ ...f, study_start_date: e.target.value })} aria-label="Início dos estudos" /></Field>
          <Field label="Publicação do edital" hint={f.edital_published ? "Publicado (oficial)" : "Previsão"}><Input type="date" value={f.edital_date ?? ""} onChange={(e) => setF({ ...f, edital_date: e.target.value || null })} aria-label="Publicação do edital" /></Field>
          <Field label="Data da prova" hint={f.exam_date_confirmed ? "Confirmada" : "Previsão (editável)"}><Input type="date" value={f.exam_date ?? ""} onChange={(e) => setF({ ...f, exam_date: e.target.value || null })} aria-label="Data da prova" /></Field>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="inline-flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-[rgb(var(--primary))]" checked={f.edital_published} onChange={(e) => setF({ ...f, edital_published: e.target.checked })} /> Edital já publicado</label>
          <label className="inline-flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-[rgb(var(--primary))]" checked={f.exam_date_confirmed} onChange={(e) => setF({ ...f, exam_date_confirmed: e.target.checked })} /> Data da prova confirmada oficialmente</label>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Reta final (semanas antes da prova)"><Input type="number" min={1} max={26} value={f.final_stretch_weeks} onChange={(e) => setF({ ...f, final_stretch_weeks: Number(e.target.value) || 6 })} aria-label="Semanas da reta final" /></Field>
          <Field label="Início da reta final" hint="Calculado automaticamente"><Input readOnly value={fs ? fmt(fs, "dd/MM/yyyy") : "Defina a data da prova"} aria-label="Início da reta final" /></Field>
          <Field label="Banca" hint={f.exam_board_confirmed ? "Confirmada" : "Prevista — aguardando edital"}><Input value={f.exam_board ?? ""} onChange={(e) => setF({ ...f, exam_board: e.target.value })} aria-label="Banca" /></Field>
        </div>
        {invalid && <p className="text-sm text-alert">Confira as datas: o edital e a prova devem ser depois do início dos estudos.</p>}
        <Button onClick={save} disabled={!!invalid}>Salvar datas</Button>
      </CardBody>
    </Card>
  );
}

export function GoalsCard() {
  const { actions } = useApp();
  const s = useSettings()!;
  const [f, setF] = useState(s);
  useEffect(() => setF(s), [s]);
  const num = (k: keyof UserSettings, min: number, max: number) => ({
    type: "number", min, max, value: String(f[k] as number), onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: Number(e.target.value) }),
  });
  const split = (p: "1" | "2" | "3", key: "theory" | "questions", v: number) => setF({ ...f, phase_splits: { ...f.phase_splits, [p]: { ...f.phase_splits[p], [key]: v } } });
  const valid = f.target_accuracy >= 1 && f.target_accuracy <= 100 && f.daily_goal_minutes >= 0 && f.session_minutes >= 5;
  return (
    <Card>
      <CardHeader title="Metas e sessões" />
      <CardBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Meta de acertos (%)"><Input {...num("target_accuracy", 1, 100)} aria-label="Meta de acertos" /></Field>
          <Field label="Meta diária (min)"><Input {...num("daily_goal_minutes", 0, 1440)} aria-label="Meta diária" /></Field>
          <Field label="Duração padrão da sessão (min)"><Input {...num("session_minutes", 5, 600)} aria-label="Duração da sessão" /></Field>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">Proporção teoria / questões por fase (minutos em 1h)</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {(["1", "2", "3"] as const).map((p) => (
              <div key={p} className="rounded-xl border p-3">
                <div className="mb-2 text-xs font-medium text-muted">Fase {p}</div>
                <div className="flex items-center gap-2">
                  <Input type="number" min={0} max={60} value={f.phase_splits[p].theory} onChange={(e) => split(p, "theory", Number(e.target.value))} aria-label={`Teoria fase ${p}`} />
                  <span className="text-muted">/</span>
                  <Input type="number" min={0} max={60} value={f.phase_splits[p].questions} onChange={(e) => split(p, "questions", Number(e.target.value))} aria-label={`Questões fase ${p}`} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <Field label="Duração do simulado completo (min)"><Input {...num("mock_duration_minutes", 10, 600)} className="sm:max-w-[200px]" aria-label="Duração do simulado" /></Field>
        <Button disabled={!valid} onClick={() => { actions.updateSettings({ target_accuracy: f.target_accuracy, daily_goal_minutes: f.daily_goal_minutes, session_minutes: f.session_minutes, phase_splits: f.phase_splits, mock_duration_minutes: f.mock_duration_minutes }); toast.success("Metas salvas"); }}>Salvar metas</Button>
      </CardBody>
    </Card>
  );
}

const SLOT_LABEL: Record<SlotType, string> = { subject: "Matéria fixa", rotation: "Matéria rotativa", weekly_review: "Revisão da semana", mixed_questions: "Questões misturadas" };

export function WeeklyPlanCard() {
  const { actions } = useApp();
  const plan = useRows("study_plan");
  const settings = useSettings()!;
  const { active } = useSubjects();
  const [rot1, setRot1] = useState(settings.rotation.phase1);
  const [rot2, setRot2] = useState(settings.rotation.phase2);
  useEffect(() => { setRot1(settings.rotation.phase1); setRot2(settings.rotation.phase2); }, [settings.rotation]);
  const total = weeklyPlannedMinutes(plan);
  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  return (
    <Card>
      <CardHeader title="Distribuição semanal" description={`${Math.round(total / 6) / 10} horas por semana · alterações valem para os próximos dias`} />
      <CardBody className="space-y-3">
        {[1, 2, 3, 4, 5, 6, 0].map((wd) => {
          const slots = plan.filter((p) => p.weekday === wd).sort((a, b) => a.position - b.position);
          return (
            <div key={wd} className="rounded-xl border p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold">{WEEKDAY_NAMES[wd]}</span>
                <Button size="sm" variant="ghost" onClick={() => actions.setPlanSlot({ weekday: wd, position: (slots.at(-1)?.position ?? -1) + 1, slot_type: "subject", subject_id: active[0]?.id ?? null })}><Plus size={14} /> Sessão</Button>
              </div>
              {slots.length === 0 ? <p className="text-xs text-muted">Dia livre</p> : (
                <div className="space-y-2">
                  {slots.map((s) => (
                    <div key={s.id} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[180px_1fr_90px_auto]">
                      <Select value={s.slot_type} onChange={(e) => actions.setPlanSlot({ ...s, slot_type: e.target.value as SlotType, subject_id: e.target.value === "subject" ? s.subject_id ?? active[0]?.id ?? null : null })} aria-label="Tipo de sessão" className="h-10 text-sm">
                        {Object.entries(SLOT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </Select>
                      <div className="order-last col-span-2 sm:order-none sm:col-span-1">
                        {s.slot_type === "subject" ? (
                          <Select value={s.subject_id ?? ""} onChange={(e) => actions.setPlanSlot({ ...s, subject_id: e.target.value })} aria-label="Matéria" className="h-10 text-sm">{active.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>
                        ) : <div className="flex h-10 items-center text-xs text-muted">{s.slot_type === "rotation" ? "Definida pela fase (veja abaixo)" : "Sem matéria fixa"}</div>}
                      </div>
                      <Input type="number" min={5} max={600} value={s.duration_minutes} onChange={(e) => Number(e.target.value) >= 5 && actions.setPlanSlot({ ...s, duration_minutes: Number(e.target.value) })} aria-label="Minutos" className="hidden h-10 text-sm sm:block" />
                      <Button size="icon" variant="ghost" className="h-10 w-10" onClick={() => actions.removePlanSlot(s.id)} aria-label="Remover sessão"><Trash2 size={15} /></Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {[["Rotação de sexta — Fase 1 (alterna semanalmente)", rot1, setRot1], ["Rotação de sexta — Fase 2", rot2, setRot2]].map(([label, list, set]) => (
          <div key={label as string}>
            <p className="mb-2 text-sm font-medium">{label as string}</p>
            <div className="flex flex-wrap gap-2">
              {active.map((s) => {
                const on = (list as string[]).includes(s.id);
                return <button key={s.id} type="button" aria-pressed={on} onClick={() => toggle(list as string[], set as (v: string[]) => void, s.id)} className={cn("rounded-full border px-3 py-1.5 text-sm", on ? "border-primary bg-primary-soft text-primary" : "hover:bg-surface-2")}>{s.short_name}</button>;
              })}
            </div>
          </div>
        ))}
        <p className="text-xs text-muted">Na Fase 3 (reta final), a sexta é escolhida automaticamente pela matéria com menor percentual de acertos.</p>
        <Button onClick={() => { actions.updateSettings({ rotation: { phase1: rot1, phase2: rot2 } }); toast.success("Rotação salva"); }}>Salvar rotação</Button>
      </CardBody>
    </Card>
  );
}

export function SubjectsCard() {
  const { actions } = useApp();
  const { all } = useSubjects();
  const [name, setName] = useState("");
  const [qn, setQn] = useState("4");
  const total = all.filter((s) => s.active).reduce((s, x) => s + x.exam_questions, 0);
  return (
    <Card>
      <CardHeader title="Matérias, questões e pesos" description={`Total: ${total} questões. O peso é calculado pela quantidade de questões e pode mudar com o edital.`} />
      <CardBody className="space-y-2">
        {all.map((s) => (
          <div key={s.id} className={cn("grid grid-cols-[auto_1fr_70px_auto] items-center gap-2 rounded-xl border p-2 sm:grid-cols-[auto_1fr_160px_70px_70px_auto]", !s.active && "opacity-60")}>
            <input type="color" value={s.color} onChange={(e) => actions.updateSubject(s.id, { color: e.target.value })} className="h-8 w-8 cursor-pointer rounded-lg border-0 bg-transparent p-0" aria-label={`Cor de ${s.name}`} />
            <Input defaultValue={s.name} onBlur={(e) => e.target.value.trim() && e.target.value !== s.name && actions.updateSubject(s.id, { name: e.target.value.trim() })} className="h-9 text-sm" aria-label="Nome da matéria" />
            <Input defaultValue={s.short_name} onBlur={(e) => e.target.value.trim() && e.target.value !== s.short_name && actions.updateSubject(s.id, { short_name: e.target.value.trim().slice(0, 80) })} className="hidden h-9 text-sm sm:block" aria-label="Nome curto" />
            <Input type="number" min={0} max={500} defaultValue={s.exam_questions} onBlur={(e) => Number(e.target.value) !== s.exam_questions && actions.updateSubject(s.id, { exam_questions: Math.max(0, Number(e.target.value)) })} className="h-9 text-sm" aria-label="Questões na prova" />
            <span className="tnum hidden text-right text-xs text-muted sm:block">{total && s.active ? ((s.exam_questions / total) * 100).toFixed(2).replace(".", ",") : "0"}%</span>
            <label className="inline-flex items-center gap-1 text-xs"><input type="checkbox" checked={s.active} onChange={(e) => actions.updateSubject(s.id, { active: e.target.checked })} className="h-4 w-4 accent-[rgb(var(--primary))]" />ativa</label>
          </div>
        ))}
        <div className="flex flex-wrap gap-2 pt-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nova matéria" className="h-10 flex-1" aria-label="Nova matéria" />
          <Input type="number" min={0} value={qn} onChange={(e) => setQn(e.target.value)} className="h-10 w-20" aria-label="Questões" />
          <Button onClick={() => { if (!name.trim()) return; actions.addSubject({ name, exam_questions: Number(qn) || 0 }); setName(""); toast.success("Matéria adicionada"); }}><Plus size={15} /> Adicionar</Button>
        </div>
        <p className="text-xs text-muted">Desativar uma matéria a retira do plano e dos simulados, mas preserva todo o histórico.</p>
      </CardBody>
    </Card>
  );
}
