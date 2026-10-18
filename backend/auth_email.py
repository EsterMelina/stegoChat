"""Rotas de registo, verificação de email e recuperação de palavra-passe do StegoChat.

Integração prevista:
    from backend.auth_email import router as auth_email_router
    app.include_router(auth_email_router)

Usa backend.database.connect() e backend.database.DB_PATH já existentes.
O hash de palavra-passe é delegado em backend.security para garantir
compatibilidade total com o login do backend.main.
"""
from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import time
import urllib.error
import urllib.request
import json
from datetime import datetime, timezone
from urllib.parse import urlencode

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field, field_validator

from backend import database
# Reutiliza o MESMO hash do login existente. Formato: "<salt_hex>:<digest_hex>".
from backend.security import hash_password as password_hash, verify_password

router = APIRouter(prefix="/api/auth", tags=["authentication"])

OTP_SECONDS = 60
OTP_MAX_ATTEMPTS = 5
RESET_TOKEN_SECONDS = 15 * 60
BREVO_URL = "https://api.brevo.com/v3/smtp/email"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_email(email: str) -> str:
    return email.strip().lower()


def send_brevo_email(to_email: str, to_name: str, subject: str, html: str) -> None:
    api_key = os.getenv("BREVO_API_KEY", "").strip()
    sender_email = os.getenv("BREVO_SENDER_EMAIL", "").strip()
    sender_name = os.getenv("BREVO_SENDER_NAME", "StegoChat").strip()
    if not api_key or not sender_email:
        raise HTTPException(
            status_code=503,
            detail="O serviço de email não está configurado."
        )

    payload = {
        "sender": {"name": sender_name, "email": sender_email},
        "to": [{"email": to_email, "name": to_name or "Utilizador"}],
        "subject": subject,
        "htmlContent": html,
    }
    req = urllib.request.Request(
        BREVO_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "api-key": api_key,
            "accept": "application/json",
            "content-type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            if not 200 <= response.status < 300:
                raise RuntimeError(f"Brevo HTTP {response.status}")
    except urllib.error.HTTPError as exc:
        # Não devolver o corpo da API ao utilizador, pois pode conter dados sensíveis.
        raise HTTPException(status_code=502, detail="Não foi possível enviar o email.") from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise HTTPException(status_code=502, detail="Serviço de email indisponível.") from exc


def email_html(title: str, body: str, action_label: str | None = None,
               action_url: str | None = None, code: str | None = None) -> str:
    action = ""
    if code:
        action = (
            f'<p style="font-size:28px;font-weight:bold;letter-spacing:6px">{code}</p>'
        )
    if action_label and action_url:
        action = (
            f'<p><a href="{action_url}" style="display:inline-block;padding:12px 18px;'
            f'background:#1565c0;color:white;text-decoration:none;border-radius:6px">'
            f'{action_label}</a></p>'
        )
    return (
        '<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">'
        f'<h2>{title}</h2><p>{body}</p>{action}'
        '<p>Se não fez este pedido, ignore esta mensagem.</p>'
        '<p>StegoChat</p></div>'
    )


def test_mode() -> bool:
    """Devolve True apenas quando AUTH_TEST_MODE=1. Nunca definir em produção."""
    return os.getenv("AUTH_TEST_MODE", "").strip() == "1"


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=30, pattern=r"^[A-Za-z0-9_]+$")
    display_name: str = Field(min_length=1, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        return value.strip().lower()

    @field_validator("display_name")
    @classmethod
    def clean_display_name(cls, value: str) -> str:
        return value.strip()


class VerifyEmailRequest(BaseModel):
    email: EmailStr
    code: str = Field(pattern=r"^\d{6}$")


class ResendCodeRequest(BaseModel):
    email: EmailStr


class LoginRequest(BaseModel):
    identifier: str = Field(min_length=1, max_length=320)
    password: str = Field(min_length=1, max_length=128)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    token: str = Field(min_length=40, max_length=200)
    new_password: str = Field(min_length=8, max_length=128)


def ensure_schema() -> None:
    """Migração aditiva: não elimina utilizadores nem mensagens existentes."""
    with database.connect() as db:
        cols = {row["name"] for row in db.execute("PRAGMA table_info(users)")}
        if "email" not in cols:
            db.execute("ALTER TABLE users ADD COLUMN email TEXT")
        if "email_verified_at" not in cols:
            db.execute("ALTER TABLE users ADD COLUMN email_verified_at TEXT")
        if "status" not in cols:
            db.execute("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'")
        db.execute("CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(email) WHERE email IS NOT NULL")
        db.executescript("""
            CREATE TABLE IF NOT EXISTS email_otps (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                code_hash TEXT NOT NULL,
                attempts INTEGER NOT NULL DEFAULT 0,
                created_at REAL NOT NULL,
                verified_at TEXT
            );
            CREATE INDEX IF NOT EXISTS email_otps_user ON email_otps(user_id, id);
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token_hash TEXT NOT NULL UNIQUE,
                created_at REAL NOT NULL,
                used_at TEXT
            );
            CREATE INDEX IF NOT EXISTS password_reset_user ON password_reset_tokens(user_id);
            CREATE TABLE IF NOT EXISTS auth_rate_limits (
                rate_key TEXT PRIMARY KEY,
                last_at REAL NOT NULL
            );
        """)


def _rate_limit(key: str, seconds: int) -> int:
    now = time.time()
    with database.connect() as db:
        row = db.execute("SELECT last_at FROM auth_rate_limits WHERE rate_key=?", (key,)).fetchone()
        if row:
            remaining = seconds - int(now - row["last_at"])
            if remaining > 0:
                return remaining
        db.execute(
            "INSERT INTO auth_rate_limits(rate_key,last_at) VALUES(?,?) "
            "ON CONFLICT(rate_key) DO UPDATE SET last_at=excluded.last_at",
            (key, now),
        )
    return 0


@router.post("/register", status_code=status.HTTP_202_ACCEPTED)
def register(data: RegisterRequest):
    ensure_schema()
    email = normalize_email(str(data.email))
    username = data.username.strip().lower()

    with database.connect() as db:
        existing = db.execute(
            "SELECT id FROM users WHERE username=? COLLATE NOCASE OR email=? COLLATE NOCASE",
            (username, email),
        ).fetchone()
        if existing:
            # A production UI should show a generic response to reduce account enumeration.
            raise HTTPException(status_code=409, detail="Não foi possível criar a conta com estes dados.")

        cur = db.execute(
            """INSERT INTO users
               (username, display_name, password_hash, created_at, email, email_verified_at, status)
               VALUES (?, ?, ?, ?, ?, NULL, 'pending')""",
            (username, data.display_name.strip(), password_hash(data.password), utc_now(), email),
        )
        user_id = cur.lastrowid
        code = f"{secrets.randbelow(1_000_000):06d}"
        db.execute("DELETE FROM email_otps WHERE user_id=?", (user_id,))
        db.execute(
            "INSERT INTO email_otps(user_id,code_hash,attempts,created_at) VALUES(?,?,0,?)",
            (user_id, hashlib.sha256(code.encode()).hexdigest(), time.time()),
        )

    try:
        send_brevo_email(
            email, data.display_name, "Verifique o seu email — StegoChat",
            email_html("Verificação de email",
                       "Use o código abaixo para activar a sua conta.",
                       code=code),
        )
    except HTTPException:
        # Keep pending account so an operator can diagnose configuration; client can retry resend.
        raise

    response: dict = {"message": "Conta criada. Verifique o email para activar a conta."}
    if test_mode():
        # APENAS para testes automatizados. Nunca activar em produção.
        response["debug_code"] = code
    return response


@router.post("/verify-email")
def verify_email(data: VerifyEmailRequest):
    ensure_schema()
    email = normalize_email(str(data.email))
    now = time.time()
    with database.connect() as db:
        user = db.execute("SELECT id,status,email_verified_at FROM users WHERE email=? COLLATE NOCASE", (email,)).fetchone()
        if not user:
            raise HTTPException(status_code=400, detail="Código inválido ou já utilizado.")
        if user["email_verified_at"]:
            return {"message": "Email já verificado."}
        otp = db.execute(
            "SELECT * FROM email_otps WHERE user_id=? AND verified_at IS NULL ORDER BY id DESC LIMIT 1",
            (user["id"],),
        ).fetchone()
        if not otp or otp["attempts"] >= OTP_MAX_ATTEMPTS:
            raise HTTPException(status_code=400, detail="Código inválido ou limite de tentativas excedido.")
        if now - otp["created_at"] > 10 * 60:
            db.execute("DELETE FROM email_otps WHERE id=?", (otp["id"],))
            raise HTTPException(status_code=400, detail="Código expirado. Solicite outro.")
        candidate = hashlib.sha256(data.code.encode()).hexdigest()
        if not hmac.compare_digest(candidate, otp["code_hash"]):
            # Não lançar a excepção dentro da transacção: caso contrário, o incremento
            # seria revertido e o limite de tentativas nunca seria aplicado.
            db.execute("UPDATE email_otps SET attempts=attempts+1 WHERE id=?", (otp["id"],))
            wrong_code = True
        else:
            wrong_code = False
            db.execute("UPDATE users SET email_verified_at=?, status='active' WHERE id=?", (utc_now(), user["id"]))
            db.execute("UPDATE email_otps SET verified_at=? WHERE id=?", (utc_now(), otp["id"]))
    if wrong_code:
        raise HTTPException(status_code=400, detail="Código inválido ou já utilizado.")
    return {"message": "Email verificado. Já pode iniciar sessão."}


@router.post("/resend-verification", status_code=status.HTTP_202_ACCEPTED)
def resend_verification(data: ResendCodeRequest):
    ensure_schema()
    email = normalize_email(str(data.email))
    remaining = _rate_limit("verify:" + hashlib.sha256(email.encode()).hexdigest(), OTP_SECONDS)
    if remaining:
        raise HTTPException(status_code=429, detail=f"Aguarde {remaining} segundos antes de pedir outro código.")
    debug_code: str | None = None
    with database.connect() as db:
        user = db.execute("SELECT id,display_name,status,email_verified_at FROM users WHERE email=? COLLATE NOCASE", (email,)).fetchone()
        if not user or user["email_verified_at"]:
            return {"message": "Se a conta precisar de verificação, será enviado um código."}
        code = f"{secrets.randbelow(1_000_000):06d}"
        db.execute("DELETE FROM email_otps WHERE user_id=?", (user["id"],))
        db.execute("INSERT INTO email_otps(user_id,code_hash,attempts,created_at) VALUES(?,?,0,?)",
                   (user["id"], hashlib.sha256(code.encode()).hexdigest(), time.time()))
        debug_code = code
    send_brevo_email(email, user["display_name"], "Novo código — StegoChat",
                     email_html("Verificação de email", "Use este código para verificar a conta.", code=code))
    response: dict = {"message": "Se a conta precisar de verificação, será enviado um código."}
    if test_mode():
        response["debug_code"] = debug_code
    return response


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
def forgot_password(data: ForgotPasswordRequest, request: Request):
    ensure_schema()
    email = normalize_email(str(data.email))
    remaining = _rate_limit("reset:" + hashlib.sha256(email.encode()).hexdigest(), OTP_SECONDS)
    if remaining:
        # Same generic response avoids disclosing account existence.
        return {"message": "Se existir uma conta elegível, receberá instruções por email."}
    debug_token: str | None = None
    with database.connect() as db:
        user = db.execute(
            "SELECT id,username,display_name,email_verified_at,status FROM users WHERE email=? COLLATE NOCASE",
            (email,),
        ).fetchone()
        if not user or not user["email_verified_at"] or user["status"] != "active":
            return {"message": "Se existir uma conta elegível, receberá instruções por email."}
        plain_token = secrets.token_urlsafe(48)
        token_hash = hashlib.sha256(plain_token.encode()).hexdigest()
        db.execute("UPDATE password_reset_tokens SET used_at=? WHERE user_id=? AND used_at IS NULL",
                   (utc_now(), user["id"]))
        db.execute(
            "INSERT INTO password_reset_tokens(user_id,token_hash,created_at,used_at) VALUES(?,?,?,NULL)",
            (user["id"], token_hash, time.time()),
        )
        debug_token = plain_token
    base_url = os.getenv("FRONTEND_URL", "http://127.0.0.1:3000").rstrip("/")
    link = f"{base_url}/reset-password?{urlencode({'email': email, 'token': plain_token})}"
    send_brevo_email(email, user["display_name"], "Redefinição de palavra-passe — StegoChat",
                     email_html("Redefinir palavra-passe",
                                "Recebemos um pedido para alterar a palavra-passe da sua conta.",
                                action_label="Definir nova palavra-passe", action_url=link))
    response: dict = {"message": "Se existir uma conta elegível, receberá instruções por email."}
    if test_mode():
        response["debug_token"] = debug_token
        response["debug_email"] = email
    return response


@router.post("/reset-password")
def reset_password(data: ResetPasswordRequest):
    ensure_schema()
    email = normalize_email(str(data.email))
    token_hash = hashlib.sha256(data.token.encode()).hexdigest()
    now = time.time()
    with database.connect() as db:
        user = db.execute("SELECT id FROM users WHERE email=? COLLATE NOCASE", (email,)).fetchone()
        if not user:
            raise HTTPException(status_code=400, detail="Link inválido, expirado ou já utilizado.")
        token = db.execute(
            "SELECT * FROM password_reset_tokens WHERE user_id=? AND token_hash=? AND used_at IS NULL",
            (user["id"], token_hash),
        ).fetchone()
        if not token or now - token["created_at"] > RESET_TOKEN_SECONDS:
            raise HTTPException(status_code=400, detail="Link inválido, expirado ou já utilizado.")
        db.execute("UPDATE users SET password_hash=? WHERE id=?", (password_hash(data.new_password), user["id"]))
        db.execute("UPDATE password_reset_tokens SET used_at=? WHERE id=?", (utc_now(), token["id"]))
        # Revoke all existing sessions after password reset.
        db.execute("DELETE FROM sessions WHERE user_id=?", (user["id"],))
    return {"message": "Palavra-passe alterada. Inicie sessão novamente."}