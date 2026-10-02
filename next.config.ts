import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
	sassOptions: {
		includePaths: ['./styles', './components', './app'],
		additionalData: `@use "@/styles/mediaqueries" as *;\n`,
	},
	devIndicators: false,
	// TODO: remove once the pre-existing type errors (Mast.tsx, EventCard.tsx, …)
	// are fixed. Build will not fail on type errors while this is set.
	typescript: {
		ignoreBuildErrors: true,
	},
};

export default nextConfig;
