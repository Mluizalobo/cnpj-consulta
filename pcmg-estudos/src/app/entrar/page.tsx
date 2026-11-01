"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, KeyRound, ArrowLeft, LockKeyhole } from "lucide-react";
import { z } from "zod";
import { getAuth } from "@/lib/data/client";
import { isConfigured } from "@/lib/data/env";
import { Button } from "@/components/ui/button";
import { Card, Field, Input } from "@/components/ui/primitives";
import { Logo } from "@/components/app/logo";
import { SetupNeeded } from "@/components/app/screens";

const emailSchema = z.string().trim().toLowerCase().email("Informe um e-mail válido");

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const voltar = params.get("voltar");
  const dest = voltar && voltar.startsWith("/") && !voltar.startsWith("//") ? voltar : "/";
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code" | "senha">("email");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!isConfigured()) return;
    const auth = getAuth();
    auth.getUser().then((u) => u && router.replace(dest));
    return auth.onChange((u) => u && router.replace(dest));
  }, [router, dest]);
  useEffect(() => { if (cooldown <= 0) return; const t = setTimeout(() => setCooldown(cooldown - 1), 1000); return () => clearTimeout(t); }, [cooldown]);

  if (!isConfigured()) return <SetupNeeded />;

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const p = emailSchema.safeParse(email);
    if (!p.success) { setError(p.error.issues[0].message); return; }
    setBusy(true); setError(null);
    try {
      await getAuth().sendLink(p.data, `${window.location.origin}/entrar?voltar=${encodeURIComponent(dest)}`);
      setEmail(p.data); setStep("code"); setCooldown(60);
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6,8}$/.test(code.trim())) { setError("O código tem 6 dígitos (veja o e-mail)."); return; }
    setBusy(true); setError(null);
    try { await getAuth().verifyCode(email, code.trim()); router.replace(dest); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };

  const loginPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = emailSchema.safeParse(email);
    if (!p.success) { setError(p.error.issues[0].message); return; }
    if (!password) { setError("Digite a sua senha."); return; }
    setBusy(true); setError(null);
    try { await getAuth().signInWithPassword(p.data, password); router.replace(dest); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="pt-safe grid min-h-dvh place-items-center bg-bg px-4 py-10">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="mb-8 flex justify-center"><Logo size={48} /></div>
        <h1 className="text-center text-2xl font-semibold tracking-tight">Meu Concurso PCMG</h1>
        <p className="mt-1 text-center text-sm text-muted">Sua preparação para Investigador, em um só lugar.</p>
        <Card className="mt-8 p-5">
          {step === "email" ? (
            <form onSubmit={send} className="space-y-4" noValidate>
              <Field label="Seu e-mail" htmlFor="email" error={error ?? undefined}>
                <Input id="email" type="email" inputMode="email" autoComplete="email" placeholder="voce@exemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
              </Field>
              <Button type="submit" className="w-full" loading={busy}><Mail size={17} /> Receber link de acesso</Button>
              <p className="text-xs leading-relaxed text-muted">Enviamos um link de acesso para o seu e-mail.</p>
              <button type="button" onClick={() => { setStep("senha"); setError(null); }} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary" data-testid="use-password"><LockKeyhole size={14} /> Entrar com senha</button>
            </form>
          ) : step === "senha" ? (
            <form onSubmit={loginPassword} className="space-y-4" noValidate>
              <Field label="E-mail" htmlFor="email-pw"><Input id="email-pw" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></Field>
              <Field label="Senha" htmlFor="password" error={error ?? undefined} hint="Crie a senha em Configurações → Conta, depois de entrar pelo link uma vez.">
                <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
              <Button type="submit" className="w-full" loading={busy}><KeyRound size={17} /> Entrar</Button>
              <button type="button" onClick={() => { setStep("email"); setError(null); }} className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft size={14} /> Receber link por e-mail</button>
            </form>
          ) : (
            <form onSubmit={verify} className="space-y-4" noValidate>
              <div className="rounded-xl bg-primary-soft p-3 text-sm text-primary">Enviamos um e-mail para <b>{email}</b>. <b>Toque no link do e-mail</b> para entrar. Se o e-mail trouxer um código, você também pode digitá-lo abaixo.</div>
              <Field label="Código (se houver)" htmlFor="code" error={error ?? undefined} hint="No app instalado no iPhone, prefira “Entrar com senha” (crie a senha em Configurações).">
                <Input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className="tnum text-center text-lg tracking-[0.4em]" autoFocus />
              </Field>
              <Button type="submit" className="w-full" loading={busy}><KeyRound size={17} /> Entrar</Button>
              <div className="flex items-center justify-between text-sm">
                <button type="button" onClick={() => { setStep("email"); setError(null); setCode(""); }} className="inline-flex items-center gap-1 text-muted hover:text-fg"><ArrowLeft size={14} /> Trocar e-mail</button>
                <button type="button" disabled={cooldown > 0 || busy} onClick={() => void send()} className="text-primary disabled:text-muted">{cooldown > 0 ? `Reenviar em ${cooldown}s` : "Reenviar"}</button>
              </div>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginInner /></Suspense>;
}
