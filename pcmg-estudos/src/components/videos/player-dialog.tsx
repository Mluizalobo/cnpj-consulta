"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useApp, useRows, useTable } from "@/components/app/context";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/primitives";
import { embedUrl } from "@/lib/videos/youtube";

/** Player incorporado (youtube-nocookie) + registro de assistida, observações e vínculo com o edital. */
export function PlayerDialog({ videoId, onClose }: { videoId: string | null; onClose: () => void }) {
  const { actions } = useApp();
  const video = useTable("video_lessons")[videoId ?? ""];
  const topics = useRows("syllabus_topics");
  const [notes, setNotes] = useState("");
  // carrega as observações só ao abrir outro vídeo (não sobrescreve enquanto digita)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (video) setNotes(video.notes ?? ""); }, [videoId]);
  useEffect(() => { if (videoId) actions.logVideoOpen(videoId); }, [videoId, actions]);
  if (!videoId || !video) return null;
  const subjectTopics = topics.filter((t) => t.subject_id === video.subject_id && t.in_current_edital).sort((a, b) => (a.code ?? "").localeCompare(b.code ?? "", "pt", { numeric: true }));
  const topic = topics.find((t) => t.id === video.syllabus_topic_id);
  const watched = () => {
    actions.setVideoWatched(video.id, !video.watched_at);
    if (!video.watched_at) {
      toast.success("Videoaula registrada como assistida", topic && topic.status === "nao_estudado" ? {
        description: "Assistir não conta como domínio. Quer marcar o conteúdo como estudado?",
        action: { label: "Marcar estudado", onClick: () => actions.setTopicStatus(topic.id, "estudado") },
      } : undefined);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) { if (notes !== (video.notes ?? "")) actions.updateVideo(video.id, { notes: notes || null }); onClose(); } }} title={video.title} description={video.channel_title ? `Canal: ${video.channel_title}` : undefined} size="lg"
      footer={<>
        <a href={video.url} target="_blank" rel="noopener noreferrer"><Button variant="outline"><ExternalLink size={15} /> Abrir no YouTube</Button></a>
        <Button variant={video.watched_at ? "secondary" : "primary"} onClick={watched} data-testid="mark-watched"><CheckCircle2 size={15} /> {video.watched_at ? "Assistida ✓ (desfazer)" : "Marcar como assistida"}</Button>
      </>}>
      <div className="space-y-4">
        {video.youtube_id ? (
          <div className="aspect-video overflow-hidden rounded-xl bg-black">
            <iframe src={embedUrl(video.youtube_id)} title={video.title} className="h-full w-full" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
          </div>
        ) : <p className="text-sm text-muted">Este link não é do YouTube: abra no navegador.</p>}
        {subjectTopics.length > 0 && (
          <Field label="Conteúdo do edital" hint="Vincular ajuda a acompanhar o progresso do tópico.">
            <Select value={video.syllabus_topic_id ?? ""} onChange={(e) => actions.updateVideo(video.id, { syllabus_topic_id: e.target.value || null })} aria-label="Conteúdo do edital">
              <option value="">— Sem vínculo —</option>
              {subjectTopics.map((t) => <option key={t.id} value={t.id}>{"  ".repeat(t.level - 1)}{t.code ? `${t.code} ` : ""}{t.title}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Minhas observações"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => actions.updateVideo(video.id, { notes: notes || null })} placeholder="Pontos importantes, minutos-chave…" aria-label="Observações" /></Field>
        <p className="text-xs text-muted">Vídeo exibido pelo player oficial do YouTube. Direitos do conteúdo pertencem ao canal.</p>
      </div>
    </Dialog>
  );
}
