// Gera os ícones PNG do PWA a partir do desenho em SVG (usa o Chromium do Playwright).
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const out = new URL("../public/icons/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const shield = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#173D2B"/><g transform="translate(${pad} ${pad}) scale(${(64 - 2 * pad) / 64})"><path d="M32 12 L48 18 V31 C48 41 41 48.5 32 52 C23 48.5 16 41 16 31 V18 Z" fill="none" stroke="#E8F0E9" stroke-width="3.5" stroke-linejoin="round"/><path d="M24.5 32.5 L30 38 L40.5 27" fill="none" stroke="#7FC29B" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></g></svg>`;
const browser = await chromium.launch();
const page = await browser.newPage();
const make = async (name, size, pad, radius) => {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px;border-radius:${radius}px;overflow:hidden">${shield(pad).replace("<svg", `<svg width="${size}" height="${size}"`)}</div></body></html>`);
  await page.screenshot({ path: out + name, omitBackground: true });
};
await make("icon-192.png", 192, 0, 0);
await make("icon-512.png", 512, 0, 0);
await make("maskable-512.png", 512, 8, 0); // margem segura para ícones adaptativos do Android
await make("apple-touch-icon.png", 180, 2, 0);
await browser.close();
console.log("ícones gerados em public/icons");
