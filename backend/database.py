"""SQLite: schema, ligações e transações (imagens incluídas no backup)."""
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

DB_PATH = Path(os.getenv("CHAT_DB_PATH", str(Path(__file__).parent / "data" / "chat.db")))


@contextmanager
def connect():
    connection = sqlite3.connect(DB_PATH, timeout=20)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def initialize():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with connect() as db:
        db.execute("PRAGMA journal_mode = WAL")
        db.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                display_name TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS chats (
                id INTEGER PRIMARY KEY,
                kind TEXT NOT NULL CHECK (kind IN ('direct', 'group')),
                name TEXT,
                direct_key TEXT UNIQUE,
                owner_id INTEGER REFERENCES users(id),
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS members (
                chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                last_read_id INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (chat_id, user_id)
            );
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
                sender_id INTEGER NOT NULL REFERENCES users(id),
                kind TEXT NOT NULL CHECK (kind IN ('text', 'hidden')),
                body TEXT,
                image BLOB,
                created_at TEXT NOT NULL,
                edited_at TEXT,
                CHECK ((kind = 'text' AND body IS NOT NULL AND image IS NULL)
                    OR (kind = 'hidden' AND body IS NULL AND image IS NOT NULL))
            );
            CREATE INDEX IF NOT EXISTS messages_chat ON messages(chat_id, id);
            CREATE INDEX IF NOT EXISTS members_user ON members(user_id);
            CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
            CREATE TABLE IF NOT EXISTS protected_payloads (
                id TEXT PRIMARY KEY,
                encryption_key BLOB NOT NULL CHECK(length(encryption_key)=32)
            );
            CREATE TABLE IF NOT EXISTS payload_recipients (
                payload_id TEXT NOT NULL REFERENCES protected_payloads(id),
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                PRIMARY KEY(payload_id, user_id)
            );
        """)
        columns = {row[1] for row in db.execute("PRAGMA table_info(messages)")}
        if "payload_id" not in columns:
            db.execute("ALTER TABLE messages ADD COLUMN payload_id TEXT REFERENCES protected_payloads(id)")
        db.execute("PRAGMA user_version = 2")
