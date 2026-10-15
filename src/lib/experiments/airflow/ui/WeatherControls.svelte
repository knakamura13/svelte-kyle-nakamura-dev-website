<script lang="ts">
	import RangeField from '$lib/experiments/ui/RangeField.svelte';
	import { useAirflow } from '../experience.svelte';
	import { describeBearing } from '../readout';
	import { describedBy } from './describedBy';
	import { WEATHER_NAMES, weatherAnnouncement, weatherField, windFromAnnouncement, windFromNote } from './weather';

	const experience = useAirflow();
	const conditions = $derived(experience.setup.conditions);
	const units = $derived(experience.view.units);
	const bearing = $derived(describeBearing(conditions.windFrom));
	const speed = $derived(weatherField('windSpeed', conditions.windSpeed, units));
	const outdoor = $derived(weatherField('outdoorTemp', conditions.outdoorTemp, units));
	const pm25 = $derived(weatherField('outdoorPm25', conditions.outdoorPm25, units));

	// A new starting temperature builds the indoor air again, and that clears the picture of the air each time. So the slider shows
	// the temperature as it moves, and the air starts over once the visitor lets go: a drag is one restart, not one per step.
	let draft: number | null = $state(null);
	const indoor = $derived(weatherField('indoorTemp', draft ?? conditions.indoorTemp, units));
	function startOver() {
		if (draft === null) return;
		const celsius = draft;
		draft = null;
		if (celsius !== conditions.indoorTemp) experience.setCondition('indoorTemp', celsius);
	}
</script>

<div class="dock-field weather-field" use:describedBy={'airflow-wind-from-note'}>
	<RangeField
		id="airflow-wind-from"
		label="Wind from"
		value={conditions.windFrom}
		min={0}
		max={360}
		step={5}
		display={bearing.text}
		spoken={bearing.spoken}
		describe={(degrees) => windFromAnnouncement(degrees, conditions.windSpeed)}
		onuser={(degrees) => experience.setCondition('windFrom', degrees)}
	/>
	<p class="dock-notice" id="airflow-wind-from-note">{windFromNote(conditions.windFrom, conditions.windSpeed)}</p>
</div>

<div class="dock-field weather-field" use:describedBy={'airflow-wind-speed-note'}>
	<RangeField
		id="airflow-wind-speed"
		label={WEATHER_NAMES.windSpeed}
		value={speed.value}
		min={speed.range.min}
		max={speed.range.max}
		step={speed.range.step}
		display={speed.display}
		spoken={speed.spoken}
		describe={(shown) => weatherAnnouncement('windSpeed', speed.range.fromDisplay(shown), units)}
		onuser={(shown) => experience.setCondition('windSpeed', speed.range.fromDisplay(shown))}
	/>
	<p class="dock-notice" id="airflow-wind-speed-note">As a weather report gives it, in the open and well above the ground. About half of it reaches the Home.</p>
</div>

<div class="dock-field weather-field" use:describedBy={'airflow-outdoor-temp-note'}>
	<RangeField
		id="airflow-outdoor-temp"
		label={WEATHER_NAMES.outdoorTemp}
		value={outdoor.value}
		min={outdoor.range.min}
		max={outdoor.range.max}
		step={outdoor.range.step}
		display={outdoor.display}
		spoken={outdoor.spoken}
		describe={(shown) => weatherAnnouncement('outdoorTemp', outdoor.range.fromDisplay(shown), units)}
		onuser={(shown) => experience.setCondition('outdoorTemp', outdoor.range.fromDisplay(shown))}
	/>
	<p class="dock-notice" id="airflow-outdoor-temp-note">How far it is from the indoor temperature sets how hard warm air rises and cold air sinks through open Openings.</p>
</div>

<!-- `change` fires when the visitor lets go of the slider, or at each press of a key, and bubbles up from the range input. (Not `focusout`: Safari fires it when a drag begins on a slider that has focus.) -->
<div class="dock-field weather-field" use:describedBy={'airflow-indoor-temp-note'} onchange={startOver}>
	<RangeField
		id="airflow-indoor-temp"
		label={WEATHER_NAMES.indoorTemp}
		value={indoor.value}
		min={indoor.range.min}
		max={indoor.range.max}
		step={indoor.range.step}
		display={indoor.display}
		spoken={indoor.spoken}
		describe={(shown) => weatherAnnouncement('indoorTemp', indoor.range.fromDisplay(shown), units)}
		onuser={(shown) => (draft = indoor.range.fromDisplay(shown))}
	/>
	<p class="dock-notice" id="airflow-indoor-temp-note">The temperature the air indoors starts at. Changing it starts the air over at that temperature.</p>
</div>

<div class="dock-field weather-field" use:describedBy={'airflow-outdoor-pm25-note'}>
	<RangeField
		id="airflow-outdoor-pm25"
		label={WEATHER_NAMES.outdoorPm25}
		value={pm25.value}
		min={pm25.range.min}
		max={pm25.range.max}
		step={pm25.range.step}
		display={pm25.display}
		spoken={pm25.spoken}
		describe={(shown) => weatherAnnouncement('outdoorPm25', pm25.range.fromDisplay(shown), units)}
		onuser={(shown) => experience.setCondition('outdoorPm25', pm25.range.fromDisplay(shown))}
	/>
	<p class="dock-notice" id="airflow-outdoor-pm25-note">Fine particles in the outdoor air, which come in through open Openings. Zero is clean air.</p>
</div>

<style>
	/* The shared slider is 40px tall; a finger wants 44. The ring stands off it by 3px, as every Dock control's does. */
	.weather-field :global(input[type='range']) {
		height: 44px;
	}
	.weather-field :global(input[type='range']:focus-visible) {
		outline-offset: 3px;
	}
</style>
