<script lang="ts">
	import { useExperience } from '../experience.svelte';

	let {
		id,
		label,
		value = $bindable(),
		min,
		max,
		step,
		display,
		spoken,
		describe,
		onuser
	}: {
		id: string;
		label: string;
		value: number;
		min: number;
		max: number;
		step: number;
		/** The value as shown beside the label. */
		display: string;
		/** The value as a screen reader should say it. Defaults to `display`. */
		spoken?: string;
		/** What to announce, politely, once the visitor stops moving the slider. */
		describe?: (value: number) => string;
		/** Called when the visitor moves the slider, but not when the value is set from code. */
		onuser?: (value: number) => void;
	} = $props();

	const experience = useExperience();
	const fill = $derived(`${((value - min) / (max - min)) * 100}%`);
</script>

<div class="field">
	<div class="field-head">
		<label for={id}>{label}</label>
		<span class="field-value" aria-hidden="true">{display}</span>
	</div>
	<input
		{id}
		type="range"
		{min}
		{max}
		{step}
		bind:value
		aria-valuetext={spoken ?? display}
		style:--fill={fill}
		oninput={(event) => {
			const next = event.currentTarget.valueAsNumber;
			onuser?.(next);
			if (describe) experience.announce(describe(next));
		}}
	/>
</div>
