import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { parseEdital, splitPages } from "../src/lib/monitor/parse-edital";
import { confirmDialog, login, MONDAY } from "./helpers";

test.describe.configure({ mode: "serial" });

test("fluxo completo de estudo do dia", async ({ page }) => {
  test.skip(!["desktop", "android"].includes(test.info().project.name), "Fluxo completo roda em celular Android e computador");
  await page.clock.install({ time: MONDAY });
  // 1–2. Entrar e ver a tela Hoje
  await login(page);
  await expect(page.getByRole("heading", { name: /Bom dia/ })).toBeVisible();
  const items = page.getByTestId("day-item");
  await expect(items).toHaveCount(2);
  await expect(items.first()).toContainText("Língua Portuguesa");

  // 3. Iniciar sessão (35 min teoria + 25 min questões)
  await items.first().getByRole("button", { name: "Iniciar" }).click();
  await expect(page.getByTestId("timer-panel")).toBeVisible();
  await expect(page.getByTestId("timer-remaining")).toHaveText(/3[45]:\d\d/);

  // 4. Atualizar a página não reinicia o cronômetro
  await page.clock.fastForward("10:00");
  await page.reload();
  await expect(page.getByTestId("timer-remaining")).toHaveText(/2[45]:\d\d/);

  // fim do bloco de teoria → passa para questões
  await page.clock.fastForward("26:00");
  await expect(page.getByTestId("timer-panel")).toContainText("Questões");

  // 5. Registrar atividade e concluir
  await page.getByRole("button", { name: "Encerrar" }).click();
  await page.locator("#fin-topic").fill("Crase");
  await page.locator("#fin-done").fill("10");
  await page.locator("#fin-ok").fill("7");
  await page.getByRole("button", { name: "Salvar e concluir" }).click();
  await expect(page.getByText(/3 revisões agendadas/)).toBeVisible();
  await expect(items.first()).toContainText("Concluída");
  await expect(page.getByTestId("today-time")).toContainText("36min");

  // 6. Revisões criadas: no dia seguinte aparece a revisão D+1
  await page.clock.fastForward("24:00:00");
  await page.reload();
  await expect(page.getByTestId("review-item").first()).toContainText("Crase");
  await expect(page.getByTestId("review-item").first()).toContainText("D+1");

  // 7–9. Resolver questões, errar e adicionar ao caderno
  await page.goto("/questoes");
  await page.getByTestId("start-practice").click();
  const solver = page.getByTestId("question-solver");
  await expect(solver).toContainText("acento indicativo de crase");
  await solver.locator("[data-option=B]").click();
  await page.getByTestId("confirm-answer").click();
  await expect(page.getByTestId("answer-feedback")).toContainText("Resposta incorreta. Gabarito: A");
  await page.getByTestId("add-notebook").click();
  await expect(page.getByText("Adicionada ao caderno de erros")).toBeVisible();

  // revisão de erro: refaz antes de ver a resposta; o erro original continua no histórico
  await page.goto("/caderno");
  await expect(page.getByTestId("note-item")).toHaveCount(1);
  await page.getByTestId("retry-note").click();
  await page.getByRole("dialog").locator("[data-option=A]").click();
  await page.getByRole("dialog").getByTestId("confirm-answer").click();
  await expect(page.getByRole("dialog")).toContainText("Resposta correta");
  await expect(page.getByRole("dialog")).toContainText("1 tentativa · 0 acertos · 1 erro · 0% · 1 em revisão");
  await page.keyboard.press("Escape");

  // 10–11. Simulado completo de 70 questões
  await page.goto("/simulados");
  await page.getByTestId("new-full-mock").click();
  await confirmDialog(page, "Começar");
  await expect(page.getByTestId("exam")).toBeVisible();
  await expect(page.getByTestId("exam-clock")).toHaveText(/4:\d\d:\d\d/);
  for (let i = 0; i < 3; i++) {
    await page.locator("[data-option=A]").first().click();
    await page.getByTestId("next-question").click();
  }
  await page.getByTestId("flag-question").click();
  await page.getByRole("button", { name: "Entregar simulado agora" }).click();
  await confirmDialog(page, "Entregar");
  await expect(page.getByTestId("mock-score")).toHaveText(/^\d+\/70$/);
  await page.goto("/simulados");
  await expect(page.getByTestId("mock-history-item")).toHaveCount(1);

  // 12. Painel de desempenho
  await page.goto("/desempenho");
  await expect(page.getByTestId("subject-table")).toContainText("Português");
  await expect(page.getByRole("img", { name: "Percentual de acertos por matéria" })).toBeVisible();
  await expect(page.getByTestId("subject-table")).toContainText(/Crítico|Em desenvolvimento|Meta atingida/);

  // 13. Exportar backup
  await page.goto("/configuracoes");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-json").click()]);
  expect(download.suggestedFilename()).toMatch(/^pcmg-estudos-backup-.*\.json$/);
  const backup = JSON.parse(readFileSync(await download.path(), "utf8"));
  expect(backup.app).toBe("pcmg-estudos");
  expect(backup.data.questions).toHaveLength(70);
  expect(backup.data.study_sessions.length).toBeGreaterThanOrEqual(1);

  // Central do Concurso: sem documentos oficiais → mensagem clara
  await page.goto("/concurso");
  await page.getByTestId("check-updates").click();
  await expect(page.getByTestId("no-news")).toHaveText("Não encontramos alterações oficiais desde a última verificação.");

  // Simula o servidor publicando um edital FICTÍCIO confirmado → análise e aplicação com um clique
  const data = parseEdital(splitPages(readFileSync("tests/fixtures/edital-investigador-ficticio.txt", "utf8")));
  await page.evaluate((d) => {
    const now = new Date().toISOString();
    (window as unknown as { __pcmgE2E: { serverInsert: (t: string, r: unknown[]) => void } }).__pcmgE2E.serverInsert("competition_versions", [{
      id: "11111111-2222-4333-8444-555555555555", version_number: 1, document_id: null, base_version_id: null, label: "Edital nº 01/2026 (FICTÍCIO)",
      data: d, diff: [], reliability: "confirmado", created_at: now, updated_at: now,
    }]);
  }, data);
  await page.getByTestId("check-updates").click();
  await page.getByRole("link", { name: "Ver o relatório e aplicar" }).click();
  await expect(page.getByTestId("changes-table")).toContainText("Nova matéria: Noções de Estatística");
  await expect(page.getByTestId("changes-table")).toContainText("12 questões");
  await page.getByTestId("apply-update").click();
  await confirmDialog(page, "Aplicar");
  await expect(page.getByTestId("update-applied")).toBeVisible();
  await page.goto("/concurso");
  await expect(page.getByTestId("competition-stage")).toHaveText(/Prova marcada|Edital publicado/);

  // Videoaulas: resposta da API simulada (vídeo FICTÍCIO de teste) → assistir e marcar como assistida
  await page.route("**/api/videos/buscar", (r) => r.fulfill({ json: { query: "teste", results: [{
    youtubeId: "AAAAAAAAAAA", url: "https://www.youtube.com/watch?v=AAAAAAAAAAA", title: "[TESTE] Aula fictícia de Português", channelTitle: "Canal de teste",
    channelId: "x", thumbnail: "", durationSeconds: 1800, publishedAt: "2026-06-01T00:00:00Z", viewCount: 10, score: 10, reasons: ["aula"], outdated: false }] } }));
  await page.goto("/");
  await page.getByTestId("find-videos").first().click();
  await expect(page.getByTestId("video-card")).toHaveCount(1);
  await page.getByTestId("video-card").getByRole("button", { name: /Assistir:/ }).click();
  await page.getByTestId("mark-watched").click();
  await expect(page.getByText("Videoaula registrada como assistida")).toBeVisible();
});
