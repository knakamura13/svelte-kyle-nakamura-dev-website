import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	extensions: ['.svelte'],
	preprocess: [vitePreprocess()],
	kit: {
		adapter: adapter()
	},
	browserslist: [
		// Support modern browsers with top-level await
		'Chrome >= 89',
		'Edge >= 89',
		'Firefox >= 89',
		'Safari >= 15'
	]
};
export default config;
