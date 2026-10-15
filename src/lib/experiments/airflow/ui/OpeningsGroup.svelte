<script lang="ts">
	import { useAirflow } from '../experience.svelte';
	import DockGroup from './DockGroup.svelte';
	import OpeningControls from './OpeningControls.svelte';
	import { openingsHint } from './openings';

	const experience = useAirflow();
	// What the visitor has set. A window fan holds its window open or shut whatever the setting says.
	const open = $derived(experience.plan.openings.filter((opening) => experience.openingAmount(opening.id) > 0).length);
	const hint = $derived(openingsHint(open, experience.plan.openings.length, experience.setup.furniture));
</script>

<DockGroup id="dock-openings" title="Openings and furniture" {hint}>
	<OpeningControls />
</DockGroup>
