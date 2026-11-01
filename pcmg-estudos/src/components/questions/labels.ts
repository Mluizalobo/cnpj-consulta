import type { Difficulty } from "@/lib/types";
export const DIFF_LABEL: Record<Difficulty, string> = { facil: "Fácil", medio: "Médio", dificil: "Difícil" };
export const optionText = (q: { option_a: string; option_b: string; option_c: string; option_d: string; option_e: string }, o: string) =>
  q[`option_${o.toLowerCase()}` as "option_a"];
