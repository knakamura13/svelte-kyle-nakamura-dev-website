<script>
	import { onMount } from 'svelte';

	onMount(() => {
		particlesJS.load('particles-js', '/vendor/particlesjs-config.json');
	});
</script>

<div id="particles-js" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%;"></div>
