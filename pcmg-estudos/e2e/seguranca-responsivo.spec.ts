import { expect, test } from "@playwright/test";
import { login, MONDAY } from "./helpers";

const PAGES = ["/", "/plano", "/questoes", "/questoes/importar", "/simulados", "/caderno", "/desempenho", "/concurso", "/edital", "/videoaulas", "/configuracoes"];

test("rotas internas exigem login", async ({ page }) => {
  await page.goto("/desempenho");
  await expect(page).toHaveURL(/\/entrar\?voltar=%2Fdesempenho/);
  await expect(page.getByRole("button", { name: "Receber link de acesso" })).toBeVisible();
});

test("código errado não entra", async ({ page }) => {
  await page.goto("/entrar");
  await page.locator("#email").fill("x@exemplo.com");
  await page.getByRole("button", { name: "Receber link de acesso" }).click();
  await page.locator("#code").fill("000000");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByText("Código inválido ou expirado")).toBeVisible();
});

test("todas as páginas cabem na tela, sem rolagem lateral nem erros", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install({ time: MONDAY });
  await login(page);
  for (const p of PAGES) {
    await page.goto(p);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("main")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `rolagem lateral em ${p}`).toBeLessThanOrEqual(1);
  }
  expect(errors).toEqual([]);
});

test("modo claro e escuro", async ({ page }) => {
  await page.clock.install({ time: MONDAY });
  await login(page);
  const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
  await page.getByTestId("theme-toggle").click(); // sistema → claro
  expect(await theme()).toBe("light");
  await page.getByTestId("theme-toggle").click(); // claro → escuro
  expect(await theme()).toBe("dark");
  await page.reload();
  await expect.poll(theme).toBe("dark"); // preferência salva
});

test("PWA: manifesto, ícones e service worker", async ({ request }) => {
  const m = await (await request.get("/manifest.webmanifest")).json();
  expect(m).toMatchObject({ name: "Meu Concurso PCMG", short_name: "PCMG Estudos", display: "standalone", lang: "pt-BR" });
  for (const i of m.icons) expect((await request.get(i.src)).status()).toBe(200);
  expect((await request.get("/sw.js")).status()).toBe(200);
  expect((await request.get("/icons/apple-touch-icon.png")).status()).toBe(200);
});

test("APIs do servidor recusam acesso sem login ou sem segredo", async ({ request }) => {
  expect((await request.post("/api/concurso/verificar")).status()).toBe(401);
  expect((await request.post("/api/concurso/analisar")).status()).toBe(401);
  expect((await request.post("/api/videos/buscar", { data: { subjectName: "x" } })).status()).toBe(401);
  expect((await request.get("/api/cron/monitorar")).status()).toBe(401);
  expect((await request.get("/api/cron/monitorar", { headers: { Authorization: "Bearer chute" } })).status()).toBe(401);
});

test("criar senha em Configurações e entrar com senha", async ({ page }) => {
  await page.clock.install({ time: MONDAY });
  await login(page, "senha@exemplo.com");
  await page.goto("/configuracoes");
  await page.locator("#new-pw").fill("minhasenha123");
  await page.locator("#new-pw2").fill("minhasenha123");
  await page.getByTestId("save-password").click();
  await expect(page.getByText(/Senha salva/)).toBeVisible();
  await page.evaluate(() => localStorage.removeItem("pcmg-e2e-auth")); // simula sair / outro aparelho
  await page.goto("/entrar");
  await page.getByTestId("use-password").click();
  await page.locator("#email-pw").fill("senha@exemplo.com");
  await page.locator("#password").fill("errada123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByText(/E-mail ou senha incorretos/)).toBeVisible();
  await page.locator("#password").fill("minhasenha123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByTestId("countdown")).toBeVisible({ timeout: 60_000 });
});
