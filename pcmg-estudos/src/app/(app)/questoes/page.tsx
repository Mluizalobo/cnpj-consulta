"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, Pencil, Play, Plus, Search, Star, Trash2, Upload, Library, Shuffle } from "lucide-react";
import { toast } from "sonner";
import { useApp, useRows, useSubjects } from "@/components/app/context";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, Input, PageHeader, Select } from "@/components/ui/primitives";
import { useConfirm } from "@/components/ui/dialog";
import { cn } from "@/components/ui/cn";
import { QuestionSolver } from "@/components/questions/question-solver";
import { QuestionFormDialog } from "@/components/questions/question-form";
import { DIFF_LABEL } from "@/components/questions/labels";
import { bankStateSummary, groupByQuestion, questionState, questionStats } from "@/lib/domain/analytics";
import { normalizeText } from "@/lib/domain/text";
import { shuffle } from "@/lib/domain/mock";
import type { Question } from "@/lib/types";

type StatusFilter = "todas" | "ineditas" | "respondidas" | "acertadas" | "erradas" | "revisadas" | "favoritas" | "revisar";
const STATUS: { value: StatusFilter; label: string }[] = [
  { value: "todas", label: "Todas" }, { value: "ineditas", label: "Não respondidas (inéditas)" }, { value: "respondidas", label: "Já resolvidas" },
  { value: "acertadas", label: "Acertadas" }, { value: "erradas", label: "Erradas" }, { value: "revisadas", label: "Revisadas no caderno" },
  { value: "favoritas", label: "Favoritas" }, { value: "revisar", label: "Marcadas para revisar" },
];

export default function QuestionsPage() {
  const { actions } = useApp();
  const confirm = useConfirm();
  const questions = useRows("questions");
  const attempts = useRows("question_attempts");
  const { all, byId } = useSubjects();
  const [subject, setSubject] = useState("");
  const [status, setStatus] = useState<StatusFilter>("todas");
  const [difficulty, setDifficulty] = useState("");
  const [board, setBoard] = useState("");
  const [topic, setTopic] = useState("");
  const [q, setQ] = useState("");
  const [practice, setPractice] = useState<string[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [form, setForm] = useState<{ open: boolean; q?: Question | null }>({ open: false });
  const [limit, setLimit] = useState(30);

  const byQ = useMemo(() => groupByQuestion(attempts), [attempts]);
  const boards = useMemo(() => [...new Set(questions.map((x) => x.board).filter(Boolean))].sort() as string[], [questions]);
  const topics = useMemo(() => [...new Set(questions.filter((x) => !subject || x.subject_id === subject).map((x) => x.topic).filter(Boolean))].sort() as string[], [questions, subject]);
  const filtered = useMemo(() => {
    const nq = normalizeText(q);
    return questions.filter((x) => {
      if (subject && x.subject_id !== subject) return false;
      if (difficulty && x.difficulty !== difficulty) return false;
      if (board && x.board !== board) return false;
      if (topic && x.topic !== topic) return false;
      if (nq && !normalizeText(`${x.statement} ${x.topic ?? ""} ${x.tags.join(" ")}`).includes(nq)) return false;
      const st = questionState(byQ.get(x.id) ?? []);
      switch (status) {
        case "ineditas": return st.cls === "inedita";
        case "respondidas": return st.answered;
        case "acertadas": return st.cls === "acertada";
        case "erradas": return st.cls === "errada";
        case "revisadas": return st.revised;
        case "favoritas": return x.favorite;
        case "revisar": return x.needs_review;
        default: return true;
      }
    }).sort((a, b) => (byId.get(a.subject_id ?? "")?.sort_order ?? 99) - (byId.get(b.subject_id ?? "")?.sort_order ?? 99) || a.created_at.localeCompare(b.created_at));
  }, [questions, subject, difficulty, board, topic, q, status, byQ, byId]);
  const summary = useMemo(() => bankStateSummary(questions, attempts), [questions, attempts]);

  const startPractice = (random: boolean) => {
    if (!filtered.length) return;
    setPractice(random ? shuffle(filtered.map((x) => x.id)) : filtered.map((x) => x.id));
    setIdx(0);
    window.scrollTo({ top: 0 });
  };

  if (practice) {
    const current = questions.find((x) => x.id === practice[idx]);
    const next = () => (idx + 1 < practice.length ? setIdx(idx + 1) : (toast.success("Fim da lista! Bom trabalho."), setPractice(null)));
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={() => setPractice(null)}><ArrowLeft size={16} /> Voltar à lista</Button>
          <span className="tnum text-sm text-muted">Questão {idx + 1} de {practice.length}</span>
        </div>
        {current ? <QuestionSolver question={current} onNext={next} /> : <EmptyState title="Questão removida" action={<Button onClick={next}>Próxima</Button>} />}
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader title="Questões" description={`${questions.length} no banco · ${summary.inedita} inéditas · ${summary.acertada} acertadas · ${summary.errada} erradas · ${summary.revisada} revisadas`}
        action={<>
          <Link href="/questoes/importar"><Button variant="outline" size="sm"><Upload size={15} /> Importar</Button></Link>
          <Button size="sm" onClick={() => setForm({ open: true, q: null })}><Plus size={15} /> Nova</Button>
        </>} />

      <Card className="space-y-3 p-3 sm:p-4">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar no enunciado, assunto ou etiqueta" className="pl-9" aria-label="Buscar" />
        </div>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          <Select value={subject} onChange={(e) => { setSubject(e.target.value); setTopic(""); }} aria-label="Matéria"><option value="">Todas as matérias</option>{all.map((s) => <option key={s.id} value={s.id}>{s.short_name}{s.active ? "" : " (inativa)"}</option>)}</Select>
          <Select value={topic} onChange={(e) => setTopic(e.target.value)} aria-label="Assunto"><option value="">Todos os assuntos</option>{topics.map((t) => <option key={t}>{t}</option>)}</Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} aria-label="Situação">{STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</Select>
          <Select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} aria-label="Dificuldade"><option value="">Qualquer dificuldade</option><option value="facil">Fácil</option><option value="medio">Médio</option><option value="dificil">Difícil</option></Select>
          <Select value={board} onChange={(e) => setBoard(e.target.value)} aria-label="Banca" className="col-span-2 lg:col-span-1"><option value="">Todas as bancas</option>{boards.map((b) => <option key={b}>{b}</option>)}</Select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => startPractice(false)} disabled={!filtered.length} data-testid="start-practice"><Play size={15} /> Resolver {filtered.length} questões</Button>
          <Button variant="outline" onClick={() => startPractice(true)} disabled={!filtered.length}><Shuffle size={15} /> Ordem aleatória</Button>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card><EmptyState icon={<Library size={20} />} title="Nenhuma questão com esses filtros" description="Ajuste os filtros, cadastre uma questão ou importe um arquivo CSV/JSON." /></Card>
      ) : (
        <Card className="divide-y">
          {filtered.slice(0, limit).map((x) => {
            const st = questionState(byQ.get(x.id) ?? []);
            const s = questionStats(byQ.get(x.id) ?? []);
            const subj = x.subject_id ? byId.get(x.subject_id) : undefined;
            return (
              <div key={x.id} className="flex items-start gap-3 p-3 sm:p-4" data-testid="question-row">
                <span className="mt-1 h-8 w-1 shrink-0 rounded-full" style={{ background: subj?.color ?? "rgb(var(--muted))" }} />
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => { setPractice([x.id]); setIdx(0); }}>
                  <p className="line-clamp-2 text-sm">{x.statement}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    <span>{subj?.short_name ?? "Sem matéria"}</span>{x.topic && <><span>·</span><span>{x.topic}</span></>}<span>·</span><span>{DIFF_LABEL[x.difficulty]}</span>
                    <Badge tone={st.cls === "inedita" ? "neutral" : st.cls === "acertada" ? "primary" : "alert"}>{st.label}</Badge>
                    {s.attempts > 0 && <span className="tnum">{s.correct}/{s.attempts} acertos</span>}
                    {x.tags.filter((t) => t !== "autoral").slice(0, 2).map((t) => <Badge key={t} tone="outline">{t}</Badge>)}
                  </div>
                </button>
                <div className="flex shrink-0 items-center">
                  <button type="button" onClick={() => actions.toggleFavorite(x.id)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-surface-2" aria-label="Favoritar"><Star size={15} className={cn(x.favorite ? "fill-warn text-warn" : "text-muted")} /></button>
                  <button type="button" onClick={() => setForm({ open: true, q: x })} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2" aria-label="Editar"><Pencil size={15} /></button>
                  <button type="button" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2" aria-label="Excluir"
                    onClick={async () => { if (await confirm({ title: "Excluir questão?", description: "O histórico de respostas e o caderno de erros são preservados.", confirmLabel: "Excluir", danger: true })) { actions.deleteQuestion(x.id); toast("Questão excluída"); } }}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })}
          {filtered.length > limit && <div className="p-3 text-center"><Button variant="ghost" onClick={() => setLimit(limit + 50)}>Mostrar mais ({filtered.length - limit})</Button></div>}
        </Card>
      )}
      <QuestionFormDialog open={form.open} onOpenChange={(o) => setForm({ open: o, q: form.q })} question={form.q} />
    </div>
  );
}
