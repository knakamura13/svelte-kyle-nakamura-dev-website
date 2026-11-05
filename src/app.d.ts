// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
// and what to do when importing types
declare namespace App {
	// interface Locals {}
	interface PageData {
		/** A full-screen page (the airflow world) that stands outside the site's shell: no nav and no footer (`routes/+layout.svelte`). */
		immersive?: boolean;
	}
	// interface Error {}
	// interface Platform {}
}
