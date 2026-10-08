"use client";

import s from "./ListenMore.module.scss";
import cn from "classnames";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { listenMoreItems } from "@/lib/events";
import type { ConcertEvent } from "@/lib/types";

export function ListenMore({ event, label = "Hör mer" }: { event: ConcertEvent; label?: string }) {
  const items = listenMoreItems(event).filter((item) => item.source !== "Spotify");
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: Event) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    let pending = 0;
    function onCard(e: Event) {
      const target = e.target;
      if (!(target instanceof Element) || !wrapRef.current) return;
      const mine = wrapRef.current.closest("[data-cal-event]");
      if (!mine) return;
      if (mine.contains(target)) {
        window.clearTimeout(pending);
        pending = 0;
        return;
      }
      const card = target.closest("[data-cal-event]");
      if (card && card !== mine && !pending) {
        pending = window.setTimeout(() => setOpen(false), 50);
      }
    }
    function onFocus(e: Event) {
      const target = e.target;
      if (!(target instanceof Element) || !wrapRef.current) return;
      const mine = wrapRef.current.closest("[data-cal-event]");
      if (!mine) return;
      const card = target.closest("[data-cal-event]");
      if (card && card !== mine) setOpen(false);
    }
    const id = window.setTimeout(() => {
      document.addEventListener("pointerdown", onDoc);
      document.addEventListener("keydown", onKey);
      document.addEventListener("pointerover", onCard);
      document.addEventListener("focusin", onFocus);
      window.addEventListener("scroll", onDoc, true);
    }, 0);
    return () => {
      window.clearTimeout(id);
      window.clearTimeout(pending);
      document.removeEventListener("pointerdown", onDoc);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerover", onCard);
      document.removeEventListener("focusin", onFocus);
      window.removeEventListener("scroll", onDoc, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !wrapRef.current) return;
    const menu = wrapRef.current.querySelector("." + s.listenMoreMenu) as HTMLElement | null;
    const btn = wrapRef.current.querySelector("." + s.listenMoreBtn) as HTMLElement | null;
    if (!menu || !btn) return;
    menu.style.top = "calc(100% + 0.4rem)";
    menu.style.bottom = "auto";
    const btnRect = btn.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const spaceBelow = window.innerHeight - btnRect.bottom - 10;
    const shouldUp = menuRect.height > spaceBelow;
    if (shouldUp) {
      menu.style.top = "auto";
      menu.style.bottom = "calc(100% + 0.4rem)";
    }
  }, [open]);

  if (!items.length) return null;
  if (items.length === 1) {
    return (
      <a className="go" data-listen-more href={items[0].url} target="_blank" rel="noopener noreferrer">
        {label}
      </a>
    );
  }

  return (
      <div
        ref={wrapRef}
        className={cn(s.listenMore, { isOpen: open })}
        data-listen-more
        data-open={open ? "true" : undefined}
      >
      <button
        type="button"
        className={cn("go", s.listenMoreBtn)}
        aria-haspopup="listbox"
        aria-expanded={open ? "true" : "false"}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        {label}
        <span className={s.listenMoreCaret} aria-hidden="true" />
      </button>
      {open ? (
        <div className={s.listenMoreMenu} role="listbox">
          {items.map((item) => (
            <a
              key={item.url}
              className={s.listenMoreOption}
              role="option"
              aria-selected="false"
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>{item.artist || item.source || "Artist"}</span>
              {item.source && item.source !== item.artist ? (
                <span className={s.listenMoreSrc}>{item.source}</span>
              ) : null}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
