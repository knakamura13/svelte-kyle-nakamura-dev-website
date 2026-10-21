<script lang="ts">
	import { onMount } from 'svelte';
	import Arrow from '$lib/components/Arrow.svelte';
	import { DEVICE_MODELS } from '$lib/experiments/airflow/devices/catalog';
	import { loadEngine } from '$lib/experiments/airflow/engine';
	import { provideAirflow } from '$lib/experiments/airflow/experience.svelte';
	import { plans } from '$lib/experiments/airflow/homes/plans';
	import { linkCatalog, setupFromHash, setupToHash } from '$lib/experiments/airflow/link';
	import { SCENARIOS } from '$lib/experiments/airflow/scenarios';
	import { shortfall } from '$lib/experiments/airflow/ui/clock';
	import Dock from '$lib/experiments/airflow/ui/Dock.svelte';
	import Explainer from '$lib/experiments/airflow/ui/Explainer.svelte';
	import { detectUnits, formatLength } from '$lib/experiments/airflow/units';
	import { stage } from '$lib/experiments/ui/stage';

	const catalog = linkCatalog(plans, DEVICE_MODELS);
	const experience = provideAirflow({
		load: loadEngine,
		plans,
		models: DEVICE_MODELS,
		scenarios: SCENARIOS,
		initial: null,
		defaultScenario: SCENARIOS[0].id,
		link: (setup) => `${location.origin}${location.pathname}${setupToHash(setup)}`
	});

	/** The Dock, until the HUD replaces it (milestone 3): a drawer on the right, shut at first so the world has the whole window. */
	let drawerOpen = $state(false);
	let drawer: HTMLElement | undefined = $state();
	let toggle: HTMLButtonElement | undefined = $state();

	function setDrawer(open: boolean, focus = true) {
		drawerOpen = open;
		if (!focus) return;
		// Opening takes the keyboard into the drawer; closing gives it back to the button that opened it.
		requestAnimationFrame(() => (open ? drawer?.querySelector<HTMLElement>('summary, button, input, a')?.focus() : toggle?.focus()));
	}

	onMount(() => {
		// Until the HUD has controls for everything, QA reaches the page's state from a script. `vite dev` only: a production build drops this.
		if (import.meta.env.DEV) (window as unknown as { __airflow: typeof experience }).__airflow = experience;
		const stop = experience.start(detectUnits(navigator.language));
		// A share link carries its setup in the address. The server never sees it, so it is read here, and again if a link is pasted into the open page.
		const adopt = () => {
			const setup = setupFromHash(location.hash, catalog);
			if (setup) experience.adoptSetup(setup);
		};
		adopt();
		addEventListener('hashchange', adopt);
		return () => {
			removeEventListener('hashchange', adopt);
			stop();
		};
	});

	const readout = $derived(experience.readout);
	const status = $derived.by(() => {
		const { physics } = readout;
		switch (readout.status) {
			case 'idle':
			case 'loading':
				return 'Starting the simulation…';
			case 'running':
			case 'paused': {
				const where = physics.backend === 'webgpu' ? 'WebGPU' : physics.reducedDetail ? 'the processor at reduced detail' : 'the processor';
				const grid = physics.cellSize ? `${physics.cells.toLocaleString('en-US')} cells, each ${formatLength(physics.cellSize, experience.view.units).text} across` : '';
				return `${readout.status === 'paused' ? 'Paused' : 'Running'}${physics.backend ? ` on ${where}` : ''}${grid ? `: ${grid}` : ''}.`;
			}
			default:
				return readout.note;
		}
	});
	// Why the grid is what it is (what the auto-tuner just did, or a note for a phone) goes with the cell size. The session announces it once, so it is outside the live region too.
	const tuning = $derived(readout.status === 'running' || readout.status === 'paused' ? readout.tuning : '');
	// A backend that cannot keep up runs the simulation slower than the clock asks. The rate changes as it goes, so it is kept out of the live region: a screen reader hears the status once, not every few seconds. The Dock's clock says it in the same words.
	const behind = $derived(shortfall(readout.status, readout.physics.rate, experience.clock.speed));
	const scenario = $derived(experience.scenarios.find((s) => s.id === experience.scenario));
</script>

<svelte:head>
	<title>Airflow, room by room — Kyle Nakamura</title>
	<meta
		name="description"
		content="Open a window and watch the air. A live simulation of indoor air movement driven by wind, temperature, and fans, and how that air carries smoke and heat around the rooms."
	/>
	<meta name="theme-color" content="#2c2f2b" />
</svelte:head>

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape' && drawerOpen) setDrawer(false);
	}}
/>

<div class="concept airflow-immersive">
	<article class="experiment airflow airflow-world" data-drawer={drawerOpen ? 'open' : 'closed'}>
		<h1 class="sr-only">Airflow, room by room</h1>

		<figure class="airflow-figure" data-stage-region data-sim={readout.status}>
			<!-- The world is operated with the mouse, fingers and keys (look/stage.ts). `application` tells screen readers to pass keys through; Svelte only counts widget roles as interactive. -->
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<div
				class="stage-view airflow-stage"
				role="application"
				aria-roledescription="3D view"
				tabindex="0"
				aria-label="The air in the {experience.plan.name}, in a cutaway of the home."
				aria-describedby="stage-help"
				data-state="pending"
				use:stage={{ experience, scene: 'airflow', params: experience, readout }}
			>
				<div class="stage-labels" aria-hidden="true"></div>
				<p class="stage-note" data-when="loading">Loading the world…</p>
				<p class="stage-note" data-when="unsupported">This browser can’t show 3D graphics, so the world is switched off.</p>
				<p class="stage-note" data-when="error">The 3D world couldn’t load.</p>
				<noscript><p class="stage-note stage-note-static">The 3D world needs JavaScript.</p></noscript>
			</div>
			<figcaption class="sr-only">{experience.plan.name}. {experience.plan.blurb}</figcaption>
		</figure>

		<header class="airflow-bar">
			<a class="airflow-chip airflow-exit" href="/experiments"><span aria-hidden="true"><Arrow direction="left" /></span> Experiments</a>
			<div class="airflow-chip airflow-title" aria-hidden="true">
				<span class="airflow-title-name">Airflow</span>
				<span class="airflow-title-home">{experience.plan.name}{scenario ? ` · ${scenario.name}` : ''}</span>
			</div>
			<button
				class="airflow-chip airflow-drawer-toggle"
				bind:this={toggle}
				aria-expanded={drawerOpen}
				aria-controls="airflow-drawer"
				onclick={() => setDrawer(!drawerOpen)}
			>
				<svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16"><path d="M3 5h9M15 5h2M3 10h3M9 10h8M3 15h7M13 15h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none" /><circle cx="13.5" cy="5" r="1.6" fill="none" stroke="currentColor" stroke-width="1.6" /><circle cx="7.5" cy="10" r="1.6" fill="none" stroke="currentColor" stroke-width="1.6" /><circle cx="11.5" cy="15" r="1.6" fill="none" stroke="currentColor" stroke-width="1.6" /></svg>
				{drawerOpen ? 'Hide controls' : 'Controls'}
			</button>
		</header>

		<p class="sim-status airflow-status" role="status" data-status={readout.status}>{status}{#if tuning}<span aria-hidden="true" data-tuning>{' '}{tuning}</span>{/if}{#if behind}<span aria-hidden="true" data-behind>{' '}{behind}</span>{/if}</p>

		<aside id="airflow-drawer" class="airflow-drawer" aria-label="Controls" bind:this={drawer} inert={!drawerOpen} data-open={drawerOpen}>
			<Dock />
			<Explainer />
		</aside>

		<p id="stage-help" class="sr-only">
			The 3D view can be focused. When it is, W, A, S and D or the arrow keys move the view across the home, Q and E turn it, plus
			and minus zoom in and out, Home goes back to the first view, and C steps the walls through cut away, up and down. In Probe or
			Emit mode, which you choose in the Probes and smoke group of controls, the arrow keys move a cursor over the air instead: Enter
			pins a probe, or starts and stops smoke, at the cursor, Shift makes the steps bigger, and Escape puts the cursor away. With a
			mouse, point to read the air, click to pin a probe, press and hold to release smoke, drag with the right button to turn the
			view, drag with the middle button to move it, and scroll to zoom.
		</p>
		<p class="sr-only" aria-live="polite">{experience.announcement}</p>
	</article>
</div>
