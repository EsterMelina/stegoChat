"use client";
import { FormEvent, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "../../lib/api";
import Icon from "../../components/Icon";

function ResetForm() {
  const params = useSearchParams();
  const email = params.get("email") || "";
  const token = params.get("token") || "";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setDone("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    const confirm = String(form.get("confirm") || "");
    if (password !== confirm) {
      setError("As palavras-passe não coincidem.");
      setBusy(false);
      return;
    }
    try {
      const result = await api<{ message: string }>("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ email, token, new_password: password }),
      });
      setDone(result.message);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  if (!email || !token) {
    return <main className="auth-page"><section className="auth-panel"><div className="auth-card">
      <h2>Link inválido.</h2>
      <p className="muted">Este link de recuperação está incompleto. Peça um novo em "Esqueci-me da palavra-passe".</p>
      <a className="primary full" href="/">Voltar ao início</a>
    </div></section></main>;
  }

  return <main className="auth-page"><section className="auth-panel"><div className="auth-card">
    <span className="pill"><span className="dot"/> Nova palavra-passe</span>
    <h2>Defina uma nova palavra-passe.</h2>
    <p className="muted">Conta: <strong>{email}</strong>. O link expira em 15 minutos.</p>
    {done ? <>
      <p className="info" role="status">{done}</p>
      <a className="primary full" href="/">Ir para o login</a>
    </> : <form onSubmit={submit}>
      <label>Nova palavra-passe<input name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} placeholder="Pelo menos 8 caracteres" required/></label>
      <label>Confirmar palavra-passe<input name="confirm" type="password" autoComplete="new-password" minLength={8} maxLength={128} required/></label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary full" disabled={busy}>{busy ? "A guardar…" : "Guardar nova palavra-passe"}<Icon name="check" size={18}/></button>
    </form>}
  </div></section></main>;
}

export default function ResetPasswordPage() {
  return <Suspense fallback={<main className="auth-page"><section className="auth-panel"><div className="auth-card"><p className="muted">A preparar…</p></div></section></main>}>
    <ResetForm/>
  </Suspense>;
}