"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, Clapperboard, Link2, ListTree, NotebookPen, Plus, Repeat, Star, Timer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useApp, useRows, useSettings, useSubjects } from "@/components/app/context";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, EmptyState, Field, Input, PageHeader, Progress, Select, Stat, Textarea } from "@/components/ui/primitives";
import { Dialog, useConfirm } from "@/components/ui/dialog";
import { cn } from "@/components/ui/cn";
import { VideoSearchDialog, type VideoTarget } from "@/components/videos/search-dialog";
import { forecast } from "@/lib/monitor/adaptive";
import { topicSimilarity } from "@/lib/monitor/match";
import { fmt, formatDuration } from "@/lib/domain/dates";
import { pct } from "@/lib/domain/stats";
import type { SyllabusTopic, TopicStatus } from "@/lib/types";

const ST: { value: TopicStatus; label: string; short: string }[] = [
  { value: "nao_estudado", label: "Não estudado", short: "—" }, { value: "estudado", label: "Estudado", short: "E" },
  { value: "revisado", label: "Revisado", short: "R" }, { value: "dominado", label: "Dominado", short: "D" },
];

export default function SyllabusPage() {
  const { actions } = useApp();
  const confirm = useConfirm();
  const settings = useSettings()!;
  const topics = useRows("syllabus_topics");
  const sessions = useRows("study_sessions");
  const attempts = useRows("question_attempts");
  const questions = useRows("questions");
  const videos = useRows("video_lessons");
  const plan = useRows("study_plan");
  const { active, byId } = useSubjects();
  const [subject, setSubject] = useState("");
  const [status, setStatus] = useState<"" | TopicStatus>("");
  const [onlyPriority, setOnlyPriority] = useState(false);
  const [showOut, setShowOut] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<SyllabusTopic | null>(null);
  const [link, setLink] = useState<SyllabusTopic | null>(null);
  const [video, setVideo] = useState<VideoTarget | null>(null);
  const [newTopic, setNewTopic] = useState<{ subject_id: string; parent_id: string | null } | null>(null);
  const [form, setForm] = useState({ minutes: "", questions: "", correct: "", notes: "", title: "" });

  const visible = topics.filter((t) => showOut || t.in_current_edital);
  const leaves = useMemo(() => topics.filter((t) => t.in_current_edital && byId.get(t.subject_id)?.active && !topics.some((c) => c.parent_id === t.id && c.in_current_edital)), [topics, byId]);
  const stats = useMemo(() => {
    const secBy = new Map<string, number>(), qBy = new Map<string, [number, number]>(), vBy = new Map<string, [number, number]>();
    for (const s of sessions) if (s.syllabus_topic_id) secBy.set(s.syllabus_topic_id, (secBy.get(s.syllabus_topic_id) ?? 0) + s.total_seconds);
    const qTopic = new Map(questions.filter((q) => q.syllabus_topic_id).map((q) => [q.id, q.syllabus_topic_id!]));
    for (const a of attempts) {
      const t = a.question_id ? qTopic.get(a.question_id) : undefined;
      if (!t || a.mode === "revisao" || !a.selected_option) continue;
      const cur = qBy.get(t) ?? [0, 0]; cur[0]++; if (a.is_correct) cur[1]++; qBy.set(t, cur);
    }
    for (const v of videos) if (v.syllabus_topic_id) { const cur = vBy.get(v.syllabus_topic_id) ?? [0, 0]; cur[0]++; if (v.watched_at) cur[1]++; vBy.set(v.syllabus_topic_id, cur); }
    return { secBy, qBy, vBy };
  }, [sessions, attempts, questions, videos]);
  const topicNums = (t: SyllabusTopic) => {
    const q = stats.qBy.get(t.id) ?? [0, 0];
    const answered = q[0] + t.manual_questions, correct = q[1] + t.manual_correct;
    return { seconds: (stats.secBy.get(t.id) ?? 0) + t.manual_seconds, answered, correct, pct: pct(correct, answered), videos: stats.vBy.get(t.id) ?? [0, 0] };
  };
  const prog = (list: SyllabusTopic[]) => ({
    total: list.length, studied: list.filter((t) => t.status !== "nao_estudado").length,
    revised: list.filter((t) => t.status === "revisado" || t.status === "dominado").length, mastered: list.filter((t) => t.status === "dominado").length,
  });
  const all = prog(leaves);
  const fc = forecast({ today: actions.today(), settings, plan, topics });
  const hardest = leaves.map((t) => ({ t, n: topicNums(t) })).filter((x) => x.n.answered >= 3 && x.n.pct !== null).sort((a, b) => a.n.pct! - b.n.pct!).slice(0, 5);
  const preliminar = topics.some((t) => t.in_current_edital && t.origin === "preliminar");

  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const matches = (t: SyllabusTopic): boolean => {
    const kids = visible.filter((c) => c.parent_id === t.id);
    const self = (!status || t.status === status) && (!onlyPriority || t.priority);
    return self || kids.some(matches);
  };

  const Node = ({ t, depth }: { t: SyllabusTopic; depth: number }) => {
    const kids = visible.filter((c) => c.parent_id === t.id).sort((a, b) => a.sort_order - b.sort_order);
    if (!matches(t)) return null;
    const isOpen = open.has(t.id);
    const n = topicNums(t);
    return (
      <li>
        <div className={cn("group flex flex-wrap items-center gap-2 rounded-xl py-2 pr-2 hover:bg-surface-2/60", !t.in_current_edital && "opacity-55")} style={{ paddingLeft: 8 + depth * 18 }}>
          {kids.length ? <button type="button" onClick={() => toggle(t.id)} aria-expanded={isOpen} aria-label={isOpen ? "Recolher" : "Expandir"} className="grid h-6 w-6 place-items-center rounded-md hover:bg-surface-2"><ChevronDown size={15} className={cn("transition-transform", !isOpen && "-rotate-90")} /></button> : <span className="w-6" />}
          <button type="button" onClick={() => toggle(t.id)} className="min-w-0 flex-1 text-left text-sm">
            <span className={cn(depth === 0 && "font-medium", t.status === "dominado" && "text-primary")}>{t.code ? <span className="tnum mr-1 text-muted">{t.code}</span> : null}{t.title}</span>
            <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
              {t.priority && <Badge tone="alert">prioridade</Badge>}
              {!t.in_current_edital && <Badge>fora do edital</Badge>}
              {n.seconds > 0 && <Badge tone="outline">{formatDuration(n.seconds, { short: true })}</Badge>}
              {n.answered > 0 && <Badge tone={(n.pct ?? 0) >= settings.target_accuracy ? "primary" : (n.pct ?? 0) < 50 ? "alert" : "warn"}>{n.correct}/{n.answered} · {n.pct}%</Badge>}
              {n.videos[0] > 0 && <Badge tone="outline">{n.videos[1]}/{n.videos[0]} vídeos</Badge>}
            </span>
          </button>
          <div className="flex items-center gap-0.5">
            <div className="flex rounded-lg bg-surface-2 p-0.5" role="radiogroup" aria-label={`Status de ${t.title}`}>
              {ST.map((s) => (
                <button key={s.value} type="button" role="radio" aria-checked={t.status === s.value} title={s.label} onClick={() => actions.setTopicStatus(t.id, s.value)}
                  className={cn("h-7 min-w-7 rounded-md px-1.5 text-xs font-semibold", t.status === s.value ? s.value === "dominado" ? "bg-primary text-primary-fg" : "bg-surface text-fg shadow-sm" : "text-muted")}>{s.short}</button>
              ))}
            </div>
            <button type="button" onClick={() => actions.toggleTopicPriority(t.id)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-surface-2" aria-label="Prioridade" aria-pressed={t.priority}><Star size={15} className={cn(t.priority ? "fill-alert text-alert" : "text-muted")} /></button>
            <button type="button" onClick={() => setVideo({ subjectId: t.subject_id, topicId: t.id, topicTitle: t.title })} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2" aria-label="Videoaulas"><Clapperboard size={15} /></button>
            <button type="button" onClick={() => { setDetail(t); setForm({ minutes: "", questions: "", correct: "", notes: t.notes ?? "", title: "" }); }} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2" aria-label="Detalhes e registro"><NotebookPen size={15} /></button>
          </div>
        </div>
        {isOpen && kids.length > 0 && <ul>{kids.map((k) => <Node key={k.id} t={k} depth={depth + 1} />)}</ul>}
      </li>
    );
  };

  const subjects = active.filter((s) => !subject || s.id === subject);
  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader title="Edital verticalizado" description={settings.edital_published ? "Conteúdo programático do edital vigente" : "Estrutura preliminar (não oficial) — será substituída pelo edital quando publicado"} />
      {preliminar && <Card className="p-3 text-sm text-muted">Os conteúdos marcados agora são uma <b>estrutura preliminar</b>, com temas usuais de cada matéria. Quando o edital sair, a Central do Concurso importa o conteúdo oficial e preserva o que você já marcou.</Card>}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Estudado" value={`${Math.round((all.studied / Math.max(1, all.total)) * 100)}%`} hint={<Progress value={all.studied / Math.max(1, all.total)} className="mt-1" />} />
        <Stat label="Revisado" value={`${Math.round((all.revised / Math.max(1, all.total)) * 100)}%`} hint={<Progress value={all.revised / Math.max(1, all.total)} className="mt-1" />} />
        <Stat label="Dominado" value={`${Math.round((all.mastered / Math.max(1, all.total)) * 100)}%`} hint={<Progress value={all.mastered / Math.max(1, all.total)} className="mt-1" />} />
        <Stat label="Pendentes" value={all.total - all.studied} hint={fc.theoryCompletionDate ? `teoria concluída ≈ ${fmt(fc.theoryCompletionDate, "MMM/yy")}` : `de ${all.total} itens`} />
      </section>
      {hardest.length > 0 && <Card className="p-4 text-sm"><p className="mb-1 font-medium">Conteúdos com maior dificuldade</p>{hardest.map(({ t, n }) => <p key={t.id} className="text-muted">• {byId.get(t.subject_id)?.short_name}: {t.title} — <span className="text-alert">{n.pct}%</span> ({n.correct}/{n.answered})</p>)}</Card>}

      <div className="flex flex-wrap items-center gap-2">
        <Select value={subject} onChange={(e) => setSubject(e.target.value)} className="w-auto min-w-[180px]" aria-label="Matéria"><option value="">Todas as matérias</option>{active.map((s) => <option key={s.id} value={s.id}>{s.short_name}</option>)}</Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value as TopicStatus | "")} className="w-auto" aria-label="Status"><option value="">Qualquer status</option>{ST.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</Select>
        <label className="inline-flex items-center gap-1.5 text-sm"><input type="checkbox" checked={onlyPriority} onChange={(e) => setOnlyPriority(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--primary))]" /> Só prioridades</label>
        <label className="inline-flex items-center gap-1.5 text-sm"><input type="checkbox" checked={showOut} onChange={(e) => setShowOut(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--primary))]" /> Mostrar itens fora do edital</label>
        <span className="text-xs text-muted">Legenda: — não estudado · E estudado · R revisado · D dominado</span>
      </div>

      {subjects.map((s) => {
        const roots = visible.filter((t) => t.subject_id === s.id && !t.parent_id).sort((a, b) => a.sort_order - b.sort_order);
        const p = prog(leaves.filter((t) => t.subject_id === s.id));
        return (
          <Card key={s.id}>
            <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3 sm:px-5">
              <span className="h-3 w-3 rounded-full" style={{ background: s.color }} />
              <span className="flex-1 font-semibold">{s.name}</span>
              <span className="tnum text-xs text-muted">{p.studied}/{p.total} estudados · {p.mastered} dominados</span>
              <div className="w-full sm:w-40"><Progress value={p.studied / Math.max(1, p.total)} label={`Progresso de ${s.name}`} /></div>
              <Button size="sm" variant="ghost" onClick={() => { setNewTopic({ subject_id: s.id, parent_id: null }); setForm({ ...form, title: "" }); }} aria-label="Adicionar tema"><Plus size={15} /></Button>
            </div>
            <CardBody className="px-1 py-2 sm:px-2">
              {roots.length === 0 ? <EmptyState icon={<ListTree size={18} />} title="Sem conteúdos" description="Adicione temas manualmente ou aguarde o edital." /> : <ul>{roots.map((t) => <Node key={t.id} t={t} depth={0} />)}</ul>}
            </CardBody>
          </Card>
        );
      })}

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)} title={detail?.title ?? ""} description={detail ? byId.get(detail.subject_id)?.name : undefined}
        footer={detail && <Button onClick={() => {
          const m = Number(form.minutes || 0), q = Number(form.questions || 0), c = Number(form.correct || 0);
          if (c > q) { toast.error("Acertos maiores que questões"); return; }
          if (m || q) actions.addTopicStudy(detail.id, { minutes: m, questions: q, correct: c });
          if ((form.notes || null) !== detail.notes) actions.updateTopic(detail.id, { notes: form.notes || null });
          toast.success("Registro salvo"); setDetail(null);
        }}>Salvar</Button>}>
        {detail && (() => {
          const n = topicNums(detail);
          return (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2 rounded-xl bg-surface-2 p-3 text-center text-sm">
                <div><div className="text-xs text-muted">Horas</div><div className="tnum font-semibold">{formatDuration(n.seconds, { short: true })}</div></div>
                <div><div className="text-xs text-muted">Questões</div><div className="tnum font-semibold">{n.correct}/{n.answered}</div></div>
                <div><div className="text-xs text-muted">Acertos</div><div className="tnum font-semibold">{n.pct === null ? "—" : `${n.pct}%`}</div></div>
              </div>
              <p className="text-xs text-muted">Assistir videoaulas não conta como domínio: o status “Dominado” deve refletir questões e revisões.</p>
              <div>
                <p className="mb-2 text-sm font-medium">Registrar estudo deste conteúdo</p>
                <div className="grid grid-cols-3 gap-2">
                  <Input type="number" min={0} placeholder="Minutos" value={form.minutes} onChange={(e) => setForm({ ...form, minutes: e.target.value })} aria-label="Minutos" />
                  <Input type="number" min={0} placeholder="Questões" value={form.questions} onChange={(e) => setForm({ ...form, questions: e.target.value })} aria-label="Questões" />
                  <Input type="number" min={0} placeholder="Acertos" value={form.correct} onChange={(e) => setForm({ ...form, correct: e.target.value })} aria-label="Acertos" />
                </div>
              </div>
              <Field label="Anotações"><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} aria-label="Anotações" /></Field>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => { const r = actions.createTopicReviews(detail.id); toast.success(r.length ? `${r.length} revisões agendadas` : "Revisões já existiam para hoje"); }}><Repeat size={14} /> Criar revisões (D+1/7/30)</Button>
                <Button size="sm" variant="outline" onClick={() => { setLink(detail); setDetail(null); }}><Link2 size={14} /> Vincular questões</Button>
                <Link href="/"><Button size="sm" variant="ghost"><Timer size={14} /> Estudar agora</Button></Link>
                <Button size="sm" variant="ghost" onClick={() => { setNewTopic({ subject_id: detail.subject_id, parent_id: detail.id }); setDetail(null); setForm({ ...form, title: "" }); }}><Plus size={14} /> Subtópico</Button>
                {detail.origin === "manual" && <Button size="sm" variant="ghost" onClick={async () => { if (await confirm({ title: "Excluir conteúdo?", description: "Subtópicos também serão excluídos. Sessões e questões vinculadas são preservadas.", confirmLabel: "Excluir", danger: true })) { actions.deleteTopic(detail.id); setDetail(null); } }}><Trash2 size={14} /> Excluir</Button>}
              </div>
            </div>
          );
        })()}
      </Dialog>

      <Dialog open={!!link} onOpenChange={(o) => !o && setLink(null)} title="Vincular questões" description={link?.title}>
        {link && (() => {
          const list = questions.filter((q) => q.subject_id === link.subject_id)
            .map((q) => ({ q, s: q.syllabus_topic_id === link.id ? 2 : topicSimilarity(link.title, `${q.topic ?? ""}`) }))
            .sort((a, b) => b.s - a.s);
          return list.length === 0 ? <p className="text-sm text-muted">Nenhuma questão desta matéria no banco.</p> : (
            <ul className="divide-y">{list.slice(0, 60).map(({ q }) => (
              <li key={q.id} className="flex items-start gap-3 py-2">
                <input type="checkbox" className="mt-1 h-4 w-4 accent-[rgb(var(--primary))]" checked={q.syllabus_topic_id === link.id} onChange={(e) => actions.linkQuestionToTopic(q.id, e.target.checked ? link.id : null)} aria-label="Vincular" />
                <span className="text-sm"><span className="text-xs text-muted">{q.topic ?? "Sem assunto"} · </span>{q.statement.slice(0, 160)}</span>
              </li>
            ))}</ul>
          );
        })()}
      </Dialog>

      <Dialog open={!!newTopic} onOpenChange={(o) => !o && setNewTopic(null)} title="Novo conteúdo" size="sm"
        footer={<Button disabled={!form.title.trim()} onClick={() => { actions.addTopic({ ...newTopic!, title: form.title }); setNewTopic(null); toast.success("Conteúdo adicionado"); }}>Adicionar</Button>}>
        <Field label="Título"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus aria-label="Título" /></Field>
      </Dialog>

      <VideoSearchDialog target={video} onClose={() => setVideo(null)} />
    </div>
  );
}
