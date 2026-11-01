"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Monitor, Moon, Sun } from "lucide-react";
import { useApp, useSettings } from "@/components/app/context";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, Field, Input, Segmented } from "@/components/ui/primitives";
import { getThemePref, setThemePref, type ThemePref } from "@/components/app/theme";

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-2">
      <span><span className="block text-sm font-medium">{label}</span>{hint && <span className="block text-xs text-muted">{hint}</span>}</span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-6 w-10 rounded-full bg-surface-2 transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring/50" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
      </span>
    </label>
  );
}

export function PreferencesCard() {
  const { actions } = useApp();
  const s = useSettings()!;
  const [theme, setTheme] = useState<ThemePref>("system");
  const [intervals, setIntervals] = useState(s.review_intervals.join(", "));
  const [reviewMin, setReviewMin] = useState(String(s.review_minutes));
  const [maxDay, setMaxDay] = useState(String(s.max_reviews_per_day));
  const [perm, setPerm] = useState<string>("default");
  useEffect(() => { setTheme(getThemePref()); setPerm(typeof Notification !== "undefined" ? Notification.permission : "unsupported"); }, []);
  const timer = (k: keyof typeof s.timer, v: boolean) => actions.updateSettings({ timer: { ...s.timer, [k]: v } });
  const enableNotif = async (v: boolean) => {
    if (!v) { timer("notifications", false); return; }
    if (typeof Notification === "undefined") { toast.error("Este navegador não suporta notificações. No iPhone, instale o app na tela inicial (iOS 16.4+)."); return; }
    const p = await Notification.requestPermission();
    setPerm(p);
    if (p === "granted") { timer("notifications", true); toast.success("Notificações ativadas"); } else toast.error("Permissão negada nas configurações do navegador.");
  };
  const saveReviews = () => {
    const list = [...new Set(intervals.split(/[,;\s]+/).map(Number).filter((n) => Number.isInteger(n) && n > 0 && n <= 365))].sort((a, b) => a - b);
    if (!list.length) { toast.error("Informe ao menos um intervalo (ex.: 1, 7, 30)"); return; }
    actions.updateSettings({ review_intervals: list, review_minutes: Math.max(5, Number(reviewMin) || 20), max_reviews_per_day: Math.max(1, Number(maxDay) || 6) });
    setIntervals(list.join(", "));
    toast.success("Preferências de revisão salvas (valem para os próximos estudos)");
  };
  return (
    <>
      <Card>
        <CardHeader title="Aparência" />
        <CardBody>
          <Segmented value={theme} onChange={(v) => { setTheme(v); setThemePref(v); }} options={[
            { value: "light", label: <span className="inline-flex items-center gap-1.5"><Sun size={14} /> Claro</span> },
            { value: "dark", label: <span className="inline-flex items-center gap-1.5"><Moon size={14} /> Escuro</span> },
            { value: "system", label: <span className="inline-flex items-center gap-1.5"><Monitor size={14} /> Automático</span> },
          ]} />
          <p className="mt-2 text-xs text-muted">Preferência salva neste aparelho.</p>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Cronômetro e avisos" />
        <CardBody className="divide-y">
          <Toggle label="Som ao fim de cada bloco" checked={s.timer.sound} onChange={(v) => timer("sound", v)} />
          <Toggle label="Vibrar (celulares Android)" checked={s.timer.vibrate} onChange={(v) => timer("vibrate", v)} />
          <Toggle label="Passar automaticamente de teoria para questões" checked={s.timer.autoAdvance} onChange={(v) => timer("autoAdvance", v)} />
          <Toggle label="Notificação do sistema quando o app estiver em segundo plano" hint={perm === "denied" ? "Bloqueado no navegador." : "Android/computador: funciona com o app aberto em outra aba. iPhone: só com o app instalado na tela inicial (iOS 16.4+), e o iOS pode adiar avisos com o app fechado."} checked={s.timer.notifications && perm === "granted"} onChange={enableNotif} />
          <Toggle label="Adicionar erros ao caderno automaticamente" hint="Desligado: o app apenas oferece a opção após cada erro." checked={s.auto_add_errors} onChange={(v) => actions.updateSettings({ auto_add_errors: v })} />
          <Toggle label="Mostrar frase do dia na tela Hoje" checked={s.show_quotes} onChange={(v) => actions.updateSettings({ show_quotes: v })} />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Revisões espaçadas" description="Domingos (dia livre) passam automaticamente para segunda-feira." />
        <CardBody className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Intervalos (dias)" hint="Ex.: 1, 7, 30"><Input value={intervals} onChange={(e) => setIntervals(e.target.value)} aria-label="Intervalos" /></Field>
            <Field label="Duração da revisão (min)"><Input type="number" min={5} value={reviewMin} onChange={(e) => setReviewMin(e.target.value)} aria-label="Duração da revisão" /></Field>
            <Field label="Máximo por dia ao reorganizar"><Input type="number" min={1} value={maxDay} onChange={(e) => setMaxDay(e.target.value)} aria-label="Máximo por dia" /></Field>
          </div>
          <Button onClick={saveReviews}>Salvar revisões</Button>
        </CardBody>
      </Card>
    </>
  );
}
