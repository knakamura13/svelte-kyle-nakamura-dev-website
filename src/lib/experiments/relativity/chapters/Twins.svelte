<script lang="ts">
	import { onMount } from 'svelte';
	import { formatBeta, formatGamma, formatYears } from '../format';
	import { prefersReducedMotion, useExperience } from '../experience.svelte';
	import { twinTrip, twinTripAt } from '../physics';
	import type { TwinTripParams, TwinTripReadout } from '../scenes/twinTrip';
	import Chapter from '../ui/Chapter.svelte';
	import PlayControls from '../ui/PlayControls.svelte';
	import RangeField from '../ui/RangeField.svelte';

	const experience = useExperience();
	const params: TwinTripParams = $state({
		distance: 8.6,
		beta: 0.9,
		destination: 'Sirius',
		progress: 0.72,
		playing: false,
		restart: 0
	});
	const readout: TwinTripReadout = $state({});

	const speeds = [0.5, 0.9, 0.99];
	const stars = [
		{ name: 'Proxima Centauri', ly: 4.2 },
		{ name: 'Sirius', ly: 8.6 },
		{ name: 'Tau Ceti', ly: 11.9 }
	];

	const trip = $derived(twinTrip(params.distance, params.beta));
	const now = $derived(twinTripAt(params.distance, params.beta, params.progress));

	const summary = () =>
		`A round trip to a star ${params.distance.toFixed(1)} light-years away at ${formatBeta(params.beta)} times the speed of light takes ${trip.earthYears.toFixed(1)} years on Earth and ${trip.travelerYears.toFixed(1)} years for the traveler.`;

	onMount(() => {
		if (!prefersReducedMotion()) {
			params.progress = 0;
			params.playing = true;
		}
	});
</script>

<Chapter
	id="twins"
	number={4}
	name="Twins"
	tint="lilac"
	scene="twinTrip"
	{params}
	{readout}
	label="Earth on the left, a star on the right, and a ship flying out and back at nearly the speed of light. Two bars on the floor show each twin’s age growing. The traveling twin’s bar grows more slowly, so the twins end up different ages."
	caption="A round trip to a star. The bars are each twin’s age; the red bracket is the difference."
	dockHeight={340}
	aspect="4 / 3"
>
	{#snippet heading()}The twin who<br />came back younger.{/snippet}
	{#snippet lede()}
		<p>
			Send one twin to a star and back at nearly the speed of light. When they return, the twin who stayed home is older.
		</p>
	{/snippet}
	{#snippet dock()}
		<div class="dock-pair">
			<div>
				<RangeField
					id="twins-distance"
					label="Distance to the star"
					bind:value={params.distance}
					min={1}
					max={20}
					step={0.1}
					display="{params.distance.toFixed(1)} ly"
					spoken="{params.distance.toFixed(1)} light-years"
					describe={summary}
					onuser={() => (params.destination = '')}
				/>
				<div class="chips" role="group" aria-label="Real stars">
					{#each stars as star (star.name)}
						<button
							type="button"
							class="chip"
							aria-pressed={params.destination === star.name}
							onclick={() => {
								params.distance = star.ly;
								params.destination = star.name;
								experience.announce(`${star.name}. ${summary()}`);
							}}>{star.name}</button
						>
					{/each}
				</div>
			</div>
			<div>
				<RangeField
					id="twins-speed"
					label="Cruising speed"
					bind:value={params.beta}
					min={0.1}
					max={0.99}
					step={0.01}
					display="{formatBeta(params.beta)} c"
					spoken="{formatBeta(params.beta)} times the speed of light, slowdown factor {formatGamma(trip.gamma)}"
					describe={summary}
				/>
				<div class="chips" role="group" aria-label="Speed presets">
					{#each speeds as speed (speed)}
						<button
							type="button"
							class="chip"
							aria-pressed={params.beta === speed}
							onclick={() => {
								params.beta = speed;
								experience.announce(summary());
							}}>{speed} c</button
						>
					{/each}
				</div>
			</div>
		</div>
		<div class="dock-scrub">
			<RangeField
				id="twins-progress"
				label="Trip progress"
				bind:value={params.progress}
				min={0}
				max={1}
				step={0.005}
				display="{Math.round(params.progress * 100)}%"
				spoken="{Math.round(params.progress * 100)} percent of the round trip. The stay-at-home twin is {formatYears(now.earthYears)} older and the traveling twin {formatYears(now.travelerYears)} older."
				onuser={() => (params.playing = false)}
			/>
			<PlayControls bind:playing={params.playing} restart={() => (params.restart += 1)} restartLabel="Start over" />
		</div>
		<dl class="readouts">
			<div data-tone="rest">
				<dt>Stay-at-home twin</dt>
				<dd>{now.earthYears.toFixed(1)} <small>years</small></dd>
			</div>
			<div data-tone="mover">
				<dt>Traveling twin</dt>
				<dd>{now.travelerYears.toFixed(1)} <small>years</small></dd>
			</div>
			<div>
				<dt>Road to the star, from the ship</dt>
				<dd>{trip.contractedLy.toFixed(1)} <small>ly</small></dd>
			</div>
		</dl>
	{/snippet}
	{#snippet body()}
		<p>
			The ship’s clock runs slow by the factor γ from the last chapter, so a trip that takes 2<i>d</i>/<i>v</i> years by
			Earth’s calendar takes only 2<i>d</i>/(γ<i>v</i>) aboard. At 0.9 <i>c</i>, a round trip to Sirius, 8.6 light-years
			away, takes 19.1 years on Earth and just 8.3 for the traveler.
		</p>
		<p>
			The traveler tells it differently. From the ship, the road ahead is squeezed to 1/γ of its length: Sirius is only 3.7
			light-years away, so the trip is shorter. Two explanations, one outcome.
		</p>
		<p>
			Why isn’t it symmetric, with each twin seeing the other age slowly? Because only one of them turns around. The
			traveler switches from a frame heading out to a frame heading home, and the stay-at-home twin never changes frame.
		</p>
		<p class="try">
			<strong>Try it.</strong> Drag the speed toward 0.99 <i>c</i> and watch the green bar fall behind. Drag the progress
			slider to check any moment of the trip.
		</p>
		<p>
			Clocks have made this trip too, at everyday speeds. In 1971 Hafele and Keating flew atomic clocks around the world on
			airliners and found them out of step with clocks on the ground, by tens to hundreds of nanoseconds, just as relativity
			predicted.
		</p>
	{/snippet}
</Chapter>
