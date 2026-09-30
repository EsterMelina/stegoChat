"""Backup consistente do SQLite, incluindo imagens. Não copia um WAL incompleto."""
import argparse
import sqlite3
from datetime import datetime
from pathlib import Path

from backend.database import DB_PATH


def main():
    parser = argparse.ArgumentParser(description="Criar um backup consistente da base de dados do StegChat.")
    parser.add_argument("destination", nargs="?", default=f"backups/chat-{datetime.now():%Y%m%d-%H%M%S}.db")
    args = parser.parse_args()
    destination = Path(args.destination).resolve()
    if not DB_PATH.exists():
        parser.error("A base de dados ainda não existe. Inicie primeiro o backend.")
    if destination == DB_PATH.resolve() or destination.exists():
        parser.error("Escolha um novo ficheiro de destino; não é permitido substituir ficheiros existentes.")
    destination.parent.mkdir(parents=True, exist_ok=True)
    source = sqlite3.connect(DB_PATH)
    target = sqlite3.connect(destination)
    try:
        source.backup(target)
    finally:
        target.close()
        source.close()
    print(f"Backup criado: {destination}")


if __name__ == "__main__":
    main()
