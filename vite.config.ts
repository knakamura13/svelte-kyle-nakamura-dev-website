import { purgeCss } from 'vite-plugin-tailwind-purgecss';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';

export default defineConfig({
	plugins: [
		sveltekit(),
		purgeCss(),
		legacy({
			targets: ['defaults', 'not IE 11']
		})
	],
	build: {
		rollupOptions: {
			external: ['pdfjs-dist']
		},
		target: 'esnext' // Change to a more recent ECMAScript standard
	}
});
