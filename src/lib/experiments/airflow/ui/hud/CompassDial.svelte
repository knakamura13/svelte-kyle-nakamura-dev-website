<script lang="ts">
	import { bearingFromPointer, dialPoint, snapBearing, stepBearing, windWords } from './compass';

	/**
	 * The weather widget's compass dial: the wind's direction as a handle on the rim (where it blows from) and an arrow across the dial
	 * (where it goes). A slider to the keyboard and to a screen reader: the arrow keys turn it, Page Up and Page Down a compass point,
	 * Home north. A pointer drags the handle round. North turns with the camera (`rotation`), so the arrow points the way the air moves
	 * on screen.
	 */
	let {
		bearing,
		speed,
		rotation = 0,
		size = 120,
		label = 'Wind direction',
		compact = false,
		onchange,
		oncommit
	}: {
		/** Where the wind blows from, degrees clockwise from north. */
		bearing: number;
		/** The wind's speed, m/s: a calm wind draws its arrow faint. */
		speed: number;
		/** North drawn this many degrees clockwise from the top. */
		rotation?: number;
		size?: number;
		label?: string;
		/** A small dial: the four cardinal ticks and N only, so it stays clean at 44 to 60 px. */
		compact?: boolean;
		onchange: (bearing: number) => void;
		/** Once a drag ends or a key is let go: for the announcement. */
		oncommit?: (bearing: number) => void;
	} = $props();

	const uid = $props.id();
	const R = 50;
	const calm = $derived(!(speed > 0));
	const words = $derived(windWords(bearing, speed));
	const handle = $derived(dialPoint(bearing, R - 9, rotation));
	const tail = $derived(dialPoint(bearing, R - 20, rotation));
	const head = $derived(dialPoint(bearing + 180, R - 16, rotation));
	const ticks = $derived(compact ? [0, 90, 180, 270] : Array.from({ length: 24 }, (_, i) => i * 15));
	const LETTERS = [
		{ name: 'N', at: 0 },
		{ name: 'E', at: 90 },
		{ name: 'S', at: 180 },
		{ name: 'W', at: 270 }
	];

	let dial: SVGSVGElement | undefined = $state();
	let dragging = $state(false);

	function bearingAt(event: PointerEvent) {
		const box = dial!.getBoundingClientRect();
		const b = bearingFromPointer(event.clientX - (box.left + box.width / 2), event.clientY - (box.top + box.height / 2), rotation);
		return b === null ? null : snapBearing(b);
	}

	function down(event: PointerEvent) {
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		dragging = true;
		(event.currentTarget as Element).setPointerCapture(event.pointerId);
		const b = bearingAt(event);
		if (b !== null && b !== bearing) onchange(b);
		event.preventDefault();
	}

	function move(event: PointerEvent) {
		if (!dragging) return;
		const b = bearingAt(event);
		if (b !== null && b !== bearing) onchange(b);
	}

	function up() {
		if (!dragging) return;
		dragging = false;
		oncommit?.(bearing);
	}

	function keydown(event: KeyboardEvent) {
		const next = stepBearing(bearing, event.key, event.shiftKey);
		if (next === null) return;
		event.preventDefault();
		if (next !== bearing) onchange(next);
	}

	function keyup(event: KeyboardEvent) {
		if (stepBearing(bearing, event.key) !== null) oncommit?.(bearing);
	}
</script>

<svg
	class="dial"
	class:dragging
	class:calm
	class:compact
	bind:this={dial}
	width={size}
	height={size}
	viewBox="-56 -56 112 112"
	role="slider"
	tabindex="0"
	aria-label={label}
	aria-valuemin={0}
	aria-valuemax={359}
	aria-valuenow={Math.round(bearing) % 360}
	aria-valuetext={words.spoken}
	onpointerdown={down}
	onpointermove={move}
	onpointerup={up}
	onpointercancel={up}
	onkeydown={keydown}
	onkeyup={keyup}
>
	<defs>
		<radialGradient id="{uid}-face" cx="50%" cy="38%" r="70%">
			<stop offset="0%" stop-color="#2f3e37" />
			<stop offset="100%" stop-color="#141c18" />
		</radialGradient>
	</defs>
	<circle class="face" r={R} fill="url(#{uid}-face)" />
	<circle class="rim" r={R - 0.5} />
	<g class="ticks">
		{#each ticks as at (at)}
			{@const outer = dialPoint(at, R - 3, rotation)}
			{@const inner = dialPoint(at, at % 90 === 0 ? R - 10 : at % 45 === 0 ? R - 8 : R - 6, rotation)}
			<line x1={outer.x} y1={outer.y} x2={inner.x} y2={inner.y} class:major={at % 45 === 0} />
		{/each}
	</g>
	{#each compact ? LETTERS.slice(0, 1) : LETTERS as letter (letter.name)}
		{@const p = dialPoint(letter.at, R - 17, rotation)}
		<text x={p.x} y={p.y} class="letter" class:north={letter.name === 'N'} text-anchor="middle" dominant-baseline="central">{letter.name}</text>
	{/each}
	<!-- The air's path: from the handle on the rim, across the middle, to the arrowhead where it goes. -->
	<line class="shaft" x1={tail.x} y1={tail.y} x2={head.x} y2={head.y} />
	<g transform="translate({head.x} {head.y}) rotate({bearing + 180 + rotation})">
		<path class="arrowhead" d="M0 -7 L6 5 L0 2 L-6 5 Z" />
	</g>
	<circle class="handle-halo" cx={handle.x} cy={handle.y} r="9" />
	<circle class="handle" cx={handle.x} cy={handle.y} r="5.5" />
</svg>

<style>
	.dial {
		display: block;
		flex: none;
		border-radius: 50%;
		cursor: grab;
		touch-action: none;
		user-select: none;
	}
	.dial.dragging {
		cursor: grabbing;
	}
	.dial:focus-visible {
		outline: 2px solid var(--hud-accent);
		outline-offset: 3px;
	}
	.face {
		stroke: none;
	}
	.rim {
		fill: none;
		stroke: rgb(255 255 255 / 0.16);
		stroke-width: 1;
	}
	.ticks line {
		stroke: rgb(255 255 255 / 0.28);
		stroke-width: 1;
		stroke-linecap: round;
	}
	.ticks line.major {
		stroke: rgb(255 255 255 / 0.55);
		stroke-width: 1.4;
	}
	.letter {
		fill: var(--hud-muted);
		font-size: 9px;
		font-weight: 800;
		letter-spacing: 0.02em;
	}
	.letter.north {
		fill: var(--hud-accent);
	}
	.shaft {
		stroke: #fff;
		stroke-width: 2.6;
		stroke-linecap: round;
		transition: opacity 200ms;
	}
	.arrowhead {
		fill: #fff;
	}
	.handle-halo {
		fill: rgb(95 213 154 / 0.25);
	}
	.handle {
		fill: var(--hud-accent);
		stroke: #fff;
		stroke-width: 1.6;
	}
	.compact .letter {
		font-size: 13px;
	}
	.compact .shaft {
		stroke-width: 3.6;
	}
	.compact .ticks line {
		stroke-width: 2;
	}
	.calm .shaft,
	.calm .arrowhead {
		opacity: 0.35;
	}
	.calm .shaft {
		stroke-dasharray: 3 4;
	}
</style>
