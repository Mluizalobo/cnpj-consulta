export type ThemePref = "light" | "dark" | "system";
const KEY = "pcmg-theme";
export function getThemePref(): ThemePref {
  try { const v = localStorage.getItem(KEY); return v === "light" || v === "dark" ? v : "system"; } catch { return "system"; }
}
export function applyTheme(pref: ThemePref) {
  const dark = pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#111412" : "#F7F8F6");
}
export function setThemePref(pref: ThemePref) {
  try { localStorage.setItem(KEY, pref); } catch { /* ignora */ }
  applyTheme(pref);
}
/** Script inline (antes da pintura) para evitar "piscar" o tema errado. */
export const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem('${KEY}');var d=p==='dark'||((!p||p==='system')&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light'}catch(e){}})()`;
