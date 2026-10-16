import base64
import sqlite3
from fastapi.testclient import TestClient

from backend import database, protected_images, steganography, migrate_encryption
from backend.main import app
from backend.tests import test_api as fixtures

picture = fixtures.picture


# Reutiliza apenas o setup/teardown; não repete os testes da classe original.
import unittest


class ProtectionTests(unittest.TestCase):
    setUp = fixtures.ChatTests.setUp
    tearDown = fixtures.ChatTests.tearDown
    register = fixtures.ChatTests.register
    send = fixtures.ChatTests.send

    def upload(self, client, png):
        return client.post("/api/steganography/reveal", files={"image": ("copy.png", png, "image/png")})

    def test_copied_photo_only_sender_and_recipient(self):
        mid = self.send("hidden", "Segredo de duas contas 🔐", picture())
        png = self.alice.get(f"/api/messages/{mid}/image").content
        for client in (self.alice, self.bob):
            self.assertEqual(self.upload(client, png).json()["body"], "Segredo de duas contas 🔐")
        self.assertEqual(self.upload(self.eve, png).status_code, 403)
        # Informar o ID de Bob não substitui a sessão de Eve.
        forged = self.eve.post("/api/steganography/reveal", data={"user_id": self.b["id"], "username": "bob"}, files={"image": ("x.png", png)})
        self.assertEqual(forged.status_code, 403)
        with TestClient(app) as guest:
            self.assertEqual(self.upload(guest, png).status_code, 401)

    def test_group_snapshot_survives_join_edit_and_leave(self):
        gid = self.alice.post("/api/chats/groups", json={"name": "Segredo", "member_ids": [self.b["id"]]}).json()["id"]
        self.chat = gid
        mid = self.send("hidden", "Antes da entrada", picture())
        png = self.alice.get(f"/api/messages/{mid}/image").content
        self.alice.post(f"/api/chats/{gid}/members", json={"user_id": self.e["id"]})
        self.assertFalse(self.eve.get(f"/api/chats/{gid}/messages").json()[0]["can_reveal"])
        self.assertEqual(self.eve.get(f"/api/messages/{mid}/image").status_code, 403)
        self.assertEqual(self.eve.post(f"/api/messages/{mid}/reveal").status_code, 403)
        self.assertEqual(self.upload(self.eve, png).status_code, 403)
        self.alice.patch(f"/api/messages/{mid}", json={"body": "Editada depois"})
        changed = self.alice.get(f"/api/messages/{mid}/image").content
        self.assertEqual(self.upload(self.eve, changed).status_code, 403)
        fresh = self.send("hidden", "Todos agora", picture())
        self.assertEqual(self.eve.post(f"/api/messages/{fresh}/reveal").json()["body"], "Todos agora")
        self.bob.post(f"/api/chats/{gid}/leave")
        self.assertEqual(self.bob.post(f"/api/messages/{mid}/reveal").status_code, 404)
        # A cópia recebida continua destinada à conta original, mesmo depois de sair.
        self.assertEqual(self.upload(self.bob, png).json()["body"], "Antes da entrada")
        self.assertEqual(self.upload(self.bob, changed).json()["body"], "Editada depois")

    def test_tampering_and_wrong_identifier(self):
        mid = self.send("hidden", image=picture())
        png = self.alice.get(f"/api/messages/{mid}/image").content
        envelope = steganography.reveal(png)
        raw = bytearray(base64.b64decode(envelope[len(protected_images.PREFIX):]))
        raw[-1] ^= 1
        altered = steganography.hide_payload(picture(), protected_images.PREFIX + base64.b64encode(raw).decode())
        self.assertEqual(self.upload(self.bob, altered).status_code, 422)
        raw[0] ^= 1
        altered_id = steganography.hide_payload(picture(), protected_images.PREFIX + base64.b64encode(raw).decode())
        self.assertEqual(self.upload(self.bob, altered_id).status_code, 403)

    def test_separate_keys_and_persistent_backups(self):
        mid = self.send("hidden", "Mesmo texto", picture())
        mid2 = self.send("hidden", "Mesmo texto", picture())
        png = self.alice.get(f"/api/messages/{mid}/image").content
        png2 = self.alice.get(f"/api/messages/{mid2}/image").content
        self.assertNotEqual(png, png2)
        backup_path = database.DB_PATH.with_name("backup.db")
        with database.connect() as db:
            keys = [row[0] for row in db.execute("SELECT encryption_key FROM protected_payloads")]
            self.assertEqual(len(set(keys)), 2)
            target = sqlite3.connect(backup_path)
            try:
                db.backup(target)
            finally:
                target.close()
        original = database.DB_PATH
        try:
            database.DB_PATH = backup_path
            self.assertEqual(self.upload(self.bob, png).json()["body"], "Mesmo texto")
            self.assertEqual(self.upload(self.eve, png).status_code, 403)
        finally:
            database.DB_PATH = original
        self.alice.delete(f"/api/messages/{mid}")
        self.assertEqual(self.upload(self.bob, png).json()["body"], "Mesmo texto")

    def test_legacy_migration_backup_and_conservative_groups(self):
        legacy = steganography.hide(picture(), "Antiga")
        gid = self.alice.post("/api/chats/groups", json={"name": "Antigo", "member_ids": [self.b["id"]]}).json()["id"]
        with database.connect() as db:
            ids = []
            for cid in (self.chat, gid):
                ids.append(db.execute("INSERT INTO messages (chat_id,sender_id,kind,image,created_at) VALUES (?,?,'hidden',?,'2026-01-01')", (cid, self.a["id"], legacy)).lastrowid)
        self.assertEqual(migrate_encryption.migrate(), {"converted": 2, "blocked": 0})
        self.assertEqual(self.bob.post(f"/api/messages/{ids[0]}/reveal").json()["body"], "Antiga")
        self.assertEqual(self.bob.post(f"/api/messages/{ids[1]}/reveal").status_code, 403)
        self.assertEqual(self.alice.post(f"/api/messages/{ids[1]}/reveal").json()["body"], "Antiga")
        self.assertEqual(self.upload(self.eve, legacy).status_code, 403)
        self.assertEqual(migrate_encryption.migrate(), {"converted": 0, "blocked": 0})
        self.assertEqual(len(list(database.DB_PATH.parent.glob("*.before-encryption-*.db"))), 1)

    def test_failed_capacity_leaves_no_key_or_message(self):
        response = self.alice.post(f"/api/chats/{self.chat}/messages", data={"kind": "hidden", "body": "Segredo"}, files={"image": ("tiny.png", picture(size=(4, 4)))})
        self.assertEqual(response.status_code, 422)
        with database.connect() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM protected_payloads").fetchone()[0], 0)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM messages").fetchone()[0], 0)
