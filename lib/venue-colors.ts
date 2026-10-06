import { VENUES } from "@/lib/types";

/**
 * Hemfärgerna läses från CSS en gång, innan någon överskrivning.
 * En scen behåller sin färg tills den läggs till i en lista där färgen redan finns.
 * Då tar den den minst använda färgen i paletten.
 */
let homes: Record<string, string> | null = null;
let palette: string[] | null = null;

function loadHomes() {
	if (homes && palette) return;
	const root = document.documentElement;
	for (const venue of VENUES) root.style.removeProperty("--" + venue.slug);
	homes = {};
	palette = [];
	const seen = new Set<string>();
	const style = getComputedStyle(root);
	for (const venue of VENUES) {
		const color = style.getPropertyValue("--" + venue.slug).trim().toLowerCase();
		if (!color) continue;
		homes[venue.slug] = color;
		if (!seen.has(color)) {
			seen.add(color);
			palette.push(color);
		}
	}
}

function leastUsed(used: Map<string, number>, avoid: string): string {
	const colors = palette || [];
	let best = colors[0] || avoid;
	let bestCount = Infinity;
	for (const color of colors) {
		if (color === avoid) continue;
		const count = used.get(color) ?? 0;
		if (count < bestCount) {
			best = color;
			bestCount = count;
			if (count === 0) break;
		}
	}
	return best;
}

export function resolveVenueColors(slugs: string[]): Record<string, string> {
	if (typeof document === "undefined") return {};
	loadHomes();
	const used = new Map<string, number>();
	const out: Record<string, string> = {};
	for (const slug of slugs) {
		if (!slug || out[slug]) continue;
		const home = homes?.[slug];
		if (!home) continue;
		const taken = (used.get(home) ?? 0) > 0;
		const color = taken ? leastUsed(used, home) : home;
		out[slug] = color;
		used.set(color, (used.get(color) ?? 0) + 1);
	}
	return out;
}

export function applyVenueColors(slugs: string[]) {
	const root = document.documentElement;
	const resolved = resolveVenueColors(slugs);
	for (const venue of VENUES) {
		const color = resolved[venue.slug];
		const home = homes?.[venue.slug];
		if (color && home && color !== home) root.style.setProperty("--" + venue.slug, color);
		else root.style.removeProperty("--" + venue.slug);
	}
}
