"use client";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useApp, useSubjects } from "@/components/app/context";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/primitives";
import type { Question } from "@/lib/types";

const schema = z.object({
  subject_id: z.string().min(1, "Escolha a matéria"),
  topic: z.string().trim().max(200).optional(),
  statement: z.string().trim().min(10, "Mínimo de 10 caracteres").max(8000),
  option_a: z.string().trim().min(1, "Obrigatória").max(2000), option_b: z.string().trim().min(1, "Obrigatória").max(2000),
  option_c: z.string().trim().min(1, "Obrigatória").max(2000), option_d: z.string().trim().min(1, "Obrigatória").max(2000),
  option_e: z.string().trim().min(1, "Obrigatória").max(2000),
  correct_option: z.enum(["A", "B", "C", "D", "E"]),
  explanation: z.string().trim().max(8000).optional(),
  difficulty: z.enum(["facil", "medio", "dificil"]),
  board: z.string().trim().max(120).optional(),
  year: z.string().trim().refine((v) => !v || (/^\d{4}$/.test(v) && +v >= 1950 && +v <= 2100), "Ano inválido").optional(),
  tags: z.string().trim().max(400).optional(),
});
type Form = z.infer<typeof schema>;

export function QuestionFormDialog({ open, onOpenChange, question }: { open: boolean; onOpenChange: (o: boolean) => void; question?: Question | null }) {
  const { actions } = useApp();
  const { active } = useSubjects();
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema) });
  useEffect(() => {
    if (!open) return;
    reset(question ? {
      subject_id: question.subject_id ?? "", topic: question.topic ?? "", statement: question.statement, option_a: question.option_a, option_b: question.option_b,
      option_c: question.option_c, option_d: question.option_d, option_e: question.option_e, correct_option: question.correct_option, explanation: question.explanation ?? "",
      difficulty: question.difficulty, board: question.board ?? "", year: question.year ? String(question.year) : "", tags: question.tags.join("; "),
    } : { subject_id: "", difficulty: "medio", correct_option: "A", board: "", topic: "", explanation: "", tags: "", year: "" });
  }, [open, question, reset]);
  const submit = (f: Form) => {
    const draft = {
      subject_id: f.subject_id, topic: f.topic || null, statement: f.statement, option_a: f.option_a, option_b: f.option_b, option_c: f.option_c,
      option_d: f.option_d, option_e: f.option_e, correct_option: f.correct_option, explanation: f.explanation || null, difficulty: f.difficulty,
      board: f.board || null, year: f.year ? Number(f.year) : null, tags: (f.tags ?? "").split(/[;,]/).map((t) => t.trim()).filter(Boolean),
    };
    try {
      if (question) { actions.updateQuestion(question.id, draft); toast.success("Questão atualizada"); }
      else { actions.createQuestion(draft); toast.success("Questão cadastrada"); }
      onOpenChange(false);
    } catch (e) { toast.error((e as Error).message); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={question ? "Editar questão" : "Nova questão"} size="lg"
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={handleSubmit(submit)} loading={isSubmitting}>Salvar</Button></>}>
      <form className="space-y-4" onSubmit={handleSubmit(submit)} noValidate>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Matéria" error={errors.subject_id?.message}><Select {...register("subject_id")} aria-label="Matéria"><option value="">Selecione…</option>{active.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <Field label="Assunto" error={errors.topic?.message}><Input {...register("topic")} placeholder="Ex.: Crase" aria-label="Assunto" /></Field>
        </div>
        <Field label="Enunciado" error={errors.statement?.message}><Textarea rows={5} {...register("statement")} aria-label="Enunciado" /></Field>
        {(["a", "b", "c", "d", "e"] as const).map((l) => (
          <Field key={l} label={`Alternativa ${l.toUpperCase()}`} error={errors[`option_${l}`]?.message}><Input {...register(`option_${l}`)} aria-label={`Alternativa ${l.toUpperCase()}`} /></Field>
        ))}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Gabarito"><Select {...register("correct_option")} aria-label="Gabarito">{["A", "B", "C", "D", "E"].map((o) => <option key={o}>{o}</option>)}</Select></Field>
          <Field label="Dificuldade"><Select {...register("difficulty")} aria-label="Dificuldade"><option value="facil">Fácil</option><option value="medio">Médio</option><option value="dificil">Difícil</option></Select></Field>
          <Field label="Ano" error={errors.year?.message}><Input inputMode="numeric" {...register("year")} aria-label="Ano" /></Field>
        </div>
        <Field label="Explicação / comentário"><Textarea {...register("explanation")} aria-label="Explicação" /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Banca de origem" hint="Informe só se a questão realmente veio de uma prova."><Input {...register("board")} aria-label="Banca" /></Field>
          <Field label="Etiquetas" hint="Separe por ponto e vírgula"><Input {...register("tags")} aria-label="Etiquetas" /></Field>
        </div>
      </form>
    </Dialog>
  );
}
