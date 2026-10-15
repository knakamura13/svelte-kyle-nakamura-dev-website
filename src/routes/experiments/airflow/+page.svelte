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

	onMount(() => {
		// Until the Dock has controls for everything, QA reaches the page's state from a script. `vite dev` only: a production build drops this.
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
	// A backend that cannot keep up runs the simulation slower than the clock asks. The rate changes as it goes, so it is kept out of the live region: a screen reader hears the status once, not every few seconds. The Dock's clock says it in the same words.
	const behind = $derived(shortfall(readout.status, readout.physics.rate, experience.clock.speed));
</script>

<svelte:head>
	<title>Airflow, room by room — Kyle Nakamura</title>
	<meta
		name="description"
		content="Open a window and watch the air. A live simulation of indoor air movement driven by wind, temperature, and fans, and how that air carries smoke and heat around the rooms."
	/>
</svelte:head>

<article class="experiment airflow">
	<header class="page-intro">
		<a class="text-link page-back" href="/experiments"><span aria-hidden="true"><Arrow direction="left" /></span> All experiments</a>
		<h1>Airflow,<br /><span>room by room.</span></h1>
		<p class="page-lede">
			Air moves through a home when the wind pushes on it, when warm air rises and cold air sinks, and when a fan pushes it along.
			This is a live simulation of that, in four small homes. Point at the air to read it, click to leave a probe, and hold to
			release smoke.
		</p>
		<div class="page-meta">
			<span>Navier–Stokes solver · Three.js · SvelteKit · WebGPU</span>
		</div>
	</header>

	<div class="airflow-card">
		<figure class="airflow-figure" data-stage-region data-sim={readout.status}>
			<!-- The view is operated with the arrow keys (see the controller). `application` tells screen readers to pass keys through; Svelte only counts widget roles as interactive. -->
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<div
				class="stage-view"
				role="application"
				aria-roledescription="3D view"
				tabindex="0"
				aria-label="The air in the {experience.plan.name}, drawn as a slice through a cutaway of the home."
				aria-describedby="stage-help"
				data-state="pending"
				use:stage={{ experience, scene: 'airflow', params: experience, readout }}
			>
				<div class="stage-labels" aria-hidden="true"></div>
				<p class="stage-note" data-when="loading">Loading the 3D view…</p>
				<p class="stage-note" data-when="unsupported">
					This browser can’t show 3D graphics, so the scene is switched off.
				</p>
				<p class="stage-note" data-when="error">The 3D view couldn’t load.</p>
				<noscript><p class="stage-note stage-note-static">The 3D view needs JavaScript.</p></noscript>
			</div>
			<p class="sim-status" role="status" data-status={readout.status}>{status}{#if behind}<span aria-hidden="true" data-behind>{' '}{behind}</span>{/if}</p>
			<figcaption>{experience.plan.name}. {experience.plan.blurb}</figcaption>
		</figure>
		<Dock />
	</div>

	<Explainer />

	<div class="case-end">
		<a class="text-link" href="/experiments"><span aria-hidden="true"><Arrow direction="left" /></span> All experiments</a>
		<a class="text-link" href="/resume">Résumé <span aria-hidden="true"><Arrow /></span></a>
	</div>

	<p id="stage-help" class="sr-only">
		The 3D view can be focused. When it is, the arrow keys rotate it, plus and minus zoom, and zero resets it. In Probe or Emit
		mode, which you choose in the Probes and smoke group of controls, the arrow keys move a cursor over the air instead:
		Enter pins a probe, or starts and stops smoke, at the cursor, Shift makes the steps bigger, and Escape puts the cursor away.
		With a mouse, point to read the air, click to pin a probe, and press and hold to release smoke.
	</p>
	<p class="sr-only" aria-live="polite">{experience.announcement}</p>
</article>
