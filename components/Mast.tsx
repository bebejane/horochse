"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { VENUES } from "@/lib/types";
import type { CalStyle, FilterMode, ListDensity, ThemeMode, ViewMode } from "@/lib/types";
import { CloseIcon, GearIcon } from "@/components/Icons";

export function Mast({
  mode,
  mine,
  peek,
  pickerOpen,
  view,
  calStyle,
  theme,
  density,
  onSelectAll,
  onTogglePicker,
  onClosePicker,
  onAddMine,
  onRemoveMine,
  onPeekVenue,
  onClearPeek,
  onSetView,
  onSetCalStyle,
  onToggleTheme,
  onToggleDensity,
  onLayout,
}: {
  mode: FilterMode;
  mine: string[];
  peek: string | null;
  pickerOpen: boolean;
  view: ViewMode;
  calStyle: CalStyle;
  theme: ThemeMode;
  density: ListDensity;
  onSelectAll: () => void;
  onTogglePicker: () => void;
  onClosePicker: () => void;
  onAddMine: (slug: string) => void;
  onRemoveMine: (slug: string) => void;
  onPeekVenue: (slug: string) => void;
  onClearPeek: () => void;
  onSetView: (view: ViewMode) => void;
  onSetCalStyle: (style: CalStyle) => void;
  onToggleTheme: () => void;
  onToggleDensity: () => void;
  onLayout?: () => void;
}) {
  const light = theme === "light";
  const navRef = useRef<HTMLElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [chipFade, setChipFade] = useState({ left: false, right: false, canScroll: false });
  const pickerListRef = useRef<HTMLDivElement>(null);
  const [pickerFade, setPickerFade] = useState({ top: false, bottom: false, canScroll: false });
  const selected = new Set(mine);
  const venuesAlpha = [...VENUES].sort((a, b) => a.name.localeCompare(b.name, "sv"));
  const selectedVenues = venuesAlpha.filter((item) => selected.has(item.slug));
  const chips = pickerOpen
    ? venuesAlpha
    : mode === "mine"
      ? venuesAlpha.filter((item) => selected.has(item.slug))
      : [];
  const collapsedChips = !pickerOpen && mode === "mine" && chips.length > 0;
  const peekVenue = peek ? venuesAlpha.find((item) => item.slug === peek) : undefined;
  const [introHidden, setIntroHidden] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem("konserter-hide-intro") === "1") setIntroHidden(true);
    } catch {
      /* ignore */
    }
  }, []);

  const chipKey = chips.map((item) => item.slug).join(",");

  useLayoutEffect(() => {
    onLayout?.();
    const frame = window.requestAnimationFrame(() => onLayout?.());
    return () => window.cancelAnimationFrame(frame);
  }, [pickerOpen, aboutOpen, introHidden, onLayout]);

  useEffect(() => {
    const node = scrollerRef.current;
    function setFade(next: { left: boolean; right: boolean; canScroll: boolean }) {
      setChipFade((prev) =>
        prev.left === next.left && prev.right === next.right && prev.canScroll === next.canScroll
          ? prev
          : next
      );
    }
    if (!node || (!collapsedChips && !pickerOpen)) {
      setFade({ left: false, right: false, canScroll: false });
      return;
    }
    function update() {
      const canScroll = node.scrollWidth > node.clientWidth + 1;
      setFade({
        left: node.scrollLeft > 1,
        right: node.scrollLeft + node.clientWidth < node.scrollWidth - 1,
        canScroll,
      });
    }
    update();
    const ro = window.ResizeObserver ? new ResizeObserver(update) : null;
    ro?.observe(node);
    node.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);

    const drag = { id: -1, x: 0, scroll: 0, moved: false };
    function onMove(event: PointerEvent) {
      if (event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.x;
      if (!drag.moved) {
        if (Math.abs(dx) < 12) return;
        drag.moved = true;
        node.classList.add("is-dragging");
        try { node.setPointerCapture(event.pointerId); } catch { /* ignore */ }
      }
      event.preventDefault();
      node.scrollLeft = drag.scroll - dx;
    }
    function onUp(event: PointerEvent) {
      if (event.pointerId !== drag.id) return;
      drag.id = -1;
      node.classList.remove("is-dragging");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (!drag.moved) return;
      function blockClick(ev: Event) {
        ev.preventDefault();
        ev.stopPropagation();
        node.removeEventListener("click", blockClick, true);
      }
      node.addEventListener("click", blockClick, true);
    }
    function onDown(event: PointerEvent) {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      if (node.scrollWidth <= node.clientWidth + 1) return;
      if (event.target instanceof Element && event.target.closest(".filter-x")) return;
      drag.id = event.pointerId;
      drag.x = event.clientX;
      drag.scroll = node.scrollLeft;
      drag.moved = false;
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    }
    function onWheel(event: WheelEvent) {
      if (node.scrollWidth <= node.clientWidth + 1) return;
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      node.scrollLeft += event.deltaY;
      event.preventDefault();
    }
    function onSelectStart(event: Event) {
      event.preventDefault();
    }
    node.addEventListener("pointerdown", onDown);
    node.addEventListener("wheel", onWheel, { passive: false });
    node.addEventListener("selectstart", onSelectStart);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      node.removeEventListener("scroll", update);
      node.removeEventListener("pointerdown", onDown);
      node.removeEventListener("wheel", onWheel);
      node.removeEventListener("selectstart", onSelectStart);
      ro?.disconnect();
    };
  }, [chipKey, pickerOpen, mode, mine]);

  const prevMineCount = useRef(mine.length);
  useLayoutEffect(() => {
    const node = scrollerRef.current;
    if (!pickerOpen || !node) {
      prevMineCount.current = mine.length;
      return;
    }
    if (mine.length > prevMineCount.current) {
      node.scrollLeft = node.scrollWidth;
    }
    prevMineCount.current = mine.length;
  }, [pickerOpen, mine.length]);

  useEffect(() => {
    const node = pickerListRef.current;
    function setFade(next: { top: boolean; bottom: boolean; canScroll: boolean }) {
      setPickerFade((prev) =>
        prev.top === next.top && prev.bottom === next.bottom && prev.canScroll === next.canScroll
          ? prev
          : next
      );
    }
    if (!node || !pickerOpen) {
      setFade({ top: false, bottom: false, canScroll: false });
      return;
    }
    function update() {
      const canScroll = node.scrollHeight > node.clientHeight + 1;
      setFade({
        top: node.scrollTop > 1,
        bottom: node.scrollTop + node.clientHeight < node.scrollHeight - 1,
        canScroll,
      });
    }
    function prepareLabel(event: Event) {
      const root = event.target instanceof Element ? event.target.closest(".filter") : null;
      if (!root || !node.contains(root)) return;
      if (event.type === "pointerout" || event.type === "focusout") {
        const next = event instanceof PointerEvent || event instanceof FocusEvent
          ? (event.relatedTarget instanceof Element ? event.relatedTarget.closest(".filter") : null)
          : null;
        if (root === next) return;
        root.classList.remove("is-label-scroll");
        return;
      }
      const label = root.querySelector(".filter-label");
      const inner = root.querySelector(".filter-label-inner");
      if (!(label instanceof HTMLElement) || !(inner instanceof HTMLElement)) return;
      const overflow = inner.scrollWidth - label.clientWidth;
      if (overflow > 1) {
        root.style.setProperty("--label-shift", -overflow + "px");
        root.style.setProperty("--label-duration", Math.min(2.6, Math.max(0.7, overflow / 48)) + "s");
        root.classList.add("is-label-scroll");
      } else {
        root.style.setProperty("--label-shift", "0px");
        root.style.setProperty("--label-duration", "0s");
        root.classList.remove("is-label-scroll");
      }
    }
    update();
    const ro = window.ResizeObserver ? new ResizeObserver(update) : null;
    ro?.observe(node);
    node.addEventListener("scroll", update, { passive: true });
    node.addEventListener("pointerover", prepareLabel);
    node.addEventListener("pointerout", prepareLabel);
    node.addEventListener("focusin", prepareLabel);
    node.addEventListener("focusout", prepareLabel);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      node.removeEventListener("scroll", update);
      node.removeEventListener("pointerover", prepareLabel);
      node.removeEventListener("pointerout", prepareLabel);
      node.removeEventListener("focusin", prepareLabel);
      node.removeEventListener("focusout", prepareLabel);
      ro?.disconnect();
    };
  }, [pickerOpen, chipKey]);

  useLayoutEffect(() => {
    const nav = navRef.current;
    const chips = pickerListRef.current;
    if (!nav || !chips || !pickerOpen) return;
    function syncWidth() {
      const close = nav.querySelector(".filter-close");
      const left = nav.getBoundingClientRect().left;
      const right = close
        ? close.getBoundingClientRect().right
        : nav.getBoundingClientRect().right;
      chips.style.setProperty("--picker-width", Math.max(0, right - left) + "px");
    }
    syncWidth();
    const ro = window.ResizeObserver ? new ResizeObserver(syncWidth) : null;
    ro?.observe(nav);
    window.addEventListener("resize", syncWidth);
    return () => {
      window.removeEventListener("resize", syncWidth);
      ro?.disconnect();
    };
  }, [pickerOpen, chipKey]);

  useLayoutEffect(() => {
    const node = scrollerRef.current;
    if (!node || !peek || pickerOpen) return;
    const chip = node.querySelector('[data-venue="' + peek + '"]');
    if (!(chip instanceof HTMLElement)) return;
    const pad = 28;
    const chipRect = chip.getBoundingClientRect();
    const box = node.getBoundingClientRect();
    if (chipRect.left < box.left + pad) {
      node.scrollLeft -= box.left + pad - chipRect.left;
    } else if (chipRect.right > box.right - pad) {
      node.scrollLeft += chipRect.right - (box.right - pad);
    }
  }, [peek, chipKey, pickerOpen, mode]);

  useEffect(() => {
    if (!pickerOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClosePicker();
    }
    function onPointer(event: PointerEvent) {
      const node = navRef.current;
      const chips = pickerListRef.current;
      if (!node) return;
      if (event.target instanceof Node && !node.contains(event.target) && !chips?.contains(event.target)) {
        onClosePicker();
      }
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [pickerOpen, onClosePicker]);

  const chipNodes = chips.map((item) => {
    const on = selected.has(item.slug);
    if (on) {
      const peeking = !pickerOpen && peek === item.slug;
      return (
        <span
          key={item.slug}
          className={
            "filter"
            + (pickerOpen ? " has-x is-on" : " is-solo")
            + (peeking ? " is-peek" : "")
          }
          data-venue={item.slug}
          role={pickerOpen ? undefined : "button"}
          tabIndex={pickerOpen ? undefined : 0}
          aria-pressed={pickerOpen ? undefined : peeking ? "true" : "false"}
          aria-label={pickerOpen ? undefined : "Visa bara " + item.name}
          onClick={
            pickerOpen
              ? undefined
              : (event) => {
                  onPeekVenue(item.slug);
                  event.currentTarget.blur();
                }
          }
          onKeyDown={
            pickerOpen
              ? undefined
              : (event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onPeekVenue(item.slug);
                  }
                }
          }
        >
          <span className="filter-label"><span className="filter-label-inner">{item.name}</span></span>
          {pickerOpen ? (
            <button
              type="button"
              className="filter-x"
              aria-label={"Ta bort " + item.name}
              onClick={() => onRemoveMine(item.slug)}
            >
              ×
            </button>
          ) : null}
        </span>
      );
    }
    return (
      <button
        key={item.slug}
        type="button"
        className="filter"
        data-venue={item.slug}
        aria-pressed="false"
        aria-label={"Lägg till " + item.name}
        onClick={() => onAddMine(item.slug)}
      >
        <span className="filter-label"><span className="filter-label-inner">{item.name}</span></span>
      </button>
    );
  });

  return (
    <header className="mast">
      <div className="mast-inner">
        <div className="mast-top">
          <p className="eyebrow">UPPTÄCK LIVEMUSIK I STOCKHOLM DEN KOMMANDE MÅNADEN</p>
          <div className="mast-top-actions">
            <button
              type="button"
              className={"mast-about" + (aboutOpen ? " is-on" : "")}
              aria-pressed={aboutOpen ? "true" : "false"}
              aria-expanded={aboutOpen ? "true" : "false"}
              aria-controls="mast-copy"
              onClick={() => setAboutOpen((open) => !open)}
            >
              Om &amp; Kontakt
            </button>
            <div className="mast-top-tools">
            <button
              type="button"
              className="theme-switch density-switch"
              role="switch"
              aria-checked={density === "less" ? "true" : "false"}
              aria-label={density === "less" ? "Visa som text" : "Visa med bild"}
              onClick={onToggleDensity}
            >
              <span className="theme-switch-label density-switch-label-more">Bild</span>
              <span className="theme-switch-track" aria-hidden="true"><i className="theme-switch-knob" /></span>
              <span className="theme-switch-label density-switch-label-less">Text</span>
            </button>
            <button
              type="button"
              className="theme-switch"
              role="switch"
              aria-checked={light ? "true" : "false"}
              aria-label={light ? "Byt till mörkt tema" : "Byt till ljust tema"}
              onClick={onToggleTheme}
            >
              <span className="theme-switch-label theme-switch-label-dark">Mörk</span>
              <span className="theme-switch-track" aria-hidden="true"><i className="theme-switch-knob" /></span>
              <span className="theme-switch-label theme-switch-label-light">Ljus</span>
            </button>
            </div>
          </div>
        </div>
        <div className="mast-headline">
          <h1
            onClick={() => {
              const motion = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
              window.scrollTo({ top: 0, behavior: motion });
            }}
          >
            <span className="mast-wordmark">Hor<span className="mast-amp">&</span>Se</span>
            <MastSymbol />
          </h1>
          {aboutOpen ? (
            <div className="mast-intro-wrap is-down is-about" id="mast-copy">
              <div className="mast-intro">
                <span className="mast-intro-p">
                  På Hör & Se kan du hitta och lyssna på artister som spelar live i Stockholm under den närmaste månaden. Genom att skapa ditt eget urval följer du dom spelställen som du är intresserade av.
                </span>
                <span className="mast-intro-p">
                  Sidan är under utveckling och drivs ideellt av{" "}
                  <a href="https://konst-teknik.se" target="_blank" rel="noopener noreferrer">Konst & Teknik</a>
                  . <a href="mailto:hos@konst-teknik.se">Hör gärna av dig</a> du har frågor eller ser något konstigt.{" "}
                  <button
                    type="button"
                    className="mast-intro-hide mast-about-close"
                    onClick={() => setAboutOpen(false)}
                  >
                    Stäng
                  </button>
                </span>
              </div>
            </div>
          ) : !introHidden ? (
            <div className="mast-intro-wrap" id="mast-copy">
              <p className="mast-intro">
                Välj vilka scener du är intresserad av och få en överblick av aktuella konserter i Stockholm (du kan alltid ändra ditt urval i efterhand sen).{" "}
                <button
                  type="button"
                  className="mast-intro-hide"
                  onClick={() => {
                    setIntroHidden(true);
                    try {
                      localStorage.setItem("konserter-hide-intro", "1");
                    } catch {
                      /* ignore */
                    }
                  }}
                >
                  Göm text
                </button>
              </p>
            </div>
          ) : null}
        </div>
        <div className="mast-tools">
            <nav
              ref={navRef}
              className={"filters" + (pickerOpen ? " is-open" : "")}
              aria-label="Filtrera scener"
            >
              <button
                type="button"
                className={"filter" + (mode === "all" ? " is-on" : "")}
                data-venue="all"
                aria-pressed={mode === "all" ? "true" : "false"}
                onClick={onSelectAll}
              >
                Alla scener
              </button>
              {!pickerOpen && mode === "all" && peekVenue ? (
                <span
                  className="filter has-x is-solo is-peek"
                  data-venue={peekVenue.slug}
                >
                  {peekVenue.name}
                  <button
                    type="button"
                    className="filter-x"
                    aria-label={"Ta bort " + peekVenue.name}
                    onClick={onClearPeek}
                  >
                    ×
                  </button>
                </span>
              ) : null}
              <button
                type="button"
                className={"filter" + (mode === "mine" || pickerOpen ? " is-on" : "")}
                data-venue="mine"
                aria-pressed={mode === "mine" ? "true" : "false"}
                aria-expanded={pickerOpen ? "true" : "false"}
                aria-haspopup="true"
                aria-label={mine.length ? "Dina scener, " + mine.length + " valda" : "Välj dina scener"}
                onClick={onTogglePicker}
              >
                {mine.length ? "Dina scener" : "Välj dina scener"}
                {mine.length ? (
                  <span className="filter-count" aria-hidden="true">{mine.length}</span>
                ) : null}
              </button>
              {chips.length || pickerOpen ? (
                <div className="filter-mine-row">
                  {pickerOpen || collapsedChips ? (
                  <div
                    ref={scrollerRef}
                    className={
                      "filter-scroller"
                      + (chipFade.canScroll ? " is-overflow" : "")
                      + (chipFade.left ? " is-overflow-left" : "")
                      + (chipFade.right ? " is-overflow-right" : "")
                    }
                  >
                    {pickerOpen
                      ? selectedVenues.map((item) => (
                          <span key={item.slug} className="filter is-solo" data-venue={item.slug}>
                            <span className="filter-label"><span className="filter-label-inner">{item.name}</span></span>
                          </span>
                        ))
                      : chipNodes}
                  </div>
                  ) : (
                  <div className="filter-chips">
                    {chipNodes}
                  </div>
                  )}
                  {pickerOpen ? (
                    <button
                      type="button"
                      className="filter filter-close"
                      aria-label="Stäng"
                      onClick={onClosePicker}
                    >
                      <CloseIcon />
                    </button>
                  ) : mode === "mine" && mine.length ? (
                    <button
                      type="button"
                      className="filter filter-gear"
                      aria-label="Redigera dina scener"
                      aria-expanded="false"
                      onClick={onTogglePicker}
                    >
                      <GearIcon />
                    </button>
                  ) : null}
                </div>
              ) : null}
            </nav>
            <div className="views-wrap">
              <div className="views" role="group" aria-label="Välj vy">
                <button
                  type="button"
                  className={"view" + (view === "list" ? " is-on" : "")}
                  aria-pressed={view === "list" ? "true" : "false"}
                  onClick={() => onSetView("list")}
                >
                  Lista
                </button>
                <div className="view-cal">
                  <button
                    type="button"
                    className={"view" + (view === "calendar" ? " is-on" : "")}
                    aria-pressed={view === "calendar" ? "true" : "false"}
                    onClick={() => onSetView("calendar")}
                  >
                    Kalender
                  </button>
                  {view === "calendar" ? (
                    <button
                      type="button"
                      className={"view view-enkel" + (calStyle === "simple" ? " is-on" : "")}
                      aria-pressed={calStyle === "simple" ? "true" : "false"}
                      onClick={() => onSetCalStyle(calStyle === "simple" ? "full" : "simple")}
                    >
                      Enkel
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
        </div>
        {pickerOpen ? (
          <div
            ref={pickerListRef}
            className={
              "filter-chips"
              + (pickerFade.canScroll ? " is-overflow" : "")
              + (pickerFade.top ? " is-overflow-top" : "")
              + (pickerFade.bottom ? " is-overflow-bottom" : "")
            }
            style={{ ["--picker-rows"]: String(Math.max(1, Math.ceil(chips.length / 5))) }}
          >
            {chipNodes}
          </div>
        ) : null}
      </div>
    </header>
  );
}

export function MastSymbol() {
  return (
    <span className="mast-symbol-lockup">
      <img className="mast-symbol mast-symbol-dark" src="/symbol-black.svg" alt="" />
      <img className="mast-symbol mast-symbol-light" src="/symbol.svg" alt="" />
    </span>
  );
}
