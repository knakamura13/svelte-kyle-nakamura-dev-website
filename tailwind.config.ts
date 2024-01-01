import { join } from 'path';
import type { Config } from 'tailwindcss';
import { skeleton } from '@skeletonlabs/tw-plugin';

export default {
	darkMode: 'class',
	content: [
		'./src/**/*.{html,js,svelte,ts}',
		join(require.resolve('@skeletonlabs/skeleton'), '../**/*.{html,js,svelte,ts}')
	],
	theme: {
		extend: {}
	},
	plugins: [
		skeleton({
			themes: {
				preset: [
					{
						name: 'skeleton',
						enhancements: true
					},
					{
						name: 'modern',
						enhancements: true
					},
					{
						name: 'wintry',
						enhancements: true
					},
					{
						name: 'rocket',
						enhancements: true
					},
					{
						name: 'hamlindigo',
						enhancements: true
					},
					{
						name: 'gold-nouveau',
						enhancements: true
					},
					{
						name: 'crimson',
						enhancements: true
					}
				]
			}
		})
	]
} satisfies Config;
