# Esteganografia em imagens

> Documento da versão desktop original, preservada em `main.py`. Para o novo chat web, consulte o [README principal](../README.md). O `requirements.txt` da raiz passou a incluir também as dependências do backend web; os comandos desktop continuam disponíveis.

Aplicação em Python com interface gráfica para esconder uma mensagem numa imagem e voltar a revelá-la. O utilizador escolhe a imagem, escreve o texto e guarda uma imagem PNG com a mensagem incorporada.

## 1. Ficheiros do projeto

| Ficheiro/pasta | Função |
| --- | --- |
| `main.py` | Interface gráfica, seleção de imagens, ocultação e leitura das mensagens. |
| `requirements.txt` | Bibliotecas externas necessárias e intervalos de versões aceites. |
| `test_main.py` | Testes automáticos das operações principais. |
| `venv/` | Ambiente virtual: contém o interpretador e as bibliotecas do projeto. |
| `__pycache__/` | Cache criada automaticamente pelo Python ao importar ou compilar módulos. |

## 2. Preparar e executar — Windows / PowerShell

Os comandos seguintes devem ser executados no terminal do VS Code, em **Terminal → Novo Terminal**. O projeto atual utiliza Python 3.12.

### Entrar na pasta

```powershell
cd "E:\Important Issues\Academic\quarto AnoSegundoSemestre\SI\esteganografiaTrabalho"
```

`cd` muda a pasta atual do terminal. As aspas permitem usar um caminho com espaços. Se mover o projeto, adapte este caminho.

### Verificar o Python

```powershell
python --version
```

Mostra a versão instalada. Se `python` não for reconhecido, experimente `py --version`. Se nenhum funcionar, instale o Python com suporte a Tcl/Tk e configure o acesso ao interpretador pelo terminal.

### Criar o ambiente virtual — apenas na primeira preparação

```powershell
python -m venv venv
```

- `python`: executa o interpretador.
- `-m venv`: executa o módulo do Python que cria ambientes virtuais.
- O último `venv`: é o nome da pasta onde o ambiente será criado.

O ambiente virtual mantém as dependências deste projeto separadas das de outros projetos. **Se a pasta `venv` já existe e funciona, não precisa de voltar a criá-la.** Se utilizar o lançador `py`, o comando equivalente é `py -3.12 -m venv venv`, desde que essa versão esteja instalada.

### Ativar o ambiente virtual

```powershell
.\venv\Scripts\Activate.ps1
```

Após ativar, normalmente aparece `(venv)` no início da linha do terminal. O comando `python` passa a usar o interpretador desse ambiente. A ativação aplica-se à sessão atual do terminal.

**Se o PowerShell bloquear a ativação**, pode usar os comandos da secção «Executar sem ativar» abaixo, sem alterar as políticas do sistema.

### Instalar as bibliotecas

```powershell
python -m pip install -r requirements.txt
```

- `-m pip`: executa o gestor de pacotes associado ao Python selecionado.
- `install`: instala os pacotes.
- `-r requirements.txt`: lê os pacotes e as versões permitidas desse ficheiro.

A instalação pode precisar de acesso à Internet. Execute-a na primeira preparação ou quando as dependências forem alteradas.

O ficheiro contém:

```text
stegano>=0.11,<3
Pillow>=10,<13
```

`>=` significa «versão igual ou superior»; `<` significa «versão inferior». Assim, o ficheiro permite várias versões, não fixa uma versão exata. O `pip` também instala as dependências destas bibliotecas. O Tkinter faz parte da instalação do Python com Tcl/Tk e não é instalado por este ficheiro.

### Abrir a aplicação

```powershell
python main.py
```

Executa o ficheiro principal e abre a janela. O terminal permanece ocupado enquanto a aplicação estiver em execução.

### Executar sem ativar o ambiente

Pode chamar diretamente o Python que está dentro de `venv`:

```powershell
.\venv\Scripts\python.exe -m pip install -r requirements.txt
.\venv\Scripts\python.exe main.py
```

O prefixo `.\` indica a pasta atual. Esta opção também funciona quando a ativação do PowerShell está bloqueada. Depois da primeira instalação, basta o segundo comando para abrir a aplicação.

### Reiniciar e sair

Para reiniciar depois de alterar o código, guarde `main.py`, feche a janela e execute novamente:

```powershell
.\venv\Scripts\python.exe main.py
```

Se o processo continuar no terminal, pressione **Ctrl + C**. Para desativar um ambiente que tenha sido ativado, depois de fechar a aplicação, execute:

```powershell
deactivate
```

Este comando apenas termina a ativação no terminal; não apaga o ambiente nem os ficheiros.

## 3. Como utilizar a interface

### Esconder uma mensagem

1. Clique em **Escolher imagem…** e selecione uma imagem.
2. Escreva a mensagem na caixa de texto.
3. Clique em **Esconder e guardar…**.
4. Escolha a pasta e guarde com extensão `.png`. O nome sugerido termina em `_secreta.png`.
5. Consulte a confirmação na parte inferior da janela. A aplicação tenta carregar automaticamente a imagem guardada.

### Revelar uma mensagem

1. Selecione o PNG que contém a mensagem, por exemplo `foto_secreta.png`.
2. Clique em **Revelar**.
3. A mensagem aparece na caixa de texto, substituindo o texto que lá estava. Pode selecioná-la e copiá-la.

Uma imagem original que nunca recebeu uma mensagem não tem conteúdo para revelar. Para partilhar a mensagem escondida, envie o ficheiro PNG guardado; redimensionar a imagem ou convertê-la para JPEG pode destruir os dados.

## 4. Como a esteganografia funciona

O programa usa o método **LSB**, do inglês *Least Significant Bit*, através da biblioteca `stegano`. Cada píxel RGB contém valores para vermelho, verde e azul. A biblioteca altera o bit menos significativo de cada um desses três valores para guardar os bits da mensagem.

Por exemplo, o valor binário `11001010` representa 202. Substituir o último bit por `1` produz `11001011`, que representa 203. A diferença de uma unidade na componente de cor costuma ser visualmente impercetível.

Na versão 2.5.0 da biblioteca instalada durante a correção, o texto inclui um prefixo com o seu comprimento e `:`. Ao revelar, a biblioteca lê esse prefixo para determinar quantos caracteres deve recuperar. Em imagens RGBA, os dados são colocados nos canais RGB; o canal alfa, que representa transparência, é preservado.

Existem aproximadamente `largura × altura × 3` bits disponíveis. Parte desse espaço é usada pelo prefixo e pelo preenchimento, pelo que a mensagem deve caber na imagem. A biblioteca verifica essa capacidade.

O PNG preserva os valores dos píxeis ao guardar. A ocultação não inclui palavra-passe nem encriptação: quem tiver a imagem e conhecer o método pode extrair o texto.

## 5. Explicação de `main.py`

### Importações

| Código | Utilidade |
| --- | --- |
| `from pathlib import Path` | Manipula caminhos e permite obter nome, extensão e nome sem extensão. |
| `import tkinter as tk` | Disponibiliza a janela e os componentes básicos da interface. `tk` é um nome abreviado. |
| `filedialog` | Abre as caixas de diálogo para escolher e guardar ficheiros. |
| `messagebox` | Mostra avisos, informações e erros. |
| `ttk` | Disponibiliza componentes com estilos, como botões, painéis e etiquetas. |
| `ScrolledText` | Caixa de texto com barra de deslocamento. |
| `Image` | Abre, converte, copia e guarda imagens através do Pillow. |
| `ImageTk` | Converte uma imagem do Pillow para um formato que o Tkinter pode apresentar. |
| `lsb` | Fornece as funções para esconder e revelar mensagens. |

### Classe `Aplicacao(tk.Tk)`

A classe herda de `tk.Tk`, por isso representa a janela principal e acrescenta os comportamentos do programa. `self` refere-se à instância atual: permite que diferentes métodos acedam à mesma imagem, aos mesmos botões e à mesma caixa de texto.

### `__init__`: construção da janela

Este método corre quando é criada uma `Aplicacao`. `super().__init__()` inicializa a janela do Tkinter antes de a configurar.

- `title(...)` define o título.
- `geometry("880x640")` define a dimensão inicial em píxeis.
- `minsize(760, 600)` limita o tamanho mínimo.
- `configure(bg=...)` define a cor do fundo.

Os atributos principais são:

| Atributo | Conteúdo |
| --- | --- |
| `self.imagem` | Imagem completa em memória; começa como `None`, isto é, sem imagem. |
| `self.caminho` | Caminho da imagem selecionada, como objeto `Path`. |
| `self.previa` | Imagem adaptada ao Tkinter para apresentar a miniatura. Manter esta referência impede que a pré-visualização desapareça por ser libertada da memória. |
| `self.estado` | `StringVar` ligada ao texto de estado no rodapé. |
| `self.nome` | `StringVar` ligada ao nome e às dimensões da imagem. |
| `self.visualizacao` | Etiqueta que apresenta a miniatura. |
| `self.mensagem` | Caixa de texto para escrever e apresentar a mensagem. |
| `self.esconder_botao` / `self.revelar_botao` | Botões das operações principais. |

`StringVar.set(...)` atualiza automaticamente as etiquetas ligadas por `textvariable`.

### Estilos e disposição dos componentes

`ttk.Style(self)` cria a configuração visual. `theme_use("clam")` escolhe o tema. `configure(...)` define fontes, cores e margens para estilos como `Title.TLabel` e `Primary.TButton`. `map(...)` adapta a aparência do botão aos estados ativo e desativado.

O painel principal contém o título, uma descrição, duas colunas e o rodapé. A coluna esquerda apresenta a imagem e o botão de seleção. A direita contém a caixa de texto e os botões para esconder e revelar.

| Opção/método | Significado |
| --- | --- |
| `Frame` | Agrupa componentes num painel. |
| `Label` | Apresenta texto ou uma imagem. |
| `pack(...)` | Organiza componentes dentro de um painel. |
| `grid(...)` | Organiza as duas colunas numa grelha. É usado num contentor diferente dos componentes organizados com `pack`. |
| `fill="both"`, `expand=True` | Permitem que o componente ocupe espaço adicional. |
| `fill="x"` | Estica o componente horizontalmente. |
| `sticky="nsew"` | Faz o componente preencher a célula da grelha nas quatro direções. |
| `weight=1` | Permite que a linha ou coluna receba espaço ao redimensionar. |
| `uniform="card"` | Mantém as duas colunas com a mesma proporção. |
| `padding`, `padx`, `pady` | Definem espaços internos ou em redor dos componentes. Um par permite margens diferentes de cada lado. |
| `anchor="w"` | Alinha à esquerda. |
| `wraplength` | Define a largura a partir da qual o texto de uma etiqueta muda de linha. |
| `command=self.escolher` | Associa a função ao clique; sem parênteses, a função só é executada quando o botão é acionado. |
| `state="disabled"` | Impede o uso dos botões antes de selecionar uma imagem. |

Na caixa `ScrolledText`, `wrap="word"` evita cortar palavras na mudança visual de linha, `undo=True` permite desfazer alterações e `relief="flat"` remove o relevo da borda. As dimensões `width` e `height` desse campo são dadas em unidades de caracteres e linhas.

Por fim, `protocol("WM_DELETE_WINDOW", self.fechar)` liga o botão de fechar da janela ao método que liberta os recursos.

### `carregar(self, caminho)`: preparar a imagem

1. `Image.open(caminho)` abre o ficheiro dentro de um bloco `with`, que fecha o ficheiro ao terminar.
2. `getbands()` identifica os canais. Se existir `A`, converte para RGBA; caso contrário, converte para RGB. A imagem convertida fica disponível depois do fecho do ficheiro original.
3. `copy()` cria uma cópia para a miniatura.
4. `thumbnail((280, 230), Image.Resampling.LANCZOS)` reduz essa cópia, mantendo as proporções, para caber na área indicada.
5. `ImageTk.PhotoImage(...)` prepara a miniatura para a interface. A imagem completa continua com as dimensões originais e é a utilizada na esteganografia.
6. Fecha a miniatura do Pillow e a imagem anteriormente selecionada, quando existe.
7. Guarda a nova imagem e o seu caminho, atualiza a pré-visualização, o nome e as dimensões.
8. Ativa os botões com `state="normal"`.

### `escolher(self)`: selecionar um ficheiro

`askopenfilename(...)` abre o seletor de ficheiros. `filetypes` define os filtros apresentados, incluindo PNG, JPEG, BMP e WebP. `parent=self` associa a caixa de diálogo à janela principal.

Se o utilizador cancelar, `if not caminho: return` termina o método. Caso contrário, chama `carregar(...)` e atualiza o estado. O bloco `except` apresenta um aviso se ocorrer um erro de leitura, um valor inválido ou a rejeição de uma imagem pelo limite de segurança de dimensões do Pillow.

### `esconder(self)`: incorporar e guardar o texto

Primeiro verifica se há imagem. Depois lê o conteúdo com:

```python
mensagem = self.mensagem.get("1.0", "end-1c")
```

`"1.0"` indica a primeira linha e a coluna zero. `"end-1c"` exclui a quebra de linha final que o Tkinter acrescenta automaticamente. `mensagem.strip()` é usado apenas para rejeitar uma mensagem vazia ou composta só por espaços; o texto original é o que será escondido. `focus_set()` devolve o foco à caixa quando é necessário escrever.

`asksaveasfilename(...)` pede o destino. `self.caminho.stem` obtém o nome sem extensão para sugerir, por exemplo, `foto_secreta.png`. `defaultextension` define a extensão por omissão e `suffix.lower()` verifica se a extensão escolhida é `.png`, independentemente das maiúsculas.

O núcleo da operação é:

```python
with self.imagem.copy() as copia:
    secreta = lsb.hide(copia, mensagem)
```

A biblioteca fecha a imagem que recebe ao esconder. Passar uma cópia preserva a imagem da interface, mesmo quando a mensagem é demasiado longa e a operação falha.

`secreta.save(caminho, format="PNG")` escreve a imagem no disco. O bloco `finally` fecha `secreta` tanto no sucesso como no erro. O `except Exception as erro` mostra os detalhes caso a ocultação ou a gravação falhem.

Após guardar, atualiza o estado e chama `carregar(caminho)`, permitindo revelar imediatamente a imagem gerada. Se essa recarga falhar por um dos erros previstos, `pass` deixa a pré-visualização anterior; o ficheiro já foi guardado.

### `revelar(self)`: recuperar a mensagem

Depois de verificar que há imagem, executa:

```python
mensagem = lsb.reveal(self.imagem, close_file=False)
```

`close_file=False` mantém a imagem aberta para permitir várias leituras e uma nova ocultação. Sem esta opção, uma leitura bem-sucedida fecha a imagem na biblioteca e a operação seguinte pode falhar.

Se não for obtida uma mensagem, o código lança `IndexError`. Esse erro, também usado pela biblioteca quando não encontra conteúdo válido, é tratado com o aviso «Sem mensagem». Outros erros são apresentados separadamente, com os detalhes e a indicação de voltar a selecionar a imagem.

No sucesso, `delete("1.0", "end")` limpa a caixa e `insert("1.0", mensagem)` coloca o texto recuperado. O estado passa a indicar que a mensagem foi revelada.

### `fechar(self)`: libertar recursos

Se houver imagem em memória, chama `close()`. Depois, `destroy()` fecha a janela e termina o ciclo da interface.

### Ponto de entrada

```python
if __name__ == "__main__":
    Aplicacao().mainloop()
```

A condição é verdadeira quando executamos `python main.py`. `Aplicacao()` constrói a janela e `mainloop()` mantém a interface à espera de cliques, escrita e outros eventos. Quando os testes importam `Aplicacao`, esta condição é falsa e a janela não é aberta automaticamente.

## 6. Explicação de `test_main.py`

Os testes usam `unittest`, que faz parte do Python. `TestFluxoMensagem(unittest.TestCase)` agrupa os testes; os métodos cujo nome começa por `test_` são executados pelo mecanismo de testes.

- `tempfile.TemporaryDirectory()` cria pastas temporárias e remove-as no final, evitando deixar imagens de teste no projeto.
- `SimpleNamespace` cria um objeto simples com os atributos necessários para executar os métodos da aplicação sem abrir uma janela.
- `Mock()` substitui a caixa de texto, o estado e o método de recarga, permitindo verificar as chamadas feitas pelo código.
- `patch(...)` substitui temporariamente as caixas de diálogo para que o teste não peça intervenção humana.
- `return_value` define a resposta simulada de uma função.
- `assertEqual` compara resultados; `assert_called_once`, `assert_called_once_with`, `assert_called_with` e `assert_not_called` verificam as chamadas aos objetos simulados.
- `Image.new(...)` gera as imagens de teste em memória.

O método auxiliar `criar_interface(...)` prepara os atributos simulados e um texto com acentos. Cada teste cobre um caso:

| Teste | O que verifica |
| --- | --- |
| `test_guardar_reabrir_e_revelar_duas_vezes` | Guarda um PNG, reabre-o e recupera o mesmo texto duas vezes; verifica também que a imagem original continua aberta. |
| `test_mensagem_demasiado_longa_preserva_imagem` | Tenta esconder texto numa imagem demasiado pequena, verifica o aviso e confirma que a imagem continua utilizável. |
| `test_imagem_sem_mensagem` | Verifica o aviso para uma imagem sem mensagem e confirma que não é inserido texto na caixa. |
| `test_revelar_e_esconder_novamente` | Revela uma mensagem, esconde outra e confirma a recuperação do novo texto e a preservação do alfa no píxel verificado. |

`unittest.main()` permite executar o ficheiro de testes diretamente. Estes testes verificam a lógica e a leitura/escrita real das imagens; não validam visualmente a disposição dos componentes ou a interação manual com as caixas de diálogo.

### Comandos de verificação

Com o ambiente ativado:

```powershell
python -m unittest -v test_main
```

Sem ativar:

```powershell
.\venv\Scripts\python.exe -m unittest -v test_main
```

`-m unittest` executa o módulo de testes, `-v` mostra o nome e o resultado de cada teste e `test_main` identifica o módulo, sem a extensão `.py`. Um resultado `OK` significa que os testes executados passaram.

Para verificar apenas a sintaxe:

```powershell
.\venv\Scripts\python.exe -m py_compile main.py test_main.py
```

`py_compile` compila os ficheiros sem abrir a interface. Não substitui os testes de funcionamento.

## 7. Problemas frequentes e limites atuais

| Situação | Como proceder |
| --- | --- |
| `No module named 'stegano'` ou `No module named 'PIL'` | Instale `requirements.txt` usando o Python de `venv` e execute a aplicação com esse mesmo interpretador. |
| Ativação bloqueada no PowerShell | Use diretamente `.\venv\Scripts\python.exe`, conforme os comandos acima. |
| Erro relacionado com `init.tcl` ou Tcl/Tk | Teste com `.\venv\Scripts\python.exe -m tkinter`. Se também falhar, verifique/repare o suporte Tcl/Tk da instalação do Python usada pelo ambiente. |
| Mensagem demasiado longa | Use uma imagem maior ou reduza o texto. |
| «Sem mensagem» | Escolha o PNG gerado pela aplicação. Uma imagem original ou alterada depois da ocultação pode não conter uma mensagem recuperável. |
| «Erro ao revelar» | Volte a selecionar o ficheiro e consulte os detalhes apresentados. |
| Alterações no código não aparecem | Guarde o ficheiro, feche a aplicação e execute-a novamente. |

Os testes incluem texto com acentos portugueses. A implementação de codificação da biblioteca 2.5.0 usada neste projeto não garante a recuperação correta de todos os caracteres Unicode com a configuração atual, como alguns símbolos e emojis. O programa também realiza as operações na mesma thread da interface: imagens ou mensagens grandes podem fazer a janela deixar de responder temporariamente.
