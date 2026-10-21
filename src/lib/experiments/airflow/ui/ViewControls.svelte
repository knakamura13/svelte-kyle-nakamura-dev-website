<script lang="ts">
	import RangeField from '$lib/experiments/ui/RangeField.svelte';
	import Segmented from '$lib/experiments/ui/Segmented.svelte';
	import Switch from '$lib/experiments/ui/Switch.svelte';
	import { useAirflow } from '../experience.svelte';
	import type { LayerId, UnitSystem } from '../state';
	import { formatLength, sliderRange } from '../units';
	import { dockLegend } from '../viz/dockLegend';
	import {
		LAYER_OPTIONS,
		SENSITIVITY_SLIDER,
		UNIT_OPTIONS,
		describeLayer,
		describeSensitivity,
		describeSliceHeight,
		describeToggle,
		describeUnits,
		formatSensitivity,
		sensitivityFromSlider,
		sensitivityHint,
		sliceHeightFromSlider,
		sliderFromSensitivity,
		sliderFromSliceHeight,
		spokenSensitivity
	} from '../viz/viewControls';

	const experience = useAirflow();
	const view = $derived(experience.view);
	const height = $derived(sliderRange('sliceHeight', view.units));
	const heightText = $derived(formatLength(view.sliceHeight, view.units));

	/** The legend as it would draw `layer` at `sensitivity`. */
	const legendAt = (layer: LayerId, sensitivity: number) => dockLegend({ layer, sensitivity, units: view.units, reference: experience.setup.conditions.indoorTemp });
	/** The Layer's scale in words: what a change of Layer or sensitivity announces. */
	const scaleOf = (layer: LayerId, sensitivity: number) => legendAt(layer, sensitivity).description;
	/** The scale now, in a few words beside the slider that sets it, because the legend may be out of sight by then. */
	const scale = $derived(legendAt(view.layer, view.sensitivity).range);

	const chooseLayer = (layer: LayerId) => {
		experience.setView({ layer });
		experience.announce(describeLayer(scaleOf(layer, view.sensitivity)));
	};
	const chooseUnits = (units: UnitSystem) => {
		experience.setView({ units });
		experience.announce(describeUnits(units));
	};
	const setTopDown = (topDown: boolean) => {
		experience.setView({ topDown });
		experience.announce(describeToggle('Top-down view', topDown));
	};
	const setTracers = (tracers: boolean) => {
		experience.setView({ tracers });
		experience.announce(describeToggle('Tracers', tracers));
	};
	const setSlice = (slice: boolean) => {
		experience.setView({ slice });
		experience.announce(describeToggle('Slice', slice));
	};
</script>

<div class="dock-field view-layer">
	<Segmented legend="Layer" name="airflow-layer" value={view.layer} options={LAYER_OPTIONS} onchange={chooseLayer} />
	<p class="dock-notice">What the Slice shows. The legend above says what its colours mean.</p>
</div>

<div class="dock-field view-range">
	<RangeField
		id="airflow-sensitivity"
		label="Colour sensitivity"
		bind:value={() => sliderFromSensitivity(view.sensitivity), (position) => experience.setView({ sensitivity: sensitivityFromSlider(position) })}
		min={SENSITIVITY_SLIDER.min}
		max={SENSITIVITY_SLIDER.max}
		step={SENSITIVITY_SLIDER.step}
		display={formatSensitivity(view.sensitivity)}
		spoken={spokenSensitivity(view.sensitivity)}
		describe={(position) => {
			const sensitivity = sensitivityFromSlider(position);
			return describeSensitivity(view.layer, sensitivity, scaleOf(view.layer, sensitivity));
		}}
	/>
	<p class="dock-notice"><strong>Scale: {scale}.</strong> {sensitivityHint(view.layer)}</p>
</div>

<div class="dock-field view-range">
	<RangeField
		id="airflow-slice-height"
		label="Slice height"
		bind:value={() => sliderFromSliceHeight(view.sliceHeight, view.units), (position) => experience.setView({ sliceHeight: sliceHeightFromSlider(position, view.units) })}
		min={height.min}
		max={height.max}
		step={height.step}
		display={heightText.text}
		spoken={heightText.spoken}
		describe={(position) => describeSliceHeight(sliceHeightFromSlider(position, view.units), view.units)}
	/>
	<p class="dock-notice">The Slice is the flat plane the colours are drawn on, and where readings and Probes are taken. Move it to see the air nearer the floor or the ceiling.</p>
</div>

<div class="dock-field">
	<Switch checked={view.slice} onchange={setSlice} label="Slice" />
	<Switch checked={view.topDown} onchange={setTopDown} label="Top-down view" />
	<Switch checked={view.tracers} onchange={setTracers} label="Tracers" />
	<p class="dock-notice">The Slice is the coloured plane at the slice height; off, the air and smoke show through the whole room. Tracers are the little dots that drift with the air.</p>
</div>

<div class="dock-field view-units">
	<Segmented legend="Units" name="airflow-units" value={view.units} options={UNIT_OPTIONS} onchange={chooseUnits} />
	<p class="dock-notice">Speeds, lengths and temperatures follow this: mph, feet and °F, or m/s, metres and °C.</p>
</div>

<style>
	/* The shared slider is 40px tall, and the Dock asks for 44px to touch; its focus ring stands off it as far as the Dock's other controls'. */
	.view-range :global(input[type='range']) {
		height: 44px;
	}
	.view-range :global(input[type='range']:focus-visible) {
		outline-offset: 3px;
	}
</style>
