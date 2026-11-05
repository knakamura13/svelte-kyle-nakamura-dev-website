<script lang="ts">
	import { onMount } from 'svelte';
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
	// The number rendered into the server HTML. A change before hydration updates the
	// control and is not replayed as an input event, so capture it before bind:value adopts it.
	const rendered = value;

	onMount(() => {
		const field = document.getElementById(id);
		const current = field instanceof HTMLInputElement ? field.valueAsNumber : NaN;
		// Ignore the browser snapping an off-step value. A real change moves by at least one step.
		if (describe && !Number.isNaN(current) && Math.abs(current - rendered) > step / 2) {
			// The bound value is not always what the chapter announces. The muon slider
			// binds a position, and this callback is the only write of its speed.
			onuser?.(current);
			experience.announce(describe(current));
		}
	});
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
