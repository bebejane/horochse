"use client";

import cn from "classnames";
import { useMemo, useState, type FormEvent } from "react";

import type { NewsletterFrequency } from "@/lib/db/newsletter";
import { VENUES } from "@/lib/types";
import s from "./NewsletterForm.module.scss";

type Tone = "info" | "success" | "error";

type Status = { tone: Tone; text: string } | null;

export function NewsletterForm({
  mode,
  initialVenues,
  initialFrequency = "monthly",
  email,
  token,
  validated = true,
  stickyActions = false,
  onSaved,
}: {
  mode: "subscribe" | "manage";
  initialVenues: string[];
  initialFrequency?: NewsletterFrequency;
  /** Manage mode: the address is shown read-only. */
  email?: string;
  /** Manage mode: the bearer token from the URL. */
  token?: string;
  validated?: boolean;
  /** Keep the submit/unsubscribe row visible while a tall modal scrolls. */
  stickyActions?: boolean;
  onSaved?: (status: string) => void;
}) {
  const venues = useMemo(
    () => [...VENUES].sort((a, b) => a.name.localeCompare(b.name, "sv")),
    [],
  );
  const fallback = useMemo(() => VENUES.map((venue) => venue.slug), []);
  const [selected, setSelected] = useState<Set<string>>(() => {
    const initial = initialVenues.length ? initialVenues : fallback;
    return new Set(initial);
  });
  const [frequency, setFrequency] = useState<NewsletterFrequency>(initialFrequency);
  const [address, setAddress] = useState("");
  const [website, setWebsite] = useState("");
  const [saving, setSaving] = useState(false);
  const [unsubscribed, setUnsubscribed] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  function toggleVenue(slug: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
    setStatus(null);
  }

  function selectAll() {
    setSelected(new Set(venues.map((venue) => venue.slug)));
    setStatus(null);
  }

  function clearAll() {
    setSelected(new Set());
    setStatus(null);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (!selected.size) {
      setStatus({ tone: "error", text: "Välj minst en scen." });
      return;
    }

    setSaving(true);
    setStatus(null);
    try {
      const endpoint =
        mode === "manage" ? "/api/newsletter/preferences" : "/api/newsletter/subscribe";
      const payload =
        mode === "manage"
          ? { token, venues: [...selected], frequency }
          : { email: address, venues: [...selected], frequency, website };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as {
        status?: string;
        error?: string;
      };

      if (!res.ok) {
        setStatus({
          tone: "error",
          text: body.error || "Kunde inte spara. Försök igen om en stund.",
        });
        return;
      }

      if (mode === "manage") {
        setStatus({ tone: "success", text: "Dina inställningar är sparade." });
        onSaved?.("saved");
        return;
      }

      if (body.status === "updated") {
        setStatus({ tone: "success", text: "Dina inställningar är uppdaterade." });
      } else if (body.status === "unchanged") {
        setStatus({ tone: "info", text: "Dina inställningar är redan sparade." });
      } else {
        setStatus({
          tone: "success",
          text: "Kolla din inkorg och bekräfta prenumerationen. Först då börjar vi skicka mailen.",
        });
      }
      onSaved?.(body.status || "pending");
    } catch {
      setStatus({
        tone: "error",
        text: "Kunde inte nå servern. Kontrollera anslutningen och försök igen.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function unsubscribe() {
    if (!token) return;
    if (!window.confirm("Avsluta prenumerationen? Du får inga fler mail från Hör & Se.")) {
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch(
        "/api/newsletter/unsubscribe?token=" + encodeURIComponent(token),
        { method: "POST" },
      );
      if (!res.ok) {
        setStatus({ tone: "error", text: "Kunde inte avsluta prenumerationen." });
        return;
      }
      setUnsubscribed(true);
    } catch {
      setStatus({ tone: "error", text: "Kunde inte nå servern. Försök igen." });
    } finally {
      setSaving(false);
    }
  }

  if (unsubscribed) {
    return (
      <div className={s.done} role="status">
        <p className={s.doneTitle}>Din prenumeration är avslutad.</p>
        <p className={s.doneText}>
          Du får inga fler mail från Hör &amp; Se. Du kan när som helst prenumerera igen.
        </p>
        <a className={s.doneLink} href="/">
          Till Hör &amp; Se →
        </a>
      </div>
    );
  }

  return (
    <form className={s.form} onSubmit={onSubmit}>
      {mode === "manage" ? (
        <p className={s.emailLine}>
          <span className={s.label}>E-post</span>
          <strong className={s.emailValue}>{email}</strong>
        </p>
      ) : null}

      <fieldset className={s.venues}>
        <legend className={s.legend}>Scener</legend>
        <div className={s.venueActions}>
          <button type="button" className={s.textButton} onClick={selectAll}>
            Välj alla
          </button>
          <button type="button" className={s.textButton} onClick={clearAll}>
            Rensa
          </button>
          <span className={s.count}>{selected.size} valda</span>
        </div>
        <div className={s.venueScroll}>
          <div className={s.venueGrid}>
            {venues.map((venue) => {
              const on = selected.has(venue.slug);
              return (
                <label key={venue.slug} className={cn(s.venue, { isOn: on })}>
                  <input
                    type="checkbox"
                    className={s.checkbox}
                    checked={on}
                    onChange={() => toggleVenue(venue.slug)}
                  />
                  <span
                    className={s.dot}
                    style={{ backgroundColor: `var(--${venue.slug})` }}
                    aria-hidden="true"
                  />
                  <span className={s.venueName}>{venue.name}</span>
                </label>
              );
            })}
          </div>
        </div>
      </fieldset>

      <div className={s.frequencyRow}>
        <span className={s.label}>Hur ofta?</span>
        <button
          type="button"
          className={s.switch}
          role="switch"
          aria-checked={frequency === "weekly"}
          aria-label={
            frequency === "weekly"
              ? "Mail varje vecka. Byt till varje månad."
              : "Mail varje månad. Byt till varje vecka."
          }
          onClick={() => {
            setFrequency((current) => (current === "weekly" ? "monthly" : "weekly"));
            setStatus(null);
          }}
        >
          <span className={cn(s.switchLabel, { isOn: frequency === "weekly" })}>Vecka</span>
          <span className={s.switchTrack} aria-hidden="true">
            <i className={s.switchKnob} />
          </span>
          <span className={cn(s.switchLabel, { isOn: frequency === "monthly" })}>Månad</span>
        </button>
      </div>

      {mode === "subscribe" ? (
        <label className={s.field}>
          <span className={s.label}>E-post</span>
          <input
            className={s.input}
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            required
            placeholder="namn@exempel.se"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
          />
        </label>
      ) : null}

      <input
        className={s.honeypot}
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={website}
        onChange={(event) => setWebsite(event.target.value)}
      />

      {mode === "manage" && !validated ? (
        <p className={s.callout}>
          Prenumerationen är inte bekräftad än. Kolla din inkorg efter bekräftelsemailet.
        </p>
      ) : null}

      {status ? (
        <p className={cn(s.status, s[status.tone])} role="status" aria-live="polite">
          {status.text}
        </p>
      ) : null}

      <div className={cn(s.actions, { [s.stickyActions]: stickyActions })}>
        <button type="submit" className={s.submit} disabled={saving}>
          {saving ? "Sparar…" : mode === "manage" ? "Spara inställningar" : "Prenumerera"}
        </button>
        {mode === "manage" ? (
          <button
            type="button"
            className={s.unsubscribe}
            disabled={saving}
            onClick={() => void unsubscribe()}
          >
            Avsluta prenumerationen
          </button>
        ) : null}
      </div>

      <p className={s.note}>
        {mode === "manage"
          ? "Vi använder adressen bara till nyhetsbrevet. Inga spårningspixlar."
          : "Vi skickar ett bekräftelsemail först. Du kan ändra dig eller avsluta när som helst."}
      </p>
    </form>
  );
}
