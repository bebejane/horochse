import type { NextConfig } from 'next';

import { IMAGE_ALLOWED_HOSTS } from './lib/image-url';

const nextConfig: NextConfig = {
	sassOptions: {
		includePaths: ['./styles', './components', './app'],
		additionalData: `@use "@/styles/mediaqueries" as *;\n`,
	},
	devIndicators: false,
	// `next/image` uses Vercel's Image Optimization (the default loader). The
	// host allowlist comes from `lib/image-url.ts` so venue images cannot be
	// optimized from arbitrary origins. Query strings on source URLs are
	// allowed (omitted `search`), matching how venue CDNs version posters.
	images: {
		// Only the widths the posters/calendar art actually use, so the generated
		// `srcset` stays small (the defaults emit 10 variants per image).
		deviceSizes: [400, 800, 1200],
		imageSizes: [200],
		remotePatterns: IMAGE_ALLOWED_HOSTS.flatMap((hostname) => [
			{ protocol: 'https' as const, hostname },
			// Subdomains, notably the `www.` form some venues serve from.
			{ protocol: 'https' as const, hostname: `**.${hostname}` },
		]),
	},
	// TODO: remove once the pre-existing type errors (Mast.tsx, EventCard.tsx, …)
	// are fixed. Build will not fail on type errors while this is set.
	typescript: {
		ignoreBuildErrors: true,
	},
};

export default nextConfig;
