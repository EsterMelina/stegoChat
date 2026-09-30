"use client";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Auth from "../components/Auth";
import Icon from "../components/Icon";
import Modal from "../components/Modal";
import { api, ApiError, Chat, initials, Message, title, User } from "../lib/api";
import { validateTextFile } from "../lib/text-file";

type Panel = "direct" | "group" | "manage" | "decode" | null;
type Revealed = Record<number, { version: string | null; body: string }>;

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [startupError, setStartupError] = useState("");
  const [chats, setChats] = useState<Chat[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [filter, setFilter] = useState("");
  const [body, setBody] = useState("");
  const [textFile, setTextFile] = useState<File | null>(null);
  const [hidden, setHidden] = useState(false);
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [editing, setEditing] = useState<Message | null>(null);
  const [revealed, setRevealed] = useState<Revealed>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [connection, setConnection] = useState("A ligar…");
  const [revision, setRevision] = useState(0);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [memberIds, setMemberIds] = useState<number[]>([]);
  const [groupName, setGroupName] = useState("");
  const [modalError, setModalError] = useState("");
  const [decoded, setDecoded] = useState("");
  const [decodeFile, setDecodeFile] = useState<File | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const active = chats.find(chat => chat.id === selected);
  const refresh = () => setRevision(value => value + 1);

  const initialize = useCallback(async () => {
    setInitializing(true); setStartupError("");
    try {
      const health = await api<{ service?: string }>("/health");
      if (health.service !== "stegchat") {
        throw new Error("O frontend está ligado a outro backend. Inicie o backend do StegChat na porta 8001 e reinicie o frontend, conforme o README.");
      }
      setUser(await api<User>("/auth/me"));
    }
    catch (error) { if (!(error instanceof ApiError && error.status === 401)) setStartupError((error as Error).message); }
    finally { setInitializing(false); }
  }, []);
  useEffect(() => { void initialize(); }, [initialize]);

  useEffect(() => {
    if (!user) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    async function sync() {
      try {
        const list = await api<Chat[]>("/chats");
        if (disposed) return;
        setChats(list);
        if (selected !== null) {
          if (!list.some(chat => chat.id === selected)) {
            setSelected(null); setMessages([]); setRevealed({}); setBody(""); setTextFile(null); setImage(null); setEditing(null); setPanel(null);
          } else {
            const incoming = await api<Message[]>(`/chats/${selected}/messages`);
            if (disposed) return;
            setMessages(incoming); setLoadingMessages(false);
            if (document.visibilityState === "visible" && incoming.length) {
              await api(`/chats/${selected}/read`, { method: "POST", body: JSON.stringify({ message_id: incoming[incoming.length - 1].id }) });
              if (!disposed) setChats(current => current.map(chat => chat.id === selected ? { ...chat, unread: 0 } : chat));
            }
          }
        }
        if (!disposed) setConnection("Atualizado");
      } catch (error) {
        if (disposed) return;
        setLoadingMessages(false);
        if (error instanceof ApiError && error.status === 401) {
          setUser(null); setChats([]); setSelected(null); setMessages([]); setRevealed({}); setBody(""); setTextFile(null); setImage(null); setPanel(null);
        } else setConnection("Sem ligação · a tentar novamente");
      } finally { if (!disposed) timer = setTimeout(sync, 3000); }
    }
    void sync();
    return () => { disposed = true; clearTimeout(timer); };
  }, [user, selected, revision]);

  useEffect(() => {
    if (nearBottom.current) listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);
  useEffect(() => {
    if (!image) { setPreview(""); return; }
    const url = URL.createObjectURL(image); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);
  useEffect(() => {
    if (!panel || panel === "decode") return;
    let disposed = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const users = await api<User[]>(`/users?q=${encodeURIComponent(search)}`);
        if (!disposed) { setResults(users); setModalError(""); }
      } catch (error) { if (!disposed) setModalError((error as Error).message); }
      finally { if (!disposed) setSearching(false); }
    }, 250);
    return () => { disposed = true; clearTimeout(timer); };
  }, [search, panel]);

  function resetComposer() {
    setBody(""); setTextFile(null); setImage(null); setEditing(null); setHidden(false);
    if (fileRef.current) fileRef.current.value = "";
  }
  function attachText(file: File) {
    setError("");
    try {
      validateTextFile(file);
      if (body && !window.confirm("Substituir o rascunho pelo ficheiro TXT? O conteúdo do ficheiro não será mostrado.")) return;
      setBody(""); setTextFile(file);
    } catch (error) { setError((error as Error).message); }
  }
  function selectChat(id: number | null) {
    if (busy || selected === id) return;
    if ((body || image || textFile) && !window.confirm("Descartar a mensagem que ainda não enviou?")) return;
    setSelected(id); setMessages([]); setRevealed({}); setError(""); setLoadingMessages(id !== null); resetComposer(); nearBottom.current = true;
  }
  function openPanel(value: Panel) {
    setPanel(value); setSearch(""); setResults([]); setMemberIds([]); setGroupName(value === "manage" ? active?.name || "" : ""); setModalError(""); setDecoded(""); setDecodeFile(null);
  }
  async function modalAction(action: () => Promise<void>) {
    setBusy(true); setModalError("");
    try { await action(); refresh(); }
    catch (error) { setModalError((error as Error).message); }
    finally { setBusy(false); }
  }
  async function startDirect(person: User) {
    await modalAction(async () => {
      const chat = await api<{ id: number }>("/chats/direct", { method: "POST", body: JSON.stringify({ user_id: person.id }) });
      if ((body || image || textFile) && !window.confirm("Descartar a mensagem atual e abrir esta conversa?")) return;
      resetComposer(); setSelected(chat.id); setMessages([]); setRevealed({}); setPanel(null); setLoadingMessages(true); nearBottom.current = true;
    });
  }
  async function createGroup(event: FormEvent) {
    event.preventDefault();
    if ((body || image || textFile) && !window.confirm("Descartar o rascunho atual e abrir o novo grupo?")) return;
    await modalAction(async () => {
      const chat = await api<{ id: number }>("/chats/groups", { method: "POST", body: JSON.stringify({ name: groupName, member_ids: memberIds }) });
      resetComposer(); setSelected(chat.id); setMessages([]); setRevealed({}); setPanel(null); setLoadingMessages(true); nearBottom.current = true;
    });
  }
  async function send(event?: FormEvent) {
    event?.preventDefault();
    if (busy || selected === null || (!body.trim() && !(hidden && textFile))) return;
    if (hidden && !image && !editing) { setError("Escolha a imagem que vai guardar a mensagem."); return; }
    setBusy(true); setError("");
    try {
      if (editing) await api(`/messages/${editing.id}`, { method: "PATCH", body: JSON.stringify({ body }) });
      else {
        const form = new FormData(); form.set("kind", hidden ? "hidden" : "text");
        if (hidden && textFile) form.set("text_file", textFile);
        else form.set("body", body);
        if (image && hidden) form.set("image", image);
        await api(`/chats/${selected}/messages`, { method: "POST", body: form });
      }
      resetComposer(); nearBottom.current = true; refresh();
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  async function reveal(message: Message) {
    const currentChat = selected;
    setBusy(true); setError("");
    try {
      const result = await api<{ body: string }>(`/messages/${message.id}/reveal`, { method: "POST" });
      if (selectedRef.current === currentChat) setRevealed(current => ({ ...current, [message.id]: { version: message.edited_at, body: result.body } }));
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  async function edit(message: Message) {
    if ((body || image || textFile) && !window.confirm("Descartar o rascunho e editar esta mensagem?")) return;
    setBusy(true); setError("");
    try {
      const text = message.kind === "hidden" ? (await api<{ body: string }>(`/messages/${message.id}/reveal`, { method: "POST" })).body : message.body || "";
      setEditing(message); setBody(text); setTextFile(null); setHidden(message.kind === "hidden"); setImage(null);
      document.getElementById("message-input")?.focus();
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  async function remove(message: Message) {
    if (!window.confirm("Eliminar esta mensagem para todos os participantes?")) return;
    setBusy(true); setError("");
    try {
      await api(`/messages/${message.id}`, { method: "DELETE" });
      setMessages(current => current.filter(item => item.id !== message.id));
      if (editing?.id === message.id) resetComposer();
      refresh();
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  async function logout() {
    if ((body || image || textFile) && !window.confirm("Sair e descartar o rascunho?")) return;
    setBusy(true);
    try {
      await api("/auth/logout", { method: "POST" });
      setUser(null); setChats([]); setMessages([]); setSelected(null); setRevealed({}); resetComposer(); setPanel(null); setError("");
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }

  if (initializing || startupError) return <main className="startup"><div className="brand-mark"><Icon name="chat" size={30}/></div><h1>StegChat</h1><p role="status">{startupError || "A preparar as suas conversas…"}</p>{startupError && <button className="primary" onClick={initialize}>Tentar novamente</button>}</main>;
  if (!user) return <Auth onLogin={setUser}/>;

  const visibleChats = chats.filter(chat => `${title(chat, user.id)} ${chat.members.map(member => member.username).join(" ")}`.toLowerCase().includes(filter.toLowerCase()));
  const isOwner = active?.owner_id === user.id;
  const candidates = panel === "manage" ? results.filter(person => !active?.members.some(member => member.id === person.id)) : results;

  return <main className={`chat-app ${selected !== null ? "has-selection" : ""}`}>
    <aside className="sidebar">
      <div className="sidebar-brand"><div className="brand"><span className="brand-mark"><Icon name="chat" size={23}/></span>steg<span>chat</span></div><span className="beta">BETA</span></div>
      <div className="sidebar-heading"><div><h1>Conversas</h1><p>Um espaço para se conectar.</p></div><button className="icon-button accent" aria-label="Nova conversa" onClick={() => openPanel("direct")} disabled={busy}><Icon name="plus"/></button></div>
      <label className="search-box"><Icon name="search" size={18}/><input aria-label="Filtrar conversas" placeholder="Procurar uma conversa…" value={filter} onChange={event => setFilter(event.target.value)}/></label>
      <div className="sidebar-actions"><button className="soft-button" onClick={() => openPanel("direct")} disabled={busy}><Icon name="chat" size={16}/> Nova conversa</button><button className="soft-button" onClick={() => openPanel("group")} disabled={busy}><Icon name="users" size={16}/> Criar grupo</button></div>
      <div className="list-label">AS SUAS CONVERSAS <span>{chats.length}</span></div>
      <nav className="conversation-list" aria-label="Conversas">
        {visibleChats.map(chat => <button key={chat.id} className={`conversation ${selected === chat.id ? "selected" : ""}`} onClick={() => selectChat(chat.id)} disabled={busy}>
          <span className={`avatar ${chat.kind === "group" ? "group-avatar" : ""}`}>{chat.kind === "group" ? <Icon name="users"/> : initials(title(chat, user.id))}</span>
          <span className="conversation-content"><span className="conversation-title">{title(chat, user.id)}<time>{chat.last_message ? new Date(chat.last_message.created_at).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }) : ""}</time></span><span className="conversation-preview">{chat.last_message?.kind === "hidden" ? "▧ Mensagem escondida numa imagem" : chat.last_message?.body || "Comece a conversa"}</span></span>{chat.unread > 0 && <span className="unread">{chat.unread}</span>}
        </button>)}
        {!visibleChats.length && <div className="sidebar-empty"><Icon name="chat" size={30}/><p>{filter ? "Nenhuma conversa encontrada." : "As boas conversas começam com um olá."}</p><button className="text-button" onClick={() => openPanel("direct")}>Encontrar pessoas</button></div>}
      </nav>
      <button className="decode-tool" onClick={() => openPanel("decode")} disabled={busy}><span className="tool-icon"><Icon name="eye"/></span><span>Revelar uma imagem<small>Descubra uma mensagem num ficheiro</small></span><Icon name="plus" size={16}/></button>
      <div className="account"><span className="avatar small">{initials(user.display_name)}</span><span><strong>{user.display_name}</strong><small>@{user.username}</small></span><button className="icon-button" aria-label="Sair da conta" title="Sair da conta" onClick={logout} disabled={busy}><Icon name="logout"/></button></div>
    </aside>

    <section className="chat-main">
      {error && <div className="error global-error" role="alert">{error}<button className="icon-button" aria-label="Fechar aviso" onClick={() => setError("")}><Icon name="close" size={16}/></button></div>}
      {active ? <>
        <header className="chat-header"><button className="icon-button mobile-back" aria-label="Voltar às conversas" onClick={() => selectChat(null)} disabled={busy}><Icon name="back"/></button><span className={`avatar ${active.kind === "group" ? "group-avatar" : ""}`}>{active.kind === "group" ? <Icon name="users"/> : initials(title(active, user.id))}</span><div className="header-person"><h2>{title(active, user.id)}</h2><p>{active.kind === "group" ? `${active.members.length} participantes` : `@${active.members.find(member => member.id !== user.id)?.username || ""}`}<span> · </span>{connection}</p></div>{active.kind === "group" && <button className="secondary" onClick={() => openPanel("manage")} disabled={busy}><Icon name="users" size={17}/><span>Grupo</span></button>}</header>
        <div className="chat-notice"><Icon name="lock" size={14}/><span>Texto ou imagem: escolha como quer contar a sua história.</span></div>
        <div className="messages" ref={listRef} onScroll={() => { const el = listRef.current; if (el) nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 130; }} aria-label="Mensagens">
          {loadingMessages && <p className="empty-hint" role="status">A carregar mensagens…</p>}
          {!loadingMessages && !messages.length && <div className="empty-conversation"><span className="welcome-icon"><Icon name="chat" size={30}/></span><h3>Este é o início da conversa.</h3><p>Envie um olá. Ou esconda algo numa imagem.</p></div>}
          {messages.map((message, index) => {
            const own = message.sender_id === user.id;
            const decodedMessage = revealed[message.id];
            const isRevealed = decodedMessage && decodedMessage.version === message.edited_at;
            const day = new Date(message.created_at).toLocaleDateString("pt-PT", { day: "numeric", month: "long" });
            const showDay = index === 0 || new Date(messages[index - 1].created_at).toDateString() !== new Date(message.created_at).toDateString();
            return <div key={message.id}>
              {showDay && <div className="day-divider"><span>{day}</span></div>}
              <article className={`message-row ${own ? "own" : ""}`}>
                {!own && <span className="avatar tiny" title={message.display_name}>{initials(message.display_name)}</span>}
                <div className={`message-bubble ${message.kind === "hidden" ? "hidden-bubble" : ""}`}>
                  {!own && <strong className="sender">{message.display_name} <span>@{message.username}</span></strong>}
                  {message.kind === "hidden" ? <><div className="hidden-label"><Icon name="lock" size={14}/> MENSAGEM OCULTA</div><img className="message-image" src={`/api/messages/${message.id}/image?v=${encodeURIComponent(message.edited_at || message.created_at)}`} alt={`Imagem com mensagem oculta de ${message.display_name}`} loading="lazy" onLoad={() => { if (nearBottom.current) listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }}/>
                    {isRevealed && <p className="revealed-text">{decodedMessage.body}</p>}
                    <div className="hidden-actions"><button className="reveal-button" onClick={() => isRevealed ? setRevealed(current => { const next = { ...current }; delete next[message.id]; return next; }) : void reveal(message)} disabled={busy}><Icon name={isRevealed ? "lock" : "eye"} size={16}/>{isRevealed ? "Ocultar texto" : "Revelar mensagem"}</button><a className="icon-button" href={`/api/messages/${message.id}/image`} download={`mensagem-${message.id}.png`} title="Guardar imagem PNG" aria-label="Guardar imagem PNG"><Icon name="download" size={17}/></a></div>
                  </> : <p className="message-text">{message.body}</p>}
                  <div className="message-meta">{message.edited_at && <span>editada · </span>}<time dateTime={message.created_at}>{new Date(message.created_at).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}</time>{own && <span title="Guardada no servidor"><Icon name="check" size={13}/></span>}</div>
                </div>
                {own && <div className="message-actions"><button className="icon-button" aria-label="Editar mensagem" title="Editar mensagem" onClick={() => edit(message)} disabled={busy}><Icon name="edit" size={15}/></button><button className="icon-button" aria-label="Eliminar mensagem" title="Eliminar mensagem" onClick={() => remove(message)} disabled={busy}><Icon name="trash" size={15}/></button></div>}
              </article>
            </div>;
          })}
        </div>
        <form className="composer" onSubmit={send}>
          {editing ? <div className="editing-banner"><Icon name="edit" size={16}/><span>A editar {editing.kind === "hidden" ? "uma mensagem oculta" : "a mensagem"}</span><button type="button" className="text-button" onClick={resetComposer} disabled={busy}>Cancelar</button></div> : <div className="composer-modes"><button type="button" className={!hidden ? "active" : ""} onClick={() => { setHidden(false); setTextFile(null); }} disabled={busy}><Icon name="chat" size={15}/> Mensagem normal</button><button type="button" className={hidden ? "active" : ""} onClick={() => setHidden(true)} disabled={busy}><Icon name="lock" size={15}/> Esconder numa imagem</button></div>}
          {hidden && !editing && <div className="attachment"><input ref={fileRef} id="image-upload" type="file" accept="image/png,image/jpeg,image/webp,image/bmp" disabled={busy} onChange={event => { const file = event.target.files?.[0]; if (file && file.size > 8 * 1024 * 1024) { setError("Escolha uma imagem até 8 MB."); event.target.value = ""; return; } setImage(file || null); }}/><label htmlFor="image-upload">{preview ? <img src={preview} alt="Imagem selecionada"/> : <Icon name="image" size={26}/>}<span>{image?.name || "Escolher imagem"}<small>PNG, JPG, WebP ou BMP · até 8 MB e 4 MP</small></span></label>{image && <button className="icon-button" type="button" aria-label="Remover imagem" disabled={busy} onClick={() => { setImage(null); if (fileRef.current) fileRef.current.value = ""; }}><Icon name="close" size={16}/></button>}</div>}
          {hidden && !editing && <div className="txt-import">
            <label className="txt-picker"><input type="file" accept=".txt,text/plain" aria-label="Associar ficheiro TXT" disabled={busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) attachText(file); }}/><Icon name="document" size={17}/><span>{textFile ? "Trocar ficheiro .txt" : "Associar ficheiro .txt"}</span></label>
            <span className="txt-description" role="status">{textFile ? `Ficheiro: ${textFile.name} · conteúdo não apresentado` : "Ou escreva abaixo · TXT em UTF-8, até 10 000 caracteres"}</span>
            {textFile && <button type="button" className="icon-button" aria-label="Remover ficheiro TXT" disabled={busy} onClick={() => setTextFile(null)}><Icon name="close" size={16}/></button>}
          </div>}
          <div className="input-row">{hidden && textFile ? <p className="txt-send-note"><Icon name="lock" size={18}/> O TXT será ocultado diretamente na imagem.</p> : <textarea id="message-input" aria-label="Mensagem" placeholder={hidden ? "Escreva a mensagem ou associe um ficheiro .txt…" : "Escreva a sua mensagem…"} rows={2} maxLength={10000} value={body} disabled={busy} onChange={event => setBody(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }}/>}<button className="send-button" aria-label={editing ? "Guardar edição" : "Enviar mensagem"} disabled={busy || (!body.trim() && !(hidden && textFile)) || (hidden && !image && !editing)}><Icon name={editing ? "check" : "send"}/></button></div>
          <div className="composer-footer"><span>{busy ? "A processar…" : hidden ? "O destinatário poderá revelar a mensagem. Não é encriptação." : "Enter para enviar · Shift + Enter para mudar de linha"}</span><span>{hidden && textFile ? `${Math.ceil(textFile.size / 1024)} KB TXT` : `${body.length}/10000`}</span></div>
        </form>
      </> : <div className="welcome"><div className="welcome-art"><span className="orbit"/><span className="welcome-icon"><Icon name="chat" size={54}/></span><span className="floating-lock"><Icon name="lock" size={26}/></span></div><span className="eyebrow">BEM-VINDO AO SEU ESPAÇO</span><h1>Olá, {user.display_name.split(" ")[0]}.<br/>Vamos conversar?</h1><p>Uma mensagem simples ou uma imagem com um segredo.<br/>Escolha uma conversa e comece a partilhar.</p><button className="primary" onClick={() => openPanel("direct")}><Icon name="plus" size={18}/> Começar uma conversa</button><div className="welcome-features"><span><Icon name="chat" size={17}/> Conversas privadas</span><span><Icon name="users" size={17}/> Grupos</span><span><Icon name="image" size={17}/> Mensagens ocultas</span></div><small className="connection-status" role="status">{connection}</small></div>}
    </section>

    {panel && <Modal title={panel === "direct" ? "Uma nova conversa" : panel === "group" ? "Criar um grupo" : panel === "manage" ? "Gerir grupo" : "Revelar uma imagem"} onClose={() => { if (!busy) setPanel(null); }}>
      {modalError && <p className="error" role="alert">{modalError}</p>}
      {panel === "decode" ? <form onSubmit={event => { event.preventDefault(); void modalAction(async () => { if (!decodeFile) return; const form = new FormData(); form.set("image", decodeFile); const result = await api<{ body: string }>("/steganography/reveal", { method: "POST", body: form }); setDecoded(result.body); }); }}><p className="muted">Escolha uma imagem PNG com uma mensagem escondida. Também aceita imagens do programa original.</p><label>Imagem PNG<input type="file" accept="image/png" required onChange={event => { setDecodeFile(event.target.files?.[0] || null); setDecoded(""); }}/></label><button className="primary full" disabled={busy || !decodeFile}><Icon name="eye" size={18}/>{busy ? "A revelar…" : "Revelar mensagem"}</button>{decoded && <div className="decoded-result"><h3>Mensagem encontrada</h3><p>{decoded}</p></div>}</form> : <>
        {panel === "manage" && active && <>
          <form onSubmit={event => { event.preventDefault(); void modalAction(async () => { await api(`/chats/${active.id}`, { method: "PATCH", body: JSON.stringify({ name: groupName }) }); }); }}><label>Nome do grupo<input value={groupName} onChange={event => setGroupName(event.target.value)} maxLength={80} required disabled={!isOwner || busy}/></label>{isOwner && <button className="secondary" disabled={busy || !groupName.trim()}>Guardar nome</button>}</form>
          <h3 className="section-label">Participantes · {active.members.length}</h3><div className="member-list">{active.members.map(member => <div className="person" key={member.id}><span className="avatar small">{initials(member.display_name)}</span><span className="person-name"><strong>{member.display_name}</strong><small>@{member.username}{active.owner_id === member.id ? " · Administrador" : ""}</small></span>{isOwner && member.id !== user.id && <button className="icon-button danger" aria-label={`Remover ${member.username}`} disabled={busy} onClick={() => { if (window.confirm(`Remover ${member.display_name} do grupo?`)) void modalAction(async () => { await api(`/chats/${active.id}/members/${member.id}`, { method: "DELETE" }); }); }}><Icon name="close" size={17}/></button>}</div>)}</div>
          <button className="danger-button full" disabled={busy} onClick={() => { if (window.confirm("Sair deste grupo? Deixará de ter acesso ao histórico. Se for administrador, outro participante assume essa função.")) void modalAction(async () => { await api(`/chats/${active.id}/leave`, { method: "POST" }); setSelected(null); setMessages([]); setRevealed({}); resetComposer(); setPanel(null); }); }}><Icon name="logout" size={17}/> Sair do grupo</button>
        </>}
        {(panel !== "manage" || isOwner) && <form onSubmit={panel === "group" ? createGroup : event => event.preventDefault()}>
          {panel === "group" && <label>Nome do grupo<input placeholder="Por exemplo, Trabalho de SI" value={groupName} onChange={event => setGroupName(event.target.value)} maxLength={80} required/></label>}
          <label>{panel === "manage" ? "Adicionar participantes" : "Encontrar utilizadores"}<div className="search-box"><Icon name="search" size={18}/><input placeholder="Pesquisar por nome ou @username" aria-label="Pesquisar utilizadores" value={search} onChange={event => setSearch(event.target.value.replace(/^@/, ""))}/></div></label>
          <p className="muted small-text">{panel === "group" ? `${memberIds.length} selecionado(s) · até 49 convidados` : "Procure pessoas que já criaram uma conta."}</p>
          <div className="people-results">{searching ? <p className="empty-hint">A pesquisar…</p> : candidates.length ? candidates.map(person => <button type="button" className={`person selectable ${memberIds.includes(person.id) ? "checked" : ""}`} key={person.id} disabled={busy || (panel === "group" && memberIds.length >= 49 && !memberIds.includes(person.id))} onClick={() => { if (panel === "direct") void startDirect(person); else if (panel === "group") setMemberIds(current => current.includes(person.id) ? current.filter(id => id !== person.id) : [...current, person.id]); else if (active) void modalAction(async () => { await api(`/chats/${active.id}/members`, { method: "POST", body: JSON.stringify({ user_id: person.id }) }); }); }}><span className="avatar small">{initials(person.display_name)}</span><span className="person-name"><strong>{person.display_name}</strong><small>@{person.username}</small></span><Icon name={memberIds.includes(person.id) ? "check" : "plus"} size={17}/></button>) : <p className="empty-hint">Nenhum utilizador encontrado. Experimente outro nome.</p>}</div>
          {panel === "group" && <><p className="small-text muted">Os participantes adicionados podem ler todo o histórico do grupo.</p><button className="primary full" disabled={busy || !groupName.trim() || !memberIds.length}><Icon name="users" size={18}/>{busy ? "A criar…" : "Criar grupo"}</button></>}
        </form>}
      </>}
    </Modal>}
  </main>;
}
