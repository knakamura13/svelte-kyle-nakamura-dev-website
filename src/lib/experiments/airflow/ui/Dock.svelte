<script lang="ts">
	import DockGroup from './DockGroup.svelte';
	import Legend from './Legend.svelte';
	import ViewControls from './ViewControls.svelte';
	import HomeControls from './HomeControls.svelte';
</script>

<!--
	The Dock: every control and readout of the page, in groups under the Stage. Each group is a component of its own that talks to
	the page's `AirflowExperience` (`useAirflow()`), so a group is added here with one line and nothing else knows it exists.
	The comments mark where the other slices go, top to bottom as they appear on the page: replace your own line and leave the others.
-->
<div class="dock airflow-dock" role="group" aria-label="Simulation controls">
	<!-- #52 transport bar: pause, speed and the clock -->

	<Legend />

	<DockGroup id="dock-home" title="Home and scenario" open>
		<HomeControls />
	</DockGroup>

	<DockGroup id="dock-view" title="View" open hint="Layer, scale, height, units">
		<ViewControls />
	</DockGroup>

	<!-- #52 Weather -->

	<!-- #52 Openings -->

	<!-- #53 Devices -->

	<!-- #54 Probes and smoke -->

	<!-- #55 Physics -->
</div>
