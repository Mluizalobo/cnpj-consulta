import { expect, type Page } from "@playwright/test";

/** Segunda-feira, 02/11/2026, 9h (horário de Brasília). */
export const MONDAY = new Date("2026-11-02T09:00:00-03:00");

export async function login(page: Page, email = "maria@exemplo.com") {
  await page.goto("/entrar");
  await page.locator("#email").fill(email);
  await page.getByRole("button", { name: "Receber link de acesso" }).click();
  await page.locator("#code").fill("123456");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByTestId("countdown")).toBeVisible({ timeout: 60_000 });
}

export async function confirmDialog(page: Page, label: string) {
  await page.getByRole("dialog").getByRole("button", { name: label, exact: true }).click();
}
