"use client";
import { FormEvent, useState } from "react";
import { api, User } from "../lib/api";
import Icon from "./Icon";

type Step = "login" | "register" | "verify";

export default function Auth({ onLogin }: { onLogin: (user: User) => void }) {
  const [step, setStep] = useState<Step>("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [code, setCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [forgot, setForgot] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  function startCooldown(seconds = 60) {
    setResendCooldown(seconds);
    const timer = setInterval(() => {
      setResendCooldown(current => {
        if (current <= 1) {
          clearInterval(timer);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setInfo("");
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form) as Record<string, string>;
    try {
      if (step === "login") {
        const user = await api<User>("/auth/login", {
          method: "POST",
          body: JSON.stringify({ username: payload.username, password: payload.password }),
        });
        onLogin(user);
      } else {
        const result = await api<{ message: string; debug_code?: string }>("/auth/register", {
          method: "POST",
          body: JSON.stringify({
            username: payload.username,
            display_name: payload.display_name,
            email: payload.email,
            password: payload.password,
          }),
        });
        setPendingEmail(payload.email);
        setStep("verify");
        setInfo(
          result.debug_code
            ? `Conta criada. Código de teste: ${result.debug_code}`
            : "Conta criada. Verifique o email para receber o código."
        );
        startCooldown(60);
      }
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setInfo("");
    try {
      await api<{ message: string }>("/auth/verify-email", {
        method: "POST",
        body: JSON.stringify({ email: pendingEmail, code }),
      });
      setInfo("Email verificado. Já pode iniciar sessão.");
      setStep("login");
      setCode("");
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  async function resend() {
    if (resendCooldown > 0) return;
    setBusy(true); setError(""); setInfo("");
    try {
      const result = await api<{ message: string; debug_code?: string }>("/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email: pendingEmail }),
      });
      setInfo(result.debug_code ? `Novo código de teste: ${result.debug_code}` : result.message);
      startCooldown(60);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  async function requestReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setInfo("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await api<{ message: string; debug_token?: string; debug_email?: string }>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: form.get("email") }),
      });
      if (result.debug_token && result.debug_email) {
        setInfo(`Link de teste: /reset-password?email=${encodeURIComponent(result.debug_email)}&token=${encodeURIComponent(result.debug_token)}`);
      } else {
        setInfo(result.message);
      }
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  return <main className={`auth-page${step === "verify" ? " otp-page" : ""}`}>
    <section className="auth-story">
      <div className="brand"><span className="brand-mark"><Icon name="chat" size={26}/></span>steg<span>chat</span></div>
      <div className="story-content"><span className="eyebrow">CADA CONVERSA TEM MAIS PARA CONTAR</span>
        <h1>Há mensagens<br/>que uma imagem<br/><em>guarda melhor.</em></h1>
        <p>O seu espaço para conversar, juntar pessoas e descobrir o que está para lá dos píxeis.</p>
        <div className="story-demo"><div className="demo-bubble">Tenho uma coisa para te contar… <span>14:32</span></div><div className="demo-secret"><div className="landscape"><span className="sun"/><span className="mountain one"/><span className="mountain two"/></div><div><Icon name="lock"/><span>Uma imagem. Uma mensagem escondida.</span></div></div><span className="demo-note"><Icon name="eye" size={15}/> Um clique para descobrir.</span></div>
      </div>
      <small>CONEXÕES REAIS. UM POUCO DE MISTÉRIO.</small>
    </section>
    <section className="auth-panel"><div className="auth-card">
      {forgot ? <>
        <span className="pill"><span className="dot"/> Recuperar acesso</span>
        <h2>Esqueceu-se da palavra-passe?</h2>
        <p className="muted">Indique o email da sua conta. Enviaremos um link para definir uma nova palavra-passe.</p>
        <form onSubmit={requestReset}>
          <label>Email<input name="email" type="email" autoComplete="email" placeholder="utilizador@example.com" required/></label>
          {error && <p className="error" role="alert">{error}</p>}
          {info && <p className="info" role="status">{info}</p>}
          <button className="primary full" disabled={busy}>{busy ? "A enviar…" : "Enviar link de recuperação"}<Icon name="send" size={18}/></button>
        </form>
        <p className="auth-footnote"><button type="button" className="text-button" onClick={() => { setForgot(false); setError(""); setInfo(""); }}>Voltar ao login</button></p>
      </> : step === "verify" ? <>
        <span className="pill"><span className="dot"/> Verificação de email</span>
        <h2>Confirme o seu email.</h2>
        <p className="muted">Enviámos um código de seis dígitos para <strong>{pendingEmail}</strong>.</p>
        <form onSubmit={verify}>
          <label>Código de verificação<input inputMode="numeric" pattern="\d{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ""))} placeholder="123456" required/></label>
          {error && <p className="error" role="alert">{error}</p>}
          {info && <p className="info" role="status">{info}</p>}
          <button className="primary full" disabled={busy || code.length !== 6}>{busy ? "A verificar…" : "Verificar email"}</button>
        </form>
        <p className="auth-footnote">
          <button type="button" className="text-button" onClick={resend} disabled={busy || resendCooldown > 0}>
            {resendCooldown > 0 ? `Reenviar em ${resendCooldown}s` : "Reenviar código"}
          </button>
          <button type="button" className="text-button" onClick={() => { setStep("login"); setError(""); setInfo(""); setCode(""); }}>Voltar ao login</button>
        </p>
      </> : <>
        <span className="pill"><span className="dot"/> O seu próximo encontro começa aqui</span>
        <h2>{step === "register" ? "Crie o seu espaço." : "Bom ter você aqui."}</h2>
        <p className="muted">{step === "register" ? "Uma conta, muitas conversas para começar." : "Entre na sua conta e continue a conversa."}</p>
        <div className="tabs"><button type="button" className={step === "login" ? "active" : ""} onClick={() => { setStep("login"); setError(""); setInfo(""); }}>Entrar</button><button type="button" className={step === "register" ? "active" : ""} onClick={() => { setStep("register"); setError(""); setInfo(""); }}>Criar conta</button></div>
        <form onSubmit={submit}>
          {step === "register" && <label>Nome de apresentação<input name="display_name" autoComplete="name" placeholder="Como quer ser chamado?" maxLength={60} required/></label>}
          <label>Username<input name="username" autoComplete="username" placeholder="o_seu_username" pattern="[a-zA-Z0-9_]{3,30}" minLength={3} maxLength={30} title="3 a 30 letras, números ou underscore" required/></label>
          {step === "register" && <label>Email<input name="email" type="email" autoComplete="email" placeholder="utilizador@example.com" required/></label>}
          <label>Palavra-passe
            <span className="password-field">
              <input name="password" type={showPassword ? "text" : "password"} autoComplete={step === "register" ? "new-password" : "current-password"} placeholder="Pelo menos 8 caracteres" minLength={8} maxLength={128} required/>
              <button type="button" className="password-toggle" onClick={() => setShowPassword(visible => !visible)} aria-label={showPassword ? "Ocultar palavra-passe" : "Mostrar palavra-passe"} aria-pressed={showPassword}>
                <Icon name={showPassword ? "eye-off" : "eye"} size={18}/>
              </button>
            </span>
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          {info && <p className="info" role="status">{info}</p>}
          <button className="primary full" disabled={busy}>{busy ? "Aguarde…" : step === "register" ? "Criar conta e verificar" : "Entrar na conversa"}<Icon name="send" size={18}/></button>
        </form>
        {step === "login" && <p className="auth-footnote"><button type="button" className="text-button" onClick={() => { setForgot(true); setError(""); setInfo(""); }}>Esqueci-me da palavra-passe</button></p>}
        <p className="auth-footnote"><Icon name="lock" size={16}/> Mensagens ocultas com conteúdo cifrado.<br/>Apenas as contas destinatárias podem revelar.</p>
      </>}
    </div></section>
  </main>;
}
