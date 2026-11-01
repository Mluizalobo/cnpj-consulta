"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, Download, FileUp, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useApp, useRows, useSubjects } from "@/components/app/context";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, PageHeader } from "@/components/ui/primitives";
import { useConfirm } from "@/components/ui/dialog";
import { CSV_TEMPLATE, JSON_TEMPLATE, parseCsv, parseJson, validateRows, type ImportResult } from "@/lib/domain/importer";
import { downloadFile } from "@/components/shared/download";

export default function ImportPage() {
  const { actions } = useApp();
  const confirm = useConfirm();
  const { all } = useSubjects();
  const questions = useRows("questions");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [imported, setImported] = useState<number | null>(null);
  const hashes = useMemo(() => new Set(questions.map((q) => q.content_hash)), [questions]);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { toast.error("Arquivo maior que 5 MB"); return; }
    setImported(null); setFileName(f.name);
    const text = await f.text();
    const isJson = /\.json$/i.test(f.name) || text.trim().startsWith("[") || text.trim().startsWith("{");
    const p = isJson ? parseJson(text) : parseCsv(text);
    setParseErrors(p.parseErrors);
    setResult(validateRows(p.rows, all, hashes, isJson ? 1 : 2));
  };
  const doImport = async () => {
    if (!result?.valid.length) return;
    if (!(await confirm({ title: `Importar ${result.valid.length} questões?`, description: `${result.errors.length} linhas com erro e ${result.duplicates.length} duplicadas serão ignoradas.`, confirmLabel: "Importar" }))) return;
    const n = actions.importQuestions(result.valid);
    setImported(n); setResult(null);
    toast.success(`${n} questões importadas com sucesso`);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <Link href="/questoes" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft size={15} /> Questões</Link>
      <PageHeader title="Importar questões" description="Envie um arquivo CSV ou JSON. Tudo é validado antes de salvar." />
      <Card>
        <CardHeader title="1. Baixe um modelo" description="Use as colunas do modelo. A matéria deve ter o nome de uma matéria cadastrada." />
        <CardBody className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => downloadFile("modelo-questoes.csv", "﻿" + CSV_TEMPLATE, "text/csv")}><Download size={15} /> Modelo CSV</Button>
          <Button variant="outline" size="sm" onClick={() => downloadFile("modelo-questoes.json", JSON_TEMPLATE, "application/json")}><Download size={15} /> Modelo JSON</Button>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="2. Envie o arquivo" />
        <CardBody>
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-center hover:bg-surface-2">
            <FileUp size={22} className="text-primary" />
            <span className="text-sm font-medium">{fileName || "Escolher arquivo .csv ou .json"}</span>
            <span className="text-xs text-muted">Até 5 MB</span>
            <input type="file" accept=".csv,.json,text/csv,application/json" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} data-testid="import-file" />
          </label>
          {imported !== null && <p className="mt-3 flex items-center gap-2 text-sm text-primary"><CheckCircle2 size={16} /> {imported} questões importadas.</p>}
        </CardBody>
      </Card>
      {result && (
        <Card>
          <CardHeader title="3. Prévia e confirmação" description={`${result.total} linhas lidas`} />
          <CardBody className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge tone="primary">{result.valid.length} válidas</Badge>
              <Badge tone={result.errors.length ? "alert" : "neutral"}>{result.errors.length} com erro</Badge>
              <Badge tone={result.duplicates.length ? "warn" : "neutral"}>{result.duplicates.length} duplicadas</Badge>
            </div>
            {parseErrors.length > 0 && <ul className="text-sm text-alert">{parseErrors.slice(0, 5).map((e) => <li key={e}>{e}</li>)}</ul>}
            {result.errors.length > 0 && (
              <div className="rounded-xl bg-alert-soft p-3 text-sm">
                <p className="mb-1 flex items-center gap-1.5 font-medium text-alert"><AlertTriangle size={15} /> Linhas com erro</p>
                <ul className="space-y-0.5">{result.errors.slice(0, 20).map((e) => <li key={e.line}>Linha {e.line}: {e.messages.join("; ")}</li>)}</ul>
              </div>
            )}
            {result.duplicates.length > 0 && <p className="text-sm text-muted">Duplicadas: {result.duplicates.slice(0, 20).map((d) => `linha ${d.line} (${d.reason.toLowerCase()})`).join(", ")}</p>}
            {result.valid.length > 0 && (
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-surface-2 text-xs text-muted"><tr><th className="p-2">Linha</th><th className="p-2">Matéria</th><th className="p-2">Enunciado</th><th className="p-2">Gab.</th></tr></thead>
                  <tbody className="divide-y">{result.valid.slice(0, 10).map((r) => (
                    <tr key={r.line}><td className="p-2 tnum">{r.line}</td><td className="p-2">{all.find((s) => s.id === r.data.subject_id)?.short_name}</td><td className="max-w-xs truncate p-2">{r.data.enunciado}</td><td className="p-2">{r.data.correct_option}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            )}
            <Button onClick={doImport} disabled={!result.valid.length} data-testid="confirm-import">Importar {result.valid.length} questões</Button>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
