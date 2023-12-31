<script>
	import { browser } from '$app/environment';

	export let title = 'SvelteKit';

	if (browser && document.title) title = document.title;
</script>

<header>
	<a href="/" class="header-title">{title}</a>
</header>

<style lang="scss">
	header {
		display: flex;
		position: fixed;
		top: 0;
		right: 0;
		left: 0;
		z-index: 9999;
		background-color: var(--back-2);
		height: var(--nav-height);
		justify-content: center;
		align-items: center;
		border-bottom: 1px solid rgba(0, 0, 0, 0.1);
		.header-title {
			text-align: center;
			margin: auto;
			color: var(--text-2);
		}
	}
</style>
