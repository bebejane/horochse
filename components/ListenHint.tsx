"use client";

import { useLayoutEffect, useRef } from "react";

function viewBounds() {
  const player = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--player-height")) || 0;
  return { viewBottom: window.innerHeight - player };
}

function firstListPlayButton() {
  return (
    document.querySelector<HTMLElement>(".list .card button.play") ||
    document.querySelector<HTMLElement>(".cal-event button.play")
  );
}

export function ListenHint({ onDismiss }: { onDismiss: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    const hint = ref.current;
    if (!hint) return;

    const place = () => {
      const play = firstListPlayButton();
      if (!play) {
        hint.style.opacity = "0";
        hint.style.pointerEvents = "none";
        return;
      }
      const { viewBottom } = viewBounds();
      const playRect = play.getBoundingClientRect();
      const hintRect = hint.getBoundingClientRect();
      const gap = 12;
      let top = playRect.top + playRect.height / 2 - hintRect.height / 2;
      let left = playRect.left - hintRect.width - gap;
      if (top + hintRect.height > viewBottom - 8) top = viewBottom - hintRect.height - 8;
      if (top < 8) top = 8;
      left = Math.max(8, left);
      hint.style.top = Math.round(top) + "px";
      hint.style.left = Math.round(left) + "px";
      hint.style.opacity = "1";
      hint.style.pointerEvents = "auto";
    };

    place();
    window.addEventListener("scroll", onDismiss, { capture: true, passive: true });
    window.addEventListener("pointerdown", onDismiss, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", onDismiss, true);
      window.removeEventListener("pointerdown", onDismiss, true);
      window.removeEventListener("resize", place);
    };
  }, [onDismiss]);

  return (
    <button
      ref={ref}
      type="button"
      className="listen-hint"
      onClick={onDismiss}
      aria-label="Glöm inte att du kan lyssna också"
    >
      <img className="listen-hint-symbol" src="/symbol.svg" alt="" />
      <span className="listen-hint-copy">
        Glöm inte att du kan lyssna också{" "}
        <span className="listen-hint-arrow" aria-hidden="true">{"\u2192"}</span>
      </span>
    </button>
  );
}
