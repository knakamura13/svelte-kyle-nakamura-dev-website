<script lang="ts">
	/** A slider for the HUD's dark glass: its name and value on one line, the track under them. The value is said as `spoken`. */
	let {
		label,
		value,
		min,
		max,
		step,
		display,
		spoken,
		note = '',
		oninput
	}: {
		label: string;
		value: number;
		min: number;
		max: number;
		step: number;
		display: string;
		spoken?: string;
		/** A line under the slider. */
		note?: string;
		oninput: (value: number) => void;
	} = $props();

	const fill = $derived(`${max > min ? ((value - min) / (max - min)) * 100 : 0}%`);
</script>

<label class="range">
	<span class="head"><span class="name">{label}</span><span class="value" aria-hidden="true">{display}</span></span>
	<input class="slider" type="range" {min} {max} {step} {value} aria-valuetext={spoken ?? display} style:--fill={fill} oninput={(event) => oninput(event.currentTarget.valueAsNumber)} />
	{#if note}<span class="note">{note}</span>{/if}
</label>

<style>
	.range {
		display: grid;
		gap: 2px;
	}
	.head {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		font-size: 12.5px;
	}
	.name {
		color: var(--hud-muted);
		font-weight: 650;
	}
	.value {
		font-weight: 750;
		white-space: nowrap;
	}
	.note {
		color: var(--hud-dim);
		font-size: 11.5px;
		line-height: 1.45;
	}
</style>
