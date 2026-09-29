<script lang="ts">
	import { onMount } from 'svelte';
	import { prefersReducedMotion, useExperience } from '../experience.svelte';
	import type { FramesParams, FramesReadout } from '../scenes/frames';
	import Chapter from '../ui/Chapter.svelte';
	import PlayControls from '../ui/PlayControls.svelte';
	import RangeField from '../ui/RangeField.svelte';
	import Segmented from '../ui/Segmented.svelte';

	const experience = useExperience();
	const params: FramesParams = $state({ view: 'platform', speed: 8, playing: false, restart: 0 });
	const readout: FramesReadout = $state({});

	const kmh = (speed: number) => Math.round(speed * 3.6);
	const describe = (speed: number) =>
		speed === 0
			? 'The train is standing still, so both views agree.'
			: `The train moves at ${speed} metres per second. Seen from the platform, the ball also moves sideways at ${speed} metres per second.`;

	onMount(() => {
		params.playing = !prefersReducedMotion();
	});
</script>

<Chapter
	id="frames"
	number={1}
	name="Frames"
	tint="sage"
	scene="frames"
	{params}
	{readout}
	label="A train passes a platform. A passenger tosses a ball straight up. From the train the ball goes straight up and down; from the platform it follows a curved arc."
	caption="A ball tossed in a passing train, in slow motion. The path is drawn as seen from whichever frame you choose."
>
	{#snippet heading()}Nobody is<br />standing still.{/snippet}
	{#snippet lede()}
		<p>
			Toss a ball straight up in a moving train and it drops straight back into your hand. To someone on the platform, the
			same ball traces an arc.
		</p>
	{/snippet}
	{#snippet dock()}
		<Segmented
			legend="Watch from"
			name="frames-view"
			bind:value={params.view}
			options={[
				{ value: 'train', label: 'The train' },
				{ value: 'platform', label: 'The platform' }
			]}
		/>
		<RangeField
			id="frames-speed"
			label="Train speed"
			bind:value={params.speed}
			min={0}
			max={10}
			step={0.5}
			display="{params.speed} m/s"
			spoken="{params.speed} metres per second, {kmh(params.speed)} kilometres per hour"
			{describe}
		/>
		<dl class="readouts">
			<div data-tone="mover">
				<dt>Sideways speed, train</dt>
				<dd>0 <small>m/s</small></dd>
			</div>
			<div data-tone="rest">
				<dt>Sideways speed, platform</dt>
				<dd>{params.speed} <small>m/s</small></dd>
			</div>
			<div>
				<dt>Gravity, both</dt>
				<dd>9.8 <small>m/s²</small></dd>
			</div>
		</dl>
		<div class="dock-actions">
			<PlayControls bind:playing={params.playing} restart={() => (params.restart += 1)} restartLabel="Toss again" />
		</div>
	{/snippet}
	{#snippet body()}
		<p>
			Both descriptions are correct. The ball’s path depends on who is watching, and nothing you do inside the train can
			tell you whether it is moving or parked. Galileo made this argument about a ship’s cabin in 1632.
		</p>
		<p>
			That is the <strong>principle of relativity</strong>: the laws of physics are the same for everyone who moves at a
			steady speed. There is no special state of “at rest”, only motion relative to something else.
		</p>
		<p class="try">
			<strong>Try it.</strong> Set the speed to zero and switch views: they agree. Raise the speed and switch again. Only the
			path changes, never the physics.
		</p>
		<p>For centuries that settled it. Then came light.</p>
	{/snippet}
</Chapter>
