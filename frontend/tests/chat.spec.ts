import { expect, test } from "@playwright/test";

test("duas contas: conversar, ocultar, revelar, editar, eliminar e gerir grupo", async ({ browser, page }) => {
  const suffix = Date.now().toString();
  const alice = `ana_${suffix}`;
  const bob = `rui_${suffix}`;
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const recipientContext = await browser.newContext({ baseURL: "http://127.0.0.1:3011" });
  const recipient = await recipientContext.newPage();
  try {
    for (const [tab, username, name] of [[page, alice, "Ana Teste"], [recipient, bob, "Rui Teste"]] as const) {
      await tab.goto("/");
      await tab.getByRole("button", { name: "Criar conta", exact: true }).click();
      await tab.getByLabel("Nome de apresentação").fill(name);
      await tab.getByLabel("Username", { exact: true }).fill(username);
      await tab.getByLabel("Palavra-passe").fill("UmaSenha12345");
      await tab.getByRole("button", { name: "Criar conta e começar" }).click();
      await expect(tab.getByRole("heading", { name: "Conversas", exact: true })).toBeVisible();
    }
    await page.getByRole("button", { name: "Nova conversa", exact: true }).first().click();
    await page.getByLabel("Pesquisar utilizadores").fill(bob);
    await page.getByRole("dialog").getByRole("button", { name: new RegExp(bob) }).click();
    await page.getByLabel("Mensagem", { exact: true }).fill("Olá, esta é uma mensagem normal.");
    await page.getByRole("button", { name: "Enviar mensagem", exact: true }).click();
    await expect(recipient.getByRole("navigation").getByRole("button", { name: /Ana Teste/ })).toBeVisible();
    await recipient.getByRole("navigation").getByRole("button", { name: /Ana Teste/ }).click();
    await expect(recipient.locator(".message-text")).toHaveText("Olá, esta é uma mensagem normal.");

    await page.getByRole("button", { name: "Editar mensagem", exact: true }).click();
    await page.getByLabel("Mensagem", { exact: true }).fill("Mensagem normal editada.");
    await page.getByRole("button", { name: "Guardar edição" }).click();
    await expect(recipient.locator(".message-text")).toHaveText("Mensagem normal editada.");

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
    await expect(page.getByLabel("Associar ficheiro TXT")).toBeEnabled();
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
    // O Chrome não disponibiliza postDataBuffer para todos os uploads de ficheiros.
    // Regista apenas nomes dos campos, sem ler o TXT nem alterar o pedido.
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
    await page.getByRole("button", { name: "Editar mensagem", exact: true }).last().click();
    await page.getByLabel("Mensagem", { exact: true }).fill("Segredo editado 🌍");
    await page.getByRole("button", { name: "Guardar edição" }).click();
    await expect(recipient.locator(".revealed-text")).toHaveCount(0);
    await recipient.getByRole("button", { name: "Revelar mensagem", exact: true }).click();
    await expect(recipient.locator(".revealed-text")).toHaveText("Segredo editado 🌍");
    await recipient.screenshot({ path: test.info().outputPath("chat-desktop.png"), fullPage: true });
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

    const outsiderContext = await browser.newContext({ baseURL: "http://127.0.0.1:3011" });
    try {
      const outsider = await outsiderContext.newPage();
      await outsider.goto("/");
      await outsider.getByRole("button", { name: "Criar conta", exact: true }).click();
      await outsider.getByLabel("Nome de apresentação").fill("Terceira pessoa");
      await outsider.getByLabel("Username", { exact: true }).fill(`eve_${suffix}`);
      await outsider.getByLabel("Palavra-passe").fill("UmaSenha12345");
      await outsider.getByRole("button", { name: "Criar conta e começar" }).click();
      await outsider.getByRole("button", { name: "Revelar uma imagem" }).click();
      await outsider.getByLabel("Imagem PNG", { exact: true }).setInputFiles(downloadedPath);
      await outsider.getByRole("dialog").getByRole("button", { name: "Revelar mensagem", exact: true }).click();
      await expect(outsider.getByRole("dialog").getByRole("alert")).toContainText("não é um dos destinatários autorizados");
      await expect(outsider.locator(".decoded-result")).toHaveCount(0);
      await expect(outsider.locator("body")).not.toContainText("Segredo editado 🌍");
    } finally { await outsiderContext.close(); }

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
    await page.reload();
    await expect(page.getByRole("heading", { name: "Conversas", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Sair da conta" }).click();
    await expect(page.getByRole("button", { name: "Entrar na conversa" })).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await recipientContext.close(); }
});

test("interface móvel mantém acesso às conversas", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await page.getByLabel("Nome de apresentação").fill("Móvel");
  await page.getByLabel("Username", { exact: true }).fill(`movel_${Date.now()}`);
  await page.getByLabel("Palavra-passe").fill("UmaSenha12345");
  await page.getByRole("button", { name: "Criar conta e começar" }).click();
  await expect(page.getByRole("heading", { name: "Conversas", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("chat-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "Revelar uma imagem" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const other = `outro_${Date.now()}`;
  const account = await request.post("/api/auth/register", { data: { username: other, display_name: "Outra pessoa", password: "UmaSenha12345" } });
  expect(account.status()).toBe(201);
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
