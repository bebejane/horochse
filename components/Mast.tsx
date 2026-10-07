'use client';

import s from './Mast.module.scss';
import cn from 'classnames';

import { useEffect, useLayoutEffect, useRef, useState, type Ref } from 'react';
import { VENUES } from '@/lib/types';
import type { CalStyle, FilterMode, ListDensity, ThemeMode, ViewMode } from '@/lib/types';
import { CloseIcon, GearIcon } from '@/components/Icons';

const WORDMARK = ['H', 'ö', 'r', '&', 'S', 'e'] as const;
const SPECTRUM_EM = 0.085;

export function Mast({
	mode,
	mine,
	peek,
	pickerOpen,
	view,
	calStyle,
	theme,
	density,
	playing,
	sampleSpectrum,
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
	playing: boolean;
	sampleSpectrum: (bands: Float32Array) => void;
	onSelectAll: () => void;
	onTogglePicker: () => void;
	onClosePicker: () => void;
	onAddMine: (slug: string) => void;
	onRemoveMine: (slug: string) => void;
	onPeekVenue: (slug: string) => void;
	onClearPeek: () => void;
	onSetView: (view: ViewMode, opts?: { top?: boolean }) => void;
	onSetCalStyle: (style: CalStyle) => void;
	onToggleTheme: () => void;
	onToggleDensity: () => void;
	onLayout?: () => void;
}) {
	const letterRefs = useRef<Array<HTMLSpanElement | null>>([]);
	const wordmarkRef = useRef<HTMLSpanElement | null>(null);
	const symbolRef = useRef<HTMLSpanElement | null>(null);
	const viewRef = useRef(view);
	viewRef.current = view;

	useEffect(() => {
		const nodes = letterRefs.current;
		const clear = () => {
			for (const node of nodes) {
				if (node) node.style.transform = '';
			}
		};
		if (!playing || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			clear();
			return;
		}
		const bands = new Float32Array(WORDMARK.length);
		const shown = new Float32Array(WORDMARK.length);
		let frame = 0;
		const tick = () => {
			sampleSpectrum(bands);
			for (let i = 0; i < WORDMARK.length; i++) {
				shown[i] += (bands[i] - shown[i]) * 0.35;
				const node = nodes[i];
				if (!node) continue;
				const lift = shown[i] * SPECTRUM_EM;
				node.style.transform = lift < 0.004 ? '' : 'translateY(' + (-lift).toFixed(3) + 'em)';
			}
			frame = window.requestAnimationFrame(tick);
		};
		frame = window.requestAnimationFrame(tick);
		return () => {
			window.cancelAnimationFrame(frame);
			clear();
		};
	}, [playing, sampleSpectrum]);
	const light = theme === 'light';
	const navRef = useRef<HTMLElement>(null);
	const scrollerRef = useRef<HTMLDivElement>(null);
	const [chipFade, setChipFade] = useState({ left: false, right: false, canScroll: false });
	const pickerListRef = useRef<HTMLDivElement>(null);
	const [pickerFade, setPickerFade] = useState({ top: false, bottom: false, canScroll: false });
	const selected = new Set(mine);
	const venuesAlpha = [...VENUES].sort((a, b) => a.name.localeCompare(b.name, 'sv'));
	const selectedVenues = venuesAlpha.filter((item) => selected.has(item.slug));
	const chips = pickerOpen
		? venuesAlpha
		: venuesAlpha.filter((item) => selected.has(item.slug));
	const collapsedChips = !pickerOpen && chips.length > 0;
	const peekVenue = peek ? venuesAlpha.find((item) => item.slug === peek) : undefined;
	const [introHidden, setIntroHidden] = useState(false);
	const [introAway, setIntroAway] = useState(false);
	const [aboutOpen, setAboutOpen] = useState(false);

	useEffect(() => {
		const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		const distance = 168;
		let frame = 0;
		let shown = 0;
		let footerOn = false;
		let easing = false;

		const scrollProgress = () => {
			const y = window.scrollY;
			return reduce ? (y > 8 ? 1 : 0) : Math.min(1, Math.max(0, y / distance));
		};

		const narrow = window.matchMedia('(max-width: 840px)');

		// På mobil scrollar logotypen bort i dokumentflödet. Ingen symbol, ingen inklippning.
		const clearScrollStyles = () => {
			const symbol = symbolRef.current;
			if (symbol) {
				symbol.style.opacity = '';
				symbol.style.transform = '';
			}
			const word = wordmarkRef.current;
			if (word) word.style.transform = '';
			const heading = word?.parentElement;
			if (heading) {
				heading.style.height = '';
				heading.style.minHeight = '';
				heading.style.overflow = '';
				heading.style.paddingBottom = '';
			}
			const letters = letterRefs.current;
			for (let i = 0; i < letters.length; i++) {
				const letter = letters[i];
				if (letter) letter.style.opacity = '';
			}
			document.documentElement.style.removeProperty('--mast-collapse');
		};

		const paint = (progress: number) => {
			if (narrow.matches) {
				clearScrollStyles();
				return;
			}
			const letters = letterRefs.current;
			const symbol = symbolRef.current;
			const steps = WORDMARK.length;
			for (let i = 0; i < steps; i++) {
				const node = letters[i];
				if (!node) continue;
				const start = i / steps;
				const end = (i + 1) / steps;
				const t = progress <= start ? 0 : progress >= end ? 1 : (progress - start) / (end - start);
				const out = t * t * (3 - 2 * t);
				node.style.opacity = out <= 0.001 ? '' : String(1 - out);
			}
			if (wordmarkRef.current) wordmarkRef.current.style.transform = '';
			if (!symbol) return;
			const enter = Math.min(1, Math.max(0, (progress - 0.08) / 0.78));
			const inn = enter * enter * (3 - 2 * enter);
			if (inn <= 0.001) {
				symbol.style.opacity = '';
				symbol.style.transform = '';
				return;
			}
			const list = viewRef.current !== 'calendar';
			const shift = ((1 - inn) * 0.45).toFixed(3);
			symbol.style.opacity = String(inn);
			symbol.style.transform =
				'translateY(calc(-50% - 1rem + ' + shift + 'rem))' + (list ? ' scale(1.1)' : '');
		};

		const footerVisible = () => {
			const node = document.querySelector('footer .mastSymbolLockup');
			if (!node) return false;
			const rect = node.getBoundingClientRect();
			if (rect.height < 2) return false;
			const player =
				parseFloat(
					getComputedStyle(document.documentElement).getPropertyValue('--player-height'),
				) || 0;
			const limit = window.innerHeight - player;
			const visible = Math.min(rect.bottom, limit) - Math.max(rect.top, 0);
			return visible > rect.height * 0.35;
		};

		let footerTimer = 0;

		const run = () => {
			const goal = footerOn ? 0 : scrollProgress();
			if (!easing) {
				shown = goal;
				paint(shown);
				frame = 0;
				return;
			}
			const step = reduce ? 1 : 0.16;
			shown += (goal - shown) * step;
			if (Math.abs(goal - shown) < 0.008) {
				shown = goal;
				easing = false;
			}
			paint(shown);
			frame = easing ? window.requestAnimationFrame(run) : 0;
		};

		const start = () => {
			if (frame) return;
			frame = window.requestAnimationFrame(run);
		};

		const onScroll = () => {
			if (narrow.matches) return;
			const seen = footerVisible();
			if (seen && !footerOn) {
				if (!footerTimer) {
					footerTimer = window.setTimeout(() => {
						footerTimer = 0;
						if (!footerVisible()) return;
						footerOn = true;
						easing = true;
						start();
					}, 220);
				}
				return;
			}
			if (footerTimer) {
				window.clearTimeout(footerTimer);
				footerTimer = 0;
			}
			if (!seen && footerOn) {
				footerOn = false;
				easing = true;
				start();
				return;
			}
			if (footerOn || easing) {
				easing = true;
				start();
				return;
			}
			shown = scrollProgress();
			paint(shown);
		};

		const onResize = () => {
			if (narrow.matches) clearScrollStyles();
			shown = footerOn ? 0 : scrollProgress();
			paint(shown);
		};

		footerOn = footerVisible();
		shown = footerOn ? 0 : scrollProgress();
		paint(shown);
		window.addEventListener('scroll', onScroll, { passive: true });
		window.addEventListener('resize', onResize);
		narrow.addEventListener('change', onResize);
		return () => {
			window.removeEventListener('scroll', onScroll);
			window.removeEventListener('resize', onResize);
			narrow.removeEventListener('change', onResize);
			if (frame) window.cancelAnimationFrame(frame);
			window.clearTimeout(footerTimer);
			document.documentElement.style.removeProperty('--mast-collapse');
		};
	}, []);

	useLayoutEffect(() => {
		const symbol = symbolRef.current;
		if (!symbol?.style.transform) return;
		const list = view !== 'calendar';
		const base = symbol.style.transform.replace(/ scale\(1\.1\)$/, '');
		symbol.style.transform = base + (list ? ' scale(1.1)' : '');
	}, [view]);

	useLayoutEffect(() => {
		try {
			if (localStorage.getItem('konserter-hide-intro') === '1') {
				document.documentElement.setAttribute('data-hide-intro', '');
				setIntroHidden(true);
			}
		} catch {
			/* ignore */
		}
	}, []);

	useEffect(() => {
		if (introHidden) {
			setIntroAway(false);
			return;
		}
		const hideAt = 96;
		const showAt = 24;
		const apply = () => {
			const y = window.scrollY;
			setIntroAway((away) => (away ? y > showAt : y >= hideAt));
		};
		apply();
		window.addEventListener('scroll', apply, { passive: true });
		return () => window.removeEventListener('scroll', apply);
	}, [introHidden]);

	useEffect(() => {
		if (!pickerOpen) return;
		let previousY = window.scrollY;
		const closeOnScrollDown = () => {
			const y = window.scrollY;
			if (y > previousY) onClosePicker();
			previousY = y;
		};
		window.addEventListener('scroll', closeOnScrollDown, { passive: true });
		return () => window.removeEventListener('scroll', closeOnScrollDown);
	}, [pickerOpen, onClosePicker]);

	const chipKey = chips.map((item) => item.slug).join(',');

	useLayoutEffect(() => {
		onLayout?.();
		const frame = window.requestAnimationFrame(() => onLayout?.());
		return () => window.cancelAnimationFrame(frame);
	}, [pickerOpen, aboutOpen, introHidden, introAway, onLayout]);

	useLayoutEffect(() => {
		if (!aboutOpen || !window.matchMedia('(max-width: 840px)').matches) return;
		window.scrollTo(0, 0);
		const frame = window.requestAnimationFrame(() => window.scrollTo(0, 0));
		return () => window.cancelAnimationFrame(frame);
	}, [aboutOpen]);

	useEffect(() => {
		const node = scrollerRef.current;
		if (!node) return;
		function setFade(next: { left: boolean; right: boolean; canScroll: boolean }) {
			setChipFade((prev) =>
				prev.left === next.left && prev.right === next.right && prev.canScroll === next.canScroll
					? prev
					: next,
			);
		}
		if (!node || (!collapsedChips && !pickerOpen)) {
			setFade({ left: false, right: false, canScroll: false });
			return;
		}
		function update() {
			if (!node) return;
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
		node.addEventListener('scroll', update, { passive: true });
		window.addEventListener('resize', update);

		const drag = { id: -1, x: 0, scroll: 0, moved: false };
		function onMove(event: PointerEvent) {
			if (!node) return;
			if (event.pointerId !== drag.id) return;
			const dx = event.clientX - drag.x;
			if (!drag.moved) {
				if (Math.abs(dx) < 12) return;
				drag.moved = true;
				node.classList.add('isDragging');
				try {
					node.setPointerCapture(event.pointerId);
				} catch {
					/* ignore */
				}
			}
			event.preventDefault();
			node.scrollLeft = drag.scroll - dx;
		}
		function onUp(event: PointerEvent) {
			if (!node) return;
			if (event.pointerId !== drag.id) return;
			drag.id = -1;
			node.classList.remove('isDragging');
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
			window.removeEventListener('pointercancel', onUp);
			if (!drag.moved) return;
			function blockClick(ev: Event) {
				ev.preventDefault();
				ev.stopPropagation();
				node.removeEventListener('click', blockClick, true);
			}
			node.addEventListener('click', blockClick, true);
		}
		function onDown(event: PointerEvent) {
			if (event.pointerType !== 'mouse' || event.button !== 0) return;
			if (node.scrollWidth <= node.clientWidth + 1) return;
			if (event.target instanceof Element && event.target.closest('.' + s.filterX)) return;
			drag.id = event.pointerId;
			drag.x = event.clientX;
			drag.scroll = node.scrollLeft;
			drag.moved = false;
			window.addEventListener('pointermove', onMove);
			window.addEventListener('pointerup', onUp);
			window.addEventListener('pointercancel', onUp);
		}
		function onWheel(event: WheelEvent) {
			if (!node) return;
			if (node.scrollWidth <= node.clientWidth + 1) return;
			if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
			node.scrollLeft += event.deltaY;
			event.preventDefault();
		}
		function onSelectStart(event: Event) {
			event.preventDefault();
		}
		node.addEventListener('pointerdown', onDown);
		node.addEventListener('wheel', onWheel, { passive: false });
		node.addEventListener('selectstart', onSelectStart);
		return () => {
			window.removeEventListener('resize', update);
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
			window.removeEventListener('pointercancel', onUp);
			node.removeEventListener('scroll', update);
			node.removeEventListener('pointerdown', onDown);
			node.removeEventListener('wheel', onWheel);
			node.removeEventListener('selectstart', onSelectStart);
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
					: next,
			);
		}
		if (!node || !pickerOpen) {
			setFade({ top: false, bottom: false, canScroll: false });
			return;
		}
		function update() {
			if (!node) return;
			const canScroll = node.scrollHeight > node.clientHeight + 1;
			setFade({
				top: node.scrollTop > 1,
				bottom: node.scrollTop + node.clientHeight < node.scrollHeight - 1,
				canScroll,
			});
		}
		function prepareLabel(event: Event) {
			if (!node) return;
			const root = event.target instanceof Element ? event.target.closest('.' + s.filter) : null;
			if (!root || !node.contains(root)) return;
			if (event.type === 'pointerout' || event.type === 'focusout') {
				const next =
					event instanceof PointerEvent || event instanceof FocusEvent
						? event.relatedTarget instanceof Element
							? event.relatedTarget.closest('.' + s.filter)
							: null
						: null;
				if (root === next) return;
				root.classList.remove('isLabelScroll');
				return;
			}
			const label = root.querySelector('.' + s.filterLabel);
			const inner = root.querySelector('.' + s.filterLabelInner);
			if (!(label instanceof HTMLElement) || !(inner instanceof HTMLElement)) return;
			const overflow = inner.scrollWidth - label.clientWidth;
			if (overflow > 1) {
				root.style.setProperty('--label-shift', -overflow + 'px');
				root.style.setProperty(
					'--label-duration',
					Math.min(2.6, Math.max(0.7, overflow / 48)) + 's',
				);
				root.classList.add('isLabelScroll');
			} else {
				root.style.setProperty('--label-shift', '0px');
				root.style.setProperty('--label-duration', '0s');
				root.classList.remove('isLabelScroll');
			}
		}
		update();
		const ro = window.ResizeObserver ? new ResizeObserver(update) : null;
		ro?.observe(node);
		node.addEventListener('scroll', update, { passive: true });
		node.addEventListener('pointerover', prepareLabel);
		node.addEventListener('pointerout', prepareLabel);
		node.addEventListener('focusin', prepareLabel);
		node.addEventListener('focusout', prepareLabel);
		window.addEventListener('resize', update);
		return () => {
			window.removeEventListener('resize', update);
			node.removeEventListener('scroll', update);
			node.removeEventListener('pointerover', prepareLabel);
			node.removeEventListener('pointerout', prepareLabel);
			node.removeEventListener('focusin', prepareLabel);
			node.removeEventListener('focusout', prepareLabel);
			ro?.disconnect();
		};
	}, [pickerOpen, chipKey]);

	useLayoutEffect(() => {
		const nav = navRef.current;
		const chips = pickerListRef.current;
		if (!nav || !chips || !pickerOpen) return;
		function syncWidth() {
			const close = nav.querySelector('.' + s.filterClose);
			const left = nav.getBoundingClientRect().left;
			const right = close ? close.getBoundingClientRect().right : nav.getBoundingClientRect().right;
			chips.style.setProperty('--picker-width', Math.max(0, right - left) + 'px');
		}
		syncWidth();
		const ro = window.ResizeObserver ? new ResizeObserver(syncWidth) : null;
		ro?.observe(nav);
		window.addEventListener('resize', syncWidth);
		return () => {
			window.removeEventListener('resize', syncWidth);
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
			if (event.key === 'Escape') onClosePicker();
		}
		function onPointer(event: PointerEvent) {
			const node = navRef.current;
			const chips = pickerListRef.current;
			if (!node) return;
			if (
				event.target instanceof Node &&
				!node.contains(event.target) &&
				!chips?.contains(event.target)
			) {
				onClosePicker();
			}
		}
		window.addEventListener('keydown', onKey);
		window.addEventListener('pointerdown', onPointer);
		return () => {
			window.removeEventListener('keydown', onKey);
			window.removeEventListener('pointerdown', onPointer);
		};
	}, [pickerOpen, onClosePicker]);

	const chipNodes = chips.map((item) => {
		const on = selected.has(item.slug);
		if (on) {
			const peeking = !pickerOpen && peek === item.slug;
			return (
				<span
					key={item.slug}
					className={cn(s.filter, pickerOpen ? { hasX: true, isOn: true } : { isSolo: true }, {
						isPeek: peeking,
					})}
					data-venue={item.slug}
					role={pickerOpen ? undefined : 'button'}
					tabIndex={pickerOpen ? undefined : 0}
					aria-pressed={pickerOpen ? undefined : peeking ? 'true' : 'false'}
					aria-label={pickerOpen ? undefined : 'Visa bara ' + item.name}
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
									if (event.key === 'Enter' || event.key === ' ') {
										event.preventDefault();
										onPeekVenue(item.slug);
									}
								}
					}
				>
					<span className={s.filterLabel}>
						<span className={s.filterLabelInner}>{item.name}</span>
					</span>
					{pickerOpen ? (
						<button
							type='button'
							className={s.filterX}
							aria-label={'Ta bort ' + item.name}
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
				type='button'
				className={s.filter}
				data-venue={item.slug}
				aria-pressed='false'
				aria-label={'Lägg till ' + item.name}
				onClick={() => onAddMine(item.slug)}
			>
				<span className={s.filterLabel}>
					<span className={s.filterLabelInner}>{item.name}</span>
				</span>
			</button>
		);
	});

	return (
		<header className={cn(s.mast, { isIntroCollapsed: introHidden || introAway })} data-mast>
			<div className={s.mastInner} data-mast-inner>
				<div className={s.mastTop} data-mast-bar>
					<p className={s.eyebrow}>LIVEMUSIK I STOCKHOLM DEN KOMMANDE MÅNADEN</p>
					<div className={s.mastTopActions}>
						<button
							type='button'
							className={cn(s.mastAbout, { isOn: aboutOpen })}
							aria-pressed={aboutOpen ? 'true' : 'false'}
							aria-expanded={aboutOpen ? 'true' : 'false'}
							aria-controls='mast-copy'
							onClick={() => setAboutOpen((open) => !open)}
						>
							Om &amp; Kontakt
						</button>
						<div className={s.mastTopTools}>
							<button
								type='button'
								className={cn(s.themeSwitch, s.densitySwitch)}
								role='switch'
								aria-checked={density === 'less' ? 'true' : 'false'}
								aria-label={density === 'less' ? 'Visa som text' : 'Visa med bild'}
								onClick={onToggleDensity}
							>
								<span className={cn(s.themeSwitchLabel, s.densitySwitchLabelMore)}>Bild</span>
								<span className={s.themeSwitchTrack} aria-hidden='true'>
									<i className={s.themeSwitchKnob} />
								</span>
								<span className={cn(s.themeSwitchLabel, s.densitySwitchLabelLess)}>Text</span>
							</button>
							<button
								type='button'
								className={s.themeSwitch}
								role='switch'
								aria-checked={light ? 'true' : 'false'}
								aria-label={light ? 'Byt till mörkt tema' : 'Byt till ljust tema'}
								onClick={onToggleTheme}
							>
								<span className={cn(s.themeSwitchLabel, s.themeSwitchLabelDark)}>Mörk</span>
								<span className={s.themeSwitchTrack} aria-hidden='true'>
									<i className={s.themeSwitchKnob} />
								</span>
								<span className={cn(s.themeSwitchLabel, s.themeSwitchLabelLight)}>Ljus</span>
							</button>
						</div>
					</div>
				</div>
				<div className={s.mastHeadline}>
					<h1
						aria-label='Hör & Se'
						onClick={() => {
							onSetView('list', { top: true });
							const motion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
								? 'auto'
								: 'smooth';
							window.scrollTo({ top: 0, behavior: motion });
						}}
					>
						<span ref={wordmarkRef} className={s.mastWordmark} aria-hidden='true'>
							{WORDMARK.map((letter, index) => (
								<span
									key={letter}
									ref={(node) => {
										letterRefs.current[index] = node;
									}}
									className={cn(s.mastLetter, { [s.mastAmp]: letter === '&' })}
								>
									{letter}
								</span>
							))}
						</span>
						<MastSymbol lockupRef={symbolRef} />
					</h1>
					{aboutOpen ? (
						<div className={cn(s.mastIntroWrap, { isDown: true, isAbout: true })} id='mast-copy'>
							<div className={s.mastIntro}>
								<span className={s.mastIntroP}>
									På Hör & Se kan du hitta och lyssna på artister som spelar live i Stockholm under
									den närmaste månaden. Genom att skapa ditt eget urval följer du dom spelställen
									som du är intresserade av.
								</span>
								<span className={s.mastIntroP}>
									Sidan är under utveckling och drivs ideellt av{' '}
									<a href='https://konst-teknik.se' target='_blank' rel='noopener noreferrer'>
										Konst & Teknik
									</a>
									. <a href='mailto:horochse@konst-teknik.se'>Hör gärna av dig</a> du har frågor eller
									ser något konstigt.{' '}
									<button
										type='button'
										className={cn(s.mastIntroHide, s.mastAboutClose)}
										onClick={() => setAboutOpen(false)}
									>
										Stäng
									</button>
								</span>
							</div>
						</div>
					) : !introHidden && !introAway ? (
						<div className={s.mastIntroWrap} id='mast-copy'>
							<p className={s.mastIntro}>
								Välj vilka scener du är intresserad av och få en överblick av aktuella konserter i
								Stockholm (du kan alltid ändra ditt urval i efterhand sen).{' '}
								<button
									type='button'
									className={s.mastIntroHide}
									onClick={() => {
										setIntroHidden(true);
										document.documentElement.setAttribute('data-hide-intro', '');
										try {
											localStorage.setItem('konserter-hide-intro', '1');
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
				<div className={s.mastTools} data-mast-tools>
					<nav
						ref={navRef}
						className={cn(s.filters, { isOpen: pickerOpen })}
						data-mode={mode}
						aria-label='Filtrera scener'
					>
						<button
							type='button'
							className={cn(s.filter, { isOn: mode === 'all' })}
							data-venue='all'
							aria-pressed={mode === 'all' ? 'true' : 'false'}
							onClick={onSelectAll}
						>
							Alla scener
						</button>
						{!pickerOpen && mode === 'all' && peekVenue && !selected.has(peekVenue.slug) ? (
							<span
								className={cn(s.filter, { hasX: true, isSolo: true, isPeek: true })}
								data-venue={peekVenue.slug}
							>
								{peekVenue.name}
								<button
									type='button'
									className={s.filterX}
									aria-label={'Ta bort ' + peekVenue.name}
									onClick={onClearPeek}
								>
									×
								</button>
							</span>
						) : null}
						<button
							type='button'
							className={cn(s.filter, { isOn: mode === 'mine' || pickerOpen })}
							data-venue='mine'
							aria-pressed={mode === 'mine' ? 'true' : 'false'}
							aria-expanded={pickerOpen ? 'true' : 'false'}
							aria-haspopup='true'
							aria-label={
								mine.length ? 'Dina scener, ' + mine.length + ' valda' : 'Välj dina scener'
							}
							onClick={onTogglePicker}
						>
							{mine.length ? 'Dina scener' : 'Välj dina scener'}
							{mine.length ? (
								<span className={s.filterCount} aria-hidden='true'>
									{mine.length}
								</span>
							) : null}
						</button>
						{chips.length || pickerOpen ? (
							<div className={s.filterMineRow}>
								{pickerOpen || collapsedChips ? (
									<div
										ref={scrollerRef}
										className={cn(s.filterScroller, {
											isOverflow: chipFade.canScroll,
											isOverflowLeft: chipFade.left,
											isOverflowRight: chipFade.right,
										})}
									>
										{pickerOpen
											? selectedVenues.map((item) => (
													<span
														key={item.slug}
														className={cn(s.filter, { isSolo: true })}
														data-venue={item.slug}
													>
														<span className={s.filterLabel}>
															<span className={s.filterLabelInner}>{item.name}</span>
														</span>
													</span>
												))
											: chipNodes}
									</div>
								) : (
									<div className={s.filterChips}>{chipNodes}</div>
								)}
								{pickerOpen ? (
									<button
										type='button'
										className={cn(s.filter, s.filterClose)}
										aria-label='Stäng'
										onClick={onClosePicker}
									>
										<CloseIcon />
									</button>
								) : collapsedChips ? (
									<button
										type='button'
										className={cn(s.filter, s.filterGear)}
										aria-label='Redigera dina scener'
										aria-expanded='false'
										onClick={onTogglePicker}
									>
										<GearIcon />
									</button>
								) : null}
							</div>
						) : null}
					</nav>
					<div className={s.viewsWrap}>
						<div className={s.views} role='group' aria-label='Välj vy'>
							<button
								type='button'
								className={cn(s.view, { isOn: view === 'list' })}
								aria-pressed={view === 'list' ? 'true' : 'false'}
								onClick={() => onSetView('list')}
							>
								Lista
							</button>
							<div className={s.viewCal}>
								<button
									type='button'
									className={cn(s.view, { isOn: view === 'calendar' })}
									aria-pressed={view === 'calendar' ? 'true' : 'false'}
									onClick={() => onSetView('calendar')}
								>
									Kalender
								</button>
								{view === 'calendar' ? (
									<button
										type='button'
										className={cn(s.view, s.viewEnkel, { isOn: calStyle === 'simple' })}
										aria-pressed={calStyle === 'simple' ? 'true' : 'false'}
										onClick={() => onSetCalStyle(calStyle === 'simple' ? 'full' : 'simple')}
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
						className={cn(s.filterChips, {
							isOverflow: pickerFade.canScroll,
							isOverflowTop: pickerFade.top,
							isOverflowBottom: pickerFade.bottom,
						})}
						style={{ ['--picker-rows']: String(Math.max(1, Math.ceil(chips.length / 5))) }}
					>
						{chipNodes}
					</div>
				) : null}
			</div>
		</header>
	);
}

const SYMBOL_OUTLINE =
	'M45.3,248.6c-32-50.1-25.9-114.9.9-161.5S124.7,12.8,175.7,13.7c91.5-2.6,153.7,75.1,169.3,160.6,14.7,78.6-10.4,168.4-54.4,225.4-44.9,57-88.1,104.7-132.1,156.3-31.8,36.2-68.2,40.6-101,23.3-30.2-15.5-44-43.2-44-70.8M267.5,133.7c-19.9-44-59.9-63.9-98.7-56.1-44.9,6.9-76,41.4-82.9,77.7-5,28.1,4.4,59.4,20.3,81.7M177.8,375.1c-37.1-3.5-56.5,21.1-80.7,53.1-14.7,19.9-31.4,25.6-43.5,20.6-22.3-9.5-20.4-34.4-9.2-67.2';
const EYE_CX = 191.2;
const EYE_CY = 280.4;
const EYE_MIN = -16;
const EYE_MAX = 58;

let eyeUsers = 0;
let unbindEyes: (() => void) | null = null;

function bindEyeFollow() {
	if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};
	let frame = 0;
	let tracking = false;
	let targetX = 0;
	let targetY = 0;
	const angle = new WeakMap<Element, number>();

	const step = () => {
		frame = 0;
		let moving = false;
		document.querySelectorAll<SVGGElement>('[data-mast-eye]').forEach((eye) => {
			const circle = eye.querySelector('circle');
			if (!circle) return;
			const rect = circle.getBoundingClientRect();
			if (rect.width < 2 || rect.height < 2) return;
			let aim = 0;
			if (tracking) {
				const dx = targetX - (rect.left + rect.width / 2);
				const dy = targetY - (rect.top + rect.height / 2);
				aim = Math.atan2(dy, dx) * (180 / Math.PI);
				if (aim > 90) aim -= 360;
				aim = Math.max(EYE_MIN, Math.min(EYE_MAX, aim));
			}
			const prev = angle.get(eye) ?? 0;
			const next = prev + (aim - prev) * 0.22;
			if (Math.abs(next - prev) > 0.04) moving = true;
			angle.set(eye, next);
			eye.setAttribute(
				'transform',
				'rotate(' + next.toFixed(2) + ' ' + EYE_CX + ' ' + EYE_CY + ')',
			);
		});
		if (moving) frame = window.requestAnimationFrame(step);
	};

	const queue = () => {
		if (!frame) frame = window.requestAnimationFrame(step);
	};
	const onMove = (event: PointerEvent) => {
		tracking = true;
		targetX = event.clientX;
		targetY = event.clientY;
		queue();
	};
	const onLeave = (event: PointerEvent) => {
		if (event.relatedTarget) return;
		tracking = false;
		queue();
	};
	window.addEventListener('pointermove', onMove, { passive: true });
	window.addEventListener('pointerout', onLeave);
	return () => {
		window.removeEventListener('pointermove', onMove);
		window.removeEventListener('pointerout', onLeave);
		if (frame) window.cancelAnimationFrame(frame);
	};
}

function useEyeFollow() {
	useEffect(() => {
		eyeUsers += 1;
		if (eyeUsers === 1) unbindEyes = bindEyeFollow();
		return () => {
			eyeUsers -= 1;
			if (eyeUsers === 0) {
				unbindEyes?.();
				unbindEyes = null;
			}
		};
	}, []);
}

export function MastSymbol({ lockupRef }: { lockupRef?: Ref<HTMLSpanElement> }) {
	useEyeFollow();
	return (
		<span ref={lockupRef} className='mastSymbolLockup'>
			<svg className='mastSymbol mastSymbolDark' viewBox='0 0 364.1 601.6' aria-hidden='true'>
				<path
					d={SYMBOL_OUTLINE}
					fill='none'
					stroke='#eee'
					strokeLinecap='round'
					strokeLinejoin='round'
					strokeWidth='18'
				/>
				<g data-mast-eye>
					<circle cx={EYE_CX} cy={EYE_CY} r='95.6' fill='#eee' stroke='#eee' strokeWidth='18' />
					<ellipse cx='232.8' cy={EYE_CY} rx='45.3' ry='64.7' fill='#111' />
				</g>
			</svg>
			<svg className='mastSymbol mastSymbolLight' viewBox='0 0 364.1 601.6' aria-hidden='true'>
				<path
					d={SYMBOL_OUTLINE}
					fill='none'
					stroke='#111'
					strokeLinecap='round'
					strokeLinejoin='round'
					strokeWidth='21.6'
				/>
				<g data-mast-eye>
					<ellipse cx='236.8' cy={EYE_CY} rx='41.3' ry='58.9' fill='#111' />
					<circle
						cx={EYE_CX}
						cy={EYE_CY}
						r='95.6'
						fill='none'
						stroke='#111'
						strokeLinecap='round'
						strokeLinejoin='round'
						strokeWidth='21.6'
					/>
				</g>
			</svg>
		</span>
	);
}
