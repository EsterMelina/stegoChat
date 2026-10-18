import { expect, APIRequestContext, Page } from "@playwright/test";

export const PASSWORD = "UmaSenha12345";

type NewAccount = {
  username: string;
  display_name: string;
  email: string;
  password?: string;
};

/**
 * Regista uma conta via API, obtém o OTP (requer AUTH_TEST_MODE=1 no backend),
 * verifica o email e devolve. Não faz login no browser.
 */
export async function registerAndVerify(request: APIRequestContext, account: NewAccount) {
  const password = account.password ?? PASSWORD;
  const reg = await request.post("/api/auth/register", {
    data: {
      username: account.username,
      display_name: account.display_name,
      email: account.email,
      password,
    },
  });
  expect(reg.status(), await reg.text()).toBe(202);
  const regBody = await reg.json();
  const code: string | undefined = regBody.debug_code;
  expect(code, "AUTH_TEST_MODE=1 deve estar activo no backend para os testes").toBeTruthy();

  const verify = await request.post("/api/auth/verify-email", {
    data: { email: account.email, code },
  });
  expect(verify.status(), await verify.text()).toBe(200);

  return { ...account, password };
}

/** Faz login na UI (formulário) e espera pelo ecrã principal. */
export async function loginInUi(page: Page, username: string, password: string) {
  await page.goto("/");
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Palavra-passe").fill(password);
  await page.getByRole("button", { name: "Entrar na conversa" }).click();
  await expect(page.getByRole("heading", { name: "Conversas", exact: true })).toBeVisible();
}