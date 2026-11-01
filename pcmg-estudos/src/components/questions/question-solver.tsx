"use client";
import { useEffect, useMemo, useState } from "react";
import { Check, X, Star, Flag, NotebookPen, History } from "lucide-react";
import { toast } from "sonner";
import { useApp, useRows, useSubjects } from "@/components/app/context";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/primitives";
import { cn } from "@/components/ui/cn";
import { OPTIONS, type Option, type Question } from "@/lib/types";
import { questionState, questionStats } from "@/lib/domain/analytics";
import { DIFF_LABEL, optionText } from "./labels";

/**
 * Resolução de uma questão. No modo "treino" registra a tentativa e mostra o gabarito na hora.
 * No modo "revisao" (caderno de erros) a nova tentativa é registrada à parte.
 */
export function QuestionSolver({ question, mode = "treino", noteId, onNext, footer }: { question: Question; mode?: "treino" | "revisao"; noteId?: string; onNext?: () => void; footer?: React.ReactNode }) {
  const { actions } = useApp();
  const { byId } = useSubjects();
  const attempts = useRows("question_attempts");
  const [selected, setSelected] = useState<Option | null>(null);
  const [result, setResult] = useState<{ correct: boolean; chosen: Option } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  useEffect(() => { setSelected(null); setResult(null); setShowHistory(false); }, [question.id]);
  const mine = useMemo(() => attempts.filter((a) => a.question_id === question.id), [attempts, question.id]);
  const stats = useMemo(() => questionStats(mine), [mine]);
  const state = useMemo(() => questionState(mine), [mine]);
  const subj = question.subject_id ? byId.get(question.subject_id) : undefined;
  const inNotebook = actions.isInNotebook(question.id);

  const confirm = () => {
    if (!selected) return;
    if (mode === "revisao" && noteId) {
      const r = actions.retryNoteQuestion(noteId, selected);
      setResult({ correct: r.correct, chosen: selected });
    } else {
      const r = actions.answerQuestion(question.id, selected);
      setResult({ correct: r.correct, chosen: selected });
      if (r.noteId) toast("Adicionada automaticamente ao caderno de erros");
    }
  };

  return (
    <Card className="overflow-hidden" data-testid="question-solver">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3 sm:px-5">
        {subj && <Badge style={{ color: subj.color }} className="bg-surface-2">{subj.short_name}</Badge>}
        {question.topic && <Badge tone="outline">{question.topic}</Badge>}
        <Badge tone="outline">{DIFF_LABEL[question.difficulty]}</Badge>
        {question.board && <span className="text-xs text-muted">{question.board}{question.year ? ` · ${question.year}` : ""}</span>}
        <div className="ml-auto flex items-center gap-1">
          <Badge tone={state.cls === "inedita" ? "neutral" : state.cls === "acertada" ? "primary" : "alert"}>{state.label}</Badge>
          <button type="button" onClick={() => actions.toggleFavorite(question.id)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-surface-2" aria-label={question.favorite ? "Remover dos favoritos" : "Favoritar"} aria-pressed={question.favorite}>
            <Star size={16} className={cn(question.favorite && "fill-warn text-warn")} />
          </button>
          <button type="button" onClick={() => actions.toggleNeedsReview(question.id)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-surface-2" aria-label="Marcar para revisar" aria-pressed={question.needs_review}>
            <Flag size={16} className={cn(question.needs_review && "fill-alert text-alert")} />
          </button>
        </div>
      </div>
      <div className="space-y-4 p-4 sm:p-5">
        <p className="whitespace-pre-line text-[15px] leading-relaxed">{question.statement}</p>
        <div className="space-y-2" role="radiogroup" aria-label="Alternativas">
          {OPTIONS.map((o) => {
            const isSel = selected === o;
            const isCorrect = result && o === question.correct_option;
            const isWrongChoice = result && !result.correct && o === result.chosen;
            return (
              <button key={o} type="button" role="radio" aria-checked={isSel} disabled={!!result} onClick={() => setSelected(o)} data-option={o}
                className={cn("flex w-full items-start gap-3 rounded-xl border p-3 text-left text-[15px] transition-colors",
                  !result && (isSel ? "border-primary bg-primary-soft" : "hover:bg-surface-2"),
                  isCorrect && "border-primary bg-primary-soft", isWrongChoice && "border-alert bg-alert-soft")}>
                <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-lg border text-sm font-semibold",
                  (isSel && !result) || isCorrect ? "border-primary bg-primary text-primary-fg" : isWrongChoice ? "border-alert bg-alert text-white" : "")}>
                  {isCorrect ? <Check size={15} /> : isWrongChoice ? <X size={15} /> : o}
                </span>
                <span className="pt-0.5">{optionText(question, o)}</span>
              </button>
            );
          })}
        </div>
        {!result ? (
          <div className="flex flex-wrap gap-2">
            <Button onClick={confirm} disabled={!selected} data-testid="confirm-answer">Confirmar resposta</Button>
            {onNext && <Button variant="ghost" onClick={onNext}>Pular</Button>}
          </div>
        ) : (
          <div className="space-y-3 animate-fade-in" data-testid="answer-feedback">
            <div className={cn("rounded-xl p-3 text-sm font-medium", result.correct ? "bg-primary-soft text-primary" : "bg-alert-soft text-alert")}>
              {result.correct ? "Resposta correta!" : `Resposta incorreta. Gabarito: ${question.correct_option}.`}
              {mode === "revisao" && <span className="block text-xs font-normal opacity-80">Resultado registrado como revisão — o erro original continua no histórico.</span>}
            </div>
            {question.explanation && <div className="rounded-xl border bg-surface-2/60 p-3 text-sm leading-relaxed"><span className="font-medium">Comentário: </span>{question.explanation}</div>}
            <div className="flex flex-wrap gap-2">
              {!result.correct && mode === "treino" && (
                inNotebook ? <Badge tone="primary"><NotebookPen size={12} /> No caderno de erros</Badge>
                  : <Button variant="soft" onClick={() => { actions.addToNotebook(question.id, result.chosen); toast.success("Adicionada ao caderno de erros"); }} data-testid="add-notebook"><NotebookPen size={15} /> Adicionar ao caderno de erros</Button>
              )}
              {onNext && <Button onClick={onNext}>Próxima</Button>}
            </div>
          </div>
        )}
        <div className="border-t pt-3">
          <button type="button" onClick={() => setShowHistory(!showHistory)} className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg">
            <History size={13} /> {stats.attempts} tentativa{stats.attempts === 1 ? "" : "s"} · {stats.correct} acerto{stats.correct === 1 ? "" : "s"} · {stats.wrong} erro{stats.wrong === 1 ? "" : "s"}{stats.pct !== null ? ` · ${stats.pct}%` : ""}{stats.reviewAttempts ? ` · ${stats.reviewAttempts} em revisão` : ""}
          </button>
          {showHistory && stats.history.length > 0 && (
            <ol className="mt-2 space-y-1 text-xs">
              {stats.history.map((h, i) => (
                <li key={i} className="flex items-center gap-2">
                  {h.correct ? <Check size={12} className="text-primary" /> : <X size={12} className="text-alert" />}
                  <span className="tnum text-muted">{new Date(h.at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
                  <span>marcou <b>{h.selected}</b></span>
                  <span className="text-muted">({h.mode === "treino" ? "treino" : h.mode === "simulado" ? "simulado" : "revisão"})</span>
                </li>
              ))}
            </ol>
          )}
        </div>
        {footer}
      </div>
    </Card>
  );
}
