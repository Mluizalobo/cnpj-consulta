"use client";
import { useMemo, useState } from "react";
import { BookCheck, Eye, NotebookPen, Pencil, Plus, Repeat, Target, Trash2, Trophy } from "lucide-react";
import { toast } from "sonner";
import { useApp, useRows, useSubjects, useTable } from "@/components/app/context";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, EmptyState, Field, Input, PageHeader, Segmented, Select, Stat, Textarea } from "@/components/ui/primitives";
import { Dialog, useConfirm } from "@/components/ui/dialog";
import { QuestionSolver } from "@/components/questions/question-solver";
import { attentionPoints } from "@/lib/domain/stats";
import { repeatedErrors } from "@/lib/domain/analytics";
import type { ErrorNote, NoteStatus } from "@/lib/types";

const STATUS_LABEL: Record<NoteStatus, string> = { pendente: "Pendente", revisando: "Revisando", dominado: "Dominado" };

export default function NotebookPage() {
  const { actions } = useApp();
  const confirm = useConfirm();
  const notes = useRows("error_notebook");
  const attempts = useRows("question_attempts");
  const questions = useTable("questions");
  const { all, active, byId } = useSubjects();
  const [subject, setSubject] = useState("");
  const [status, setStatus] = useState<"" | NoteStatus>("");
  const [order, setOrder] = useState<"recentes" | "antigos" | "recorrentes">("recentes");
  const [retry, setRetry] = useState<ErrorNote | null>(null);
  const [edit, setEdit] = useState<Partial<ErrorNote> | null>(null);
  const today = actions.today();

  const points = useMemo(() => attentionPoints(attempts, notes, today), [attempts, notes, today]);
  const repeated = useMemo(() => new Map(repeatedErrors(attempts).map((r) => [r.questionId, r.errors])), [attempts]);
  const list = useMemo(() => notes
    .filter((n) => (!subject || n.subject_id === subject) && (!status || n.status === status))
    .sort((a, b) => order === "recorrentes" ? (Math.max(b.occurrences, repeated.get(b.question_id ?? "") ?? 0) - Math.max(a.occurrences, repeated.get(a.question_id ?? "") ?? 0)) || b.last_error_at.localeCompare(a.last_error_at)
      : order === "antigos" ? a.error_date.localeCompare(b.error_date) : b.last_error_at.localeCompare(a.last_error_at)),
  [notes, subject, status, order, repeated]);
  const counts = { pendente: notes.filter((n) => n.status === "pendente").length, revisando: notes.filter((n) => n.status === "revisando").length, dominado: notes.filter((n) => n.status === "dominado").length };
  const totalReviews = notes.reduce((s, n) => s + n.review_count, 0);

  const saveEdit = () => {
    if (!edit) return;
    if (!edit.subject_id || !(edit.statement ?? "").trim()) { toast.error("Informe a matéria e o conteúdo do erro"); return; }
    if (edit.id) actions.updateNote(edit.id, edit);
    else actions.createManualNote({ subject_id: edit.subject_id, topic: edit.topic ?? null, statement: edit.statement ?? null, my_answer: edit.my_answer ?? null, correct_answer: edit.correct_answer ?? null, explanation: edit.explanation ?? null, personal_note: edit.personal_note ?? null });
    toast.success("Anotação salva"); setEdit(null);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader title="Caderno de erros" description="Transforme cada erro em aprendizado" action={<Button size="sm" onClick={() => setEdit({ subject_id: "" })}><Plus size={15} /> Anotação manual</Button>} />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Pendentes" icon={<NotebookPen size={14} />} value={counts.pendente} />
        <Stat label="Revisando" icon={<Repeat size={14} />} value={counts.revisando} />
        <Stat label="Dominados" icon={<Trophy size={14} />} value={counts.dominado} />
        <Stat label="Revisões feitas" icon={<BookCheck size={14} />} value={totalReviews} />
      </section>

      <Card>
        <CardHeader title="Meus pontos de atenção" description="Assuntos com mais erros recentes (60 dias) e anotações em aberto" />
        <CardBody>
          {points.length === 0 ? <p className="text-sm text-muted">Sem pontos de atenção por enquanto. Resolva questões para alimentar esta análise.</p> : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {points.map((p) => (
                <li key={`${p.subjectId}:${p.topic}`} className="flex items-center gap-3 rounded-xl border p-3">
                  <Target size={16} className="shrink-0 text-alert" />
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{p.topic}</div><div className="text-xs text-muted">{byId.get(p.subjectId ?? "")?.short_name ?? "—"}</div></div>
                  <div className="text-right text-xs"><div className="tnum font-semibold text-alert">{p.errors} erro{p.errors === 1 ? "" : "s"}</div>{p.pct !== null && <div className="tnum text-muted">{p.pct}% acertos</div>}</div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={subject} onChange={(e) => setSubject(e.target.value)} className="w-auto min-w-[160px]" aria-label="Matéria"><option value="">Todas as matérias</option>{all.map((s) => <option key={s.id} value={s.id}>{s.short_name}</option>)}</Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value as NoteStatus | "")} className="w-auto" aria-label="Situação"><option value="">Todas</option><option value="pendente">Pendentes</option><option value="revisando">Revisando</option><option value="dominado">Dominados</option></Select>
        <Segmented size="sm" value={order} onChange={setOrder} options={[{ value: "recentes", label: "Recentes" }, { value: "antigos", label: "Antigos" }, { value: "recorrentes", label: "Recorrentes" }]} />
      </div>

      {list.length === 0 ? <Card><EmptyState icon={<NotebookPen size={20} />} title="Nenhum erro anotado" description="Ao errar uma questão, toque em “Adicionar ao caderno de erros”." /></Card> : (
        <div className="space-y-3">
          {list.map((n) => {
            const subj = byId.get(n.subject_id ?? "");
            const recurrent = Math.max(n.occurrences, repeated.get(n.question_id ?? "") ?? 0);
            return (
              <Card key={n.id} className="p-4" data-testid="note-item">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: subj?.color }} />
                  <span className="text-sm font-medium">{subj?.short_name ?? "—"}</span>
                  {n.topic && <Badge tone="outline">{n.topic}</Badge>}
                  <Badge tone={n.status === "dominado" ? "primary" : n.status === "revisando" ? "warn" : "alert"}>{STATUS_LABEL[n.status]}</Badge>
                  {recurrent >= 2 && <Badge tone="alert">errou {recurrent}×</Badge>}
                  <span className="ml-auto text-xs text-muted">{new Date(n.error_date + "T12:00").toLocaleDateString("pt-BR")}</span>
                </div>
                {n.statement && <p className="mt-2 line-clamp-3 text-sm">{n.statement}</p>}
                <div className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                  {n.my_answer && <p><span className="text-muted">Minha resposta:</span> <span className="text-alert">{n.my_answer}</span></p>}
                  {n.correct_answer && <p><span className="text-muted">Correta:</span> <span className="text-primary">{n.correct_answer}</span></p>}
                </div>
                {n.explanation && <p className="mt-2 rounded-lg bg-surface-2 p-2 text-sm">{n.explanation}</p>}
                {n.personal_note && <p className="mt-2 border-l-2 border-primary pl-2 text-sm italic">{n.personal_note}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {n.question_id && questions[n.question_id] && <Button size="sm" onClick={() => setRetry(n)} data-testid="retry-note"><Eye size={14} /> Refazer questão</Button>}
                  <Button size="sm" variant="outline" onClick={() => { actions.reviewNote(n.id); toast.success("Revisão registrada"); }}><Repeat size={14} /> Revisei</Button>
                  {n.status !== "dominado" ? <Button size="sm" variant="soft" onClick={() => actions.setNoteStatus(n.id, "dominado")}><Trophy size={14} /> Dominei</Button>
                    : <Button size="sm" variant="ghost" onClick={() => actions.setNoteStatus(n.id, "revisando")}>Voltar a revisar</Button>}
                  <span className="text-xs text-muted">{n.review_count} revis{n.review_count === 1 ? "ão" : "ões"}{n.last_reviewed_at ? ` · última em ${new Date(n.last_reviewed_at).toLocaleDateString("pt-BR")}` : ""}</span>
                  <div className="ml-auto flex">
                    <button type="button" aria-label="Editar anotação" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2" onClick={() => setEdit(n)}><Pencil size={15} /></button>
                    <button type="button" aria-label="Excluir anotação" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2" onClick={async () => { if (await confirm({ title: "Excluir anotação?", description: "O histórico de respostas da questão é preservado.", confirmLabel: "Excluir", danger: true })) actions.deleteNote(n.id); }}><Trash2 size={15} /></button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!retry} onOpenChange={(o) => !o && setRetry(null)} title="Refazer questão" description="Responda antes de ver o gabarito. O resultado fica registrado como revisão." size="lg">
        {retry?.question_id && questions[retry.question_id] && <QuestionSolver question={questions[retry.question_id]} mode="revisao" noteId={retry.id} />}
      </Dialog>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)} title={edit?.id ? "Editar anotação" : "Nova anotação"}
        footer={<><Button variant="outline" onClick={() => setEdit(null)}>Cancelar</Button><Button onClick={saveEdit}>Salvar</Button></>}>
        {edit && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Matéria"><Select value={edit.subject_id ?? ""} onChange={(e) => setEdit({ ...edit, subject_id: e.target.value })} aria-label="Matéria"><option value="">Selecione…</option>{active.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
              <Field label="Assunto"><Input value={edit.topic ?? ""} onChange={(e) => setEdit({ ...edit, topic: e.target.value })} aria-label="Assunto" /></Field>
            </div>
            <Field label="Questão / conteúdo do erro"><Textarea value={edit.statement ?? ""} onChange={(e) => setEdit({ ...edit, statement: e.target.value })} aria-label="Questão" /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Minha resposta"><Input value={edit.my_answer ?? ""} onChange={(e) => setEdit({ ...edit, my_answer: e.target.value })} aria-label="Minha resposta" /></Field>
              <Field label="Resposta correta"><Input value={edit.correct_answer ?? ""} onChange={(e) => setEdit({ ...edit, correct_answer: e.target.value })} aria-label="Resposta correta" /></Field>
            </div>
            <Field label="Explicação"><Textarea value={edit.explanation ?? ""} onChange={(e) => setEdit({ ...edit, explanation: e.target.value })} aria-label="Explicação" /></Field>
            <Field label="Minha anotação pessoal"><Textarea value={edit.personal_note ?? ""} onChange={(e) => setEdit({ ...edit, personal_note: e.target.value })} aria-label="Anotação pessoal" /></Field>
          </div>
        )}
      </Dialog>
    </div>
  );
}
