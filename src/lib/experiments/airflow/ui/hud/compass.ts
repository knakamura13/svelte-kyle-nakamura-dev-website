import { compassWord, describeBearing } from '../../readout';

/**
 * The weather widget's compass dial, as numbers: where a pointer on the dial points, what the keys do, and where the dial draws
 * the wind's handle. A bearing is degrees clockwise from north, 0 to 360, and the wind's is the bearing it blows FROM, as
 * `Conditions.windFrom` keeps it. The dial can be drawn turned (`rotation`, degrees clockwise: north drawn that far round from
 * the top), so it can follow a camera. Plain numbers, so Node tests them.
 */

/** Steps of the dial: a drag snaps to `SNAP` degrees, an arrow key moves `STEP` (`STEP_FAST` with Shift), Page Up and Page Down a compass point of eight. */
export const SNAP = 5;
export const STEP = 5;
export const STEP_FAST = 15;
export const STEP_PAGE = 45;

/** Into [0, 360). */
export const wrapBearing = (degrees: number) => ((degrees % 360) + 360) % 360;

/**
 * How far the dial turns to match the 3D view: north drawn this many degrees clockwise from the top. The world reports the bearing its
 * camera looks toward as `data-yaw` (`SimsCamera.yawDegrees`), degrees clockwise from north: 0 looking north, so north is up the screen,
 * and 270 looking west, so north is to the right. North on screen is that bearing turned back.
 */
export const dialRotation = (cameraYaw: number) => (Number.isFinite(cameraYaw) ? wrapBearing(-cameraYaw) : 0);

/** The nearest multiple of `step` degrees, wrapped, so 358 snaps to 0 and not to 360. */
export const snapBearing = (degrees: number, step = SNAP) => wrapBearing(Math.round(degrees / step) * step);

/**
 * The bearing a pointer at (dx, dy) pixels from the dial's centre points at, screen y down: straight up the dial is north when the
 * dial is not turned. A pointer at the centre has no direction, so it gives null.
 */
export function bearingFromPointer(dx: number, dy: number, rotation = 0): number | null {
	if (Math.hypot(dx, dy) < 1e-6) return null;
	// atan2(east, north) with north up the screen (-y).
	const screen = (Math.atan2(dx, -dy) * 180) / Math.PI;
	return wrapBearing(screen - rotation);
}

/** Where a bearing sits on a dial of `radius` pixels, from its centre, screen y down. The inverse of `bearingFromPointer`. */
export function dialPoint(bearing: number, radius: number, rotation = 0): { x: number; y: number } {
	const angle = ((bearing + rotation) * Math.PI) / 180;
	return { x: radius * Math.sin(angle), y: -radius * Math.cos(angle) };
}

/**
 * What a key does to the bearing, as a slider's keys do: Right and Up turn clockwise, Left and Down anticlockwise (Shift for bigger
 * steps), Page Up and Page Down a whole compass point of eight, Home goes to north and End to west. Null for a key the dial leaves alone.
 */
export function stepBearing(current: number, key: string, shift = false): number | null {
	const step = shift ? STEP_FAST : STEP;
	switch (key) {
		case 'ArrowRight':
		case 'ArrowUp':
			return snapBearing(current + step, step);
		case 'ArrowLeft':
		case 'ArrowDown':
			return snapBearing(current - step, step);
		case 'PageUp':
			return snapBearing(current + STEP_PAGE, STEP_PAGE);
		case 'PageDown':
			return snapBearing(current - STEP_PAGE, STEP_PAGE);
		case 'Home':
			return 0;
		case 'End':
			return 270;
		default:
			return null;
	}
}

export interface WindWords {
	/** "from W · 270°", or "Calm". */
	short: string;
	/** The slider's value for a screen reader: "from the west, 270 degrees". */
	spoken: string;
	/** Where the air goes, for the dial's caption: "Blows toward the east." */
	toward: string;
}

/** The wind in a few words. A calm wind still has a direction to set, and says it changes nothing yet. */
export function windWords(windFrom: number, windSpeed: number): WindWords {
	const bearing = describeBearing(windFrom);
	const calm = !(windSpeed > 0);
	return {
		short: calm ? `Calm · ${bearing.text}` : `from ${bearing.text}`,
		spoken: `from the ${bearing.spoken}${calm ? ', calm' : ''}`,
		toward: calm ? 'The wind is calm, so its direction changes nothing yet.' : `Blows toward the ${compassWord(windFrom + 180)}.`
	};
}
