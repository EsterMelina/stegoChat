"""Migração aditiva do schema para email verificado e recuperação de palavra-passe."""
from backend.auth_email import ensure_schema


if __name__ == "__main__":
    ensure_schema()
    print("Migração de autenticação concluída. Não foram apagados utilizadores ou mensagens.")
