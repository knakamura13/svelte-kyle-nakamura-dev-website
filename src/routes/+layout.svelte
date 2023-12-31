<script lang="ts">
	import Header from '$components/Header.svelte';
	import './styles.scss';
</script>

<div class="app">
	<Header />

	<main>
		<slot />
	</main>
</div>

<style>
	main {
		position: absolute;
		top: var(--nav-height);
		right: 0;
		bottom: 0;
		left: 0;
		background-color: var(--back-1);
		padding: 1em;
		overflow: auto;
	}
</style>
