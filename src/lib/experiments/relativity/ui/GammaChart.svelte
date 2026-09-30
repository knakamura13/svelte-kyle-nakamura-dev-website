<script lang="ts">
	import { formatBeta, formatGamma } from '../format';
	import { gamma } from '../physics';

	let {
		beta,
		max,
		onpick
	}: {
		/** The speed the Dock is set to, as a fraction of c. */
		beta: number;
		/** The fastest speed the Dock allows. */
		max: number;
		/** Called with a speed when the visitor clicks, taps, or drags across the graph. */
		onpick: (beta: number) => void;
	} = $props();

	const HEIGHT = 250;
	const MARGIN = { top: 14, right: 16, bottom: 44, left: 40 };
	/** The graph stops here; the curve keeps climbing off the top. */
	const TOP = 10;
	/** The speed at which the slowdown reaches TOP. */
	const LIMIT = Math.sqrt(1 - 1 / (TOP * TOP));
	const yTicks = [1, 2, 4, 6, 8, 10];
	const xTicks = [0, 0.25, 0.5, 0.75, 1];
	const table = [0.1, 0.5, 0.8, 0.9, 0.95, 0.99, 0.999];

	let width = $state(520);
	let hovered = $state<number | null>(null);
	let dragging = false;

	const plotWidth = $derived(width - MARGIN.left - MARGIN.right);
	const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
	const px = (speed: number) => MARGIN.left + speed * plotWidth;
	const py = (slowdown: number) => MARGIN.top + (1 - (slowdown - 1) / (TOP - 1)) * plotHeight;

	// Denser toward the right, where the curve turns steeply upward.
	const line = $derived(
		Array.from({ length: 121 }, (_, i) => {
			const speed = LIMIT * Math.sin((i / 120) * (Math.PI / 2));
			return `${i === 0 ? 'M' : 'L'}${px(speed).toFixed(1)} ${py(gamma(speed)).toFixed(1)}`;
		}).join('')
	);

	const now = $derived({ x: px(beta), y: py(gamma(beta)), g: gamma(beta) });
	const peek = $derived(hovered === null ? null : { x: px(hovered), y: py(gamma(hovered)), g: gamma(hovered), speed: hovered });
	const labelOnLeft = $derived(now.x > MARGIN.left + plotWidth * 0.55);

	function speedAt(event: PointerEvent) {
		const box = (event.currentTarget as SVGElement).getBoundingClientRect();
		const speed = (event.clientX - box.left - MARGIN.left) / plotWidth;
		return Math.min(Math.max(speed, 0), LIMIT);
	}

	const pick = (speed: number) => onpick(Math.min(max, Math.round(speed * 100) / 100));

	function down(event: PointerEvent) {
		dragging = true;
		(event.currentTarget as SVGElement).setPointerCapture?.(event.pointerId);
		pick(speedAt(event));
	}

	function move(event: PointerEvent) {
		hovered = event.pointerType === 'mouse' ? Math.round(speedAt(event) * 100) / 100 : null;
		if (dragging) pick(speedAt(event));
	}

	const up = () => (dragging = false);
	const leave = () => (hovered = null);
</script>

<figure class="chart" bind:clientWidth={width}>
	<figcaption class="chart-title">How much slower a moving clock ticks, by speed</figcaption>
	<div class="chart-plot">
		<svg
			{width}
			height={HEIGHT}
			role="img"
			aria-label="Graph of the slowdown factor gamma against speed. It starts at 1, rises slowly, then climbs steeply as speed nears the speed of light. At {formatBeta(beta)} times the speed of light, gamma is {formatGamma(now.g)}."
		>
			{#each yTicks as tick (tick)}
				<line class="chart-grid" x1={MARGIN.left} x2={width - MARGIN.right} y1={py(tick)} y2={py(tick)} />
				<text aria-hidden="true" x={MARGIN.left - 9} y={py(tick) + 4} text-anchor="end">{tick}</text>
			{/each}
			{#each xTicks as tick (tick)}
				<text aria-hidden="true" x={px(tick)} y={HEIGHT - MARGIN.bottom + 18} text-anchor={tick === 0 ? 'start' : tick === 1 ? 'end' : 'middle'}>{tick === 1 ? '1 c' : tick}</text>
			{/each}
			<text aria-hidden="true" x={MARGIN.left + plotWidth / 2} y={HEIGHT - 6} text-anchor="middle">Speed, as a fraction of c</text>
			<text aria-hidden="true" x={px(0.93)} y={MARGIN.top + 12} text-anchor="end">keeps climbing toward c</text>

			<path class="chart-line" d={line} />
			<line class="chart-guide" x1={now.x} x2={now.x} y1={now.y} y2={py(1)} />
			<line class="chart-guide" x1={MARGIN.left} x2={now.x} y1={now.y} y2={now.y} />
			<circle class="chart-ring" cx={now.x} cy={now.y} r="8" />
			<circle class="chart-dot" cx={now.x} cy={now.y} r="6" />
			<text aria-hidden="true"
				class="chart-value"
				x={now.x + (labelOnLeft ? -14 : 14)}
				y={now.y - 12}
				text-anchor={labelOnLeft ? 'end' : 'start'}>γ = {formatGamma(now.g)}</text
			>

			{#if peek}
				<line class="chart-cross" x1={peek.x} x2={peek.x} y1={MARGIN.top} y2={py(1)} />
				<circle class="chart-ring" cx={peek.x} cy={peek.y} r="7" />
				<circle class="chart-dot" cx={peek.x} cy={peek.y} r="5" />
			{/if}
			<!-- Pointer-only enhancement: the speed slider above the graph does the same job from the keyboard. -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<rect
				class="chart-hit"
				x="0"
				y="0"
				{width}
				height={HEIGHT - MARGIN.bottom + 8}
				fill="transparent"
				onpointerdown={down}
				onpointermove={move}
				onpointerup={up}
				onpointercancel={up}
				onpointerleave={leave}
			/>
		</svg>
		{#if peek}
			<div class="chart-tip" style:left="{Math.min(Math.max(peek.x, 62), width - 62)}px" style:top="{peek.y - 14}px">
				<strong>{formatGamma(peek.g)}× slower</strong>
				<span>at {formatBeta(peek.speed)} c</span>
			</div>
		{/if}
	</div>
	<details class="chart-table">
		<summary>Show the numbers</summary>
		<table>
			<thead>
				<tr>
					<th scope="col">Speed</th>
					<th scope="col">Slowdown, γ</th>
					<th scope="col">Moving-clock ticks per 10 stationary</th>
				</tr>
			</thead>
			<tbody>
				{#each table as speed (speed)}
					<tr>
						<th scope="row">{formatBeta(speed)} c</th>
						<td>{formatGamma(gamma(speed))}</td>
						<td>{(10 / gamma(speed)).toFixed(2)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</details>
</figure>
