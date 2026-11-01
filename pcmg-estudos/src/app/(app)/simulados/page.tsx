"use client";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ClipboardCheck, Play, Plus, Settings2, Trash2, Timer } from "lucide-react";
import { toast } from "sonner";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useApp, useRows, useSettings, useSubjects } from "@/components/app/context";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, EmptyState, Field, Input, PageHeader } from "@/components/ui/primitives";
import { Dialog, useConfirm } from "@/components/ui/dialog";
import { useChartColors } from "@/components/shared/chart-colors";
import { formatDuration } from "@/lib/domain/dates";
import { examDistribution } from "@/lib/domain/mock";
import { pct } from "@/lib/domain/stats";

function MocksInner() {
  const { actions } = useApp();
  const settings = useSettings()!;
  const router = useRouter();
  const params = useSearchParams();
  const confirm = useConfirm();
  const mocks = useRows("mock_exams");
  const questions = useRows("questions");
  const { active, byId } = useSubjects();
  const colors = useChartColors();
  const [custom, setCustom] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const [total, setTotal] = useState("20");
  const [minutes, setMinutes] = useState("");

  const dist = useMemo(() => examDistribution(active), [active]);
  const fullTotal = dist.reduce((s, d) => s + d.count, 0);
  const shortage = dist.map((d) => ({ ...d, have: questions.filter((q) => q.subject_id === d.subject_id).length })).filter((d) => d.have < d.count);
  const inProgress = mocks.filter((m) => m.status === "em_andamento").sort((a, b) => b.started_at.localeCompare(a.started_at));
  const done = mocks.filter((m) => m.status === "finalizado").sort((a, b) => (b.finished_at ?? "").localeCompare(a.finished_at ?? ""));
  const series = [...done].reverse().map((m, i) => ({ n: `#${i + 1}`, pct: pct(m.correct_count ?? 0, m.total_questions), title: m.title, data: new Date(m.finished_at ?? m.started_at).toLocaleDateString("pt-BR") }));

  const createFull = async () => {
    if (shortage.length && !(await confirm({ title: "Banco de questões incompleto", description: `Faltam questões em: ${shortage.map((s) => `${byId.get(s.subject_id)?.short_name} (${s.have}/${s.count})`).join(", ")}. O simulado terá menos de ${fullTotal} questões.`, confirmLabel: "Criar assim mesmo" }))) return;
    if (!(await confirm({ title: `Iniciar simulado completo?`, description: `${fullTotal} questões, ${formatDuration(settings.mock_duration_minutes * 60)} de prova. O gabarito só aparece na entrega. Você pode pausar.`, confirmLabel: "Começar" }))) return;
    try {
      const { mock } = actions.createMock({ kind: "completo" });
      router.push(`/simulados/prova?id=${mock.id}`);
    } catch (e) { toast.error((e as Error).message); }
  };
  // abre a criação do simulado quando vem da tela Hoje (?novo=completo); roda só uma vez
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (params.get("novo") === "completo") { router.replace("/simulados"); void createFull(); } }, []);
  const createCustom = () => {
    try {
      const { mock, shortages } = actions.createMock({ kind: "personalizado", total: Number(total), subjectIds: sel.length ? sel : undefined, minutes: minutes ? Number(minutes) : undefined });
      if (shortages.length) toast(`Algumas matérias tinham menos questões que o previsto.`);
      router.push(`/simulados/prova?id=${mock.id}`);
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader title="Simulados" description={`Formato da prova: ${fullTotal} questões · ${formatDuration(settings.mock_duration_minutes * 60)}`}
        action={<><Button variant="outline" size="sm" onClick={() => setCustom(true)}><Settings2 size={15} /> Personalizado</Button><Button size="sm" onClick={createFull} data-testid="new-full-mock"><Plus size={15} /> Simulado completo</Button></>} />

      {inProgress.map((m) => (
        <Card key={m.id} className="flex flex-wrap items-center gap-3 border-primary/30 p-4">
          <Timer size={18} className="text-primary" />
          <div className="min-w-0 flex-1"><div className="font-medium">{m.title}</div><div className="text-xs text-muted">{m.answered_count}/{m.total_questions} respondidas · em andamento</div></div>
          <Link href={`/simulados/prova?id=${m.id}`}><Button size="sm"><Play size={14} /> Continuar</Button></Link>
        </Card>
      ))}

      <Card>
        <CardHeader title="Evolução" description={`Nota em % de acertos · meta ${settings.target_accuracy}%`} />
        <CardBody>
          {series.length < 2 ? <p className="py-6 text-center text-sm text-muted">Faça ao menos dois simulados para ver sua evolução.</p> : (
            <div className="h-56" role="img" aria-label="Evolução das notas nos simulados">
              <ResponsiveContainer>
                <LineChart data={series} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke={colors.grid} vertical={false} />
                  <XAxis dataKey="n" tick={{ fill: colors.axis, fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: colors.axis, fontSize: 12 }} axisLine={false} tickLine={false} unit="%" />
                  <ReferenceLine y={settings.target_accuracy} stroke={colors.ref} strokeDasharray="4 4" label={{ value: `meta ${settings.target_accuracy}%`, fill: colors.axis, fontSize: 11, position: "insideTopRight" }} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: `1px solid ${colors.grid}`, background: colors.surface }} formatter={(v) => [`${v}%`, "Acertos"]} labelFormatter={(_, p) => (p?.[0]?.payload ? `${p[0].payload.title} · ${p[0].payload.data}` : "")} />
                  <Line dataKey="pct" stroke={colors.line} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: colors.surface }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Histórico" description={`${done.length} simulado${done.length === 1 ? "" : "s"} realizados`} />
        {done.length === 0 ? <EmptyState icon={<ClipboardCheck size={20} />} title="Nenhum simulado ainda" description="Na reta final, faça um simulado completo todo sábado." /> : (
          <ul className="divide-y px-1 pb-1 pt-2">
            {done.map((m) => {
              const p = pct(m.correct_count ?? 0, m.total_questions);
              return (
                <li key={m.id} className="flex items-center gap-3 px-3 py-3 sm:px-4" data-testid="mock-history-item">
                  <Link href={`/simulados/resultado?id=${m.id}`} className="min-w-0 flex-1">
                    <div className="font-medium">{m.title}</div>
                    <div className="mt-0.5 text-xs text-muted">{new Date(m.finished_at ?? m.started_at).toLocaleDateString("pt-BR")} · {formatDuration(m.elapsed_seconds)}</div>
                  </Link>
                  <div className="text-right">
                    <div className="tnum font-semibold">{m.correct_count}/{m.total_questions}</div>
                    <Badge tone={p !== null && p >= settings.target_accuracy ? "primary" : p !== null && p < 50 ? "alert" : "warn"}>{p}%</Badge>
                  </div>
                  <button type="button" aria-label="Excluir simulado" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2"
                    onClick={async () => { if (await confirm({ title: "Excluir simulado?", description: "As respostas registradas no histórico de questões são mantidas.", confirmLabel: "Excluir", danger: true })) actions.deleteMock(m.id); }}><Trash2 size={15} /></button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Dialog open={custom} onOpenChange={setCustom} title="Simulado personalizado" description="Proporção das matérias igual à da prova"
        footer={<><Button variant="outline" onClick={() => setCustom(false)}>Cancelar</Button><Button onClick={createCustom} disabled={!(Number(total) >= 1 && Number(total) <= 200)}>Começar</Button></>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nº de questões"><Input type="number" min={1} max={200} value={total} onChange={(e) => setTotal(e.target.value)} aria-label="Número de questões" /></Field>
            <Field label="Tempo (min)" hint="Vazio = proporcional"><Input type="number" min={5} max={600} value={minutes} onChange={(e) => setMinutes(e.target.value)} aria-label="Tempo" /></Field>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Matérias (nenhuma marcada = todas)</p>
            <div className="flex flex-wrap gap-2">
              {active.filter((s) => s.exam_questions > 0).map((s) => (
                <button key={s.id} type="button" onClick={() => setSel(sel.includes(s.id) ? sel.filter((x) => x !== s.id) : [...sel, s.id])}
                  className={`rounded-full border px-3 py-1.5 text-sm ${sel.includes(s.id) ? "border-primary bg-primary-soft text-primary" : "hover:bg-surface-2"}`} aria-pressed={sel.includes(s.id)}>{s.short_name}</button>
              ))}
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
export default function MocksPage() { return <Suspense><MocksInner /></Suspense>; }
