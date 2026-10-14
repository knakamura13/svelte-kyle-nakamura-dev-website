import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	build: {
		target: 'esnext'
	},
	// The airflow solver's Web Worker (airflow/solver/cpu/worker.ts) is a module worker in dev, so it is built as one too.
	worker: {
		format: 'es'
	}
});
