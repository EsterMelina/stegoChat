import { expect, test } from "@playwright/test";
import { validateTextFile } from "../lib/text-file";

test("seleção de TXT não lê o conteúdo no navegador", () => {
  const file = new File(["Segredo 🔐"], "mensagem.TXT");
  file.arrayBuffer = async () => { throw new Error("O navegador não deve ler o TXT"); };
  file.text = async () => { throw new Error("O navegador não deve ler o TXT"); };
  expect(() => validateTextFile(file)).not.toThrow();
});

test("seleção valida apenas tamanho e extensão do ficheiro", () => {
  expect(() => validateTextFile(new File([], "vazio.txt"))).toThrow("vazio");
  expect(() => validateTextFile(new File(["texto"], "documento.pdf"))).toThrow("extensão .txt");
  expect(() => validateTextFile(new File(["a".repeat(65537)], "grande.txt"))).toThrow("64 KB");
});
