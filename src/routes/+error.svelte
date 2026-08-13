<script lang="ts">
	import { page } from '$app/state';
	import AnimatedButton from '$lib/components/AnimatedButton.svelte';

	interface Props {
		error?: App.Error;
		status?: number;
	}

	let { status }: Props = $props();

	const code = $derived(status ?? page.status);
	const isNotFound = $derived(code === 404);
	const heading = $derived(isNotFound ? 'This page is not in the folio.' : 'The press jammed.');
	const detail = $derived(
		isNotFound
			? 'That address is not a sheet on this site. Check the URL, or head back to the studio.'
			: 'Something unexpected happened while setting this page. Try again, or return home.'
	);
	const title = $derived(isNotFound ? 'Not found' : 'Error');
</script>

<svelte:head>
	<title>{title} · Kyle Nakamura</title>
</svelte:head>

<div class="page">
	<p class="eyebrow">
		<span class="cat-no">{code}</span>
		{isNotFound ? 'Missing sheet' : 'Press error'}
	</p>
	<h1>{heading}</h1>
	<p class="detail">{detail}</p>

	<AnimatedButton href="/" size="big" variant="primary" ariaLabel="Back to the home page">
		Back home
	</AnimatedButton>
</div>

<style>
	.page {
		max-width: 42rem;
		padding-top: 4rem;
		padding-bottom: 5rem;
	}

	.eyebrow {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		font-weight: 500;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--color-lacquer);
		margin-bottom: 1.35rem;
	}

	.eyebrow .cat-no {
		margin-right: 0.65rem;
		letter-spacing: 0.16em;
	}

	h1 {
		font-size: clamp(2.2rem, 7vw, 3.6rem);
		font-weight: 500;
		letter-spacing: -0.04em;
		margin-bottom: 1.15rem;
		font-variation-settings: 'SOFT' 50, 'WONK' 1, 'opsz' 96;
	}

	.detail {
		color: var(--color-ink-muted);
		margin-bottom: 2rem;
		max-width: 34rem;
	}
</style>
