<script lang="ts">
	import { LOAD_STAGES } from '../load';
	import type { AirflowLoading } from '../loading.svelte';

	/**
	 * The loading screen: the title, one line on what is about to happen, and one bar for everything the world waits for (the code and
	 * the CC0 assets, the shaders, and the warm-up that measures the device and picks the grid), with the stage under way named beneath
	 * it. It is in the server's HTML, so it is the first thing painted, before the page's script runs. Once the world is on show it
	 * fades into it and leaves the page.
	 */
	let { loading, line }: { loading: AirflowLoading; line: string } = $props();

	const percent = $derived(Math.round(loading.progress * 100));
	const current = $derived(LOAD_STAGES.findIndex((stage) => stage.id === loading.stage));
	const leaving = $derived(loading.phase !== 'loading');
	let gone = $state(false);

	// Once it has faded, it leaves the page (the fade is 1.1 s; reduced motion makes it 0.2 s).
	$effect(() => {
		if (!leaving) return;
		const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
		const timer = setTimeout(() => (gone = true), reduced ? 300 : 1300);
		return () => clearTimeout(timer);
	});
</script>

{#if !gone}
	<div class="loading" class:leaving data-phase={loading.phase} aria-hidden={leaving ? 'true' : undefined}>
		<div class="card">
			<p class="eyebrow">Experiment · Airflow</p>
			<p class="title">Airflow, room by room</p>
			<p class="line">{line}</p>
			<div class="bar" role="progressbar" aria-label="Loading the world" aria-valuemin="0" aria-valuemax="100" aria-valuenow={percent} aria-valuetext="{loading.label}, {percent}%">
				<span class="fill" style:transform="scaleX({Math.max(0.015, loading.progress)})"></span>
			</div>
			<ol class="stages">
				{#each LOAD_STAGES as stage, n (stage.id)}
					<li data-state={n < current || (n === current && loading.shares[stage.id] >= 1) ? 'done' : n === current ? 'now' : 'next'}>
						<span class="dot" aria-hidden="true"></span>{stage.label}
					</li>
				{/each}
				<li class="percent" aria-hidden="true">{percent}%</li>
			</ol>
			<noscript><p class="line">The 3D world needs JavaScript to run.</p></noscript>
		</div>
	</div>
{/if}

<style>
	.loading {
		--accent: #5fd59a;
		--text: #f3f7f4;
		--muted: #b9c6bf;
		--dim: #7f8d86;
		position: absolute;
		inset: 0;
		z-index: 10;
		display: grid;
		place-items: center;
		padding: 16px;
		/* Dusk over the lawn before the world comes up: a warm glow low down, as the golden-hour sun the world is lit by. */
		background:
			radial-gradient(120% 70% at 50% 118%, rgb(242 163 92 / 0.34), rgb(242 163 92 / 0) 62%),
			radial-gradient(90% 60% at 50% -20%, rgb(95 213 154 / 0.07), rgb(95 213 154 / 0) 60%),
			linear-gradient(180deg, #0d1311 0%, #111915 52%, #1c1d16 100%);
		color: var(--text);
		font-family: 'Manrope Variable', system-ui, sans-serif;
		-webkit-font-smoothing: antialiased;
		transition:
			opacity 1100ms cubic-bezier(0.4, 0, 0.2, 1),
			visibility 0s linear 1100ms;
	}
	.loading.leaving {
		opacity: 0;
		visibility: hidden;
		pointer-events: none;
	}
	.card {
		width: min(100%, 548px);
		padding: 30px 32px 24px;
		border-radius: 24px;
		background-color: rgb(14 19 17 / 0.82);
		background-image: linear-gradient(180deg, rgb(255 255 255 / 0.055), rgb(255 255 255 / 0) 46%);
		box-shadow:
			0 30px 70px rgb(0 0 0 / 0.45),
			0 6px 18px rgb(0 0 0 / 0.25),
			inset 0 1px 0 rgb(255 255 255 / 0.07),
			inset 0 0 0 1px rgb(255 255 255 / 0.1);
		animation: rise 700ms cubic-bezier(0.22, 1, 0.36, 1) backwards;
		transition:
			transform 1100ms cubic-bezier(0.4, 0, 0.2, 1),
			opacity 700ms cubic-bezier(0.4, 0, 0.2, 1);
	}
	.leaving .card {
		opacity: 0;
		transform: translateY(-10px) scale(0.985);
	}
	.eyebrow {
		margin: 0 0 12px;
		color: var(--accent);
		font-size: 10.5px;
		font-weight: 750;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	.title {
		margin: 0;
		font-family: 'Newsreader Variable', Georgia, serif;
		font-size: clamp(34px, 7vw, 48px);
		font-weight: 400;
		line-height: 1.02;
		letter-spacing: -0.035em;
		color: var(--text);
	}
	.line {
		margin: 12px 0 0;
		max-width: 44ch;
		color: var(--muted);
		font-size: 14px;
		line-height: 1.55;
	}
	.bar {
		position: relative;
		height: 6px;
		margin-top: 26px;
		border-radius: 6px;
		overflow: hidden;
		background: rgb(255 255 255 / 0.1);
		box-shadow: inset 0 1px 1px rgb(0 0 0 / 0.35);
	}
	.fill {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		transform-origin: left center;
		background: linear-gradient(90deg, #3fbf82, var(--accent) 60%, #9be8c0);
		box-shadow: 0 0 14px rgb(95 213 154 / 0.55);
		transition: transform 420ms cubic-bezier(0.22, 1, 0.36, 1);
	}
	/* A sheen that runs along the fill while it works. */
	.fill::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(90deg, rgb(255 255 255 / 0) 0%, rgb(255 255 255 / 0.55) 50%, rgb(255 255 255 / 0) 100%);
		transform: translateX(-100%);
		animation: sheen 1.6s cubic-bezier(0.45, 0, 0.55, 1) infinite;
	}
	.stages {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 14px;
		margin: 12px 0 0;
		padding: 0;
		list-style: none;
		color: var(--dim);
		font-size: 12px;
		font-weight: 650;
	}
	.stages li {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		transition: color 300ms ease;
	}
	.stages li[data-state='now'] {
		color: var(--text);
	}
	.stages li[data-state='done'] {
		color: var(--muted);
	}
	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: rgb(255 255 255 / 0.18);
		transition:
			background 300ms ease,
			box-shadow 300ms ease;
	}
	[data-state='done'] .dot {
		background: var(--accent);
	}
	[data-state='now'] .dot {
		background: var(--accent);
		box-shadow: 0 0 0 4px rgb(95 213 154 / 0.22);
		animation: pulse 1.4s ease-in-out infinite;
	}
	.percent {
		margin-left: auto;
		color: var(--muted);
		font-variant-numeric: tabular-nums;
	}
	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(14px);
		}
	}
	@keyframes sheen {
		to {
			transform: translateX(100%);
		}
	}
	@keyframes pulse {
		50% {
			box-shadow: 0 0 0 7px rgb(95 213 154 / 0.06);
		}
	}
	@media (max-width: 480px) {
		.card {
			padding: 24px 22px 20px;
		}
		.percent {
			margin-left: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.loading,
		.card,
		.fill {
			animation: none;
			transition-duration: 200ms;
		}
		.loading {
			transition:
				opacity 200ms linear,
				visibility 0s linear 200ms;
		}
		.fill::after,
		[data-state='now'] .dot {
			animation: none;
		}
	}
</style>
