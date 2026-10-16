"""AES-256-GCM + LSB. A imagem nunca contém a chave ou uma lista editável de users."""
import base64
import binascii
import secrets

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from backend import steganography

PREFIX = "STEGCHAT2:"
AAD = b"StegChat:image:v2:"


class AccessDenied(Exception):
    pass


def recipients(db, payload_id):
    return [row[0] for row in db.execute("SELECT user_id FROM payload_recipients WHERE payload_id=? ORDER BY user_id", (payload_id,))]


def allowed(db, payload_id, user_id):
    return bool(payload_id and db.execute("SELECT 1 FROM payload_recipients WHERE payload_id=? AND user_id=?", (payload_id, user_id)).fetchone())


def seal(db, image, text, user_ids, *, stored_image=False):
    """O chamador confirma a transação juntamente com a mensagem."""
    ids = set(user_ids)
    if not ids:
        raise ValueError("A mensagem precisa de destinatários autorizados.")
    identifier = secrets.token_bytes(16)
    key = AESGCM.generate_key(bit_length=256)
    nonce = secrets.token_bytes(12)
    ciphertext = AESGCM(key).encrypt(nonce, text.encode("utf-8"), AAD + identifier)
    envelope = PREFIX + base64.b64encode(identifier + nonce + ciphertext).decode("ascii")
    encoded = steganography.hide_payload(image, envelope, stored_image=stored_image)
    payload_id = identifier.hex()
    db.execute("INSERT INTO protected_payloads VALUES (?, ?)", (payload_id, key))
    db.executemany("INSERT INTO payload_recipients VALUES (?, ?)", [(payload_id, uid) for uid in ids])
    return encoded, payload_id


def reveal(db, image, user_id, *, expected_id=None):
    envelope = steganography.reveal(image)
    if not envelope.startswith(PREFIX):
        raise AccessDenied("Esta imagem antiga não tem proteção por conta. Peça ao remetente para a reenviar pelo chat.")
    try:
        raw = base64.b64decode(envelope[len(PREFIX):], validate=True)
        if len(raw) < 44:
            raise ValueError()
    except (ValueError, binascii.Error):
        raise ValueError("A imagem protegida está danificada ou foi alterada.") from None
    identifier, nonce, ciphertext = raw[:16], raw[16:28], raw[28:]
    payload_id = identifier.hex()
    if (expected_id is not None and payload_id != expected_id) or not allowed(db, payload_id, user_id):
        raise AccessDenied("A sua conta não é um dos destinatários autorizados desta imagem.")
    row = db.execute("SELECT encryption_key FROM protected_payloads WHERE id=?", (payload_id,)).fetchone()
    try:
        return AESGCM(row[0]).decrypt(nonce, ciphertext, AAD + identifier).decode("utf-8")
    except (InvalidTag, UnicodeDecodeError):
        raise ValueError("A imagem protegida está danificada ou foi alterada.") from None
