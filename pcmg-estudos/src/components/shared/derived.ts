"use client";
import { useMemo } from "react";
import { useRows, useSettings, useSubjects } from "@/components/app/context";
import { accuracyBySubject } from "@/lib/domain/stats";
import { getDayItems, type DayItem } from "@/lib/domain/plan";
import { addDaysKey } from "@/lib/domain/dates";
import type { DateKey, StudySession } from "@/lib/types";

/** Itens planejados para uma data + sessão correspondente (se iniciada/concluída). */
export function usePlanFor(dates: DateKey[]) {
  const settings = useSettings();
  const { all } = useSubjects();
  const plan = useRows("study_plan");
  const attempts = useRows("question_attempts");
  const sessions = useRows("study_sessions");
  const today = dates[0];
  const accuracy = useMemo(() => accuracyBySubject(attempts, { since: addDaysKey(today, -60) }), [attempts, today]);
  return useMemo(() => {
    const bySlot = new Map<string, StudySession>();
    for (const s of sessions) if (s.slot_key) bySlot.set(s.slot_key, s);
    const out: Record<DateKey, { item: DayItem; session: StudySession | undefined }[]> = {};
    if (!settings) return out;
    for (const d of dates) out[d] = getDayItems(d, { settings, subjects: all, plan, accuracy }).map((item) => ({ item, session: bySlot.get(item.key) }));
    return out;
  }, [settings, all, plan, accuracy, sessions, dates]);
}
