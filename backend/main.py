"""API do chat. Execute da raiz: python -m uvicorn backend.main:app --reload --port 8001."""
import os
import re
import secrets
import sqlite3
import threading
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from backend import database, security, steganography, text_files

COOKIE = "stegchat_session"
SESSION_SECONDS = 7 * 24 * 60 * 60
SECURE_COOKIES = os.getenv("CHAT_SECURE_COOKIES", "0") == "1"
ALLOWED_ORIGINS = set(os.getenv("CHAT_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000,http://localhost:8001,http://127.0.0.1:8001").split(","))
attempts = defaultdict(deque)
attempt_lock = threading.Lock()


def now():
    return datetime.now(timezone.utc).isoformat()


@asynccontextmanager
async def lifespan(app):
    database.initialize()
    yield


app = FastAPI(title="StegChat API", version="1.0.0", lifespan=lifespan)


@app.middleware("http")
async def protect_requests(request: Request, call_next):
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        origin = request.headers.get("origin")
        if (origin and origin not in ALLOWED_ORIGINS) or request.headers.get("sec-fetch-site") == "cross-site":
            return JSONResponse({"detail": "Origem do pedido não autorizada."}, status_code=403)
    try:
        if int(request.headers.get("content-length", "0")) > 25 * 1024 * 1024:
            return JSONResponse({"detail": "Ficheiro demasiado grande."}, status_code=413)
    except ValueError:
        return JSONResponse({"detail": "Pedido inválido."}, status_code=400)
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


def public_user(row):
    return {key: row[key] for key in ("id", "username", "display_name")}


def current_user(request: Request):
    token = request.cookies.get(COOKIE, "")
    with database.connect() as db:
        user = db.execute("SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?",
                          (security.hash_token(token), time.time())).fetchone()
    if not user:
        raise HTTPException(401, "Entre na sua conta para continuar.")
    return public_user(user)


def throttle(request):
    key = request.client.host if request.client else "local"
    with attempt_lock:
        timestamp = time.monotonic()
        # Limpeza evita acumular indefinidamente endereços antigos.
        for old_key in list(attempts):
            if not attempts[old_key] or attempts[old_key][-1] < timestamp - 60:
                del attempts[old_key]
        bucket = attempts[key]
        while bucket and bucket[0] < timestamp - 60:
            bucket.popleft()
        if len(bucket) >= 30:
            raise HTTPException(429, "Demasiadas tentativas. Aguarde um minuto.")
        bucket.append(timestamp)


def session(db, user_id, response, old_token=""):
    token = secrets.token_urlsafe(32)
    db.execute("DELETE FROM sessions WHERE expires_at<? OR token_hash=?", (time.time(), security.hash_token(old_token)))
    db.execute("INSERT INTO sessions VALUES (?, ?, ?)", (security.hash_token(token), user_id, time.time() + SESSION_SECONDS))
    response.set_cookie(COOKIE, token, httponly=True, secure=SECURE_COOKIES, samesite="strict", max_age=SESSION_SECONDS, path="/")


class Credentials(BaseModel):
    username: str = Field(min_length=3, max_length=30)
    password: str = Field(min_length=8, max_length=128)


class Registration(Credentials):
    display_name: str = Field(min_length=1, max_length=60)


class DirectChat(BaseModel):
    user_id: int


class GroupChat(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    member_ids: list[int] = Field(default_factory=list, max_length=50)


class MessageEdit(BaseModel):
    body: str = Field(min_length=1, max_length=10000)


class ReadMarker(BaseModel):
    message_id: int = Field(ge=0)


def require_member(db, chat_id, user_id):
    chat = db.execute("SELECT c.* FROM chats c JOIN members m ON m.chat_id=c.id WHERE c.id=? AND m.user_id=?", (chat_id, user_id)).fetchone()
    if not chat:
        raise HTTPException(404, "Conversa não encontrada ou sem acesso.")
    return chat


def require_owner(db, chat_id, user_id):
    chat = require_member(db, chat_id, user_id)
    if chat["kind"] != "group" or chat["owner_id"] != user_id:
        raise HTTPException(403, "Só o administrador pode gerir este grupo.")
    return chat


def message_row(db, message_id, user_id):
    # Não carrega imagens quando só precisamos de metadados.
    row = db.execute("SELECT id, chat_id, sender_id, kind FROM messages WHERE id=?", (message_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Mensagem não encontrada.")
    require_member(db, row["chat_id"], user_id)
    return row


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "stegchat"}


@app.post("/api/auth/register", status_code=201)
def register(data: Registration, request: Request, response: Response):
    throttle(request)
    username = data.username.strip().lower()
    if not re.fullmatch(r"[a-z0-9_]{3,30}", username) or not data.display_name.strip():
        raise HTTPException(422, "Use um nome e um username com 3–30 letras, números ou underscore.")
    password_hash = security.hash_password(data.password)
    try:
        with database.connect() as db:
            cursor = db.execute("INSERT INTO users (username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?)",
                                (username, data.display_name.strip(), password_hash, now()))
            session(db, cursor.lastrowid, response, request.cookies.get(COOKIE, ""))
            return public_user(db.execute("SELECT * FROM users WHERE id=?", (cursor.lastrowid,)).fetchone())
    except sqlite3.IntegrityError:
        raise HTTPException(409, "Este username já está em uso.")


@app.post("/api/auth/login")
def login(data: Credentials, request: Request, response: Response):
    throttle(request)
    with database.connect() as db:
        user = db.execute("SELECT * FROM users WHERE username=?", (data.username.strip().lower(),)).fetchone()
        if not user:
            security.hash_password(data.password)  # Trabalho equivalente ao de uma conta existente.
            raise HTTPException(401, "Username ou palavra-passe incorretos.")
        if not security.verify_password(data.password, user["password_hash"]):
            raise HTTPException(401, "Username ou palavra-passe incorretos.")
        session(db, user["id"], response, request.cookies.get(COOKIE, ""))
        return public_user(user)


@app.post("/api/auth/logout")
def logout(request: Request, response: Response):
    with database.connect() as db:
        db.execute("DELETE FROM sessions WHERE token_hash=?", (security.hash_token(request.cookies.get(COOKIE, "")),))
    response.delete_cookie(COOKIE, path="/", secure=SECURE_COOKIES, httponly=True, samesite="strict")
    return {"ok": True}


@app.get("/api/auth/me")
def me(user=Depends(current_user)):
    return user


@app.get("/api/users")
def search_users(q: str = "", user=Depends(current_user)):
    query = q.strip()[:60].replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    with database.connect() as db:
        rows = db.execute("SELECT id, username, display_name FROM users WHERE id!=? AND (username LIKE ? ESCAPE '\\' OR display_name LIKE ? ESCAPE '\\') ORDER BY username LIMIT 30",
                          (user["id"], f"%{query}%", f"%{query}%")).fetchall()
    return [dict(row) for row in rows]


@app.get("/api/chats")
def chats(user=Depends(current_user)):
    with database.connect() as db:
        rows = db.execute("""SELECT c.*, COALESCE((SELECT MAX(id) FROM messages WHERE chat_id=c.id), 0) last_id,
            (SELECT COUNT(*) FROM messages WHERE chat_id=c.id AND id>m.last_read_id AND sender_id!=?) unread
            FROM chats c JOIN members m ON m.chat_id=c.id WHERE m.user_id=? ORDER BY last_id DESC, c.id DESC""", (user["id"], user["id"])).fetchall()
        result = []
        for row in rows:
            item = dict(row)
            item.pop("direct_key")
            item["members"] = [dict(member) for member in db.execute("SELECT u.id, u.username, u.display_name FROM users u JOIN members m ON m.user_id=u.id WHERE m.chat_id=? ORDER BY u.id", (row["id"],))]
            last = db.execute("SELECT kind, body, created_at FROM messages WHERE chat_id=? ORDER BY id DESC LIMIT 1", (row["id"],)).fetchone()
            item["last_message"] = dict(last) if last else None
            result.append(item)
        return result


@app.post("/api/chats/direct")
def direct(data: DirectChat, user=Depends(current_user)):
    if data.user_id == user["id"]:
        raise HTTPException(422, "Escolha outro utilizador.")
    key = ":".join(map(str, sorted([user["id"], data.user_id])))
    with database.connect() as db:
        if not db.execute("SELECT id FROM users WHERE id=?", (data.user_id,)).fetchone():
            raise HTTPException(404, "Utilizador não encontrado.")
        db.execute("INSERT OR IGNORE INTO chats (kind, direct_key, created_at) VALUES ('direct', ?, ?)", (key, now()))
        chat_id = db.execute("SELECT id FROM chats WHERE direct_key=?", (key,)).fetchone()[0]
        for uid in (user["id"], data.user_id):
            db.execute("INSERT OR IGNORE INTO members (chat_id, user_id) VALUES (?, ?)", (chat_id, uid))
        return {"id": chat_id}


@app.post("/api/chats/groups", status_code=201)
def group(data: GroupChat, user=Depends(current_user)):
    if not data.name.strip():
        raise HTTPException(422, "Introduza um nome para o grupo.")
    ids = set(data.member_ids) | {user["id"]}
    if len(ids) < 2 or len(ids) > 50:
        raise HTTPException(422, "Um grupo deve começar com 2 a 50 participantes.")
    with database.connect() as db:
        for uid in ids:
            if not db.execute("SELECT id FROM users WHERE id=?", (uid,)).fetchone():
                raise HTTPException(404, "Um dos utilizadores não existe.")
        cursor = db.execute("INSERT INTO chats (kind, name, owner_id, created_at) VALUES ('group', ?, ?, ?)", (data.name.strip(), user["id"], now()))
        chat_id = cursor.lastrowid
        db.executemany("INSERT INTO members (chat_id, user_id) VALUES (?, ?)", [(chat_id, uid) for uid in ids])
        return {"id": chat_id}


@app.patch("/api/chats/{chat_id}")
def rename_group(chat_id: int, data: GroupChat, user=Depends(current_user)):
    if not data.name.strip():
        raise HTTPException(422, "Introduza um nome para o grupo.")
    with database.connect() as db:
        require_owner(db, chat_id, user["id"])
        db.execute("UPDATE chats SET name=? WHERE id=?", (data.name.strip(), chat_id))
    return {"ok": True}


@app.post("/api/chats/{chat_id}/members")
def add_member(chat_id: int, data: DirectChat, user=Depends(current_user)):
    with database.connect() as db:
        require_owner(db, chat_id, user["id"])
        if db.execute("SELECT COUNT(*) FROM members WHERE chat_id=?", (chat_id,)).fetchone()[0] >= 50:
            raise HTTPException(422, "O grupo atingiu o limite de 50 participantes.")
        if not db.execute("SELECT id FROM users WHERE id=?", (data.user_id,)).fetchone():
            raise HTTPException(404, "Utilizador não encontrado.")
        db.execute("INSERT OR IGNORE INTO members (chat_id, user_id) VALUES (?, ?)", (chat_id, data.user_id))
    return {"ok": True}


@app.delete("/api/chats/{chat_id}/members/{member_id}")
def remove_member(chat_id: int, member_id: int, user=Depends(current_user)):
    with database.connect() as db:
        require_owner(db, chat_id, user["id"])
        if member_id == user["id"]:
            raise HTTPException(422, "Use a opção Sair do grupo.")
        db.execute("DELETE FROM members WHERE chat_id=? AND user_id=?", (chat_id, member_id))
    return {"ok": True}


@app.post("/api/chats/{chat_id}/leave")
def leave_group(chat_id: int, user=Depends(current_user)):
    with database.connect() as db:
        chat = require_member(db, chat_id, user["id"])
        if chat["kind"] != "group":
            raise HTTPException(422, "Esta conversa não é um grupo.")
        db.execute("DELETE FROM members WHERE chat_id=? AND user_id=?", (chat_id, user["id"]))
        remaining = db.execute("SELECT user_id FROM members WHERE chat_id=? ORDER BY user_id LIMIT 1", (chat_id,)).fetchone()
        if not remaining:
            db.execute("DELETE FROM chats WHERE id=?", (chat_id,))
        elif chat["owner_id"] == user["id"]:
            db.execute("UPDATE chats SET owner_id=? WHERE id=?", (remaining[0], chat_id))
    return {"ok": True}


@app.get("/api/chats/{chat_id}/messages")
def messages(chat_id: int, user=Depends(current_user)):
    with database.connect() as db:
        require_member(db, chat_id, user["id"])
        rows = db.execute("""SELECT m.id, m.chat_id, m.sender_id, m.kind, m.body, m.created_at, m.edited_at,
            u.username, u.display_name FROM messages m JOIN users u ON u.id=m.sender_id
            WHERE m.chat_id=? ORDER BY m.id""", (chat_id,)).fetchall()
    return [dict(row) for row in rows]


@app.post("/api/chats/{chat_id}/read")
def mark_read(chat_id: int, data: ReadMarker, user=Depends(current_user)):
    with database.connect() as db:
        require_member(db, chat_id, user["id"])
        maximum = db.execute("SELECT COALESCE(MAX(id), 0) FROM messages WHERE chat_id=?", (chat_id,)).fetchone()[0]
        db.execute("UPDATE members SET last_read_id=MAX(last_read_id, ?) WHERE chat_id=? AND user_id=?", (min(data.message_id, maximum), chat_id, user["id"]))
    return {"ok": True}


@app.post("/api/chats/{chat_id}/messages", status_code=201)
def send_message(chat_id: int, body: str = Form("", max_length=10000), kind: str = Form("text"), image: UploadFile | None = File(None), text_file: UploadFile | None = File(None), user=Depends(current_user)):
    if kind not in {"text", "hidden"}:
        raise HTTPException(422, "Selecione um modo válido.")
    with database.connect() as db:
        require_member(db, chat_id, user["id"])
    if text_file is not None:
        if kind != "hidden" or body:
            raise HTTPException(422, "Envie o TXT apenas no modo oculto, sem texto escrito em simultâneo.")
        try:
            body = text_files.read_text_file(text_file.filename or "", text_file.file.read(text_files.MAX_TXT_BYTES + 1))
        except ValueError as error:
            raise HTTPException(422, str(error))
    if not body.strip():
        raise HTTPException(422, "Escreva uma mensagem ou associe um ficheiro TXT.")
    encoded = None
    if kind == "hidden":
        if image is None:
            raise HTTPException(422, "Escolha uma imagem para esconder a mensagem.")
        try:
            encoded = steganography.hide(image.file.read(steganography.MAX_UPLOAD + 1), body)
        except ValueError as error:
            raise HTTPException(422, str(error))
    with database.connect() as db:
        require_member(db, chat_id, user["id"])
        cursor = db.execute("INSERT INTO messages (chat_id, sender_id, kind, body, image, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                            (chat_id, user["id"], kind, body if kind == "text" else None, encoded, now()))
        return {"id": cursor.lastrowid}


@app.patch("/api/messages/{message_id}")
def edit_message(message_id: int, data: MessageEdit, user=Depends(current_user)):
    if not data.body.strip():
        raise HTTPException(422, "A mensagem não pode estar vazia.")
    with database.connect() as db:
        row = message_row(db, message_id, user["id"])
        if row["sender_id"] != user["id"]:
            raise HTTPException(403, "Só pode editar as suas mensagens.")
        if row["kind"] == "hidden":
            source = db.execute("SELECT image FROM messages WHERE id=?", (message_id,)).fetchone()[0]
            try:
                encoded = steganography.hide(source, data.body, stored_image=True)
            except ValueError as error:
                raise HTTPException(422, str(error))
            db.execute("UPDATE messages SET image=?, edited_at=? WHERE id=?", (encoded, now(), message_id))
        else:
            db.execute("UPDATE messages SET body=?, edited_at=? WHERE id=?", (data.body, now(), message_id))
    return {"ok": True}


@app.delete("/api/messages/{message_id}")
def delete_message(message_id: int, user=Depends(current_user)):
    with database.connect() as db:
        row = message_row(db, message_id, user["id"])
        if row["sender_id"] != user["id"]:
            raise HTTPException(403, "Só pode eliminar as suas mensagens.")
        db.execute("DELETE FROM messages WHERE id=?", (message_id,))
    return {"ok": True}


@app.get("/api/messages/{message_id}/image")
def message_image(message_id: int, user=Depends(current_user)):
    with database.connect() as db:
        row = message_row(db, message_id, user["id"])
        if row["kind"] != "hidden":
            raise HTTPException(404, "Esta mensagem não contém uma imagem.")
        data = db.execute("SELECT image FROM messages WHERE id=?", (message_id,)).fetchone()[0]
    return Response(data, media_type="image/png", headers={"Content-Disposition": f'inline; filename="mensagem-{message_id}.png"'})


@app.post("/api/messages/{message_id}/reveal")
def reveal_message(message_id: int, user=Depends(current_user)):
    with database.connect() as db:
        row = message_row(db, message_id, user["id"])
        if row["kind"] != "hidden":
            raise HTTPException(422, "Esta mensagem já está em texto simples.")
        data = db.execute("SELECT image FROM messages WHERE id=?", (message_id,)).fetchone()[0]
    try:
        return {"body": steganography.reveal(data)}
    except ValueError as error:
        raise HTTPException(422, str(error))


@app.post("/api/steganography/reveal")
def reveal_upload(image: UploadFile = File(...), user=Depends(current_user)):
    try:
        return {"body": steganography.reveal(image.file.read(24 * 1024 * 1024 + 1))}
    except ValueError as error:
        raise HTTPException(422, str(error))
