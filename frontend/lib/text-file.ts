/** Só valida metadados. O conteúdo do TXT é lido exclusivamente pelo backend. */
export function validateTextFile(file: File): void {
  if (!/\.txt$/i.test(file.name)) throw new Error("Selecione um ficheiro com extensão .txt.");
  if (file.size > 64 * 1024) throw new Error("O ficheiro TXT deve ter até 64 KB e 10 000 caracteres.");
  if (file.size === 0) throw new Error("O ficheiro TXT está vazio.");
}
