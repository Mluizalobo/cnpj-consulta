"use client";
import { Logo } from "./logo";

export function FullScreenLoader({ label, offlineHint }: { label: string; offlineHint?: boolean }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-bg p-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <Logo size={44} />
        <div className="h-1 w-40 overflow-hidden rounded-full bg-surface-2"><div className="h-full w-1/3 animate-[shimmer_1.2s_ease-in-out_infinite] rounded-full bg-primary" /></div>
        <p className="text-sm text-muted">{label}</p>
        {offlineHint && <p className="max-w-xs text-xs text-muted">Se estiver sem internet no primeiro acesso, conecte-se para baixar seus dados. Depois disso o app abre mesmo offline.</p>}
      </div>
    </div>
  );
}

export function SetupNeeded() {
  return (
    <div className="mx-auto max-w-xl p-6 pt-16">
      <Logo size={40} />
      <h1 className="mt-6 text-2xl font-semibold">Falta conectar o banco de dados</h1>
      <p className="mt-2 text-muted">O app guarda seus estudos no Supabase (gratuito). Para funcionar, configure as variáveis de ambiente:</p>
      <pre className="mt-4 overflow-x-auto rounded-xl border bg-surface p-4 text-sm">NEXT_PUBLIC_SUPABASE_URL=...{"\n"}NEXT_PUBLIC_SUPABASE_ANON_KEY=...</pre>
      <p className="mt-4 text-sm text-muted">O passo a passo completo está no arquivo <b>README.md</b> do projeto (seção “Publicação gratuita”).</p>
    </div>
  );
}
