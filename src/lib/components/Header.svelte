<script lang="ts">
	import { AppBar } from '@skeletonlabs/skeleton';
	import AnimatedButton from '$lib/components/AnimatedButton.svelte';
	import { page } from '$app/stores';

	$: urlPath = $page.url.pathname;
</script>

<AppBar shadow="shadow-2xl">
	<svelte:fragment slot="lead">
		{#if urlPath !== '/'}
			<button
				class="btn back-btn"
				title="Back"
				on:click={() => {
					history.back();
				}}
			>
				<img src="/icons/icon-arrow-light.svg" alt="" class="rotate-180 cursor-pointer" />
			</button>
		{/if}

		<a href="/" class="link link--zoomies">
			<strong class="text-xl uppercase">Kyle Nakamura</strong>
		</a>
	</svelte:fragment>

	<svelte:fragment slot="trail">
		<AnimatedButton
			href="https://linkedin.com/in/kylenakamura"
			ariaLabel="View my LinkedIn profile"
			icon="/icons/logo-linkedin-white.png"
			iconSize="small">LinkedIn</AnimatedButton
		>
		<AnimatedButton
			href="https://github.com/knakamura13"
			ariaLabel="View my GitHub profile"
			icon="/icons/logo-github-white.svg"
			iconSize="small">GitHub</AnimatedButton
		>
	</svelte:fragment>
</AppBar>

<style lang="scss">
	.btn.back-btn {
		padding: 0;
		height: 100%;
		margin-right: 0.5rem;

		img {
			height: 2.2rem;
		}
	}
</style>
