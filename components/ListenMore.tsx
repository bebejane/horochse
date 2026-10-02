"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { listenMoreItems } from "@/lib/events";
import type { ConcertEvent } from "@/lib/types";

export function ListenMore({ event }: { event: ConcertEvent }) {
  const items = listenMoreItems(event);
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
    const id = window.setTimeout(() => {
      document.addEventListener("pointerdown", onDoc);
      document.addEventListener("keydown", onKey);
      window.addEventListener("scroll", onDoc, true);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("pointerdown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onDoc, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !wrapRef.current) return;
    const menu = wrapRef.current.querySelector(".listen-more-menu") as HTMLElement | null;
    const btn = wrapRef.current.querySelector(".listen-more-btn") as HTMLElement | null;
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
      <a className="go card-listen" href={items[0].url} target="_blank" rel="noopener noreferrer">
        Hör mer
      </a>
    );
  }

  return (
      <div ref={wrapRef} className={"listen-more card-listen" + (open ? " is-open" : "")}>
      <button
        type="button"
        className="go listen-more-btn"
        aria-haspopup="listbox"
        aria-expanded={open ? "true" : "false"}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        Hör mer
        <span className="listen-more-caret" aria-hidden="true" />
      </button>
      {open ? (
        <div className="listen-more-menu" role="listbox">
          {items.map((item) => (
            <a
              key={item.url}
              className="listen-more-option"
              role="option"
              aria-selected="false"
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="listen-more-name">{item.artist || item.source || "Artist"}</span>
              {item.source && item.source !== item.artist ? (
                <span className="listen-more-src">{item.source}</span>
              ) : null}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
