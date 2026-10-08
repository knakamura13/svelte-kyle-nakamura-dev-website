/**
 * Words for which way the air at a probe is moving, and conversions between compass bearings and this repo's axes:
 * x east, y up, z south, so north is −z. A bearing is degrees clockwise from north, 0 to 360.
 */

export const COMPASS_POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'] as const;

export type CompassPoint = (typeof COMPASS_POINTS)[number];

const COMPASS_WORDS: Record<CompassPoint, string> = {
	N: 'north',
	NNE: 'north-northeast',
	NE: 'northeast',
	ENE: 'east-northeast',
	E: 'east',
	ESE: 'east-southeast',
	SE: 'southeast',
	SSE: 'south-southeast',
	S: 'south',
	SSW: 'south-southwest',
	SW: 'southwest',
	WSW: 'west-southwest',
	W: 'west',
	WNW: 'west-northwest',
	NW: 'northwest',
	NNW: 'north-northwest'
};

const DEGREES_PER_RADIAN = 180 / Math.PI;

/** Into [0, 360). */
const wrap = (degrees: number) => ((degrees % 360) + 360) % 360;

/** The nearest of the 16 compass points. Each covers 22.5° centred on it; a bearing exactly between two goes to the clockwise one. Not a number reads as north. */
export function compassName(degrees: number): CompassPoint {
	if (!Number.isFinite(degrees)) return 'N';
	return COMPASS_POINTS[Math.round(wrap(degrees) / 22.5) % 16];
}

/** The horizontal unit vector for a bearing, as its east (+x) and south (+z) components. */
export function bearingToVector(degrees: number): { east: number; south: number } {
	const d = wrap(degrees);
	// Exact at the cardinal points, where the sine and cosine of a rounded π leave a 1e-16 residue.
	const [east, north] = d === 0 ? [0, 1] : d === 90 ? [1, 0] : d === 180 ? [0, -1] : d === 270 ? [-1, 0] : [Math.sin(d / DEGREES_PER_RADIAN), Math.cos(d / DEGREES_PER_RADIAN)];
	// 0 - north rather than -north, so due east and west give a south of 0, not -0.
	return { east, south: 0 - north };
}

/** The bearing of a horizontal vector given by its east (+x) and south (+z) components; 0 for no vector. */
export function vectorToBearing(east: number, south: number): number {
	if (east === 0 && south === 0) return 0;
	return wrap(Math.atan2(east, 0 - south) * DEGREES_PER_RADIAN);
}

export interface Direction {
	/** Speed of the air, m/s. */
	speed: number;
	/** Bearing the air is moving toward, 0 to 360; 0 when it has no horizontal motion. */
	heading: number;
	compass: CompassPoint;
	/** Climb angle, degrees: positive rising, negative sinking, −90 to 90. */
	tilt: number;
	/** "toward NE, rising 12°", "toward the south, level", "straight up" or "still". */
	text: string;
	/** The same with every word spelled out, for a screen reader. */
	spoken: string;
}

/** Tilts that round to less than this many degrees read as level. */
const LEVEL = 3;
/** From this tilt the air is going straight up or down and a compass point would mislead. */
const VERTICAL = 80;

/**
 * Which way air with velocity (u east, v up, w south, m/s) is going, in plain words. Slower than `still` m/s, or not a
 * number, it reads as still. The four cardinal points are words ("toward the south"), the others compass points
 * ("toward NE"); `spoken` spells them all out.
 */
export function describeDirection(u: number, v: number, w: number, still = 0.02): Direction {
	const horizontal = Math.hypot(u, w);
	const speed = Math.hypot(u, v, w);
	const heading = horizontal > 0 ? vectorToBearing(u, w) : 0;
	const tilt = speed > 0 ? Math.atan2(v, horizontal) * DEGREES_PER_RADIAN : 0;
	const compass = compassName(heading);
	const result = { speed, heading, compass, tilt };
	if (!(speed >= still)) return { ...result, speed: Number.isFinite(speed) ? speed : 0, text: 'still', spoken: 'still' };
	const degrees = Math.round(Math.abs(tilt));
	if (degrees >= VERTICAL) {
		const text = tilt > 0 ? 'straight up' : 'straight down';
		return { ...result, text, spoken: text };
	}
	const word = COMPASS_WORDS[compass];
	const place = compass.length === 1 ? `the ${word}` : compass;
	const climb = degrees < LEVEL ? null : tilt > 0 ? 'rising' : 'sinking';
	return {
		...result,
		text: `toward ${place}, ${climb ? `${climb} ${degrees}°` : 'level'}`,
		spoken: `toward the ${word}, ${climb ? `${climb} ${degrees} degrees` : 'level'}`
	};
}
