<script lang="ts" module>
	/** One stroke of an icon on a 24 px grid: a path, filled instead of stroked when `fill` is set, turned by `rotate` degrees about the middle. */
	type Stroke = { d: string; fill?: boolean; rotate?: number } | { circle: [number, number, number]; fill?: boolean };

	const BLADE = 'M12 10.2c-.4-2.9.7-5.6 3-6 2-.4 3 1.7 1.6 3.3-1.1 1.3-2.6 2-4.6 2.7z';

	/**
	 * The HUD's icons, drawn for it: a 1.8 px line on a 24 px grid with round ends, so they read as one family at 20 to 24 px. Inline SVG,
	 * so nothing is downloaded and every icon takes `currentColor`.
	 */
	const ICONS = {
		exit: [{ d: 'M19 12H5.5' }, { d: 'M11 6l-6 6 6 6' }],
		home: [{ d: 'M4 11l8-6.5 8 6.5' }, { d: 'M6 9.6V19.5h12V9.6' }, { d: 'M10 19.5v-5h4v5' }],
		scenario: [{ d: 'M11 3.5l1.7 4.6 4.6 1.7-4.6 1.7L11 16.1l-1.7-4.6-4.6-1.7 4.6-1.7z' }, { d: 'M18 14.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z' }],
		'chevron-down': [{ d: 'M7 10l5 5 5-5' }],
		'chevron-right': [{ d: 'M10 7l5 5-5 5' }],
		'chevron-left': [{ d: 'M14 7l-5 5 5 5' }],
		select: [{ d: 'M6 4.5l12.5 6-5.6 1.8-2.2 5.8z' }, { d: 'M13.2 12.6l4.3 4.4' }],
		build: [{ d: 'M12 3.2l7.8 4.4v8.8L12 20.8l-7.8-4.4V7.6z' }, { d: 'M12 12l7.6-4.3' }, { d: 'M12 12v8.6' }, { d: 'M12 12L4.4 7.7' }],
		probe: [{ d: 'M12 21s-6.4-5.6-6.4-11a6.4 6.4 0 0 1 12.8 0c0 5.4-6.4 11-6.4 11z' }, { circle: [12, 9.9, 2.3] }],
		smoke: [{ d: 'M12 21.5V15.5' }, { d: 'M9.5 21.5h5' }, { d: 'M12 13c-2.3-1.5-2.3-3.5 0-5s2.3-3.5 0-5' }, { d: 'M16.4 12.2c-1.6-1-1.6-2.4 0-3.4' }, { d: 'M7.6 12.2c1.6-1 1.6-2.4 0-3.4' }],
		pause: [{ d: 'M8 5h1.6a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM14.4 5H16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-1.6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z', fill: true }],
		play: [{ d: 'M8 5.6v12.8a.9.9 0 0 0 1.4.8l10-6.4a.9.9 0 0 0 0-1.6l-10-6.4A.9.9 0 0 0 8 5.6z', fill: true }],
		'speed-1': [{ d: 'M9.5 7.4v9.2a.6.6 0 0 0 .9.5l6.6-4.6a.6.6 0 0 0 0-1l-6.6-4.6a.6.6 0 0 0-.9.5z', fill: true }],
		'speed-5': [{ d: 'M5 7.4v9.2a.6.6 0 0 0 .9.5l6-4.6a.6.6 0 0 0 0-1l-6-4.6a.6.6 0 0 0-.9.5zM12.6 7.4v9.2a.6.6 0 0 0 .9.5l6-4.6a.6.6 0 0 0 0-1l-6-4.6a.6.6 0 0 0-.9.5z', fill: true }],
		'speed-20': [
			{
				d: 'M2.6 8v8a.5.5 0 0 0 .8.4l4.7-4a.5.5 0 0 0 0-.8l-4.7-4a.5.5 0 0 0-.8.4zM9.3 8v8a.5.5 0 0 0 .8.4l4.7-4a.5.5 0 0 0 0-.8l-4.7-4a.5.5 0 0 0-.8.4zM16 8v8a.5.5 0 0 0 .8.4l4.7-4a.5.5 0 0 0 0-.8l-4.7-4a.5.5 0 0 0-.8.4z',
				fill: true
			}
		],
		'overlay-off': [{ d: 'M4 4l16 16' }, { d: 'M10.4 6.2A9 9 0 0 1 12 6c5.4 0 9 6 9 6a15 15 0 0 1-2.7 3.3' }, { d: 'M6.6 7.6C4.3 9.2 3 12 3 12s3.6 6 9 6a8.6 8.6 0 0 0 4.1-1' }, { d: 'M9.9 9.9a3 3 0 0 0 4.2 4.2' }],
		'overlay-speed': [{ d: 'M3 9h10.5A2.5 2.5 0 1 0 11 6.5' }, { d: 'M3 13h15a2.5 2.5 0 1 1-2.5 2.5' }, { d: 'M3 17h7' }],
		'overlay-temperature': [{ d: 'M10 14.3V5.6a2 2 0 1 1 4 0v8.7a4 4 0 1 1-4 0z' }, { d: 'M12 10v6.4' }],
		'overlay-smoke': [{ d: 'M7.2 17h9.6a3.8 3.8 0 0 0 .5-7.6 5.2 5.2 0 0 0-10 1.2A3.2 3.2 0 0 0 7.2 17z' }, { circle: [7, 20.5, 1], fill: true }, { circle: [12, 21, 1], fill: true }, { circle: [17, 20.5, 1], fill: true }],
		'walls-up': [{ d: 'M3.5 16.5L12 20.5l8.5-4' }, { d: 'M3.5 16.5L12 12.5l8.5 4' }, { d: 'M3.5 16.5V7.5L12 3.5l8.5 4v9' }, { d: 'M12 3.5v9' }],
		'walls-cutaway': [{ d: 'M3.5 16.5L12 20.5l8.5-4' }, { d: 'M3.5 16.5L12 12.5l8.5 4' }, { d: 'M3.5 16.5V7.5L12 3.5v9' }, { d: 'M12 9.5l8.5 4v3' }],
		'walls-down': [{ d: 'M3.5 16.5L12 20.5l8.5-4' }, { d: 'M3.5 16.5L12 12.5l8.5 4' }, { d: 'M3.5 16.5v-3L12 9.5l8.5 4v3' }, { d: 'M12 9.5v3' }],
		info: [{ circle: [12, 12, 8.8] }, { d: 'M12 11v5.4' }, { circle: [12, 7.9, 1.05], fill: true }],
		settings: [{ d: 'M4 7.5h8.5M16.5 7.5H20M4 16.5h3.5M11.5 16.5H20' }, { circle: [14.5, 7.5, 2] }, { circle: [9.5, 16.5, 2] }],
		close: [{ d: 'M7 7l10 10M17 7L7 17' }],
		link: [{ d: 'M10.2 13.8a4 4 0 0 0 5.6 0l2.6-2.6a4 4 0 0 0-5.6-5.6l-.9.9' }, { d: 'M13.8 10.2a4 4 0 0 0-5.6 0l-2.6 2.6a4 4 0 0 0 5.6 5.6l.9-.9' }],
		restart: [{ d: 'M4.6 12a7.4 7.4 0 1 0 2.2-5.3' }, { d: 'M4.4 4.6v4.2h4.2' }],
		reset: [{ d: 'M9 6.5L5 10.5l4 4' }, { d: 'M5 10.5h9.5a4.5 4.5 0 0 1 0 9H12' }],
		'turn-left': [{ d: 'M5 13a7 7 0 1 0 2.4-5.3' }, { d: 'M5.2 4.2v4.3h4.3' }],
		'turn-right': [{ d: 'M19 13a7 7 0 1 1-2.4-5.3' }, { d: 'M18.8 4.2v4.3h-4.3' }],
		move: [{ d: 'M12 3.5v17M3.5 12h17' }, { d: 'M9.3 6.2L12 3.5l2.7 2.7M9.3 17.8l2.7 2.7 2.7-2.7M6.2 9.3L3.5 12l2.7 2.7M17.8 9.3l2.7 2.7-2.7 2.7' }],
		remove: [{ d: 'M4.5 7h15' }, { d: 'M9.5 7V4.6h5V7' }, { d: 'M6.6 7l.9 12.1a1 1 0 0 0 1 .9h7a1 1 0 0 0 1-.9L17.4 7' }, { d: 'M10.2 11v5.4M13.8 11v5.4' }],
		oscillate: [{ d: 'M4.6 14.2a8 8 0 0 1 14.8 0' }, { d: 'M3.4 11.2l1.2 3 2.9-1.3' }, { d: 'M20.6 11.2l-1.2 3-2.9-1.3' }, { circle: [12, 16.5, 2] }],
		exhaust: [{ d: 'M4 12h10.5' }, { d: 'M10.5 8l4 4-4 4' }, { d: 'M19 4.5v15' }],
		intake: [{ d: 'M20 12H9.5' }, { d: 'M13.5 8l-4 4 4 4' }, { d: 'M5 4.5v15' }],
		check: [{ d: 'M5 12.5l4.5 4.5 9.5-9.5' }],
		plus: [{ d: 'M12 5.5v13M5.5 12h13' }],
		minus: [{ d: 'M5.5 12h13' }],
		inspector: [{ circle: [5.2, 7, 1.15], fill: true }, { circle: [5.2, 12, 1.15], fill: true }, { circle: [5.2, 17, 1.15], fill: true }, { d: 'M9.5 7h10M9.5 12h10M9.5 17h10' }],
		fan: [{ circle: [12, 12, 8.6] }, { d: BLADE, fill: true }, { d: BLADE, fill: true, rotate: 120 }, { d: BLADE, fill: true, rotate: 240 }, { circle: [12, 12, 1.4], fill: true }],
		purifier: [{ d: 'M7.5 3.5h9A1.5 1.5 0 0 1 18 5v14a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V5a1.5 1.5 0 0 1 1.5-1.5z' }, { circle: [12, 8.2, 2] }, { d: 'M9 13.5h6M9 16h6M9 18.5h6' }],
		wind: [{ d: 'M3 9h10.5A2.5 2.5 0 1 0 11 6.5' }, { d: 'M3 13h15a2.5 2.5 0 1 1-2.5 2.5' }, { d: 'M3 17h7' }],
		thermometer: [{ d: 'M10 14.3V5.6a2 2 0 1 1 4 0v8.7a4 4 0 1 1-4 0z' }, { d: 'M12 10v6.4' }],
		air: [{ d: 'M7.2 17h9.6a3.8 3.8 0 0 0 .5-7.6 5.2 5.2 0 0 0-10 1.2A3.2 3.2 0 0 0 7.2 17z' }],
		more: [{ circle: [5.5, 12, 1.7], fill: true }, { circle: [12, 12, 1.7], fill: true }, { circle: [18.5, 12, 1.7], fill: true }],
		'arrow-up': [{ d: 'M12 19.5V5' }, { d: 'M6.5 10.5L12 5l5.5 5.5' }],
		clock: [{ circle: [12, 12, 8.6] }, { d: 'M12 7.5V12l3 2' }],
		details: [{ d: 'M13.5 4.5h6v6' }, { d: 'M19.5 4.5L12 12' }, { d: 'M10 5.5H6.5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V14' }],
		door: [{ d: 'M6.5 20V4.8a.8.8 0 0 1 .8-.8h9.4a.8.8 0 0 1 .8.8V20' }, { d: 'M4 20h16' }, { circle: [14.6, 12.4, 0.9], fill: true }],
		window: [{ d: 'M6 4h12a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z' }, { d: 'M12 4v16M5 12h14' }],
		grip: [{ circle: [9, 7, 1.3], fill: true }, { circle: [15, 7, 1.3], fill: true }, { circle: [9, 12, 1.3], fill: true }, { circle: [15, 12, 1.3], fill: true }, { circle: [9, 17, 1.3], fill: true }, { circle: [15, 17, 1.3], fill: true }],
		target: [{ circle: [12, 12, 6.5] }, { d: 'M12 2.8v4M12 17.2v4M2.8 12h4M17.2 12h4' }, { circle: [12, 12, 1.3], fill: true }]
	} satisfies Record<string, Stroke[]>;

	export type IconName = keyof typeof ICONS;
	const shapes: Record<IconName, Stroke[]> = ICONS;
</script>

<script lang="ts">
	let { name, size = 22, class: className = '' }: { name: IconName; size?: number; class?: string } = $props();
</script>

<svg class="icon {className}" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
	{#each shapes[name] as stroke, i (i)}
		{#if 'circle' in stroke}
			<circle cx={stroke.circle[0]} cy={stroke.circle[1]} r={stroke.circle[2]} class:filled={stroke.fill} />
		{:else}
			<path d={stroke.d} class:filled={stroke.fill} transform={stroke.rotate ? `rotate(${stroke.rotate} 12 12)` : undefined} />
		{/if}
	{/each}
</svg>

<style>
	.icon {
		flex: none;
		display: block;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.filled {
		fill: currentColor;
		stroke: none;
	}
</style>
