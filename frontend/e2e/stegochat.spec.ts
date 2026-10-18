import { expect, test } from "@playwright/test";
import { loginInUi, PASSWORD, registerAndVerify } from "./helpers";

const BASE = "http://127.0.0.1:3011";

test("duas contas: conversar, ocultar, revelar, editar, eliminar e gerir grupo", async ({ browser, page, request }) => {
  const suffix = Date.now().toString();
  const alice = `ana_${suffix}`;
  const bob = `rui_${suffix}`;
  const eve = `eve_${suffix}`;
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));

  const recipientContext = await browser.newContext({ baseURL: BASE });
  const recipient = await recipientContext.newPage();
  try {
    // 1) Registar + verificar as duas contas via API
    await registerAndVerify(request, {
      username: alice,
      display_name: "Ana Teste",
      email: `${alice}@example.com`,
    });
    await registerAndVerify(request, {
      username: bob,
      display_name: "Rui Teste",
      email: `${bob}@example.com`,
    });

    // 2) Login na UI das duas
    await loginInUi(page, alice, PASSWORD);
    await loginInUi(recipient, bob, PASSWORD);

    // 3) Conversa directa
    await page.getByRole("button", { name: "Nova conversa", exact: true }).first().click();
    await page.getByLabel("Pesquisar utilizadores").fill(bob);
    await page.getByRole("dialog").getByRole("button", { name: new RegExp(bob) }).click();
    await page.getByLabel("Mensagem", { exact: true }).fill("Olá, esta é uma mensagem normal.");
    await page.getByRole("button", { name: "Enviar mensagem", exact: true }).click();
    await expect(recipient.getByRole("navigation").getByRole("button", { name: /Ana Teste/ })).toBeVisible();
    await recipient.getByRole("navigation").getByRole("button", { name: /Ana Teste/ }).click();
    await expect(recipient.locator(".message-text")).toHaveText("Olá, esta é uma mensagem normal.");

    // 4) Editar
    await page.getByRole("button", { name: "Editar mensagem", exact: true }).click();
    await page.getByLabel("Mensagem", { exact: true }).fill("Mensagem normal editada.");
    await page.getByRole("button", { name: "Guardar edição" }).click();
    await expect(recipient.locator(".message-text")).toHaveText("Mensagem normal editada.");

    // 5) Mensagem oculta com TXT
    const png = await page.evaluate(() => {
      const canvas = document.createElement("canvas"); canvas.width = 120; canvas.height = 120;
      const context = canvas.getContext("2d")!; context.fillStyle = "#9f82cf"; context.fillRect(0, 0, 120, 120);
      return canvas.toDataURL("image/png").split(",")[1];
    });
    await page.getByRole("button", { name: "Esconder numa imagem" }).click();
    await page.locator("#image-upload").setInputFiles({ name: "imagem.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
    await page.getByLabel("Mensagem", { exact: true }).fill("Rascunho a preservar");
    await page.getByLabel("Associar ficheiro TXT").setInputFiles({ name: "vazio.txt", mimeType: "text/plain", buffer: Buffer.alloc(0) });
    await expect(page.getByRole("alert").filter({ hasText: "O ficheiro TXT" })).toContainText("vazio");
    await expect(page.getByLabel("Mensagem", { exact: true })).toHaveValue("Rascunho a preservar");

    const imported = "Segredo com ação e emoji 🔐\nSegunda linha do ficheiro.";
    page.once("dialog", dialog => dialog.dismiss());
    await page.getByLabel("Associar ficheiro TXT").setInputFiles({ name: "segredo.txt", mimeType: "text/plain", buffer: Buffer.from(imported) });
    await expect(page.getByLabel("Mensagem", { exact: true })).toHaveValue("Rascunho a preservar");
    page.once("dialog", dialog => dialog.accept());
    await page.getByLabel("Associar ficheiro TXT").setInputFiles({ name: "segredo.txt", mimeType: "text/plain", buffer: Buffer.from(imported) });
    await expect(page.getByLabel("Mensagem", { exact: true })).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(imported);
    await expect(page.getByText("Ficheiro: segredo.txt · conteúdo não apresentado")).toBeVisible();
    await page.getByRole("button", { name: "Remover ficheiro TXT" }).click();
    await expect(page.getByLabel("Mensagem", { exact: true })).toHaveValue("");
    await page.getByLabel("Associar ficheiro TXT").setInputFiles({ name: "segredo.txt", mimeType: "text/plain", buffer: Buffer.from(imported) });
    await page.screenshot({ path: test.info().outputPath("txt-import.png"), fullPage: true });
    await page.evaluate(() => {
      const originalFetch = window.fetch;
      window.fetch = (input, init) => {
        if (init?.body instanceof FormData) document.documentElement.dataset.sentFields = JSON.stringify([...init.body.keys()]);
        return originalFetch(input, init);
      };
    });
    await page.getByRole("button", { name: "Enviar mensagem", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-sent-fields", JSON.stringify(["kind", "text_file", "image"]));
    await expect(page.locator("body")).not.toContainText(imported);
    await expect(recipient.locator("body")).not.toContainText(imported);
    await recipient.getByRole("button", { name: "Revelar mensagem", exact: true }).click();
    await expect(recipient.locator(".revealed-text")).toHaveText(imported);
    await recipient.getByRole("button", { name: "Ocultar texto" }).click();
    await recipient.getByRole("button", { name: "Revelar mensagem", exact: true }).click();
    await expect(recipient.locator(".revealed-text")).toHaveText(imported);

    // 6) Editar mensagem oculta
    await page.getByRole("button", { name: "Editar mensagem", exact: true }).last().click();
    await page.getByLabel("Mensagem", { exact: true }).fill("Segredo editado 🌍");
    await page.getByRole("button", { name: "Guardar edição" }).click();
    await expect(recipient.locator(".revealed-text")).toHaveCount(0);
    await recipient.getByRole("button", { name: "Revelar mensagem", exact: true }).click();
    await expect(recipient.locator(".revealed-text")).toHaveText("Segredo editado 🌍");
    await recipient.screenshot({ path: test.info().outputPath("chat-desktop.png"), fullPage: true });

    // 7) Download + revelar via ficheiro (outsider)
    const download = recipient.waitForEvent("download");
    await recipient.getByRole("link", { name: "Guardar imagem PNG" }).click();
    const downloaded = await download;
    expect(downloaded.suggestedFilename()).toMatch(/mensagem-\d+\.png/);
    const downloadedPath = (await downloaded.path())!;

    await recipient.getByRole("button", { name: "Revelar uma imagem" }).click();
    await recipient.getByLabel("Imagem PNG", { exact: true }).setInputFiles(downloadedPath);
    await recipient.getByRole("dialog").getByRole("button", { name: "Revelar mensagem", exact: true }).click();
    await expect(recipient.locator(".decoded-result p")).toHaveText("Segredo editado 🌍");
    await recipient.getByRole("button", { name: "Fechar janela" }).click();

    await registerAndVerify(request, {
      username: eve,
      display_name: "Terceira pessoa",
      email: `${eve}@example.com`,
    });
    const outsiderContext = await browser.newContext({ baseURL: BASE });
    try {
      const outsider = await outsiderContext.newPage();
      await loginInUi(outsider, eve, PASSWORD);
      await outsider.getByRole("button", { name: "Revelar uma imagem" }).click();
      await outsider.getByLabel("Imagem PNG", { exact: true }).setInputFiles(downloadedPath);
      await outsider.getByRole("dialog").getByRole("button", { name: "Revelar mensagem", exact: true }).click();
      await expect(outsider.getByRole("dialog").getByRole("alert")).toContainText("não é um dos destinatários autorizados");
      await expect(outsider.locator(".decoded-result")).toHaveCount(0);
      await expect(outsider.locator("body")).not.toContainText("Segredo editado 🌍");
    } finally { await outsiderContext.close(); }

    // 8) Eliminar, criar grupo, sair do grupo
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Eliminar mensagem", exact: true }).first().click();
    await expect(recipient.locator(".message-text")).toHaveCount(0);
    await page.getByRole("button", { name: "Criar grupo", exact: true }).click();
    await page.getByLabel("Nome do grupo").fill(`Grupo ${suffix}`);
    await page.getByLabel("Pesquisar utilizadores").fill(bob);
    await page.getByRole("dialog").getByRole("button", { name: new RegExp(bob) }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Criar grupo", exact: true }).click();
    await expect(page.getByRole("heading", { name: `Grupo ${suffix}`, exact: true })).toBeVisible();
    await recipient.getByRole("navigation").getByRole("button", { name: new RegExp(`Grupo ${suffix}`) }).click();
    await recipient.getByRole("button", { name: "Grupo", exact: true }).click();
    recipient.once("dialog", dialog => dialog.accept());
    await recipient.getByRole("button", { name: "Sair do grupo", exact: true }).click();
    await expect(recipient.getByRole("navigation").getByRole("button", { name: new RegExp(`Grupo ${suffix}`) })).toHaveCount(0);

    // 9) Persistência + logout
    await page.reload();
    await expect(page.getByRole("heading", { name: "Conversas", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Sair da conta" }).click();
    await expect(page.getByRole("button", { name: "Entrar na conversa" })).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await recipientContext.close(); }
});

test("interface móvel mantém acesso às conversas", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const suffix = Date.now().toString();
  const username = `movel_${suffix}`;
  const other = `outro_${suffix}`;
  await registerAndVerify(request, { username, display_name: "Móvel", email: `${username}@example.com` });
  await registerAndVerify(request, { username: other, display_name: "Outra pessoa", email: `${other}@example.com` });

  await loginInUi(page, username, PASSWORD);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("chat-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "Revelar uma imagem" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Nova conversa", exact: true }).first().click();
  await page.getByLabel("Pesquisar utilizadores").fill(other);
  await page.getByRole("dialog").getByRole("button", { name: new RegExp(other) }).click();
  await page.getByLabel("Mensagem", { exact: true }).fill("Olá pelo telemóvel!");
  await page.getByRole("button", { name: "Enviar mensagem", exact: true }).click();
  await expect(page.locator(".message-text")).toHaveText("Olá pelo telemóvel!");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("conversation-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "Voltar às conversas" }).click();
  await expect(page.getByRole("heading", { name: "Conversas", exact: true })).toBeVisible();
});

test("recuperação de palavra-passe invalida sessões antigas", async ({ page, request }) => {
  const suffix = Date.now().toString();
  const username = `rec_${suffix}`;
  const email = `${username}@example.com`;
  await registerAndVerify(request, { username, display_name: "Recuperação", email });
  await loginInUi(page, username, PASSWORD);

  const forgot = await request.post("/api/auth/forgot-password", { data: { email } });
  expect(forgot.status()).toBe(202);
  const forgotBody = await forgot.json();
  expect(forgotBody.debug_token, "AUTH_TEST_MODE=1 deve estar activo").toBeTruthy();

  const reset = await request.post("/api/auth/reset-password", {
    data: { email, token: forgotBody.debug_token, new_password: "NovaSenha98765" },
  });
  expect(reset.status()).toBe(200);

  // A sessão do browser deixa de valer: o polling apanha 401 e volta ao login.
  await expect(page.getByRole("button", { name: "Entrar na conversa" })).toBeVisible({ timeout: 10_000 });

  await loginInUi(page, username, "NovaSenha98765");
});