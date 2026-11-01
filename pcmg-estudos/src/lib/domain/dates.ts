import { addDays, differenceInCalendarDays, format, parseISO, startOfWeek, endOfWeek, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateKey } from "../types";

export const toKey = (d: Date): DateKey => format(d, "yyyy-MM-dd");
export const fromKey = (k: DateKey): Date => parseISO(k);
export const todayKey = (now: Date = new Date()): DateKey => toKey(now);
export const addDaysKey = (k: DateKey, n: number): DateKey => toKey(addDays(fromKey(k), n));
export const diffDays = (a: DateKey, b: DateKey): number => differenceInCalendarDays(fromKey(a), fromKey(b));
export const weekdayOf = (k: DateKey): number => fromKey(k).getDay();
export const isValidKey = (k: unknown): k is DateKey =>
  typeof k === "string" && /^\d{4}-\d{2}-\d{2}$/.test(k) && isValid(parseISO(k));

/** Semana de segunda a domingo. */
export const weekStartKey = (k: DateKey): DateKey => toKey(startOfWeek(fromKey(k), { weekStartsOn: 1 }));
export const weekEndKey = (k: DateKey): DateKey => toKey(endOfWeek(fromKey(k), { weekStartsOn: 1 }));
export const weekDays = (k: DateKey): DateKey[] => {
  const s = weekStartKey(k);
  return Array.from({ length: 7 }, (_, i) => addDaysKey(s, i));
};

export const fmt = (k: DateKey | Date, pattern: string): string =>
  format(typeof k === "string" ? fromKey(k) : k, pattern, { locale: ptBR });

export const WEEKDAY_NAMES = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
export const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h >= 5 && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}

export function formatDuration(totalSeconds: number, opts: { short?: boolean } = {}): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (opts.short) {
    if (h === 0) return `${m}min`;
    return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
  }
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export const hoursLabel = (seconds: number): string => {
  const h = seconds / 3600;
  return `${h.toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: h > 0 && h < 10 ? 1 : 0 })} h`;
};
