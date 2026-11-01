"use client";
import { useState } from "react";
import { toast } from "sonner";
import { useApp, useSubjects } from "@/components/app/context";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/primitives";
import { extractYoutubeId } from "@/lib/videos/youtube";
import { fetchOembed } from "./client";

/** Adicionar videoaula por link (usa o oEmbed oficial do YouTube: gratuito e sem chave). */
export function AddLinkForm({ subjectId, topicId, onSaved }: { subjectId?: string | null; topicId?: string | null; onSaved?: (id: string) => void }) {
  const { actions, auth } = useApp();
  const { active } = useSubjects();
  const [url, setUrl] = useState("");
  const [subj, setSubj] = useState(subjectId ?? "");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const id = extractYoutubeId(url);
    if (!id) { toast.error("Cole um link válido do YouTube (youtube.com/watch?v=… ou youtu.be/…)."); return; }
    setBusy(true);
    try {
      const m = await fetchOembed(auth, url);
      const row = actions.saveVideo({ youtubeId: m.youtubeId, url: m.url, title: m.title, channelTitle: m.channelTitle, thumbnail: m.thumbnail }, { subjectId: subj || null, topicId: topicId ?? null, source: "manual" });
      toast.success("Videoaula adicionada");
      setUrl("");
      onSaved?.(row.id);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="flex flex-col gap-2 rounded-xl border p-3 sm:flex-row">
      <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" aria-label="Link do YouTube" className="flex-1" />
      {!subjectId && <Select value={subj} onChange={(e) => setSubj(e.target.value)} className="sm:w-44" aria-label="Matéria"><option value="">Matéria…</option>{active.map((s) => <option key={s.id} value={s.id}>{s.short_name}</option>)}</Select>}
      <Button onClick={save} loading={busy}>Adicionar</Button>
    </div>
  );
}
