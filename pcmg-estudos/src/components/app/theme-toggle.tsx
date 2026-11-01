"use client";
import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { getThemePref, setThemePref, type ThemePref } from "./theme";

export function ThemeToggle() {
  const [pref, setPref] = useState<ThemePref>("system");
  useEffect(() => setPref(getThemePref()), []);
  const next: Record<ThemePref, ThemePref> = { light: "dark", dark: "system", system: "light" };
  const Icon = pref === "light" ? Sun : pref === "dark" ? Moon : Monitor;
  const label = pref === "light" ? "Tema claro" : pref === "dark" ? "Tema escuro" : "Tema automático";
  return (
    <button type="button" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-surface-2" aria-label={`${label} (tocar para mudar)`} title={label} data-testid="theme-toggle"
      onClick={() => { const n = next[pref]; setPref(n); setThemePref(n); }}>
      <Icon size={17} />
    </button>
  );
}
