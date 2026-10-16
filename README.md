# StegChat — chat com mensagens escondidas em imagens

Aplicação web com **frontend Next.js**, **backend Python/FastAPI** e **base de dados SQLite**. Permite criar contas, conversar com outras pessoas, criar grupos e enviar texto normal ou mensagens escondidas em imagens usando LSB.

## Funcionalidades

Consulte o [relatório completo do projeto](docs/RELATORIO_PROJETO.md): funcionamento da esteganografia, encriptação, ferramentas, código, base de dados e comandos.

- Criar conta, entrar, manter a sessão ao recarregar e sair.
- Procurar utilizadores por username ou nome de apresentação.
- Conversas privadas entre duas contas, sem duplicar a mesma conversa.
- Enviar, editar e eliminar as próprias mensagens para todos os participantes.
- Enviar mensagens ocultas numa imagem, revelar/ocultar o texto e descarregar o PNG.
- Associar um ficheiro `.txt` do computador e ocultá-lo diretamente na imagem, sem mostrar o conteúdo no editor.
- Editar também o texto de mensagens ocultas, voltando a codificar a imagem.
- Suportar acentos, emojis e outros caracteres Unicode nas novas mensagens ocultas.
- Revelar um PNG protegido descarregado deste servidor, apenas com uma conta destinatária autorizada.
- Encriptar o conteúdo com AES-256-GCM antes de o esconder; usernames públicos não são chaves secretas.
- Criar grupos, alterar o nome, adicionar/remover participantes e sair.
- Transferir automaticamente a administração quando o administrador sai; eliminar o grupo quando sai o último participante.
- Mostrar mensagens não lidas e atualizar as conversas automaticamente a cada 3 segundos.
- Interface em português, adaptada a computador e telemóvel.

**Os dados são reais e persistentes.** Não existem contas de demonstração nem mensagens pré-preenchidas. Crie duas contas para experimentar.

## 1. O que precisa de ter instalado

- **Python 3.12**, versão usada no desenvolvimento deste projeto, com `pip` e `venv`.
- **Node.js 22** e **npm**, usados no frontend.
- Um navegador, como Chrome, Edge ou Firefox.

Verifique no terminal PowerShell do VS Code:

```powershell
python --version
node --version
npm --version
```

Se `python` não for reconhecido mas `py` funcionar, use `py -3.12` para criar o ambiente virtual. Se acabou de instalar Python ou Node.js, reabra o terminal.

## 2. Preparação inicial

Abra a pasta do projeto no VS Code e o menu **Terminal → Novo Terminal**.

### Entrar na pasta do projeto

```powershell
cd "E:\Important Issues\Academic\quarto AnoSegundoSemestre\SI\stegoChat"
```

Adapte o caminho se mover o projeto. As aspas são necessárias devido aos espaços.

### Criar o ambiente virtual

```powershell
python -m venv venv
```

Execute apenas se ainda não existir um ambiente `venv` funcional. O primeiro `venv` é o módulo do Python; o segundo é o nome da pasta que guarda o ambiente e as bibliotecas.

Pode ativá-lo:

```powershell
.\venv\Scripts\Activate.ps1
```

Se o PowerShell bloquear a ativação, continue com os comandos seguintes: chamam diretamente o Python do ambiente e não precisam de ativação.

### Instalar as bibliotecas do backend

```powershell
.\venv\Scripts\python.exe -m pip install -r backend\requirements-lock.txt
```

`-m pip` usa o instalador do Python selecionado. `-r` lê as dependências do ficheiro. O ficheiro `requirements-lock.txt` fixa as versões instaladas durante a validação do projeto. `backend/requirements.txt` contém os intervalos de dependências diretas e é a alternativa para atualizar versões; o `requirements.txt` da raiz aponta para esse ficheiro.

### Instalar as dependências do frontend

```powershell
cd frontend
npm ci
cd ..
```

`npm ci` instala as versões exatas registadas em `package-lock.json`. Faça estas instalações na primeira preparação e quando alterar as dependências, não sempre que abrir a aplicação.

## 3. Executar — dois terminais

### Terminal 1: backend

A partir da raiz do projeto:

```powershell
.\venv\Scripts\python.exe -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8001
```

- `uvicorn`: servidor que executa a API Python.
- `backend.main:app`: importa o objeto `app` de `backend/main.py`.
- `--reload`: reinicia o servidor quando altera o código durante o desenvolvimento.
- `--host 127.0.0.1`: aceita ligações locais.
- `--port 8001`: porta utilizada pela API.

Na primeira execução, o backend cria automaticamente a pasta `backend/data` e a base de dados `chat.db`, incluindo todas as tabelas. **Não precisa de criar tabelas manualmente nem instalar SQLite separadamente.**

Mantenha este terminal aberto.

### Terminal 2: frontend

Abra outro terminal na raiz e execute:

```powershell
cd frontend
npm run dev
```

Abra **http://127.0.0.1:3000** no navegador.

O frontend encaminha os pedidos `/api/...` para o backend na porta 8001. Não precisa de configurar `.env` para usar as portas padrão.

**Para voltar a abrir o projeto noutro dia, basta executar os comandos dos dois terminais.** As contas e conversas continuam na base de dados. Para parar um servidor, pressione **Ctrl + C** no respetivo terminal. Se ativou o ambiente virtual, pode terminar essa ativação com `deactivate`.

## 4. Experimentar o chat

1. Abra a aplicação e clique em **Criar conta**. O username aceita 3–30 letras sem acentos, números ou `_`; a palavra-passe deve ter 8–128 caracteres.
2. Crie uma segunda conta numa janela anónima ou noutro navegador. Duas abas normais do mesmo navegador partilham a sessão, por isso não servem para representar duas pessoas independentes.
3. Na primeira conta, clique em **Nova conversa**, pesquise o username da segunda e selecione-o.
4. Escreva uma mensagem normal e envie. A segunda conta verá a conversa através da atualização automática.
5. Para ocultar, selecione **Esconder numa imagem** e escolha uma imagem. Escreva a mensagem ou clique em **Associar ficheiro .txt**. Com um TXT associado, aparece apenas o nome do ficheiro, sem mostrar o conteúdo na caixa de escrita. Clique em enviar para ocultar o TXT diretamente na imagem.
6. O destinatário verá o cartão da imagem. **Revelar mensagem** extrai o texto; **Ocultar texto** volta a escondê-lo na interface. O botão de descarga guarda o PNG.
7. Os botões de lápis e caixote do lixo junto às suas mensagens permitem editar ou eliminar. Uma mensagem eliminada desaparece para todos; uma edição aparece identificada como «editada».
8. Use **Criar grupo**, dê um nome e escolha os participantes. No cabeçalho da conversa, **Grupo** permite gerir participantes e sair.

O criador é o administrador. Apenas ele pode alterar o nome e adicionar/remover pessoas. Qualquer participante pode sair. Novos participantes veem o histórico normal, mas só o remetente e os participantes presentes no envio podem revelar uma mensagem oculta. Sair revoga o acesso à conversa; a conta continua autorizada a revelar cópias das imagens que lhe foram destinadas, através do upload.

O botão **Revelar uma imagem**, no fundo da barra lateral, lê um PNG protegido sem o enviar para uma conversa. Exige sessão e autorização registada neste servidor; ter a fotografia ou saber o username não basta. PNG antigos sem encriptação são recusados neste fluxo.

Os ficheiros `.txt` devem estar em **UTF-8**, ter até **64 KB** e conter no máximo **10 000 caracteres**. O navegador envia o ficheiro original e a imagem ao backend, sem ler o TXT nem preencher a caixa de escrita. O backend valida o conteúdo e incorpora-o na imagem; o texto só é devolvido quando um participante pede para revelar (ou editar) a mensagem oculta. Se já existir um rascunho escrito, é pedida confirmação antes de o descartar para associar o TXT. Pode remover o ficheiro para voltar à escrita manual. Acentos, emojis e quebras de linha são preservados. O que fica oculto na imagem é o conteúdo do TXT, não o seu nome ou um anexo separado. A mensagem continua sujeita à capacidade da imagem escolhida.

## 5. Base de dados

**SQLite** é adequado para esta versão académica/local: não exige um serviço separado e permite guardar o projeto num único ficheiro de dados. O Python inclui o módulo `sqlite3`.

Ficheiro principal:

```text
backend/data/chat.db
```

| Tabela | Conteúdo |
| --- | --- |
| `users` | Username único, nome de apresentação, hash da palavra-passe e data de criação. |
| `sessions` | Hashes dos tokens de sessão, utilizador e validade. |
| `chats` | Conversas privadas e grupos, nome e administrador. |
| `members` | Participantes de cada conversa e última mensagem marcada como lida. |
| `messages` | Autor, conversa, tipo, texto ou imagem PNG, datas de envio e edição. |
| `protected_payloads` | Identificador e chave AES secreta de cada versão de conteúdo oculto. |
| `payload_recipients` | Contas autorizadas no momento do envio, incluindo o remetente. |

As imagens são guardadas como **BLOB** na própria base de dados. Nas mensagens ocultas, `body` é `NULL` e `payload_id` referencia a proteção: o conteúdo incorporado no PNG está cifrado. O servidor verifica a conta e decifra apenas para destinatários autorizados. As chaves ficam na base de dados, nunca no PNG.

Ao arrancar, o servidor atualiza o schema para a versão 2 e migra imagens antigas, com backup prévio em `backend/data/*.before-encryption-*.db`. Em grupos antigos, como não existia histórico de participantes por envio, só o autor recebe acesso; pode reenviar para os destinatários pretendidos. Imagens que não puderem ser migradas ficam bloqueadas. Cópias antigas já descarregadas não podem ser protegidas retroativamente.

As palavras-passe usam `scrypt` com sal aleatório. A sessão dura sete dias e usa um cookie `HttpOnly`; apenas o hash do token é guardado na base de dados. Não há configuração de credenciais de administrador inicial: cada pessoa cria a sua conta.

SQLite usa chaves estrangeiras e modo WAL. Podem aparecer ficheiros `chat.db-wal` e `chat.db-shm` enquanto o servidor trabalha. **Não os apague com o backend aberto.** Não copie apenas `chat.db` durante uma escrita; utilize o comando de backup.

### Fazer backup

Na raiz do projeto, com ou sem o backend em execução:

```powershell
.\venv\Scripts\python.exe -m backend.backup
```

Cria um ficheiro com data e hora em `backups/`, usando a API de backup do SQLite para incluir uma visão consistente dos dados. Pode escolher outro destino que ainda não exista:

```powershell
.\venv\Scripts\python.exe -m backend.backup backups\minha-copia.db
```

O backup inclui contas, sessões, conversas, mensagens, imagens, chaves secretas e permissões. Proteja o acesso a estes ficheiros: quem possui a base completa pode decifrar os conteúdos. As pastas de dados e backups estão no `.gitignore`.

### Restaurar uma cópia sem substituir a base atual

Pare o backend. Copie o backup para um **novo nome** e selecione-o antes de iniciar o servidor:

```powershell
Copy-Item backups\minha-copia.db backend\data\restaurada.db
$env:CHAT_DB_PATH = (Resolve-Path backend\data\restaurada.db).Path
.\venv\Scripts\python.exe -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8001
```

Escolha outro nome se `restaurada.db` já existir. Para voltar ao ficheiro padrão numa nova execução, remova a variável com `Remove-Item Env:CHAT_DB_PATH` ou abra outro terminal.

## 6. Organização e explicação do código

```text
frontend/
  app/page.tsx               Estado e interface do chat
  app/layout.tsx             Estrutura HTML, idioma e metadados
  app/globals.css            Estilos e adaptação ao telemóvel
  components/Auth.tsx        Formulários de entrada e registo
  components/Modal.tsx       Janelas acessíveis de pesquisa e gestão
  components/Icon.tsx        Ícones SVG locais
  lib/api.ts                 Cliente HTTP, tipos e funções auxiliares
  lib/text-file.ts           Validação de nome/tamanho do TXT, sem ler conteúdo
  next.config.ts             Encaminhamento /api para o backend
  tests/chat.spec.ts         Testes no navegador com duas sessões
  tests/text-file.spec.ts    Verificação de metadados sem leitura do TXT
  playwright.config.ts      Servidores e configuração dos testes
  package.json              Dependências e comandos npm
  package-lock.json         Versões exatas das dependências
backend/
  main.py                   Rotas, autenticação e permissões
  database.py               Schema SQLite e transações
  security.py               Hashes de palavras-passe e sessões
  steganography.py          Ocultação e revelação LSB com Unicode
  protected_images.py       AES-256-GCM e autorização por destinatário
  migrate_encryption.py     Migração de imagens antigas com backup
  text_files.py             Leitura e validação do TXT apenas no backend
  backup.py                 Backup consistente do SQLite
  requirements.txt          Dependências diretas
  requirements-lock.txt     Versões instaladas na validação
  tests/test_api.py         Testes da API e das permissões
  tests/test_protected_images.py  Cópias, grupos, adulteração e migração
  data/chat.db              Dados da aplicação (criado ao iniciar)
docs/
  RELATORIO_PROJETO.md      Relatório completo e ferramentas utilizadas
  ARQUITETURA.md            Explicação dos fluxos, funções e endpoints
  DESKTOP.md                Documentação anterior da versão Tkinter
main.py                     Programa desktop original, preservado
test_main.py                Testes do programa desktop original
```

A explicação das duas camadas, das funções e dos endpoints está em [docs/ARQUITETURA.md](docs/ARQUITETURA.md). O programa desktop continua disponível com `.\venv\Scripts\python.exe main.py`, mas não partilha contas ou conversas com o chat web.

## 7. Executar os testes

### Backend — da raiz

```powershell
.\venv\Scripts\python.exe -m unittest discover -s backend\tests -v
```

Cria bases de dados temporárias. Verifica autenticação, acesso às conversas e imagens, autoria, grupos, Unicode, capacidade, bloqueio de terceiros com cópias do PNG, adulteração, backup e migração de imagens antigas.

### Frontend — dentro de `frontend`

```powershell
npm run typecheck
npm run build
```

O primeiro verifica os tipos TypeScript. O segundo gera a compilação de produção. Depois do build, `npm run start` serve essa versão na porta 3000; o backend continua necessário. Não execute `dev` e `start` simultaneamente na mesma porta.

### Testes automáticos no navegador

Instale o navegador de testes uma vez:

```powershell
npx playwright install chromium
npm run test:e2e
```

Se já tiver Google Chrome instalado, pode usá-lo sem descarregar Chromium:

```powershell
$env:PLAYWRIGHT_CHANNEL = "chrome"
npm run test:e2e
```

Os testes iniciam os seus próprios servidores nas portas **8011** e **3011** e usam **`backend/data/e2e.db`**, separada dos seus dados. O frontend de teste utiliza a pasta `.next-e2e` para separar a compilação da aplicação normal. As contas de teste têm nomes únicos. A configuração procura o Python em `venv`; se estiver noutro caminho, defina `PYTHON_PATH`.

### Programa desktop original — da raiz

```powershell
.\venv\Scripts\python.exe -m unittest -v test_main
```

## 8. Configuração opcional

| Variável | Onde é usada | Valor padrão |
| --- | --- | --- |
| `API_URL` | Servidor Next.js, em `frontend/.env.local` | `http://127.0.0.1:8001` |
| `CHAT_DB_PATH` | Ambiente do processo Python | `backend/data/chat.db`, relativo à localização do módulo |
| `CHAT_ORIGINS` | Ambiente do processo Python | Endereços locais nas portas 3000 e 8001 |
| `CHAT_SECURE_COOKIES` | Ambiente do processo Python | `0`, adequado ao HTTP local; use `1` com HTTPS |

Para configurar o frontend, copie `frontend/.env.example` para `frontend/.env.local` e reinicie o Next.js em desenvolvimento. Se estiver a usar `npm run start`, volte a executar `npm run build` antes de reiniciar, porque o encaminhamento é registado na compilação. `API_URL` é uma variável do servidor e não tem prefixo `NEXT_PUBLIC_`.

O backend não carrega ficheiros `.env` automaticamente; `backend/.env.example` serve de referência. Em PowerShell, defina variáveis antes do comando do Uvicorn, por exemplo:

```powershell
$env:CHAT_ORIGINS = "http://127.0.0.1:3001"
```

Se a porta 3000 estiver ocupada e usar outra, ajuste `CHAT_ORIGINS` e reinicie o backend para permitir pedidos desse endereço.

## 9. Limites desta versão

- **LSB esconde e AES-256-GCM cifra.** Só as contas destinatárias podem revelar pela aplicação, mas o servidor guarda as chaves: não existe encriptação ponta a ponta. Eliminar/editar uma mensagem não revoga cópias já entregues aos destinatários originais.
- Imagens de entrada: até **8 MB** e **4 milhões de píxeis**. A mensagem deve caber na imagem. Texto: até **10 000 caracteres**. Grupos: até **50 participantes**.
- O PNG gerado preserva os píxeis. Redimensionar, recomprimir ou converter para JPEG pode destruir a mensagem. A versão desktop antiga não interpreta o envelope Unicode novo; use o chat para revelar imagens produzidas pelo chat.
- Atualização automática por **polling de 3 segundos**, com o histórico completo da conversa aberta. Não há WebSockets, paginação, chamadas de voz/vídeo ou indicador «a escrever».
- Sem recuperação de palavra-passe por email, confirmação de email ou moderação global. Esta implementação destina-se a demonstração académica e uso local.
- Para alojar publicamente, configure HTTPS, cookies seguros e a origem pública. Para muitos utilizadores, será necessário adaptar o armazenamento de imagens, usar uma base de dados como PostgreSQL, acrescentar paginação e uma limitação de pedidos partilhada entre processos.

## 10. Problemas frequentes

| Problema | Solução |
| --- | --- |
| «Sem ligação ao servidor» | Confirme que os dois terminais estão ativos e que a API responde em `http://127.0.0.1:8001/api/health`. |
| Origem não autorizada | Use a porta 3000 ou ajuste `CHAT_ORIGINS` para o endereço exato do frontend. |
| `No module named ...` | Instale as dependências com o Python de `venv` e use esse mesmo Python para executar o Uvicorn. |
| `npm` não reconhecido | Instale Node.js e reabra o terminal. |
| `npm.ps1` bloqueado | Use `npm.cmd ci` e `npm.cmd run dev`, sem alterar a política do PowerShell. |
| Instalação Python fica parada na leitura dos certificados no Windows | Experimente `.\venv\Scripts\python.exe -m pip install --use-deprecated=legacy-certs -r backend\requirements-lock.txt`; mantém a validação TLS com o conjunto de certificados do pip. |
| `EPERM` no npm | Feche processos que bloqueiem os ficheiros e use uma cache gravável, por exemplo `npm ci --cache ..\.npm-cache`, dentro de `frontend`. |
| Uma conta aparece em duas abas | É a mesma sessão. Use uma janela anónima ou outro navegador para a segunda conta. |
| Mensagem não cabe na imagem | Reduza o texto ou escolha uma imagem maior. |
| Backend não arranca depois de mover o projeto | Crie novamente o ambiente virtual na nova localização e reinstale as dependências. |

A documentação interativa da API está em **http://127.0.0.1:8001/docs**. O esquema das tabelas e a lista de rotas encontram-se em [docs/ARQUITETURA.md](docs/ARQUITETURA.md).
