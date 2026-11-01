/**
 * Cronômetro baseado em marcações de tempo (não em contagem de "ticks").
 * Assim, atualizar a página ou fechar o app não reinicia nem perde o tempo.
 */
export type BlockType = "teoria" | "questoes" | "revisao";
export interface TimerBlock { type: BlockType; seconds: number }

export interface TimerData {
  sessionId: string;
  kind: "estudo" | "revisao";
  reviewId?: string | null;
  subjectId: string | null;
  label: string;
  blocks: TimerBlock[];
  index: number;
  accumulated: number[]; // segundos já contabilizados em cada bloco
  runningSince: number | null; // ms; null = pausado
  finished: boolean;
  startedAt: number;
}

export type TimerEvent = { type: "block_end"; block: TimerBlock; next: TimerBlock | null } | { type: "done" };

export const BLOCK_LABEL: Record<BlockType, string> = { teoria: "Teoria", questoes: "Questões", revisao: "Revisão" };

export function createTimer(p: Omit<TimerData, "index" | "accumulated" | "runningSince" | "finished" | "startedAt">, now: number): TimerData {
  const blocks = p.blocks.filter((b) => b.seconds > 0);
  return { ...p, blocks, index: 0, accumulated: blocks.map(() => 0), runningSince: now, finished: false, startedAt: now };
}

export const isRunning = (t: TimerData) => t.runningSince !== null;

function liveExtra(t: TimerData, now: number) {
  return t.runningSince !== null ? Math.max(0, (now - t.runningSince) / 1000) : 0;
}

export function blockElapsed(t: TimerData, now: number, i = t.index): number {
  return t.accumulated[i] + (i === t.index ? liveExtra(t, now) : 0);
}

export function blockRemaining(t: TimerData, now: number): number {
  const b = t.blocks[t.index];
  return b ? Math.max(0, b.seconds - blockElapsed(t, now)) : 0;
}

export function totalElapsed(t: TimerData, now: number): number {
  return t.accumulated.reduce((s, v) => s + v, 0) + liveExtra(t, now);
}

export function totalPlanned(t: TimerData): number {
  return t.blocks.reduce((s, b) => s + b.seconds, 0);
}

/** Tempo efetivo por tipo de atividade (para registrar na sessão). */
export function secondsByType(t: TimerData, now: number): Record<BlockType, number> {
  const out: Record<BlockType, number> = { teoria: 0, questoes: 0, revisao: 0 };
  t.blocks.forEach((b, i) => (out[b.type] += blockElapsed(t, now, i)));
  for (const k of Object.keys(out) as BlockType[]) out[k] = Math.round(out[k]);
  return out;
}

function commit(t: TimerData, now: number): TimerData {
  if (t.runningSince === null) return t;
  const acc = [...t.accumulated];
  acc[t.index] += liveExtra(t, now);
  return { ...t, accumulated: acc, runningSince: now };
}

export function pause(t: TimerData, now: number): TimerData {
  const c = commit(t, now);
  return { ...c, runningSince: null };
}

export function resume(t: TimerData, now: number): TimerData {
  if (t.runningSince !== null || t.finished) return t;
  return { ...t, runningSince: now };
}

export function reset(t: TimerData, now: number): TimerData {
  return { ...t, index: 0, accumulated: t.blocks.map(() => 0), runningSince: now, finished: false, startedAt: now };
}

/** Pula para outro bloco (ex.: de teoria para questões). */
export function switchTo(t: TimerData, index: number, now: number): TimerData {
  if (index < 0 || index >= t.blocks.length || index === t.index) return t;
  const c = commit(t, now);
  return { ...c, index, finished: false, runningSince: c.runningSince === null ? null : now };
}

/**
 * Avança o estado até "agora": quando um bloco termina, o excedente passa ao próximo
 * (se autoAdvance) ou o cronômetro pausa. Funciona mesmo após longos períodos fechado.
 */
export function tick(t: TimerData, now: number, autoAdvance = true): { timer: TimerData; events: TimerEvent[] } {
  const events: TimerEvent[] = [];
  let cur = t;
  for (let guard = 0; guard < 20 && cur.runningSince !== null && !cur.finished; guard++) {
    const block = cur.blocks[cur.index];
    if (!block) break;
    const elapsed = blockElapsed(cur, now);
    if (elapsed < block.seconds) break;
    const overflow = elapsed - block.seconds;
    const acc = [...cur.accumulated];
    acc[cur.index] = block.seconds;
    const next = cur.blocks[cur.index + 1] ?? null;
    events.push({ type: "block_end", block, next });
    if (next && autoAdvance) {
      cur = { ...cur, accumulated: acc, index: cur.index + 1, runningSince: now - overflow * 1000 };
    } else if (next) {
      cur = { ...cur, accumulated: acc, index: cur.index + 1, runningSince: null };
    } else {
      cur = { ...cur, accumulated: acc, runningSince: null, finished: true };
      events.push({ type: "done" });
    }
  }
  return { timer: cur, events };
}
