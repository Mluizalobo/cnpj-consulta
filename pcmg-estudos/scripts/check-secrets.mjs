// Verifica que nenhuma chave secreta está no código-fonte nem no JavaScript enviado ao navegador.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const walk = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    if (["node_modules", ".git", ".next-e2e", "test-results", "playwright-report"].includes(f)) continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out); else if (/\.(ts|tsx|js|mjs|json|sql|md|html|css|env.*)$/.test(f) || f.startsWith(".env")) out.push(p);
  }
  return out;
};

const problems = [];
const SECRET_PATTERNS = [
  [/sb_secret_[A-Za-z0-9_-]{10,}/, "chave secreta do Supabase (sb_secret_)"],
  [/AIza[0-9A-Za-z_-]{35}/, "chave de API do Google (YouTube/Gemini)"],
  [/sk-ant-[A-Za-z0-9_-]{10,}/, "chave da Anthropic"],
  [/-----BEGIN (RSA )?PRIVATE KEY-----/, "chave privada"],
];
const isServiceRoleJwt = (s) => {
  for (const m of s.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g)) {
    try { if (JSON.parse(Buffer.from(m[1], "base64url").toString()).role === "service_role") return true; } catch { /* ignora */ }
  }
  return false;
};

// 1) Código-fonte e arquivos versionados (exceto .env.local, que não vai para o Git)
for (const f of walk(root)) {
  if (/\.env\.local$|\.env$/.test(f)) continue;
  const s = readFileSync(f, "utf8");
  for (const [re, name] of SECRET_PATTERNS) if (re.test(s)) problems.push(`${f.replace(root, "")}: possível ${name}`);
  if (isServiceRoleJwt(s)) problems.push(`${f.replace(root, "")}: token service_role do Supabase`);
  if (/NEXT_PUBLIC_[A-Z_]*(SERVICE|SECRET|CRON|GEMINI|YOUTUBE)/.test(s)) problems.push(`${f.replace(root, "")}: variável secreta com prefixo NEXT_PUBLIC_ (iria para o navegador)`);
}

// 2) JavaScript do navegador (build de produção): não pode citar variáveis secretas
const staticDir = join(root, ".next", "static");
if (existsSync(staticDir)) {
  for (const f of walk(staticDir)) {
    if (!f.endsWith(".js")) continue;
    const s = readFileSync(f, "utf8");
    for (const name of ["SUPABASE_SERVICE_ROLE_KEY", "CRON_SECRET", "GEMINI_API_KEY", "YOUTUBE_API_KEY", "ALLOWED_EMAILS"]) if (s.includes(name)) problems.push(`${f.replace(root, "")}: menciona ${name} no código do navegador`);
    for (const [re, name] of SECRET_PATTERNS) if (re.test(s)) problems.push(`${f.replace(root, "")}: ${name} no código do navegador`);
    if (isServiceRoleJwt(s)) problems.push(`${f.replace(root, "")}: token service_role no código do navegador`);
  }
} else console.log("(sem build em .next — rode `npm run build` para verificar também o código do navegador)");

if (problems.length) { console.error("❌ Problemas encontrados:\n" + problems.map((p) => " - " + p).join("\n")); process.exit(1); }
console.log("✅ Nenhuma chave secreta encontrada no código-fonte nem no JavaScript do navegador.");
