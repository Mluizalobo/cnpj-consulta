// Gera o PDF fictício a partir do .txt (cada \f vira uma nova página). Uso: node tests/fixtures/make-pdf.mjs
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const dir = new URL(".", import.meta.url).pathname;
const txt = readFileSync(dir + "edital-investigador-ficticio.txt", "utf8");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const pages = txt.split("\\f").map((p) => `<section>${p.trim().split("\n").map((l) => `<p>${esc(l)}</p>`).join("")}</section>`).join("");
const html = `<html><head><meta charset="utf-8"><style>body{font-family:Arial;font-size:10pt} section{page-break-after:always} p{margin:2px 0}</style></head><body>${pages}</body></html>`;
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html);
await page.pdf({ path: dir + "edital-investigador-ficticio.pdf", format: "A4", margin: { top: "1.5cm", bottom: "1.5cm", left: "1.5cm", right: "1.5cm" } });
await browser.close();
console.log("PDF gerado");
