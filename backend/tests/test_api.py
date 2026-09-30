import io
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image
from stegano import lsb

from backend import database, steganography
from backend.main import app, attempts


def picture(mode="RGB", size=(120, 120)):
    output = io.BytesIO()
    with Image.new(mode, size, (30, 80, 160, 90) if mode == "RGBA" else (30, 80, 160)) as image:
        image.save(output, "PNG")
    return output.getvalue()


class ChatTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.original_path = database.DB_PATH
        database.DB_PATH = Path(self.temp.name) / "test.db"
        attempts.clear()
        self.alice = TestClient(app)
        self.alice.__enter__()
        self.bob = TestClient(app)
        self.eve = TestClient(app)
        self.a = self.register(self.alice, "alice")
        self.b = self.register(self.bob, "bob")
        self.e = self.register(self.eve, "eve")
        self.chat = self.alice.post("/api/chats/direct", json={"user_id": self.b["id"]}).json()["id"]

    def tearDown(self):
        self.bob.close()
        self.eve.close()
        self.alice.__exit__(None, None, None)
        database.DB_PATH = self.original_path
        self.temp.cleanup()

    def register(self, client, username):
        response = client.post("/api/auth/register", json={"username": username, "display_name": username.title(), "password": "teste12345"})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def send(self, kind="text", body="Olá, mundo!", image=None):
        response = self.alice.post(f"/api/chats/{self.chat}/messages", data={"body": body, "kind": kind}, files={"image": ("foto.png", image, "image/png")} if image else None)
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["id"]

    def test_accounts_sessions_and_hashes(self):
        self.assertEqual(self.alice.get("/api/health").json(), {"status": "ok", "service": "stegchat"})
        self.assertEqual(self.alice.get("/api/auth/me").json()["username"], "alice")
        with database.connect() as db:
            saved = db.execute("SELECT password_hash FROM users WHERE id=?", (self.a["id"],)).fetchone()[0]
            self.assertNotIn("teste12345", saved)
            self.assertNotEqual(db.execute("SELECT token_hash FROM sessions LIMIT 1").fetchone()[0], self.alice.cookies.get("stegchat_session"))
        self.alice.post("/api/auth/logout")
        self.assertEqual(self.alice.get("/api/auth/me").status_code, 401)
        self.assertEqual(self.alice.post("/api/auth/login", json={"username": "alice", "password": "wrongpass"}).status_code, 401)
        login = self.alice.post("/api/auth/login", json={"username": "ALICE", "password": "teste12345"})
        self.assertEqual(login.status_code, 200)
        self.assertIn("HttpOnly", login.headers["set-cookie"])
        self.assertIn("SameSite=strict", login.headers["set-cookie"])

    def test_duplicate_username_and_invalid_registration(self):
        response = self.eve.post("/api/auth/register", json={"username": "ALICE", "display_name": "Another", "password": "teste12345"})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(self.eve.post("/api/auth/register", json={"username": "bad name", "display_name": "Bad", "password": "teste12345"}).status_code, 422)

    def test_search_and_duplicate_direct(self):
        self.assertEqual(self.alice.get("/api/users?q=BO").json(), [self.b])
        self.assertEqual(self.alice.get("/api/users?q=%25").json(), [])
        repeated = self.bob.post("/api/chats/direct", json={"user_id": self.a["id"]}).json()["id"]
        self.assertEqual(repeated, self.chat)
        self.assertEqual(self.alice.post("/api/chats/direct", json={"user_id": self.a["id"]}).status_code, 422)

    def test_send_edit_delete_and_unread(self):
        mid = self.send()
        self.assertEqual(self.bob.get("/api/chats").json()[0]["unread"], 1)
        self.bob.post(f"/api/chats/{self.chat}/read", json={"message_id": mid})
        self.assertEqual(self.bob.get("/api/chats").json()[0]["unread"], 0)
        self.assertEqual(self.alice.patch(f"/api/messages/{mid}", json={"body": "Texto editado"}).status_code, 200)
        message = self.bob.get(f"/api/chats/{self.chat}/messages").json()[0]
        self.assertEqual(message["body"], "Texto editado")
        self.assertIsNotNone(message["edited_at"])
        self.assertEqual(self.alice.delete(f"/api/messages/{mid}").status_code, 200)
        self.assertEqual(self.bob.get(f"/api/chats/{self.chat}/messages").json(), [])

    def test_message_authorization(self):
        mid = self.send("hidden", image=picture())
        self.assertEqual(self.bob.patch(f"/api/messages/{mid}", json={"body": "Intrusão"}).status_code, 403)
        self.assertEqual(self.bob.delete(f"/api/messages/{mid}").status_code, 403)
        for path in (f"/api/chats/{self.chat}/messages", f"/api/messages/{mid}/image"):
            self.assertEqual(self.eve.get(path).status_code, 404)
        self.assertEqual(self.eve.post(f"/api/messages/{mid}/reveal").status_code, 404)
        self.assertEqual(self.eve.post(f"/api/chats/{self.chat}/messages", data={"body": "Intrusão"}).status_code, 404)
        with TestClient(app) as anonymous:
            self.assertEqual(anonymous.get(f"/api/messages/{mid}/image").status_code, 401)

    def test_hidden_unicode_roundtrip_edit_and_download(self):
        text = "Olá, ação! 🔐🌍\n日本語 e símbolos € — fim"
        mid = self.send("hidden", text, picture("RGBA"))
        message = self.bob.get(f"/api/chats/{self.chat}/messages").json()[0]
        self.assertIsNone(message["body"])
        with database.connect() as db:
            self.assertIsNone(db.execute("SELECT body FROM messages WHERE id=?", (mid,)).fetchone()[0])
        for _ in range(2):
            self.assertEqual(self.bob.post(f"/api/messages/{mid}/reveal").json()["body"], text)
        png = self.bob.get(f"/api/messages/{mid}/image")
        self.assertEqual(png.headers["content-type"], "image/png")
        self.assertEqual(steganography.reveal(png.content), text)
        with Image.open(io.BytesIO(png.content)) as image:
            self.assertEqual(image.getpixel((0, 0))[3], 90)
        changed = "Nova mensagem 🙂"
        self.assertEqual(self.alice.patch(f"/api/messages/{mid}", json={"body": changed}).status_code, 200)
        self.assertEqual(self.bob.post(f"/api/messages/{mid}/reveal").json()["body"], changed)
        self.alice.delete(f"/api/messages/{mid}")
        self.assertEqual(self.bob.get(f"/api/messages/{mid}/image").status_code, 404)

    def test_invalid_upload_and_capacity(self):
        for data in (b"not an image", picture(size=(2, 2))):
            response = self.alice.post(f"/api/chats/{self.chat}/messages", data={"kind": "hidden", "body": "Mensagem demasiado longa"}, files={"image": ("bad.png", data, "image/png")})
            self.assertEqual(response.status_code, 422)
        self.assertEqual(self.alice.post(f"/api/chats/{self.chat}/messages", data={"kind": "hidden", "body": "Mensagem"}).status_code, 422)
        self.assertEqual(self.alice.post(f"/api/chats/{self.chat}/messages", data={"body": "  "}).status_code, 422)
        self.assertEqual(self.alice.get(f"/api/chats/{self.chat}/messages").json(), [])

    def test_txt_is_hidden_server_side_without_returning_plaintext(self):
        secret = "Ação 🔐\r\nSegunda linha 日本語"
        response = self.alice.post(f"/api/chats/{self.chat}/messages", data={"kind": "hidden"}, files={
            "image": ("imagem.png", picture(), "image/png"),
            "text_file": ("SEGREDO.TXT", ("\ufeff" + secret).encode("utf-8"), "text/plain"),
        })
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(set(response.json()), {"id"})
        mid = response.json()["id"]
        for client in (self.alice, self.bob):
            row = client.get(f"/api/chats/{self.chat}/messages").json()[0]
            self.assertIsNone(row["body"])
            self.assertEqual(row["kind"], "hidden")
        with database.connect() as db:
            self.assertIsNone(db.execute("SELECT body FROM messages WHERE id=?", (mid,)).fetchone()[0])
        self.assertEqual(self.bob.post(f"/api/messages/{mid}/reveal").json()["body"], secret)

    def test_txt_validation_rejects_invalid_and_ambiguous_uploads(self):
        for name, data in (("bad.pdf", b"text"), ("empty.txt", b" \n"), ("bad.txt", b"\xff"),
                           ("binary.txt", b"a\0b"), ("long.txt", b"a" * 10001), ("large.txt", b"a" * 65537)):
            with self.subTest(name=name):
                response = self.alice.post(f"/api/chats/{self.chat}/messages", data={"kind": "hidden"}, files={
                    "image": ("imagem.png", picture(), "image/png"), "text_file": (name, data, "text/plain"),
                })
                self.assertEqual(response.status_code, 422, response.text)
        for fields in ({"kind": "text"}, {"kind": "hidden", "body": "Texto em simultâneo"}):
            response = self.alice.post(f"/api/chats/{self.chat}/messages", data=fields, files={
                "image": ("imagem.png", picture(), "image/png"), "text_file": ("secret.txt", b"secret", "text/plain"),
            })
            self.assertEqual(response.status_code, 422)
        self.assertEqual(self.alice.get(f"/api/chats/{self.chat}/messages").json(), [])

    def test_reveal_external_and_legacy(self):
        data = steganography.hide(picture(), "Uma mensagem 🖼️")
        result = self.bob.post("/api/steganography/reveal", files={"image": ("secret.png", data, "image/png")})
        self.assertEqual(result.json()["body"], "Uma mensagem 🖼️")
        with Image.new("RGB", (100, 100), "red") as source:
            legacy = lsb.hide(source, "Mensagem antiga com ação")
            output = io.BytesIO()
            legacy.save(output, "PNG")
            legacy.close()
        self.assertEqual(steganography.reveal(output.getvalue()), "Mensagem antiga com ação")
        self.assertEqual(self.bob.post("/api/steganography/reveal", files={"image": ("plain.png", picture(), "image/png")}).status_code, 422)

    def test_group_membership_and_owner_transfer(self):
        gid = self.alice.post("/api/chats/groups", json={"name": "Trabalho SI", "member_ids": [self.b["id"]]}).json()["id"]
        self.assertEqual(self.bob.post(f"/api/chats/{gid}/members", json={"user_id": self.e["id"]}).status_code, 403)
        self.assertEqual(self.alice.patch(f"/api/chats/{gid}", json={"name": "Novo nome"}).status_code, 200)
        self.alice.post(f"/api/chats/{gid}/members", json={"user_id": self.e["id"]})
        self.assertEqual(self.eve.get(f"/api/chats/{gid}/messages").status_code, 200)
        self.alice.delete(f"/api/chats/{gid}/members/{self.e['id']}")
        self.assertEqual(self.eve.get(f"/api/chats/{gid}/messages").status_code, 404)
        self.alice.post(f"/api/chats/{gid}/leave")
        self.assertEqual(self.alice.get(f"/api/chats/{gid}/messages").status_code, 404)
        group = next(c for c in self.bob.get("/api/chats").json() if c["id"] == gid)
        self.assertEqual(group["owner_id"], self.b["id"])
        self.bob.post(f"/api/chats/{gid}/leave")
        with database.connect() as db:
            self.assertIsNone(db.execute("SELECT id FROM chats WHERE id=?", (gid,)).fetchone())

    def test_invalid_group_rolls_back(self):
        response = self.alice.post("/api/chats/groups", json={"name": "Invalido", "member_ids": [999999]})
        self.assertEqual(response.status_code, 404)
        self.assertEqual(len(self.alice.get("/api/chats").json()), 1)

    def test_csrf_origin_and_expired_session(self):
        self.assertEqual(self.alice.post("/api/chats/direct", json={"user_id": self.e["id"]}, headers={"Origin": "https://site-externo.example"}).status_code, 403)
        with database.connect() as db:
            db.execute("UPDATE sessions SET expires_at=0 WHERE user_id=?", (self.a["id"],))
        self.assertEqual(self.alice.get("/api/auth/me").status_code, 401)


if __name__ == "__main__":
    unittest.main()
