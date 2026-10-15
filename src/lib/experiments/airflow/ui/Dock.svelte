<script lang="ts">
	import { useAirflow } from '../experience.svelte';
	import { MAX_PINS } from '../state';
	import DevicesPanel from './DevicesPanel.svelte';
	import DockGroup from './DockGroup.svelte';
	import Legend from './Legend.svelte';
	import ViewControls from './ViewControls.svelte';
	import HomeControls from './HomeControls.svelte';
	import ProbeControls from './ProbeControls.svelte';
	import SmokeControls from './SmokeControls.svelte';

	const experience = useAirflow();
</script>

<!--
	The Dock: every control and readout of the page, in groups under the Stage. Each group is a component of its own that talks to
	the page's `AirflowExperience` (`useAirflow()`), so a group is added here with one line and nothing else knows it exists.
	The comments mark where the other slices go, top to bottom as they appear on the page: replace your own line and leave the others.
-->
<div class="dock airflow-dock" role="group" aria-label="Simulation controls">
	<!-- #52 transport bar: pause, speed and the clock -->

	<Legend />

	<DockGroup id="dock-home" title="Home and scenario" hint={experience.plan.name} open>
		<HomeControls />
	</DockGroup>

	<DockGroup id="dock-view" title="View" open hint="Layer, scale, height, units">
		<ViewControls />
	</DockGroup>

	<!-- #52 Weather -->

	<!-- #52 Openings -->

	<DockGroup id="dock-devices" title="Fans and purifiers" hint="{experience.setup.devices.length} of 6" open>
		<DevicesPanel />
	</DockGroup>

	<DockGroup id="dock-probes" title="Probes and smoke" hint="{experience.probes.length} of {MAX_PINS} probes">
		<ProbeControls>
			<SmokeControls />
		</ProbeControls>
	</DockGroup>

	<!-- #55 Physics -->
</div>
