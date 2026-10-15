<script lang="ts">
	import { useAirflow } from '../experience.svelte';
	import DockGroup from './DockGroup.svelte';
	import WeatherControls from './WeatherControls.svelte';
	import { weatherHint } from './weather';

	const experience = useAirflow();
	const hint = $derived(weatherHint(experience.setup.conditions, experience.view.units));
</script>

<DockGroup id="dock-weather" title="Weather" {hint}>
	<WeatherControls />
</DockGroup>
