"use client";
import { useEffect, useState } from "react";
import type { Band } from "@/lib/domain/stats";

/** Cores validadas (scripts de daltonismo) para as faixas de desempenho, por tema. Sempre acompanhadas de rótulo. */
const LIGHT = { meta: "#2E7D52", desenvolvimento: "#D9A21B", critico: "#C2402A", sem_dados: "#B9C0B9", line: "#2E6B4B", grid: "#E6E9E5", axis: "#6F776F", ref: "#202620", surface: "#FFFFFF" };
const DARK = { meta: "#3E9A6A", desenvolvimento: "#D29A28", critico: "#DD5A40", sem_dados: "#4A524B", line: "#68AA84", grid: "#2A302B", axis: "#98A299", ref: "#E5EAE5", surface: "#191D1A" };
export type ChartColors = typeof LIGHT;

export function useChartColors(): ChartColors {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const read = () => setDark(el.dataset.theme === "dark");
    read();
    const mo = new MutationObserver(read);
    mo.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);
  return dark ? DARK : LIGHT;
}
export const bandColor = (c: ChartColors, b: Band) => c[b];
