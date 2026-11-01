"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useStore } from "zustand";
import { Toaster } from "sonner";
import { getAuth, getBackend } from "@/lib/data/client";
import { isConfigured } from "@/lib/data/env";
import type { AuthUser } from "@/lib/data/auth";
import { SyncEngine } from "@/lib/data/sync-engine";
import { browserPersistence } from "@/lib/data/persistence";
import { createActions } from "@/lib/data/actions";
import { stableId } from "@/lib/domain/ids";
import { ConfirmProvider } from "@/components/ui/dialog";
import { AppContext } from "./context";
import { applyTheme, getThemePref } from "./theme";
import { SetupNeeded, FullScreenLoader } from "./screens";

export function ThemeWatcher() {
  useEffect(() => {
    applyTheme(getThemePref());
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => applyTheme(getThemePref());
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return null;
}

export function RootProviders({ children }: { children: ReactNode }) {
  return (
    <ConfirmProvider>
      <ThemeWatcher />
      {children}
      <Toaster position="top-center" richColors closeButton toastOptions={{ style: { fontFamily: "inherit" } }} />
    </ConfirmProvider>
  );
}

/** Garante login e prepara dados/sincronização para as páginas internas. */
export function AuthedApp({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const configured = isConfigured();

  useEffect(() => {
    if (!configured) return;
    const auth = getAuth();
    let alive = true;
    auth.getUser().then((u) => alive && setUser(u));
    const off = auth.onChange((u) => setUser(u));
    return () => { alive = false; off(); };
  }, [configured]);

  useEffect(() => {
    if (user === null) router.replace(`/entrar?voltar=${encodeURIComponent(pathname)}`);
  }, [user, router, pathname]);

  if (!configured) return <SetupNeeded />;
  if (!user) return <FullScreenLoader label="Verificando acesso…" />;
  return <DataProvider user={user}>{children}</DataProvider>;
}

function DataProvider({ user, children }: { user: AuthUser; children: ReactNode }) {
  const [engine, setEngine] = useState<SyncEngine | null>(null);
  useEffect(() => {
    let e: SyncEngine | null = null;
    let cancelled = false;
    (async () => {
      const persistence = await browserPersistence();
      e = new SyncEngine(getBackend(), persistence);
      if (cancelled) return;
      setEngine(e);
      await e.start(user.id);
    })();
    return () => { cancelled = true; e?.stop(); };
  }, [user.id]);
  if (!engine) return <FullScreenLoader label="Carregando seus dados…" />;
  return <EngineReady engine={engine} user={user}>{children}</EngineReady>;
}

function EngineReady({ engine, user, children }: { engine: SyncEngine; user: AuthUser; children: ReactNode }) {
  const actions = useMemo(() => createActions(engine), [engine]);
  const auth = getAuth();
  const ready = useStore(engine.store, (s) => s.ready);
  const serverLoaded = useStore(engine.store, (s) => s.serverLoaded);
  const hasSettings = useStore(engine.store, (s) => !!s.data.user_settings[user.id]);
  const updates = useStore(engine.store, (s) => s.data.competition_updates);
  const seeded = useRef(false);

  // primeira vez: cria matérias, plano e banco inicial
  useEffect(() => {
    if (serverLoaded && !hasSettings && !seeded.current) { seeded.current = true; actions.seedIfNeeded(); }
  }, [serverLoaded, hasSettings, actions]);

  // sincronização automática: ao voltar ao app, reconectar e a cada 60 s com a tela visível
  useEffect(() => {
    const sync = () => { if (document.visibilityState === "visible") void engine.sync(); };
    window.addEventListener("online", sync);
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    const id = setInterval(sync, 60_000);
    const save = () => void engine.saveCache();
    window.addEventListener("pagehide", save);
    return () => {
      window.removeEventListener("online", sync); window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync); window.removeEventListener("pagehide", save); clearInterval(id);
    };
  }, [engine]);

  // novidades oficiais do concurso viram notificações internas (uma por novidade)
  useEffect(() => {
    if (!hasSettings) return;
    const created = engine.rows("profiles")[0]?.created_at ?? engine.row("user_settings", user.id)?.created_at;
    for (const u of Object.values(updates)) {
      if (created && u.detected_at < created && u.kind === "pista_nao_oficial") continue;
      const kind = u.kind === "edital_publicado" ? "edital" : "concurso";
      actions.notify({ kind, title: u.title, body: u.summary, link: "/concurso", source_update_id: u.id }, stableId("notif-update", user.id, u.id));
    }
  }, [updates, hasSettings, actions, engine, user.id]);

  if (!ready || !hasSettings) return <FullScreenLoader label={serverLoaded ? "Preparando seu plano de estudos…" : "Sincronizando com o servidor…"} offlineHint={!serverLoaded} />;
  return <AppContext.Provider value={{ engine, actions, user, auth }}>{children}</AppContext.Provider>;
}
