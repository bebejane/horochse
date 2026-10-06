"use client";

import cn from "classnames";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { PauseIcon, PlayIcon } from "@/components/Icons";

import styles from "./admin.module.scss";
import { canPlay, useAdminPlayback } from "./playback";

type AdminTrack = {
  position: number;
  source: string;
  artist: string;
  title: string;
  url: string;
  bandId: number | null;
  albumId: number | null;
  trackId: number | null;
  videoId: string | null;
  type: string | null;
};

type AdminEvent = {
  id: string;
  title: string;
  venue: string;
  place: string;
  date: string;
  time: string;
  tracks: AdminTrack[];
};

const SOURCE_LABEL: Record<string, string> = {
  bandcamp: "Bandcamp",
  soundcloud: "SoundCloud",
  youtube: "YouTube",
  deezer: "Deezer",
};

function sourceLabel(source: string): string {
  return SOURCE_LABEL[source] || source;
}

function trackLabel(track: AdminTrack): string {
  const name = [track.artist, track.title].filter(Boolean).join(" — ");
  return name || "Låt utan namn";
}

export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [password, setPassword] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const playback = useAdminPlayback();

  useEffect(() => {
    document.title = "Admin — Hör & Se";
    void load();
  }, []);

  async function load() {
    const res = await fetch("/api/admin/events", { cache: "no-store" });
    if (res.status === 401 || res.status === 503) {
      const body = await res.json().catch(() => ({}));
      setAuthed(false);
      setError(res.status === 503 ? body.error || "Admin är inte konfigurerad." : "");
      return;
    }
    if (!res.ok) {
      setAuthed(false);
      setError("Kunde inte hämta listan.");
      return;
    }
    const body = await res.json();
    setEvents(body.events || []);
    setAuthed(true);
    setError("");
  }

  async function onLogin(event: FormEvent) {
    event.preventDefault();
    setNotice("");
    setError("");
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error || "Fel lösenord.");
      return;
    }
    setPassword("");
    await load();
  }

  async function onLogout() {
    playback.stop();
    await fetch("/api/admin/logout", { method: "POST" });
    setEvents([]);
    setAuthed(false);
  }

  async function mutate(key: string, payload: Record<string, unknown>, eventId: string) {
    setBusy(key);
    setNotice("");
    setError("");
    try {
      const res = await fetch("/api/admin/tracks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, ...payload }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setAuthed(false);
        setEvents([]);
        return;
      }
      if (!res.ok) {
        setError(body.error || "Kunde inte spara.");
        return;
      }
      setEvents((current) =>
        current.map((item) => (item.id === eventId ? { ...item, tracks: body.tracks || [] } : item)),
      );
      setNotice(payload.action === "remove" ? "Låten är borttagen." : "Låten är sparad.");
    } finally {
      setBusy("");
    }
  }

  function onReplace(event: FormEvent<HTMLFormElement>, eventId: string, position: number) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const url = String(data.get("url") || "");
    void mutate(`${eventId}:${position}`, { action: "replace", position, url }, eventId);
  }

  function onAdd(event: FormEvent<HTMLFormElement>, eventId: string) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const url = String(data.get("url") || "");
    void mutate(`${eventId}:add`, { action: "add", url }, eventId);
  }

  function onRemove(eventId: string, track: AdminTrack) {
    const name = trackLabel(track);
    if (!window.confirm(`Ta bort ${name} från den här konserten?`)) return;
    void mutate(`${eventId}:${track.position}`, { action: "remove", position: track.position }, eventId);
  }

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return events;
    return events.filter((event) => {
      const blob = [event.title, event.venue, event.place, event.date, ...event.tracks.flatMap((track) => [track.artist, track.title])]
        .join(" ")
        .toLowerCase();
      return blob.includes(needle);
    });
  }, [events, query]);

  return (
    <main className={styles.page}>
      <audio ref={playback.audioRef} preload="none" />
      <iframe
        ref={playback.iframeRef}
        id="sc-widget"
        title="SoundCloud"
        src="https://w.soundcloud.com/player/?auto_play=false&hide_related=true&show_comments=false&show_user=false&show_reposts=false&visual=false"
      />
      <div id="yt-host" ref={playback.ytRef} />
      <div className={styles.top}>
        <p className={styles.mark}>Hör & Se</p>
        {authed ? (
          <button type="button" onClick={() => void onLogout()}>
            Logga ut
          </button>
        ) : null}
      </div>
      <h1>Admin</h1>
      {authed === null ? <p className={styles.lead}>Hämtar listan…</p> : null}
      {authed === false ? (
        <form className={styles.login} onSubmit={onLogin}>
          <p className={styles.lead}>Lösenord krävs.</p>
          <label>
            Lösenord
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error ? <p className={styles.error}>{error}</p> : null}
          <button type="submit">Logga in</button>
        </form>
      ) : null}
      {authed ? (
        <>
          <p className={styles.lead}>
            {events.length} konserter. Rubriken är konserten, och varje länk går till musikfilen. En ändring ligger kvar efter nästa skrapning.
          </p>
          {error ? <p className={styles.error}>{error}</p> : null}
          {playback.error ? <p className={styles.error}>{playback.error}</p> : null}
          {notice ? <p className={styles.lead}>{notice}</p> : null}
          <input
            type="search"
            placeholder="Sök artist, titel eller scen"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Sök i listan"
          />
          {visible.length ? (
            <ul className={styles.list}>
              {visible.map((event) => (
                <li key={event.id} className={styles.event}>
                  <p className={styles.when}>
                    {[event.date, event.time, event.venue, event.place && event.place !== event.venue ? event.place : ""]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <h2>{event.title}</h2>
                  {event.tracks.length ? (
                    <ul className={styles.tracks}>
                      {event.tracks.map((track) => {
                        const key = `${event.id}:${track.position}`;
                        return (
                          <li key={key} className={styles.track}>
                            <div className={styles.media}>
                              {canPlay(track) ? (
                                <button
                                  type="button"
                                  className={cn(styles.play, {
                                    isOn: playback.currentKey === key,
                                    isLoading: playback.loadingKey === key,
                                  })}
                                  aria-label={
                                    (playback.currentKey === key ? "Pausa " : "Spela ") +
                                    trackLabel(track) +
                                    (track.source ? " från " + sourceLabel(track.source) : "")
                                  }
                                  aria-pressed={playback.currentKey === key ? "true" : "false"}
                                  onClick={() => void playback.toggle(key, track)}
                                >
                                  <PlayIcon />
                                  <PauseIcon />
                                </button>
                              ) : null}
                              <div>
                                {track.url ? (
                                  <a className={styles.link} href={track.url} target="_blank" rel="noreferrer">
                                    {trackLabel(track)}
                                  </a>
                                ) : (
                                  <span className={styles.link}>{trackLabel(track)}</span>
                                )}
                                {track.source ? <span className={styles.source}>{sourceLabel(track.source)}</span> : null}
                              </div>
                            </div>
                            <form className={styles.row} onSubmit={(formEvent) => onReplace(formEvent, event.id, track.position)}>
                              <input
                                type="url"
                                name="url"
                                required
                                placeholder="Bandcamp- eller SoundCloud-länk"
                                aria-label={`Ny länk för ${trackLabel(track)}`}
                              />
                              <button type="submit" disabled={busy === key}>
                                Byt ut
                              </button>
                              <button type="button" disabled={Boolean(busy)} onClick={() => onRemove(event.id, track)}>
                                Ta bort
                              </button>
                            </form>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <>
                      <p className={styles.none}>Ingen musik</p>
                      <form className={styles.row} onSubmit={(formEvent) => onAdd(formEvent, event.id)}>
                        <input
                          type="url"
                          name="url"
                          required
                          placeholder="Bandcamp- eller SoundCloud-länk"
                          aria-label={`Lägg till länk för ${event.title}`}
                        />
                        <button type="submit" disabled={busy === `${event.id}:add`}>
                          Lägg till
                        </button>
                      </form>
                    </>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.empty}>{query ? "Inget matchar sökningen." : "Inga konserter i listan."}</p>
          )}
        </>
      ) : null}
    </main>
  );
}
