"use client";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Clapperboard, RefreshCw, Search, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { useApp, useRows, useSubjects } from "@/components/app/context";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Segmented, Select } from "@/components/ui/primitives";
import { useConfirm } from "@/components/ui/dialog";
import { cn } from "@/components/ui/cn";
import { VideoCard } from "@/components/videos/video-card";
import { PlayerDialog } from "@/components/videos/player-dialog";
import { VideoSearchDialog, type VideoTarget } from "@/components/videos/search-dialog";
import { AddLinkForm } from "@/components/videos/add-link";
import { useVideoAutoSearch } from "@/components/videos/auto-search";
import type { VideoLesson } from "@/lib/types";

type Tab = "materia" | "minhas" | "historico";
const toCard = (v: VideoLesson) => ({ youtubeId: v.youtube_id, url: v.url, title: v.title, channelTitle: v.channel_title, thumbnail: v.thumbnail_url, durationSeconds: v.duration_seconds, publishedAt: v.published_at });

export default function VideosPage() {
  const { actions } = useApp();
  const confirm = useConfirm();
  const { active, byId } = useSubjects();
  const videos = useRows("video_lessons");
  const topics = useRows("syllabus_topics");
  const cache = useRows("video_search_cache");
  const autoSearch = useVideoAutoSearch();
  const [tab, setTab] = useState<Tab>("materia");
  const [subject, setSubject] = useState("");
  const [filter, setFilter] = useState<"todas" | "favoritas" | "depois" | "assistidas">("todas");
  const [target, setTarget] = useState<VideoTarget | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [auto, setAuto] = useState<string | null>(null);
  const [apiOn, setApiOn] = useState<boolean | null>(null);
  useEffect(() => { fetch("/api/videos/status").then((r) => r.json()).then((j) => setApiOn(!!j.search)).catch(() => setApiOn(null)); }, []);
  useEffect(() => { if (!subject && active[0]) setSubject(active[0].id); }, [active, subject]);

  const subjTopics = useMemo(() => topics.filter((t) => t.subject_id === subject && t.in_current_edital).sort((a, b) => a.level - b.level || a.sort_order - b.sort_order), [topics, subject]);
  const roots = subjTopics.filter((t) => !t.parent_id);
  const children = (id: string) => subjTopics.filter((t) => t.parent_id === id).sort((a, b) => a.sort_order - b.sort_order);
  const cacheByTopic = useMemo(() => { const m = new Map<string, (typeof cache)[number]>(); for (const c of cache) if (c.syllabus_topic_id) m.set(c.syllabus_topic_id, c); return m; }, [cache]);
  const videosByTopic = useMemo(() => { const m = new Map<string, VideoLesson[]>(); for (const v of videos) if (v.syllabus_topic_id) m.set(v.syllabus_topic_id, [...(m.get(v.syllabus_topic_id) ?? []), v]); return m; }, [videos]);
  const leavesAll = topics.filter((t) => t.in_current_edital && byId.get(t.subject_id)?.active && !topics.some((c) => c.parent_id === t.id));
  const noVideos = leavesAll.filter((t) => !videosByTopic.has(t.id) && cacheByTopic.has(t.id) && cacheByTopic.get(t.id)!.results.length === 0);
  const notSearched = leavesAll.filter((t) => !videosByTopic.has(t.id) && !cacheByTopic.has(t.id)).length;

  const mine = videos.filter((v) => (!subject || tab !== "minhas" || v.subject_id === subject || subject === "__all") && (filter === "todas" || (filter === "favoritas" ? v.favorite : filter === "depois" ? v.watch_later : !!v.watched_at)))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const history = videos.filter((v) => v.last_opened_at).sort((a, b) => (b.last_opened_at ?? "").localeCompare(a.last_opened_at ?? ""));

  const runAuto = async () => {
    setAuto("Buscando videoaulas para conteúdos sem recomendação…");
    const r = await autoSearch(10);
    setAuto(null);
    if (r.error) toast.error(r.error); else toast.success(`${r.searched} conteúdos pesquisados${r.empty.length ? ` · ${r.empty.length} sem videoaulas adequadas` : ""}`);
  };

  const TopicRow = ({ id, depth }: { id: string; depth: number }) => {
    const t = subjTopics.find((x) => x.id === id)!;
    const kids = children(id);
    const mineT = videosByTopic.get(id) ?? [];
    const rec = cacheByTopic.get(id);
    const expanded = open === id;
    return (
      <li>
        <div className={cn("flex items-center gap-2 py-2", depth && "pl-4")} style={{ paddingLeft: depth * 16 }}>
          <button type="button" onClick={() => setOpen(expanded ? null : id)} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={expanded}>
            <ChevronDown size={14} className={cn("shrink-0 text-muted transition-transform", !expanded && "-rotate-90")} />
            <span className={cn("truncate text-sm", depth === 0 && "font-medium")}>{t.code ? `${t.code} ` : ""}{t.title}</span>
          </button>
          {mineT.length > 0 && <Badge tone="primary">{mineT.filter((v) => v.watched_at).length}/{mineT.length} assistidas</Badge>}
          {rec && rec.results.length === 0 && !mineT.length && <Badge tone="warn">sem videoaulas</Badge>}
          <Button size="sm" variant="ghost" onClick={() => setTarget({ subjectId: t.subject_id, topicId: t.id, topicTitle: t.title })} aria-label={`Buscar videoaulas: ${t.title}`}><Search size={14} /></Button>
        </div>
        {expanded && (
          <div className="mb-2 space-y-3 rounded-xl bg-surface-2/60 p-3" style={{ marginLeft: depth * 16 + 8 }}>
            {mineT.map((v) => <VideoCard key={v.id} compact v={toCard(v)} onPlay={() => setPlaying(v.id)} saved watched={!!v.watched_at} favorite={v.favorite} onFavorite={() => actions.toggleVideoFavorite(v.id)} />)}
            {rec?.results.filter((r) => !mineT.some((m) => m.youtube_id === r.youtubeId)).slice(0, 3).map((r) => (
              <VideoCard key={r.youtubeId} compact v={r} onPlay={() => setPlaying(actions.saveVideo(r, { subjectId: t.subject_id, topicId: t.id }).id)} />
            ))}
            {!mineT.length && !rec && <p className="text-xs text-muted">Ainda não pesquisado. Toque na lupa para buscar.</p>}
          </div>
        )}
        {kids.length > 0 && <ul>{kids.map((k) => <TopicRow key={k.id} id={k.id} depth={depth + 1} />)}</ul>}
      </li>
    );
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader title="Videoaulas" description="Matéria → tema → subtema → videoaulas, ligadas ao edital vigente" />
      {apiOn === false && <Card className="flex gap-3 border-warn/40 p-4 text-sm"><TriangleAlert size={17} className="shrink-0 text-warn" /><div>A busca automática está desligada (falta configurar a chave gratuita da API do YouTube no servidor — veja o README, seção Videoaulas). Você ainda pode abrir a busca no YouTube e colar o link da aula: o app preenche título, canal e miniatura.</div></Card>}
      <Segmented value={tab} onChange={setTab} options={[{ value: "materia", label: "Por matéria" }, { value: "minhas", label: `Minhas (${videos.length})` }, { value: "historico", label: "Histórico" }]} />

      {tab === "materia" && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={subject} onChange={(e) => setSubject(e.target.value)} className="w-auto min-w-[200px]" aria-label="Matéria">{active.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
            <Button variant="outline" size="sm" onClick={() => subject && setTarget({ subjectId: subject })}><Search size={14} /> Buscar na matéria</Button>
            <Button variant="outline" size="sm" onClick={runAuto} loading={!!auto} disabled={apiOn === false}><RefreshCw size={14} /> Atualizar recomendações</Button>
          </div>
          {auto && <p className="text-sm text-muted">{auto}</p>}
          <Card>
            <CardHeader title={byId.get(subject)?.name ?? ""} description={`${notSearched} conteúdo(s) do edital ainda sem pesquisa de videoaulas`} />
            <CardBody className="pt-2">
              {roots.length === 0 ? <EmptyState icon={<Clapperboard size={20} />} title="Sem conteúdos cadastrados" description="Os conteúdos vêm do Edital verticalizado." /> : <ul className="divide-y">{roots.map((r) => <TopicRow key={r.id} id={r.id} depth={0} />)}</ul>}
            </CardBody>
          </Card>
          {noVideos.length > 0 && (
            <Card>
              <CardHeader title="Conteúdos sem videoaulas encontradas" description="Tente outros termos ou cole links de aulas que você conhece." />
              <CardBody><ul className="space-y-1.5 text-sm">{noVideos.map((t) => (
                <li key={t.id} className="flex items-center gap-2"><span className="flex-1">{byId.get(t.subject_id)?.short_name} · {t.title}</span><Button size="sm" variant="ghost" onClick={() => setTarget({ subjectId: t.subject_id, topicId: t.id, topicTitle: t.title })}>Buscar alternativas</Button></li>
              ))}</ul></CardBody>
            </Card>
          )}
        </>
      )}

      {tab === "minhas" && (
        <>
          <AddLinkForm />
          <div className="flex flex-wrap gap-2">
            <Segmented size="sm" value={filter} onChange={setFilter} options={[{ value: "todas", label: "Todas" }, { value: "favoritas", label: "Favoritas" }, { value: "depois", label: "Assistir depois" }, { value: "assistidas", label: "Assistidas" }]} />
            <Select value={subject} onChange={(e) => setSubject(e.target.value)} className="h-9 w-auto text-sm" aria-label="Filtrar matéria"><option value="__all">Todas as matérias</option>{active.map((s) => <option key={s.id} value={s.id}>{s.short_name}</option>)}</Select>
          </div>
          {mine.length === 0 ? <Card><EmptyState icon={<Clapperboard size={20} />} title="Nenhuma videoaula aqui" description="Busque por matéria ou cole o link de uma aula." /></Card> : (
            <Card className="divide-y">{mine.map((v) => (
              <div key={v.id} className="p-3 sm:p-4">
                <VideoCard v={toCard(v)} onPlay={() => setPlaying(v.id)} saved favorite={v.favorite} watchLater={v.watch_later} watched={!!v.watched_at} onFavorite={() => actions.toggleVideoFavorite(v.id)} onWatchLater={() => actions.toggleWatchLater(v.id)} />
                <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                  <span>{byId.get(v.subject_id ?? "")?.short_name ?? "Sem matéria"}{v.syllabus_topic_id ? ` · ${topics.find((t) => t.id === v.syllabus_topic_id)?.title ?? ""}` : ""}</span>
                  {v.notes && <span className="truncate italic">“{v.notes}”</span>}
                  <button type="button" className="ml-auto grid h-8 w-8 place-items-center rounded-lg hover:bg-surface-2" aria-label="Remover da biblioteca" onClick={async () => { if (await confirm({ title: "Remover videoaula da biblioteca?", confirmLabel: "Remover", danger: true })) actions.deleteVideo(v.id); }}><Trash2 size={14} /></button>
                </div>
              </div>
            ))}</Card>
          )}
        </>
      )}

      {tab === "historico" && (
        history.length === 0 ? <Card><EmptyState title="Nenhuma videoaula aberta ainda" /></Card> : (
          <Card className="divide-y">{history.map((v) => (
            <div key={v.id} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1"><VideoCard compact v={toCard(v)} onPlay={() => setPlaying(v.id)} watched={!!v.watched_at} saved /></div>
              <div className="text-right text-xs text-muted"><div>{new Date(v.last_opened_at!).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</div><div>{v.history.length}× aberta</div></div>
            </div>
          ))}</Card>
        )
      )}

      <VideoSearchDialog target={target} onClose={() => setTarget(null)} />
      <PlayerDialog videoId={playing} onClose={() => setPlaying(null)} />
    </div>
  );
}
