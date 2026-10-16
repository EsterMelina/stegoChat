"""LSB com envelope ASCII para suportar acentos, emojis e qualquer texto UTF-8."""
import base64
import binascii
import io
import warnings

from PIL import Image, UnidentifiedImageError
from stegano import lsb

MAX_UPLOAD = 8 * 1024 * 1024
MAX_PIXELS = 4_000_000
PREFIX = "STEGCHAT1:"


def open_image(data: bytes, max_bytes: int = MAX_UPLOAD) -> Image.Image:
    if not data or len(data) > max_bytes:
        raise ValueError("Escolha uma imagem até 8 MB.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as image:
                if image.width * image.height > MAX_PIXELS:
                    raise ValueError("A imagem deve ter, no máximo, 4 milhões de píxeis.")
                return image.convert("RGBA" if "A" in image.getbands() or "transparency" in image.info else "RGB")
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning) as error:
        raise ValueError("O ficheiro não é uma imagem válida ou é demasiado grande.") from error


def hide(data: bytes, message: str, *, stored_image: bool = False) -> bytes:
    envelope = PREFIX + base64.b64encode(message.encode("utf-8")).decode("ascii")
    return hide_payload(data, envelope, stored_image=stored_image)


def hide_payload(data: bytes, envelope: str, *, stored_image: bool = False) -> bytes:
    """Incorpora um envelope ASCII; a API usa aqui apenas conteúdo cifrado."""
    with open_image(data, 24 * 1024 * 1024 if stored_image else MAX_UPLOAD) as image:
        required = (len(str(len(envelope))) + 1 + len(envelope)) * 8
        if required > image.width * image.height * 3:
            raise ValueError("A mensagem não cabe nesta imagem. Escolha uma imagem maior ou reduza o texto.")
        encoded = lsb.hide(image, envelope)
        try:
            result = io.BytesIO()
            encoded.save(result, format="PNG")
            return result.getvalue()
        finally:
            encoded.close()


def reveal(data: bytes) -> str:
    # Os PNG gerados podem ser maiores do que o upload original (JPEG, por exemplo).
    if len(data) > 24 * 1024 * 1024:
        raise ValueError("Imagem demasiado grande.")
    try:
        with Image.open(io.BytesIO(data)) as original:
            if original.width * original.height > MAX_PIXELS:
                raise ValueError("Imagem demasiado grande.")
            with original.convert("RGBA" if "A" in original.getbands() else "RGB") as image:
                text = lsb.reveal(image, close_file=False)
        if not text:
            raise ValueError("Sem mensagem.")
        if text.startswith(PREFIX):
            return base64.b64decode(text[len(PREFIX):], validate=True).decode("utf-8")
        return text  # Compatibilidade com as imagens do programa Tkinter.
    except (IndexError, ValueError, OSError, binascii.Error, Image.DecompressionBombError) as error:
        raise ValueError("Não foi encontrada uma mensagem válida nesta imagem.") from error
