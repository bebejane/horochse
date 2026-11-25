"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { CloseIcon } from "@/components/Icons";
import { NewsletterForm } from "@/components/NewsletterForm";
import s from "./NewsletterModal.module.scss";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function NewsletterModal({
  open,
  onClose,
  mine,
}: {
  open: boolean;
  onClose: () => void;
  /** Venues already selected on the site; prefills the checkboxes. */
  mine: string[];
}) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    closeRef.current?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const nodes = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (node) =>
          node.tabIndex >= 0 && (node.offsetParent !== null || node === document.activeElement),
      );
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      previous?.focus();
    };
  }, [open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className={s.overlay}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={s.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="newsletter-title"
      >
        <div className={s.head}>
          <div>
            <p className={s.eyebrow}>Nyhetsbrev</p>
            <h2 id="newsletter-title" className={s.title}>
              Prenumerera på Hör &amp; Se
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            className={s.close}
            aria-label="Stäng"
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </div>
        <p className={s.lead}>
          Välj scener och hur ofta du vill få mail. Vi skickar en bekräftelse först.
        </p>
        <NewsletterForm mode="subscribe" initialVenues={mine} stickyActions />
      </div>
    </div>,
    document.body,
  );
}
