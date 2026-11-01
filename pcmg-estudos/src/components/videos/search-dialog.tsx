"use client";
import { useEffect, useMemo, useState } from "react";
import { Link2, Search, SquarePlay as Youtube, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useApp, useSettings, useSubjects, useTable } from "@/components/app/context";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { EmptyState, Input, Segmented, Skeleton } from "@/components/ui/primitives";
import { buildQuery, searchUrl } from "@/lib/videos/youtube";
import type { VideoResult } from "@/lib/types";
import { searchVideos } from "./client";
import { VideoCard } from "./video-card";
import { PlayerDialog } from "./player-dialog";
import { AddLinkForm } from "./add-link";

export interface VideoTarget { subjectId: string; topicId?: string | null; topicTitle?: string | null }

/** "Encontrar videoaulas": busca real no YouTube para a matéria/conteúdo, com cache e alternativas sem API. */
export function VideoSearchDialog({ target, onClose }: { target: VideoTarget | null; onClose: () => void }) {
  const { actions, auth } = useApp();
  const settings = useSettings();
  const { byId, active } = useSubjects();
  const videos = useTable("video_lessons");
  const subject = target ? byId.get(target.subjectId) : undefined;
  const baseQuery = subject ? buildQuery({ subjectName: subject.name, topic: target?.topicTitle }) : "";
  const [query, setQuery] = useState(baseQuery);
  const [results, setResults] = useState<VideoResult[] | null>(null);
  const [error, setError] = useState<{ code: string; msg: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState<"relevancia" | "duracao">("relevancia");
  const [playing, setPlaying] = useState<string | null>(null);
  const [manual, setManual] = useState(false);

  const run = async (q: string, force = false) => {
    if (!subject) return;
    setError(null);
    const cached = actions.cachedSearch(q);
    if (cached && !force && Date.now() - new Date(cached.fetched_at).getTime() < 14 * 86400000) { setResults(cached.results); return; }
    setLoading(true);
    const r = await searchVideos(auth, { subjectName: subject.name, topic: target?.topicTitle, board: settings?.exam_board, otherSubjects: active.filter((s) => s.id !== subject.id).map((s) => s.name), query: q });
    setLoading(false);
    if (r.ok) { setResults(r.results); actions.cacheVideoSearch(q, subject.id, target?.topicId ?? null, r.results); }
    else { setError({ code: r.code, msg: r.error }); if (cached) setResults(cached.results); else setResults(null); }
  };
  // nova busca apenas quando muda a matéria/conteúdo alvo
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (target) { setQuery(baseQuery); setResults(null); setManual(false); void run(baseQuery); } }, [target?.subjectId, target?.topicId, target?.topicTitle]);
  const sorted = useMemo(() => !results ? [] : sort === "duracao" ? [...results].sort((a, b) => (b.durationSeconds ?? 0) - (a.durationSeconds ?? 0)) : results, [results, sort]);
  if (!target || !subject) return null;
  const saveAndPlay = (v: VideoResult) => { const row = actions.saveVideo(v, { subjectId: subject.id, topicId: target.topicId ?? null }); setPlaying(row.id); };
  const saved = (v: VideoResult) => Object.values(videos).find((x) => x.youtube_id === v.youtubeId);

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()} title="Videoaulas" description={`${subject.short_name}${target.topicTitle ? ` · ${target.topicTitle}` : ""}`} size="lg">
        <div className="space-y-4">
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void run(query, true); }}>
            <Input value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Termos da busca" />
            <Button type="submit" loading={loading} aria-label="Buscar"><Search size={16} /></Button>
          </form>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Segmented size="sm" value={sort} onChange={setSort} options={[{ value: "relevancia", label: "Relevância" }, { value: "duracao", label: "Duração" }]} />
            <div className="flex gap-2">
              <a href={searchUrl(query)} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="ghost"><Youtube size={15} /> Abrir busca no YouTube</Button></a>
              <Button size="sm" variant="ghost" onClick={() => setManual(!manual)}><Link2 size={15} /> Colar link</Button>
            </div>
          </div>
          {manual && <AddLinkForm subjectId={subject.id} topicId={target.topicId ?? null} onSaved={(id) => { setManual(false); setPlaying(id); }} />}
          {error && (
            <div className="flex gap-2 rounded-xl bg-warn-soft p-3 text-sm text-warn">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <div>{error.msg}{error.code === "not_configured" && <span className="block text-xs opacity-80">Enquanto isso, use “Abrir busca no YouTube” e cole aqui o link da aula escolhida — o app preenche título, canal e miniatura.</span>}</div>
            </div>
          )}
          {loading && <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="flex gap-3"><Skeleton className="h-24 w-40" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/3" /></div></div>)}</div>}
          {!loading && results && results.length === 0 && <EmptyState title="Nenhuma videoaula adequada encontrada" description="Descartamos vídeos curtos e de outras matérias. Tente outros termos ou cole um link." />}
          {!loading && sorted.length > 0 && (
            <ul className="space-y-4">
              {sorted.map((v) => {
                const s = saved(v);
                return (
                  <li key={v.youtubeId}>
                    <VideoCard v={{ ...v, thumbnail: v.thumbnail, channelTitle: v.channelTitle }} onPlay={() => saveAndPlay(v)} saved={!!s} favorite={s?.favorite} watchLater={s?.watch_later} watched={!!s?.watched_at}
                      onFavorite={() => { const r = s ?? actions.saveVideo(v, { subjectId: subject.id, topicId: target.topicId ?? null }); actions.toggleVideoFavorite(r.id); }}
                      onWatchLater={() => { const r = s ?? actions.saveVideo(v, { subjectId: subject.id, topicId: target.topicId ?? null }); actions.toggleWatchLater(r.id); if (!r.watch_later) toast("Salva para assistir depois"); }} />
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-xs text-muted">Resultados reais da API do YouTube, filtrados por matéria e assunto; vídeos com menos de 6 minutos são descartados. Prioridade para aulas completas, recentes, sobre concursos e que citam a banca. O canal de cada vídeo aparece no cartão.</p>
        </div>
      </Dialog>
      <PlayerDialog videoId={playing} onClose={() => setPlaying(null)} />
    </>
  );
}
