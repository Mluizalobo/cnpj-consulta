"use client";
/** Avisos discretos ao fim de cada bloco: som curto, vibração e (se permitido) notificação. */
let ctx: AudioContext | null = null;
export function beep() {
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const now = ctx.currentTime;
    [0, 0.22].forEach((d, i) => {
      const o = ctx!.createOscillator(), g = ctx!.createGain();
      o.type = "sine"; o.frequency.value = i ? 880 : 660;
      g.gain.setValueAtTime(0.0001, now + d); g.gain.exponentialRampToValueAtTime(0.18, now + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, now + d + 0.18);
      o.connect(g).connect(ctx!.destination); o.start(now + d); o.stop(now + d + 0.2);
    });
  } catch { /* sem áudio */ }
}
export function vibrate() { try { navigator.vibrate?.([120, 80, 120]); } catch { /* ignore */ } }
export async function systemNotify(title: string, body: string) {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { body, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", tag: "pcmg-timer" });
    else new Notification(title, { body, icon: "/icons/icon-192.png" });
  } catch { /* ignore */ }
}
