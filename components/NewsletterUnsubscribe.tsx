"use client";

import { useState } from "react";

import s from "./NewsletterForm.module.scss";

export function NewsletterUnsubscribe({ token, email }: { token: string; email: string }) {
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");

  async function unsubscribe() {
    if (state === "saving") return;
    setState("saving");
    try {
      const res = await fetch(
        "/api/newsletter/unsubscribe?token=" + encodeURIComponent(token),
        { method: "POST" },
      );
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className={s.done} role="status">
        <p className={s.doneTitle}>Din prenumeration är avslutad.</p>
        <p className={s.doneText}>Du får inga fler mail från Hör &amp; Se.</p>
        <a className={s.doneLink} href="/">
          Till Hör &amp; Se →
        </a>
      </div>
    );
  }

  return (
    <div className={s.done}>
      <p className={s.doneText}>
        Vill du avsluta prenumerationen för <strong>{email}</strong>? Du får då inga fler
        mail och kan prenumerera igen när som helst.
      </p>
      {state === "error" ? (
        <p className={`${s.status} ${s.error}`} role="alert">
          Kunde inte avsluta prenumerationen. Försök igen.
        </p>
      ) : null}
      <button
        type="button"
        className={s.submit}
        disabled={state === "saving"}
        onClick={() => void unsubscribe()}
      >
        {state === "saving" ? "Avslutar…" : "Avsluta prenumerationen"}
      </button>
      <a className={s.doneLink} href={`/prenumerera/${encodeURIComponent(token)}`}>
        Behåll prenumerationen
      </a>
    </div>
  );
}
