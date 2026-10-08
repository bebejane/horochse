"use client";

import { type FormEvent, type ReactNode, useEffect, useState } from "react";

import styles from "./ads.module.scss";

export default function AdsAuthGate({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void checkSession();
  }, []);

  async function checkSession() {
    try {
      const response = await fetch("/api/admin/session", { cache: "no-store" });
      if (response.ok) {
        setAuthed(true);
        setError("");
        return;
      }
      const body = await response.json().catch(() => ({}));
      setAuthed(false);
      setError(
        response.status === 401
          ? ""
          : body?.error || "Kunde inte kontrollera inloggningen.",
      );
    } catch {
      setAuthed(false);
      setError("Kunde inte kontrollera inloggningen.");
    }
  }

  async function onLogin(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body?.error || "Fel lösenord.");
        return;
      }
      setPassword("");
      await checkSession();
    } catch {
      setError("Kunde inte logga in. Försök igen.");
    } finally {
      setBusy(false);
    }
  }

  async function onLogout() {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/logout", { method: "POST" });
      if (!response.ok) throw new Error("Utloggningen misslyckades.");
      setAuthed(false);
    } catch {
      setError("Kunde inte logga ut. Försök igen.");
    } finally {
      setBusy(false);
    }
  }

  if (authed === null) {
    return (
      <main className={styles.page}>
        <p className={styles.lead}>Kontrollerar inloggning…</p>
      </main>
    );
  }

  if (authed) {
    return (
      <>
        <div className={styles.page}>
          <div className={styles.top}>
            <p className={styles.mark}>ADS</p>
            <button type="button" onClick={() => void onLogout()} disabled={busy}>
              Logga ut
            </button>
          </div>
        </div>
        {children}
      </>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.top}>
        <p className={styles.mark}>ADS</p>
      </div>
      <h1>Lösenord krävs</h1>
      <form className={styles.login} onSubmit={onLogin}>
        <label>
          Lösenord
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            disabled={busy}
          />
        </label>
        {error ? <p className={styles.error}>{error}</p> : null}
        <button type="submit" disabled={busy}>
          Logga in
        </button>
      </form>
    </main>
  );
}
