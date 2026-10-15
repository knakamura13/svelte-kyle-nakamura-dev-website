<script lang="ts">
	import { useAirflow } from '../experience.svelte';
	import DockGroup from './DockGroup.svelte';
	import HomeControls from './HomeControls.svelte';

	const experience = useAirflow();
</script>

<!--
	The Dock: every control and readout of the page, in groups under the Stage. Each group is a component of its own that talks to
	the page's `AirflowExperience` (`useAirflow()`), so a group is added here with one line and nothing else knows it exists.
	The comments mark where the other slices go, top to bottom as they appear on the page: replace your own line and leave the others.
-->
<div class="dock airflow-dock" role="group" aria-label="Simulation controls">
	<!-- #52 transport bar: pause, speed and the clock -->

	<!-- #51 legend: the scale of the layer on the Slice -->

	<DockGroup id="dock-home" title="Home and scenario" hint={experience.plan.name} open>
		<HomeControls />
	</DockGroup>

	<!-- #51 View: layer, sensitivity, slice height, toggles, units -->

	<!-- #52 Weather -->

	<!-- #52 Openings -->

	<!-- #53 Devices -->

	<!-- #54 Probes and smoke -->

	<!-- #55 Physics -->
</div>
