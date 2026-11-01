"use client";
/* eslint-disable @next/next/no-img-element */
import { Bookmark, CheckCircle2, ExternalLink, Heart, Play } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { Badge } from "@/components/ui/primitives";
import { formatClock } from "@/lib/domain/dates";

export interface VideoCardData {
  youtubeId: string | null;
  url: string;
  title: string;
  channelTitle: string | null;
  thumbnail: string | null;
  durationSeconds: number | null;
  publishedAt: string | null;
  reasons?: string[];
  outdated?: boolean;
}

export function VideoCard({ v, onPlay, saved, favorite, watchLater, watched, onFavorite, onWatchLater, compact }: {
  v: VideoCardData; onPlay: () => void; saved?: boolean; favorite?: boolean; watchLater?: boolean; watched?: boolean;
  onFavorite?: () => void; onWatchLater?: () => void; compact?: boolean;
}) {
  return (
    <div className={cn("group flex gap-3", compact ? "items-center" : "flex-col sm:flex-row")} data-testid="video-card">
      <button type="button" onClick={onPlay} className={cn("relative shrink-0 overflow-hidden rounded-xl bg-surface-2", compact ? "h-16 w-28" : "aspect-video w-full sm:w-48")} aria-label={`Assistir: ${v.title}`}>
        {v.thumbnail ? <img src={v.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]" /> : null}
        <span className="absolute inset-0 grid place-items-center bg-black/0 transition-colors group-hover:bg-black/25"><Play size={compact ? 18 : 26} className="fill-white text-white opacity-90 drop-shadow" /></span>
        {v.durationSeconds ? <span className="tnum absolute bottom-1 right-1 rounded bg-black/75 px-1 text-[11px] font-medium text-white">{formatClock(v.durationSeconds)}</span> : null}
        {watched && <span className="absolute left-1 top-1 rounded bg-primary px-1 text-[10px] font-semibold text-primary-fg">assistida</span>}
      </button>
      <div className="min-w-0 flex-1">
        <p className={cn("font-medium leading-snug", compact ? "line-clamp-2 text-sm" : "line-clamp-2")}>{v.title}</p>
        <p className="mt-0.5 truncate text-xs text-muted">Canal: <b className="font-medium">{v.channelTitle || "—"}</b>{v.publishedAt ? ` · ${new Date(v.publishedAt).toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}` : ""}</p>
        {!compact && (v.reasons?.length || v.outdated) ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {v.outdated && <Badge tone="warn">publicado há anos — confira se está atualizado</Badge>}
            {v.reasons?.slice(0, 3).map((r) => <Badge key={r} tone="outline">{r}</Badge>)}
          </div>
        ) : null}
        <div className="mt-1.5 flex items-center gap-1">
          {onFavorite && <button type="button" onClick={onFavorite} aria-pressed={favorite} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-surface-2" aria-label="Favoritar"><Heart size={15} className={cn(favorite ? "fill-alert text-alert" : "text-muted")} /></button>}
          {onWatchLater && <button type="button" onClick={onWatchLater} aria-pressed={watchLater} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-surface-2" aria-label="Assistir depois"><Bookmark size={15} className={cn(watchLater ? "fill-primary text-primary" : "text-muted")} /></button>}
          {saved && watched && <CheckCircle2 size={15} className="text-primary" aria-label="Assistida" />}
          <a href={v.url} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-muted hover:bg-surface-2">YouTube <ExternalLink size={12} /></a>
        </div>
      </div>
    </div>
  );
}
