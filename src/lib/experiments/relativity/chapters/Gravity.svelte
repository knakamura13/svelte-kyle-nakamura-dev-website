<script lang="ts">
	import { onMount } from 'svelte';
	import { prefersReducedMotion, useExperience } from '../experience.svelte';
	import { gravityRate } from '../physics';
	import type { GravityParams, GravityReadout } from '../scenes/gravity';
	import Chapter from '../ui/Chapter.svelte';
	import PlayControls from '../ui/PlayControls.svelte';
	import RangeField from '../ui/RangeField.svelte';

	const experience = useExperience();
	const params: GravityParams = $state({ radius: 3, playing: false, restart: 0 });
	const readout: GravityReadout = $state({ farTicks: 0, probeTicks: 0 });
	const presets = [
		{ label: 'Far away', radius: 12 },
		{ label: 'Close', radius: 3 },
		{ label: 'Near the horizon', radius: 1.1 }
	];
	const rate = $derived(gravityRate(params.radius));

	const describe = (radius: number) =>
		`At ${radius.toFixed(2)} Schwarzschild radii, the probe clock ticks ${gravityRate(radius).toFixed(2)} times as fast as the far clock.`;

	onMount(() => {
		params.playing = !prefersReducedMotion();
	});
</script>

<Chapter
	id="gravity"
	number={6}
	name="Gravity"
	tint="butter"
	scene="gravity"
	{params}
	{readout}
	label="A stretched sheet with a deep well around a dark mass, a common picture of curved spacetime. A green probe clock sits on the slope of the well and a blue reference clock stands on flat ground outside it. The deeper the probe, the more slowly its hand turns."
	caption="A picture of curved spacetime: the sheet dips around a mass. The green clock sits in the well; the blue one stands far outside it."
	dockHeight={300}
	aspect="5 / 4"
>
	{#snippet heading()}Gravity slows<br />clocks too.{/snippet}
	{#snippet lede()}
		<p>
			Speed isn’t the only thing that changes a clock’s pace. General relativity adds a second way: put the clock deeper in a
			gravitational field.
		</p>
	{/snippet}
	{#snippet dock()}
		<RangeField
			id="gravity-radius"
			label="Distance from the mass, in Schwarzschild radii"
			bind:value={params.radius}
			min={1.05}
			max={12}
			step={0.05}
			display={params.radius.toFixed(2)}
			spoken="{params.radius.toFixed(2)} Schwarzschild radii, so the clock runs at {rate.toFixed(2)} of the far clock’s pace"
			{describe}
		/>
		<div class="chips" role="group" aria-label="Distance presets">
			{#each presets as preset (preset.radius)}
				<button
					type="button"
					class="chip"
					aria-pressed={params.radius === preset.radius}
					onclick={() => {
						params.radius = preset.radius;
						experience.announce(describe(preset.radius));
					}}>{preset.label}</button
				>
			{/each}
		</div>
		<dl class="readouts">
			<div data-tone="mover">
				<dt>Pace vs far clock</dt>
				<dd>{rate.toFixed(2)}<small>×</small></dd>
			</div>
			<div data-tone="rest">
				<dt>Far clock</dt>
				<dd>{readout.farTicks} <small>{readout.farTicks === 1 ? 'tick' : 'ticks'}</small></dd>
			</div>
			<div data-tone="mover">
				<dt>Probe clock</dt>
				<dd>{readout.probeTicks} <small>{readout.probeTicks === 1 ? 'tick' : 'ticks'}</small></dd>
			</div>
		</dl>
		<div class="dock-actions">
			<PlayControls bind:playing={params.playing} restart={() => (params.restart += 1)} />
		</div>
	{/snippet}
	{#snippet body()}
		<p>
			Einstein’s general theory of relativity, published in 1915, describes gravity as the curving of space and time by
			mass. The sheet in the scene is the familiar picture of that curve, an analogy rather than a literal surface. A clock
			deeper in the well ticks more slowly than one far outside it.
		</p>
		<p class="formula" role="math" aria-label="clock rate equals the square root of one minus r sub s over r">
			rate = √(1 − <i>r</i><sub>s</sub>/<i>r</i>)
		</p>
		<p>
			Here <i>r</i> is the distance from the mass and <i>r</i><sub>s</sub> = 2<i>GM</i>/<i>c</i>² is its Schwarzschild radius:
			about 3 kilometres for the Sun and 9 millimetres for Earth. At <i>r</i> = <i>r</i><sub>s</sub>, the horizon of a black
			hole, the rate reaches zero.
		</p>
		<p class="try">
			<strong>Try it.</strong> Slide the probe from 12 down to 1.1 Schwarzschild radii and watch its hand slow. Near the
			horizon it ticks at less than a third of the far clock’s pace.
		</p>
		<p>
			On Earth the effect is tiny but real. A clock on the ground runs slow by about 7 parts in ten billion compared with one
			far away, roughly 22 milliseconds a year. In 2010, physicists at NIST compared two atomic clocks and measured the
			difference made by raising one of them just 33 centimetres.
		</p>
		<p>
			Your phone depends on it. GPS satellites orbit about 20,200 kilometres up, where gravity is weaker, so their clocks gain
			about 46 microseconds a day. Their speed makes them lose about 7. The net gain, roughly 38 microseconds a day, would
			put positions off by about 11 kilometres every day if the system did not correct for it.
		</p>
	{/snippet}
</Chapter>
