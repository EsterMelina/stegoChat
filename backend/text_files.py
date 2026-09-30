"""Valida e lê o TXT apenas no backend, sem devolver o conteúdo ao remetente."""
MAX_TXT_BYTES = 64 * 1024


def read_text_file(filename: str, data: bytes) -> str:
    if not filename.lower().endswith(".txt"):
        raise ValueError("Selecione um ficheiro com extensão .txt.")
    if len(data) > MAX_TXT_BYTES:
        raise ValueError("O ficheiro TXT deve ter até 64 KB.")
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise ValueError("Guarde o ficheiro TXT com codificação UTF-8 e tente novamente.") from None
    if "\0" in text:
        raise ValueError("O ficheiro deve conter texto em UTF-8, não dados binários.")
    if not text.strip():
        raise ValueError("O ficheiro TXT está vazio ou contém apenas espaços.")
    if len(text) > 10000:
        raise ValueError("O TXT excede o limite de 10 000 caracteres.")
    return text
