import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

from PIL import Image
from stegano import lsb

from main import Aplicacao


class TestFluxoMensagem(unittest.TestCase):
    def criar_interface(self, imagem, texto="Mensagem com acentos: ação e café."):
        return SimpleNamespace(
            imagem=imagem, caminho=Path("original.png"),
            mensagem=Mock(), estado=Mock(), carregar=Mock(),
        ), texto

    def test_guardar_reabrir_e_revelar_duas_vezes(self):
        with tempfile.TemporaryDirectory() as pasta:
            destino = str(Path(pasta) / "secreta.png")
            with Image.new("RGB", (80, 80), "red") as original:
                app, texto = self.criar_interface(original)
                app.mensagem.get.return_value = texto
                with patch("main.filedialog.asksaveasfilename", return_value=destino):
                    Aplicacao.esconder(app)
                original.getpixel((0, 0))  # A imagem original continua aberta.
                app.carregar.assert_called_once_with(destino)
                with Image.open(destino) as guardada:
                    app.imagem = guardada
                    for _ in range(2):
                        Aplicacao.revelar(app)
                        app.mensagem.insert.assert_called_with("1.0", texto)
                        guardada.getpixel((0, 0))

    def test_mensagem_demasiado_longa_preserva_imagem(self):
        with Image.new("RGB", (2, 2), "red") as original:
            app, texto = self.criar_interface(original)
            app.mensagem.get.return_value = texto
            with patch("main.filedialog.asksaveasfilename", return_value="secreta.png"), \
                    patch("main.messagebox.showerror") as aviso:
                Aplicacao.esconder(app)
                aviso.assert_called_once()
            original.getpixel((0, 0))

    def test_imagem_sem_mensagem(self):
        with Image.new("RGB", (20, 20), "black") as original:
            app, _ = self.criar_interface(original)
            with patch("main.messagebox.showinfo") as aviso:
                Aplicacao.revelar(app)
                aviso.assert_called_once()
            app.mensagem.insert.assert_not_called()
            original.getpixel((0, 0))

    def test_revelar_e_esconder_novamente(self):
        with Image.new("RGBA", (80, 80), (10, 20, 30, 100)) as original:
            secreta = lsb.hide(original.copy(), "Primeira mensagem")
            with secreta:
                app, texto = self.criar_interface(secreta)
                Aplicacao.revelar(app)
                app.mensagem.get.return_value = texto
                with tempfile.TemporaryDirectory() as pasta:
                    destino = str(Path(pasta) / "segunda.png")
                    with patch("main.filedialog.asksaveasfilename", return_value=destino):
                        Aplicacao.esconder(app)
                    self.assertEqual(lsb.reveal(destino), texto)
                    with Image.open(destino) as guardada:
                        self.assertEqual(guardada.getpixel((0, 0))[3], 100)


if __name__ == "__main__":
    unittest.main()
