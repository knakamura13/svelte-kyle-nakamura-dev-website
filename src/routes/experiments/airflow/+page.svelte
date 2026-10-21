<script lang="ts">
	import { onMount } from 'svelte';
	import { DEVICE_MODELS } from '$lib/experiments/airflow/devices/catalog';
	import { loadEngine } from '$lib/experiments/airflow/engine';
	import { provideAirflow } from '$lib/experiments/airflow/experience.svelte';
	import { plans } from '$lib/experiments/airflow/homes/plans';
	import { linkCatalog, setupFromHash, setupToHash } from '$lib/experiments/airflow/link';
	import { SCENARIOS } from '$lib/experiments/airflow/scenarios';
	import { shortfall } from '$lib/experiments/airflow/ui/clock';
	import Hud from '$lib/experiments/airflow/ui/hud/Hud.svelte';
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
		// QA reaches the page's state from a script. `vite dev` only: a production build drops this.
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
	// A backend that cannot keep up runs the simulation slower than the clock asks. The rate changes as it goes, so it is kept out of the live region: a screen reader hears the status once, not every few seconds. The bottom bar's clock says it in the same words.
	const behind = $derived(shortfall(readout.status, readout.physics.rate, experience.clock.speed));
	const key = (target: { kind: string; id: string } | null) => (target ? `${target.kind}:${target.id}` : undefined);
</script>

<svelte:head>
	<title>Airflow, room by room — Kyle Nakamura</title>
	<meta
		name="description"
		content="Open a window and watch the air. A live simulation of indoor air movement driven by wind, temperature, and fans, and how that air carries smoke and heat around the rooms."
	/>
	<meta name="theme-color" content="#2c2f2b" />
</svelte:head>

<div class="concept airflow-immersive">
	<article
		class="experiment airflow airflow-world"
		data-tool={experience.tool}
		data-hovering={experience.hovered ? '' : undefined}
		data-hovered={key(experience.hovered)}
		data-carrying={experience.carry ? '' : undefined}
	>
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

		<Hud {status} {tuning} {behind} />

		<p id="stage-help" class="sr-only">
			The 3D view can be focused. When it is, W, A, S and D or the arrow keys move the view across the home, Q and E turn it, plus and
			minus zoom in and out, and Home goes back to the first view. With the Probe or the Smoke tool, the arrow keys move a cursor over the
			air instead: Enter pins a probe, or starts and stops smoke, at the cursor, Shift makes the steps bigger, and Escape puts the cursor
			away. With a mouse, drag with the right button to turn the view, drag with the middle button to move it, and scroll to zoom.
			Everything in the home can also be chosen and changed from the Inspector.
		</p>
	</article>
</div>
