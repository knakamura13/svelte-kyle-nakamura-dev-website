<script lang="ts">
	import { onMount } from 'svelte';
	import Explainer from '../Explainer.svelte';
	import Icon from './Icon.svelte';
	import { useHudUi } from './ui.svelte';

	/**
	 * About this simulation: the explainer that sat under the old page, in a dialog over the world. A modal dialog, so the keyboard stays
	 * in it until it closes (the close button, or Escape), and the focus goes back to the button that opened it.
	 */
	const ui = useHudUi();
	let dialog: HTMLDialogElement | undefined = $state();

	onMount(() => {
		const opener = document.activeElement as HTMLElement | null;
		dialog?.showModal();
		return () => opener?.focus();
	});
</script>

<dialog class="about glass deep" bind:this={dialog} aria-labelledby="hud-about-title" onclose={() => (ui.panel = null)}>
	<header class="head">
		<div>
			<p class="eyebrow">About this simulation</p>
			<h2 id="hud-about-title" class="title">Airflow, room by room.</h2>
		</div>
		<button type="button" class="ibtn" aria-label="Close" onclick={() => dialog?.close()}><Icon name="close" size={20} /></button>
	</header>
	<div class="body scroll">
		<p class="lede">
			Air moves through a home when the wind pushes on it, when warm air rises and cold air sinks, and when a fan pushes it along. This is a live
			simulation of that, in four small homes: a Navier–Stokes solver on WebGPU, or on the processor where there is none.
		</p>
		<Explainer />
	</div>
</dialog>

<style>
	.about {
		--sage: rgb(95 213 154 / 0.16);
		width: min(820px, calc(100vw - 32px));
		max-height: min(86vh, 900px);
		margin: auto;
		padding: 0;
		border: 0;
		color: var(--hud-text);
		overflow: hidden;
		animation: hud-in 240ms var(--hud-ease);
	}
	.about[open] {
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
	}
	.about::backdrop {
		background: rgb(6 10 8 / 0.42);
		-webkit-backdrop-filter: blur(4px);
		backdrop-filter: blur(4px);
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 16px;
		padding: 22px 22px 14px 32px;
		border-bottom: 1px solid var(--hud-rule);
	}
	.title {
		margin: 4px 0 0;
		font-family: 'Newsreader Variable', Georgia, serif;
		font-size: 34px;
		font-weight: 400;
		letter-spacing: -0.04em;
		line-height: 1.05;
		color: var(--hud-text);
	}
	.body {
		padding: 18px 32px 28px;
	}
	.lede {
		margin: 0 0 6px;
		max-width: 62ch;
		color: var(--hud-text);
		font-size: 15px;
		line-height: 1.75;
	}
	.body :global(.portfolio-background) {
		display: block;
		margin: 0;
		padding: 26px 0 8px;
		border-top: 1px solid var(--hud-rule);
	}
	.body :global(.portfolio-background:first-of-type) {
		margin-top: 18px;
	}
	.body :global(.portfolio-background h2) {
		margin: 0 0 18px;
		font-size: 28px;
		color: var(--hud-text);
	}
	/* The headings keep their line break: the site hides it on a narrow screen, and the words would run together. */
	.body :global(.portfolio-background h2 br) {
		display: inline;
	}
	.body :global(.takeaways li),
	.body :global(.background-copy > p) {
		font-size: 14px;
		line-height: 1.75;
	}
	.body :global(.takeaways li::before) {
		color: var(--hud-accent);
	}
	.body :global(.sources li) {
		color: var(--hud-muted);
	}
	.body :global(.sources a) {
		color: var(--hud-text);
		text-decoration-color: rgb(95 213 154 / 0.6);
	}
	.body :global(h3) {
		color: var(--hud-text);
	}
	:global(.hud.phone) .about {
		width: calc(100vw - 16px);
		max-height: calc(100vh - 16px);
	}
	:global(.hud.phone) .head {
		padding: 16px 12px 12px 18px;
	}
	:global(.hud.phone) .title {
		font-size: 26px;
	}
	:global(.hud.phone) .body {
		padding: 14px 18px 22px;
	}
</style>
