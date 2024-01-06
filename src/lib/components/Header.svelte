<script lang="ts">
	import { AppBar } from '@skeletonlabs/skeleton';
	import AnimatedButton from '$lib/components/AnimatedButton.svelte';
</script>

<AppBar shadow="shadow-2xl">
	<svelte:fragment slot="lead">
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
