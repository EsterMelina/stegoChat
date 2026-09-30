from pathlib import Path
import tkinter as tk
from tkinter import filedialog, messagebox, ttk
from tkinter.scrolledtext import ScrolledText

from PIL import Image, ImageTk
from stegano import lsb


class Aplicacao(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Esteganografia · Mensagens em imagens")
        self.geometry("880x640")
        self.minsize(760, 600)
        self.configure(bg="#f3f5fa")
        self.imagem = None
        self.caminho = None
        self.previa = None
        self.estado = tk.StringVar(value="Escolha uma imagem para começar.")
        self.nome = tk.StringVar(value="Nenhuma imagem selecionada")

        estilo = ttk.Style(self)
        estilo.theme_use("clam")
        estilo.configure("TFrame", background="#f3f5fa")
        estilo.configure("Card.TFrame", background="white")
        estilo.configure("TLabel", background="#f3f5fa", foreground="#17243b", font=("Segoe UI", 10))
        estilo.configure("Title.TLabel", font=("Segoe UI", 23, "bold"))
        estilo.configure("Muted.TLabel", foreground="#637088")
        estilo.configure("Card.TLabel", background="white")
        estilo.configure("Heading.TLabel", background="white", font=("Segoe UI", 12, "bold"))
        estilo.configure("TButton", font=("Segoe UI", 10), padding=(16, 10))
        estilo.configure("Primary.TButton", background="#315de5", foreground="white")
        estilo.map("Primary.TButton", background=[("active", "#244ac0"), ("disabled", "#c5cde0")])

        painel = ttk.Frame(self, padding=28)
        painel.pack(fill="both", expand=True)
        ttk.Label(painel, text="Uma imagem, uma mensagem.", style="Title.TLabel").pack(anchor="w")
        ttk.Label(painel, text="Oculte uma mensagem ou descubra o que uma imagem guarda.",
                  style="Muted.TLabel").pack(anchor="w", pady=(6, 24))
        colunas = ttk.Frame(painel)
        colunas.pack(fill="both", expand=True)
        colunas.columnconfigure(0, weight=1, uniform="card")
        colunas.columnconfigure(1, weight=1, uniform="card")
        colunas.rowconfigure(0, weight=1)

        esquerda = ttk.Frame(colunas, style="Card.TFrame", padding=20)
        esquerda.grid(row=0, column=0, sticky="nsew", padx=(0, 10))
        ttk.Label(esquerda, text="1. Escolha a imagem", style="Heading.TLabel").pack(anchor="w")
        self.visualizacao = tk.Label(esquerda, text="A sua imagem aparece aqui", bg="#f0f3fa",
                                    fg="#637088", font=("Segoe UI", 11))
        self.visualizacao.pack(fill="both", expand=True, pady=18)
        ttk.Label(esquerda, textvariable=self.nome, style="Card.TLabel",
                  wraplength=280).pack(anchor="w", pady=(0, 12))
        ttk.Button(esquerda, text="Escolher imagem…", command=self.escolher).pack(fill="x")

        direita = ttk.Frame(colunas, style="Card.TFrame", padding=20)
        direita.grid(row=0, column=1, sticky="nsew", padx=(10, 0))
        ttk.Label(direita, text="2. A sua mensagem", style="Heading.TLabel").pack(anchor="w")
        ttk.Label(direita, text="Escreva para esconder ou clique em Revelar.",
                  style="Card.TLabel", wraplength=280).pack(anchor="w", pady=(8, 14))
        self.mensagem = ScrolledText(direita, wrap="word", width=25, height=10,
                                    font=("Segoe UI", 11), relief="flat", bg="#f6f8fc",
                                    fg="#17243b", padx=12, pady=12, undo=True)
        self.mensagem.pack(fill="both", expand=True)
        self.esconder_botao = ttk.Button(direita, text="Esconder e guardar…", style="Primary.TButton",
                                        command=self.esconder, state="disabled")
        self.esconder_botao.pack(fill="x", pady=(18, 8))
        self.revelar_botao = ttk.Button(direita, text="Revelar", command=self.revelar, state="disabled")
        self.revelar_botao.pack(fill="x")
        ttk.Label(painel, textvariable=self.estado, style="Muted.TLabel",
                  wraplength=690).pack(anchor="w", pady=(18, 6))
        ttk.Label(painel, text="A imagem com a mensagem é guardada em PNG para preservar o conteúdo.",
                  style="Muted.TLabel", wraplength=690).pack(anchor="w")
        self.protocol("WM_DELETE_WINDOW", self.fechar)

    def carregar(self, caminho):
        with Image.open(caminho) as original:
            imagem = original.convert("RGBA" if "A" in original.getbands() else "RGB")
        miniatura = imagem.copy()
        miniatura.thumbnail((280, 230), Image.Resampling.LANCZOS)
        self.previa = ImageTk.PhotoImage(miniatura)
        miniatura.close()
        if self.imagem is not None:
            self.imagem.close()
        self.imagem = imagem
        self.caminho = Path(caminho)
        self.visualizacao.configure(image=self.previa, text="")
        self.nome.set(f"{self.caminho.name}\n{imagem.width} × {imagem.height} píxeis")
        self.esconder_botao.configure(state="normal")
        self.revelar_botao.configure(state="normal")

    def escolher(self):
        caminho = filedialog.askopenfilename(parent=self, title="Escolher imagem",
                                            filetypes=[("Imagens", "*.png *.jpg *.jpeg *.bmp *.webp"),
                                                       ("Todos os ficheiros", "*.*")])
        if not caminho:
            return
        try:
            self.carregar(caminho)
            self.estado.set("Imagem pronta. Escreva uma mensagem ou clique em Revelar.")
        except (OSError, ValueError, Image.DecompressionBombError):
            messagebox.showerror("Imagem inválida", "Não foi possível abrir esta imagem. Escolha outro ficheiro.", parent=self)

    def esconder(self):
        if self.imagem is None:
            return
        mensagem = self.mensagem.get("1.0", "end-1c")
        if not mensagem.strip():
            messagebox.showinfo("Escreva uma mensagem", "Introduza a mensagem que pretende esconder.", parent=self)
            self.mensagem.focus_set()
            return
        caminho = filedialog.asksaveasfilename(parent=self, title="Guardar imagem com mensagem",
                                              defaultextension=".png",
                                              initialfile=f"{self.caminho.stem}_secreta.png",
                                              filetypes=[("Imagem PNG", "*.png")])
        if not caminho:
            return
        if Path(caminho).suffix.lower() != ".png":
            messagebox.showinfo("Formato PNG", "Guarde o ficheiro com a extensão .png.", parent=self)
            return
        try:
            # A biblioteca fecha a imagem recebida; preserve a imagem da interface.
            with self.imagem.copy() as copia:
                secreta = lsb.hide(copia, mensagem)
            try:
                secreta.save(caminho, format="PNG")
            finally:
                secreta.close()
        except Exception as erro:
            messagebox.showerror("Não foi possível esconder", f"A mensagem pode ser demasiado longa para esta imagem, "
                                 f"ou o destino não permite guardar.\n\nDetalhes: {erro}", parent=self)
            return
        self.estado.set(f"Mensagem escondida! Imagem guardada em: {caminho}")
        try:
            self.carregar(caminho)
        except (OSError, ValueError, Image.DecompressionBombError):
            pass  # O ficheiro já foi guardado; mantém a pré-visualização anterior.

    def revelar(self):
        if self.imagem is None:
            return
        try:
            mensagem = lsb.reveal(self.imagem, close_file=False)
            if not mensagem:
                raise IndexError("Sem mensagem")
        except IndexError:
            self.estado.set("Não foi encontrada uma mensagem nesta imagem.")
            messagebox.showinfo("Sem mensagem", "Não foi possível encontrar uma mensagem válida.\n"
                                "Escolha uma imagem PNG criada com este programa ou com o mesmo método.", parent=self)
            return
        except Exception as erro:
            self.estado.set("Não foi possível ler a imagem. Selecione-a novamente.")
            messagebox.showerror("Erro ao revelar", f"Selecione novamente a imagem e tente outra vez.\n\nDetalhes: {erro}", parent=self)
            return
        self.mensagem.delete("1.0", "end")
        self.mensagem.insert("1.0", mensagem)
        self.estado.set("Mensagem revelada! Pode selecionar e copiar o texto.")

    def fechar(self):
        if self.imagem is not None:
            self.imagem.close()
        self.destroy()


if __name__ == "__main__":
    Aplicacao().mainloop()
