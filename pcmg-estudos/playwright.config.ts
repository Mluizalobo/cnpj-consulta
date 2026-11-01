import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;
/**
 * Testes E2E: o app roda em MODO DE TESTE (NEXT_PUBLIC_E2E=1), com servidor em memória e login falso
 * (código 123456). Nada aqui toca o Supabase real.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, locale: "pt-BR", timezoneId: "America/Sao_Paulo", trace: "retain-on-failure" },
  projects: [
    { name: "android", use: { ...devices["Pixel 7"] } },
    { name: "iphone", use: { ...devices["iPhone 13"], browserName: "chromium", defaultBrowserType: "chromium" } },
    { name: "tablet", use: { viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true } },
    { name: "desktop", use: { viewport: { width: 1366, height: 860 } } },
  ],
  webServer: {
    command: `NEXT_PUBLIC_E2E=1 NEXT_DIST_DIR=.next-e2e npx next build && NEXT_PUBLIC_E2E=1 NEXT_DIST_DIR=.next-e2e npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/entrar`,
    timeout: 300_000,
    reuseExistingServer: true,
  },
});
