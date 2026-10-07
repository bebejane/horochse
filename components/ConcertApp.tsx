'use client';

import s from './ConcertApp.module.scss';
import cn from 'classnames';

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { formatUpdated, toIso, todayDate, weekMondayIso } from '@/lib/dates';
import {
	clearStoredSettings,
	filteredEvents,
	isLocalHost,
	loadFilterMode,
	loadMine,
	loadPickerOpen,
	saveFilterMode,
	saveMine,
	savePickerSeen,
	upcomingEvents,
} from '@/lib/events';
import { applyVenueColors } from '@/lib/venue-colors';
import type {
	CalStyle,
	ConcertEvent,
	EventsPayload,
	FilterMode,
	ListDensity,
	ThemeMode,
	ViewMode,
} from '@/lib/types';
import { usePlayer } from '@/hooks/usePlayer';
import { CalendarView } from './CalendarView';
import { ListView } from './ListView';
import list from './ListView.module.scss';
import { Mast, MastSymbol } from './Mast';
import { NowPlayingBar } from './NowPlayingBar';

function prefersReducedMotion() {
	return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function mastCoverBottom() {
	const mast = document.querySelector<HTMLElement>('[data-mast]');
	if (!mast) return 0;
	if (mast.getBoundingClientRect().height >= 1) return mast.getBoundingClientRect().bottom;
	const pieces = mast.querySelectorAll<HTMLElement>('[data-mast-bar], [data-mast-tools]');
	let bottom = 0;
	pieces.forEach((piece) => {
		bottom = Math.max(bottom, piece.getBoundingClientRect().bottom);
	});
	return bottom;
}

function scrollToCard(
	event: ConcertEvent,
	opts: { force?: boolean; behavior?: ScrollBehavior } = {},
) {
	const card =
		document.querySelector<HTMLElement>('[data-card][data-id="' + event.id + '"]') ||
		document.querySelector<HTMLElement>('[data-cal-event][data-id="' + event.id + '"]');
	if (!card) return;
	const mast = document.querySelector<HTMLElement>('[data-mast]');
	const bar = document.getElementById('nowplaying');
	let topBound = mastCoverBottom();
	const bottomBound =
		bar && bar.classList.contains('isOn') ? bar.getBoundingClientRect().top : window.innerHeight;
	const motion = opts.behavior || (prefersReducedMotion() ? 'auto' : 'smooth');
	if (card.matches('[data-cal-event]')) {
		const week = card.closest<HTMLElement>('[data-week]');
		const weekHead = week?.parentElement?.querySelector<HTMLElement>('[data-week-head]');
		if (weekHead) topBound += weekHead.getBoundingClientRect().height;
		const calHeads = week && week.querySelector<HTMLElement>('[data-cal-heads]');
		if (calHeads) topBound += calHeads.getBoundingClientRect().height;
		const dayCol = card.closest<HTMLElement>('[data-cal-day]');
		if (week && dayCol && week.scrollWidth > week.clientWidth + 2) {
			const dayRect = dayCol.getBoundingClientRect();
			const weekRect = week.getBoundingClientRect();
			if (dayRect.left < weekRect.left + 4 || dayRect.right > weekRect.right - 4) {
				const snap = dayCol.offsetLeft - week.clientLeft;
				week.scrollTo({ left: Math.max(0, snap), behavior: opts.behavior || 'auto' });
			}
		}
		const calRect = card.getBoundingClientRect();
		const cs = getComputedStyle(card);
		const scale = parseFloat(cs.getPropertyValue('--cal-hover-scale')) || 1;
		const growsUp = scale > 1 && !/top/.test(cs.transformOrigin || '');
		const transformed = cs.transform && cs.transform !== 'none';
		const lift = growsUp && !transformed ? (card.offsetHeight * (scale - 1)) / 2 : 0;
		const target = calRect.top - lift;
		if (!opts.force && Math.abs(target - (topBound + 18)) < 12) return;
		window.scrollTo({
			top: Math.max(0, window.scrollY + target - topBound - 18),
			behavior: opts.behavior || 'auto',
		});
		return;
	}
	const day = card.closest<HTMLElement>('[data-day]');
	const heading = day?.querySelector<HTMLElement>('[data-day-title]');
	if (heading && heading.getBoundingClientRect().bottom <= card.getBoundingClientRect().top + 4) {
		topBound += heading.getBoundingClientRect().height;
	}
	const rect = card.getBoundingClientRect();
	if (!opts.force && rect.top >= topBound - 2 && rect.bottom <= bottomBound - 16) return;
	window.scrollTo({
		top: Math.max(0, window.scrollY + rect.top - topBound - 10),
		behavior: motion,
	});
}

function queueScrollToCard(event: ConcertEvent) {
	const id = event.id;
	window.requestAnimationFrame(() => {
		window.requestAnimationFrame(() => {
			scrollToCard(event);
		});
	});
	void id;
}

export function ConcertApp({ payload }: { payload: EventsPayload }) {
	const events: ConcertEvent[] = payload.events || [];
	const updated = payload.updated || '';
	const rangeTo = payload.range?.to || null;
	const loaded = true;
	const [mode, setMode] = useState<FilterMode>('all');
	const [mine, setMine] = useState<string[]>([]);
	const [pickerOpen, setPickerOpen] = useState(false);
	const [peek, setPeek] = useState<string | null>(null);
	const [view, setView] = useState<ViewMode>('list');
	const [calStyle, setCalStyle] = useState<CalStyle>('full');
	const [theme, setTheme] = useState<ThemeMode>('dark');
	const [density, setDensity] = useState<ListDensity>('more');
	const [openCardId, setOpenCardId] = useState<string | null>(null);
	const [localHost, setLocalHost] = useState(false);
	const [narrow, setNarrow] = useState(
		() => typeof window !== 'undefined' && window.matchMedia('(max-width: 840px)').matches,
	);
	const effectiveView: ViewMode = narrow ? 'list' : view;

	const visible = useMemo(
		() =>
			effectiveView === 'calendar'
				? filteredEvents(events, mine, mode, peek)
				: upcomingEvents(events, mine, mode, peek),
		[events, mine, mode, peek, effectiveView],
	);
	const playlistEvents = useMemo(
		() => filteredEvents(events, mine, mode, peek),
		[events, mine, mode, peek],
	);

	const colorSlugs = useMemo(() => {
		if (peek) return [peek];
		if (mode === 'mine') return mine;
		const seen = new Set<string>();
		const slugs: string[] = [];
		for (const event of visible) {
			const slug = event.venue_slug;
			if (!slug || seen.has(slug)) continue;
			seen.add(slug);
			slugs.push(slug);
		}
		return slugs;
	}, [peek, mode, mine, visible]);

	useLayoutEffect(() => {
		applyVenueColors(colorSlugs);
	}, [colorSlugs, theme]);

	const scrollPlaying = useCallback((event: ConcertEvent) => {
		scrollToCard(event);
		queueScrollToCard(event);
	}, []);

	const player = usePlayer({ events: playlistEvents, onNeedScroll: scrollPlaying });

	useEffect(() => {
		setMine(loadMine());
		setMode(loadFilterMode());
		setPickerOpen(loadPickerOpen());
		try {
			const storedView = localStorage.getItem('konserter-view');
			if (window.location.hash === '#kalender') setView('calendar');
			else if (window.location.hash === '#lista') setView('list');
			else if (storedView === 'calendar') setView('calendar');
			const storedCal = localStorage.getItem('konserter-cal-style');
			if (storedCal === 'simple') setCalStyle('simple');
			const storedTheme = localStorage.getItem('konserter-theme');
			if (storedTheme === 'light') setTheme('light');
			const storedDensity = localStorage.getItem('konserter-density');
			if (storedDensity === 'less') setDensity('less');
		} catch {
			/* ignore */
		}
	}, []);

	useEffect(() => {
		setLocalHost(isLocalHost());
	}, []);

	useEffect(() => {
		const mq = window.matchMedia('(max-width: 840px)');
		const apply = () => setNarrow(mq.matches);
		apply();
		mq.addEventListener('change', apply);
		return () => mq.removeEventListener('change', apply);
	}, []);

	useEffect(() => {
		document.body.classList.toggle('isCalendar', effectiveView === 'calendar');
		document.body.classList.toggle(
			'isCalSimple',
			effectiveView === 'calendar' && calStyle === 'simple',
		);
	}, [effectiveView, calStyle]);

	useEffect(() => {
		try {
			localStorage.setItem('konserter-view', view);
		} catch {
			/* ignore */
		}
		try {
			localStorage.setItem('konserter-cal-style', calStyle);
		} catch {
			/* ignore */
		}
		if (view === 'calendar') history.replaceState(null, '', '#kalender');
		else history.replaceState(null, '', '#lista');
	}, [view, calStyle]);

	useEffect(() => {
		if (theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
		else document.documentElement.removeAttribute('data-theme');
		try {
			localStorage.setItem('konserter-theme', theme);
		} catch {
			/* ignore */
		}
	}, [theme]);

	useEffect(() => {
		try {
			localStorage.setItem('konserter-density', density);
		} catch {
			/* ignore */
		}
		if (density === 'more') setOpenCardId(null);
	}, [density]);

	const syncLayout = useCallback(() => {
		const root = document.documentElement;
		const mast = document.querySelector<HTMLElement>('[data-mast]');
		const mastBar = mast?.querySelector<HTMLElement>('[data-mast-bar]');
		const mastTools = mast?.querySelector<HTMLElement>('[data-mast-tools]');
		const narrow = window.matchMedia('(max-width: 840px)').matches;
		if (narrow && mast && mast.getBoundingClientRect().height < 1 && mastBar && mastTools) {
			root.style.setProperty(
				'--mast-height',
				mastBar.getBoundingClientRect().height + mastTools.getBoundingClientRect().height + 'px',
			);
		} else if (mast) {
			root.style.setProperty('--mast-height', mast.getBoundingClientRect().height + 'px');
		}
		const heads = document.querySelector<HTMLElement>('[data-week] [data-cal-heads]');
		if (heads) {
			document.documentElement.style.setProperty(
				'--cal-heads-height',
				Math.ceil(heads.getBoundingClientRect().height) + 'px',
			);
		}
		const weekHead = document.querySelector<HTMLElement>('[data-week-head]');
		if (weekHead) {
			document.documentElement.style.setProperty(
				'--week-head',
				Math.ceil(weekHead.getBoundingClientRect().height) + 'px',
			);
		} else {
			document.documentElement.style.removeProperty('--week-head');
		}
		const bar = document.getElementById('nowplaying');
		let height = 0;
		if (bar && !bar.hidden && bar.classList.contains('isOn')) {
			height = Math.ceil(bar.getBoundingClientRect().height);
		}
		document.documentElement.style.setProperty('--player-height', height + 'px');
	}, []);

	useEffect(() => {
		syncLayout();
		const mast = document.querySelector<HTMLElement>('[data-mast]');
		const bar = document.getElementById('nowplaying');
		const heads = document.querySelector<HTMLElement>('[data-cal-heads]');
		const weekHead = document.querySelector<HTMLElement>('[data-week-head]');
		const ro = window.ResizeObserver ? new ResizeObserver(syncLayout) : null;
		if (ro && mast) ro.observe(mast);
		const mastBar = mast?.querySelector<HTMLElement>('[data-mast-bar]');
		const mastTools = mast?.querySelector<HTMLElement>('[data-mast-tools]');
		if (ro && mastBar) ro.observe(mastBar);
		if (ro && mastTools) ro.observe(mastTools);
		if (ro && bar) ro.observe(bar);
		if (ro && heads) ro.observe(heads);
		if (ro && weekHead) ro.observe(weekHead);
		window.addEventListener('resize', syncLayout);
		return () => {
			window.removeEventListener('resize', syncLayout);
			ro?.disconnect();
		};
	}, [syncLayout, effectiveView, calStyle, player.barOn, visible.length, pickerOpen]);

	useEffect(() => {
		player.rebindAfterRender();
		// Intentionally omit `player` so rebind runs on view/filter changes, not every player tick.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [effectiveView, visible, player.rebindAfterRender]);

	const emptyList = loaded && !visible.length;

	const currentWeek = player.eventId
		? (() => {
				const ev = playlistEvents.find((e) => e.id === player.eventId);
				return ev ? weekMondayIso(ev.date) : '';
			})()
		: '';

	const closePicker = useCallback(() => {
		savePickerSeen();
		setPickerOpen(false);
	}, []);

	function scrollPageTop() {
		const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
		window.scrollTo({ top: 0, behavior });
	}

	const onFilterVenue = useCallback((slug: string) => {
		setPickerOpen(false);
		setPeek((current) => (current === slug ? null : slug));
		scrollPageTop();
	}, []);

	function onSetView(next: ViewMode) {
		const changed = next !== view;
		setView(next);
		if (next === 'calendar') setCalStyle('full');
		if (changed && player.eventId) {
			const ev = playlistEvents.find((e) => e.id === player.eventId);
			if (ev) {
				const go = () => scrollToCard(ev, { force: true, behavior: 'auto' });
				setTimeout(go, 0);
				setTimeout(go, 80);
			}
		}
	}

	return (
		<div>
			<a className='skip' href='#program'>
				Hoppa till programmet
			</a>
			<Mast
				mode={mode}
				mine={mine}
				peek={peek}
				pickerOpen={pickerOpen}
				view={view}
				calStyle={calStyle}
				theme={theme}
				density={density}
				onSelectAll={() => {
					savePickerSeen();
					setMode('all');
					saveFilterMode('all');
					setPeek(null);
					setPickerOpen(false);
					scrollPageTop();
				}}
				onTogglePicker={() => {
					const hadPeek = peek !== null;
					setPeek(null);
					if (pickerOpen) {
						savePickerSeen();
						setPickerOpen(false);
						if (mine.length) {
							setMode('mine');
							saveFilterMode('mine');
						}
						if (hadPeek || (mine.length > 0 && mode !== 'mine')) scrollPageTop();
						return;
					}
					if (!mine.length) {
						setPickerOpen(true);
						return;
					}
					if (mode !== 'mine') {
						setMode('mine');
						saveFilterMode('mine');
						scrollPageTop();
						return;
					}
					if (hadPeek) scrollPageTop();
					setPickerOpen(true);
				}}
				onClosePicker={closePicker}
				onAddMine={(slug) => {
					if (mine.includes(slug)) return;
					const next = [...mine, slug];
					setMine(next);
					saveMine(next);
					savePickerSeen();
					setMode('mine');
					saveFilterMode('mine');
					scrollPageTop();
				}}
				onRemoveMine={(slug) => {
					const next = mine.filter((item) => item !== slug);
					setMine(next);
					saveMine(next);
					if (peek === slug) setPeek(null);
					if (!next.length && !pickerOpen) {
						setMode('all');
						saveFilterMode('all');
					}
					scrollPageTop();
				}}
				onPeekVenue={(slug) => {
					if (pickerOpen) return;
					setPeek((current) => (current === slug ? null : slug));
					scrollPageTop();
				}}
				onClearPeek={() => setPeek(null)}
				onSetView={onSetView}
				onSetCalStyle={(style) => {
					setView('calendar');
					setCalStyle(style);
				}}
				onToggleTheme={() => setTheme(theme === 'light' ? 'dark' : 'light')}
				onToggleDensity={() => setDensity(density === 'less' ? 'more' : 'less')}
				onLayout={syncLayout}
			/>
			<script
				dangerouslySetInnerHTML={{
					__html:
						'try{var root=document.documentElement;var mast=document.querySelector("[data-mast]");if(!mast)throw 0;var narrow=window.matchMedia("(max-width: 840px)").matches;if(narrow&&mast.getBoundingClientRect().height<1){var bar=mast.querySelector("[data-mast-bar]");var tools=mast.querySelector("[data-mast-tools]");var h=(bar?bar.getBoundingClientRect().height:0)+(tools?tools.getBoundingClientRect().height:0);if(h)root.style.setProperty("--mast-height",h+"px")}else if(root.hasAttribute("data-hide-intro")){root.style.setProperty("--mast-height",mast.getBoundingClientRect().height+"px")}}catch(e){}',
				}}
			/>
			<div className={s.shell}>
				<main id='program'>
					<div id='days'>
						{emptyList ? null : effectiveView === 'calendar' ? (
							<CalendarView
								events={visible}
								rangeTo={rangeTo}
								playing={player.playing}
								eventId={player.eventId}
								trackIndex={player.trackIndex}
								loadingId={player.loadingId}
								currentWeek={currentWeek}
								simple={calStyle === 'simple'}
								onToggle={player.togglePlay}
								onPrev={player.playEventPrev}
								onNext={player.playEventNext}
								onPlayWeek={(week) => player.playWeek(week, weekMondayIso, toIso(todayDate()))}
								onFilterVenue={onFilterVenue}
								onPreload={player.preloadEvent}
								onPreloadWeek={(week) =>
									player.preloadWeek(week, weekMondayIso, toIso(todayDate()))
								}
							/>
						) : (
							<ListView
								events={visible}
								playing={player.playing}
								eventId={player.eventId}
								trackIndex={player.trackIndex}
								loadingId={player.loadingId}
								currentWeek={currentWeek}
								compact={narrow && density === 'less'}
								expandedId={openCardId}
								onToggle={player.togglePlay}
								onPrev={player.playEventPrev}
								onNext={player.playEventNext}
								onPlayWeek={(week) => player.playWeek(week, weekMondayIso, toIso(todayDate()))}
								onFilterVenue={onFilterVenue}
								onExpandCard={(id) => setOpenCardId((current) => (current === id ? null : id))}
								onPreload={player.preloadEvent}
								onPreloadWeek={(week) =>
									player.preloadWeek(week, weekMondayIso, toIso(todayDate()))
								}
							/>
						)}
					</div>
				</main>
			</div>
			<footer className={s.colophon}>
				{localHost ? (
					<button
						type='button'
						className={s.colophonReset}
						aria-label='Nollställ sidan till första besöket'
						title='Nollställ sidan till första besöket'
						onClick={() => {
							clearStoredSettings();
							document.documentElement.removeAttribute('data-theme');
							history.replaceState(null, '', window.location.pathname + window.location.search);
							window.location.reload();
						}}
					>
						<MastSymbol />
					</button>
				) : (
					<MastSymbol />
				)}
				<p className={s.colophonCopy}>
					Hör & Se hämtar informationen veckovis från alla scenerna. Fel kan ibland uppstå,{' '}
					<a href='mailto:horochse@konst-teknik.se'>maila oss</a> gärna i så fall.
				</p>
				<p className={s.updated}>{formatUpdated(updated)}</p>
			</footer>
			<NowPlayingBar
				hidden={player.barHidden}
				on={player.barOn}
				playing={player.playing}
				data={player.nowPlaying}
				progress={player.progress}
				scrubbingRef={player.scrubbingRef}
				onSeek={player.seekToRatio}
				onPrev={player.playPrev}
				onToggle={player.toggleBarPlay}
				onNext={player.playNext}
			/>
			<iframe
				ref={player.iframeRef}
				id='sc-widget'
				title='SoundCloud'
				allow='autoplay; encrypted-media'
				src='https://w.soundcloud.com/player/?auto_play=false&hide_related=true&show_comments=false&show_user=false&show_reposts=false&show_artwork=false&visual=false'
			/>
			<div id='yt-host' aria-hidden='true'>
				<div ref={player.ytContainerRef} />
			</div>
		</div>
	);
}
