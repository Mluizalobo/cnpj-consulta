"use client";
import { useState } from "react";
import { Download, FileJson, FileSpreadsheet, Upload, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useApp, useRows, useSubjects, useSync } from "@/components/app/context";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, Segmented } from "@/components/ui/primitives";
import { useConfirm } from "@/components/ui/dialog";
import { downloadFile } from "@/components/shared/download";
import { TABLE_LABEL, validateBackup, type Backup } from "@/lib/domain/backup";
import { questionsToCsv } from "@/lib/domain/importer";
import type { TableName } from "@/lib/types";

export function BackupCard() {
  const { actions, engine } = useApp();
  const confirm = useConfirm();
  const sync = useSync();
  const questions = useRows("questions");
  const { byId } = useSubjects();
  const [pending, setPending] = useState<{ backup: Backup; summary: { table: TableName; count: number }[]; name: string } | null>(null);
  const [mode, setMode] = useState<"mesclar" | "substituir">("mesclar");
  const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");

  const exportJson = () => downloadFile(`pcmg-estudos-backup-${stamp()}.json`, JSON.stringify(actions.exportBackup(), null, 1), "application/json");
  const exportCsv = () => downloadFile(`pcmg-questoes-${stamp()}.csv`, "﻿" + questionsToCsv(questions.map((q) => ({
    enunciado: q.statement, materia: byId.get(q.subject_id ?? "")?.name ?? "", assunto: q.topic ?? "", a: q.option_a, b: q.option_b, c: q.option_c, d: q.option_d, e: q.option_e,
    gabarito: q.correct_option, explicacao: q.explanation ?? "", dificuldade: q.difficulty, banca: q.board ?? "", ano: q.year, tags: q.tags.join(";"),
  }))), "text/csv");
  const onFile = async (f?: File) => {
    if (!f) return;
    if (f.size > 50 * 1024 * 1024) { toast.error("Arquivo grande demais"); return; }
    try {
      const v = validateBackup(JSON.parse(await f.text()));
      if (!v.ok) { toast.error(`Backup inválido: ${v.errors[0]}`); return; }
      setPending({ backup: v.backup, summary: v.summary, name: f.name });
    } catch { toast.error("Arquivo não é um JSON válido"); }
  };
  const restore = async () => {
    if (!pending) return;
    const ok = mode === "mesclar"
      ? await confirm({ title: "Mesclar backup?", description: "Registros novos serão adicionados e os existentes só serão atualizados se a versão do backup for mais recente. Nada será apagado.", confirmLabel: "Mesclar" })
      : await confirm({ title: "Substituir todos os dados?", description: "Registros que NÃO estão no backup serão removidos. Antes disso, um backup dos dados atuais será baixado automaticamente.", confirmLabel: "Substituir", danger: true, typeToConfirm: "SUBSTITUIR" });
    if (!ok) return;
    if (mode === "substituir") exportJson();
    const r = actions.importBackup(pending.backup, mode);
    toast.success(`Backup restaurado: ${r.added} registros aplicados${r.removed ? `, ${r.removed} removidos` : ""}.`);
    setPending(null);
    void engine.sync();
  };
  return (
    <Card id="backup">
      <CardHeader title="Backup e restauração" description="Seus dados ficam no Supabase. O backup é uma cópia extra que você guarda." />
      <CardBody className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportJson} data-testid="export-json"><FileJson size={15} /> Exportar tudo (JSON)</Button>
          <Button variant="outline" onClick={exportCsv}><FileSpreadsheet size={15} /> Exportar questões (CSV)</Button>
          <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl border px-4 text-[15px] font-medium hover:bg-surface-2">
            <Upload size={15} /> Importar backup<input type="file" accept=".json,application/json" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} data-testid="import-backup" />
          </label>
        </div>
        {pending && (
          <div className="space-y-3 rounded-xl border p-3 animate-fade-in">
            <p className="flex items-center gap-2 text-sm font-medium"><ShieldCheck size={16} className="text-primary" /> Backup válido: {pending.name}</p>
            <p className="text-xs text-muted">Criado em {new Date(pending.backup.exported_at).toLocaleString("pt-BR")}</p>
            <div className="flex flex-wrap gap-1.5">{pending.summary.filter((s) => s.count).map((s) => <Badge key={s.table}>{TABLE_LABEL[s.table]}: {s.count}</Badge>)}</div>
            <Segmented value={mode} onChange={setMode} options={[{ value: "mesclar", label: "Mesclar (recomendado)" }, { value: "substituir", label: "Substituir" }]} />
            <div className="flex gap-2"><Button onClick={restore}><Download size={15} /> Restaurar</Button><Button variant="ghost" onClick={() => setPending(null)}>Cancelar</Button></div>
          </div>
        )}
        <p className="text-xs text-muted">Sincronização: {sync.status === "synced" ? "tudo salvo no servidor" : sync.status === "offline" ? `${sync.pending} alterações aguardando internet` : sync.status === "error" ? `erro — ${sync.error}` : "sincronizando…"}{sync.lastSyncedAt ? ` · última às ${new Date(sync.lastSyncedAt).toLocaleTimeString("pt-BR")}` : ""}</p>
      </CardBody>
    </Card>
  );
}
