"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import * as D from "@radix-ui/react-dialog";
import { Ellipsis, LogOut } from "lucide-react";
import { NAV, isActive } from "./nav";
import { Logo } from "./logo";
import { SyncIndicator } from "./sync-indicator";
import { NotificationsButton } from "./notifications";
import { ThemeToggle } from "./theme-toggle";
import { useApp } from "./context";
import { cn } from "@/components/ui/cn";
import { MiniTimer } from "@/components/timer/timer-panel";
import { TimerRunner } from "@/components/timer/timer-runner";
import { useTimer } from "@/components/timer/timer-store";
import { useConfirm } from "@/components/ui/dialog";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [more, setMore] = useState(false);
  const { auth, engine, user } = useApp();
  const confirm = useConfirm();
  const hasTimer = useTimer((s) => !!s.timer);
  const mobileItems = NAV.filter((n) => n.mobile);
  const moreActive = NAV.filter((n) => !n.mobile).some((n) => isActive(pathname, n.href));
  const inExam = pathname.startsWith("/simulados/prova");

  const logout = async () => {
    const pending = engine.pendingCount();
    if (!(await confirm({ title: "Sair da conta?", description: pending ? `Há ${pending} alterações ainda não enviadas ao servidor. Se sair agora, elas ficam guardadas neste aparelho e serão enviadas quando você entrar de novo.` : "Seus dados continuam salvos no servidor.", confirmLabel: "Sair" }))) return;
    await auth.signOut();
    router.replace("/entrar");
  };

  return (
    <div className="min-h-dvh lg:pl-64">
      <TimerRunner />
      {/* Sidebar (computador) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-surface lg:flex">
        <div className="px-5 py-5"><Logo withText /></div>
        <nav className="flex-1 space-y-0.5 px-3" aria-label="Navegação principal">
          {NAV.map((n) => {
            const active = isActive(pathname, n.href);
            return (
              <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined}
                className={cn("flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors", active ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-2 hover:text-fg")}>
                <n.icon size={18} strokeWidth={active ? 2.2 : 1.8} />{n.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t p-3">
          <div className="truncate px-2 pb-2 text-xs text-muted" title={user.email ?? ""}>{user.email}</div>
          <button type="button" onClick={logout} className="flex h-9 w-full items-center gap-2 rounded-lg px-2 text-sm text-muted hover:bg-surface-2 hover:text-fg"><LogOut size={16} /> Sair</button>
        </div>
      </aside>

      {/* Cabeçalho */}
      <header className="pt-safe sticky top-0 z-20 border-b bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4">
          <Link href="/" className="lg:hidden" aria-label="Início"><Logo size={28} /></Link>
          <div className="flex-1" />
          <SyncIndicator />
          <NotificationsButton />
          <ThemeToggle />
        </div>
      </header>

      <main className={cn("mx-auto max-w-5xl px-4 pb-28 pt-5 lg:pb-12", inExam && "pb-12")}>{children}</main>

      {/* Mini cronômetro */}
      {hasTimer && pathname !== "/" && !inExam && (
        <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-30 px-3 lg:bottom-4 lg:left-64 lg:px-6">
          <div className="mx-auto max-w-md"><MiniTimer onOpen={() => router.push("/")} /></div>
        </div>
      )}

      {/* Navegação inferior (celular) */}
      {!inExam && (
        <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t bg-surface/95 backdrop-blur lg:hidden" aria-label="Navegação">
          <div className="grid h-16 grid-cols-5">
            {mobileItems.map((n) => {
              const active = isActive(pathname, n.href);
              return (
                <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} className={cn("flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium", active ? "text-primary" : "text-muted")}>
                  <n.icon size={21} strokeWidth={active ? 2.2 : 1.8} />{n.short ?? n.label}
                </Link>
              );
            })}
            <button type="button" onClick={() => setMore(true)} className={cn("flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium", moreActive ? "text-primary" : "text-muted")} aria-label="Mais opções">
              <Ellipsis size={21} />Mais
            </button>
          </div>
        </nav>
      )}

      <D.Root open={more} onOpenChange={setMore}>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-40 bg-black/40 animate-fade-in" />
          <D.Content className="pb-safe fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border bg-surface p-3 shadow-pop animate-slide-up focus:outline-none">
            <D.Title className="px-2 pb-2 pt-1 text-sm font-semibold text-muted">Mais</D.Title>
            <D.Description className="sr-only">Outras áreas do aplicativo</D.Description>
            <div className="grid gap-1">
              {NAV.filter((n) => !n.mobile).map((n) => (
                <Link key={n.href} href={n.href} onClick={() => setMore(false)} className={cn("flex h-12 items-center gap-3 rounded-xl px-3 text-[15px] font-medium", isActive(pathname, n.href) ? "bg-primary-soft text-primary" : "hover:bg-surface-2")}>
                  <n.icon size={19} />{n.label}
                </Link>
              ))}
              <button type="button" onClick={() => { setMore(false); void logout(); }} className="flex h-12 items-center gap-3 rounded-xl px-3 text-[15px] font-medium text-muted hover:bg-surface-2"><LogOut size={19} /> Sair</button>
            </div>
          </D.Content>
        </D.Portal>
      </D.Root>
    </div>
  );
}
