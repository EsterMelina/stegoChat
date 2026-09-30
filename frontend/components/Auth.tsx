"use client";
import { FormEvent, useState } from "react";
import { api, User } from "../lib/api";
import Icon from "./Icon";

export default function Auth({ onLogin }: { onLogin: (user: User) => void }) {
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      onLogin(await api<User>(`/auth/${register ? "register" : "login"}`, { method: "POST", body: JSON.stringify(Object.fromEntries(form)) }));
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  return <main className="auth-page">
    <section className="auth-story">
      <div className="brand"><span className="brand-mark"><Icon name="chat" size={26}/></span>steg<span>chat</span></div>
      <div className="story-content"><span className="eyebrow">CADA CONVERSA TEM MAIS PARA CONTAR</span>
        <h1>Há mensagens<br/>que uma imagem<br/><em>guarda melhor.</em></h1>
        <p>O seu espaço para conversar, juntar pessoas e descobrir o que está para lá dos píxeis.</p>
        <div className="story-demo"><div className="demo-bubble">Tenho uma coisa para te contar… <span>14:32</span></div><div className="demo-secret"><div className="landscape"><span className="sun"/><span className="mountain one"/><span className="mountain two"/></div><div><Icon name="lock"/><span>Uma imagem. Uma mensagem escondida.</span></div></div><span className="demo-note"><Icon name="eye" size={15}/> Um clique para descobrir.</span></div>
      </div>
      <small>CONEXÕES REAIS. UM POUCO DE MISTÉRIO.</small>
    </section>
    <section className="auth-panel"><div className="auth-card"><span className="pill"><span className="dot"/> O seu próximo encontro começa aqui</span>
      <h2>{register ? "Crie o seu espaço." : "Bom ter você aqui."}</h2>
      <p className="muted">{register ? "Uma conta, muitas conversas para começar." : "Entre na sua conta e continue a conversa."}</p>
      <div className="tabs"><button type="button" className={!register ? "active" : ""} onClick={() => { setRegister(false); setError(""); }}>Entrar</button><button type="button" className={register ? "active" : ""} onClick={() => { setRegister(true); setError(""); }}>Criar conta</button></div>
      <form onSubmit={submit}>
        {register && <label>Nome de apresentação<input name="display_name" autoComplete="name" placeholder="Como quer ser chamado?" maxLength={60} required/></label>}
        <label>Username<input name="username" autoComplete="username" placeholder="o_seu_username" pattern="[a-zA-Z0-9_]{3,30}" minLength={3} maxLength={30} title="3 a 30 letras, números ou underscore" required/></label>
        <label>Palavra-passe<input name="password" type="password" autoComplete={register ? "new-password" : "current-password"} placeholder="Pelo menos 8 caracteres" minLength={8} maxLength={128} required/></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary full" disabled={busy}>{busy ? "Aguarde…" : register ? "Criar conta e começar" : "Entrar na conversa"}<Icon name="send" size={18}/></button>
      </form>
      <p className="auth-footnote"><Icon name="lock" size={16}/> A esteganografia esconde o texto na imagem.<br/>Não substitui a encriptação.</p>
    </div></section>
  </main>;
}
