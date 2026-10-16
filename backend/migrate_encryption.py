"""Protege imagens existentes; grupos antigos sem histórico de membros: só autor."""
import logging
import secrets
import sqlite3
from datetime import datetime, timezone

from backend import database, protected_images, steganography


def migrate():
    with database.connect() as db:
        pending = db.execute("SELECT COUNT(*) FROM messages WHERE kind='hidden' AND payload_id IS NULL").fetchone()[0]
    if not pending:
        return {"converted": 0, "blocked": 0}
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    backup_path = database.DB_PATH.with_name(f"{database.DB_PATH.stem}.before-encryption-{stamp}-{secrets.token_hex(3)}.db")
    with database.connect() as source:
        target = sqlite3.connect(backup_path)
        try:
            source.backup(target)
        finally:
            target.close()
    converted = blocked = 0
    with database.connect() as db:
        db.execute("BEGIN IMMEDIATE")
        rows = db.execute("SELECT m.*, c.kind chat_kind FROM messages m JOIN chats c ON c.id=m.chat_id WHERE m.kind='hidden' AND m.payload_id IS NULL").fetchall()
        for row in rows:
            # Os grupos anteriores não registavam participantes por mensagem.
            ids = {row["sender_id"]}
            if row["chat_kind"] == "direct":
                ids.update(member[0] for member in db.execute("SELECT user_id FROM members WHERE chat_id=?", (row["chat_id"],)))
            try:
                text = steganography.reveal(row["image"])
                if text.startswith(protected_images.PREFIX):
                    raise ValueError("Envelope sem associação na base de dados")
                image, pid = protected_images.seal(db, row["image"], text, ids, stored_image=True)
            except ValueError:
                blocked += 1
                continue
            db.execute("UPDATE messages SET image=?, payload_id=?, edited_at=? WHERE id=?", (image, pid, datetime.now(timezone.utc).isoformat(), row["id"]))
            converted += 1
    logging.getLogger("uvicorn.error").info("Proteção de imagens: %s convertidas, %s bloqueadas. Backup anterior: %s", converted, blocked, backup_path)
    return {"converted": converted, "blocked": blocked}


if __name__ == "__main__":
    database.initialize()
    print(migrate())
