import { describeDirection } from './directionWords';
import type { AirReading } from './readouts';
import type { UnitSystem } from './state';
import { formatLength, formatParticulates, formatSpeed, formatTemperature } from './units';

/**
 * What the Dock says about a point of the air, for the pointer's readout and for each Probe: where it is, and what the air
 * is doing there, once for the eye (labelled values) and once for a screen reader (one sentence with every unit spelled
 * out). Nothing here touches Svelte or the page, so Node can test it. Every number goes through `units.ts`, so it follows
 * the visitor's unit system.
 */

/** A point in the Home: x east and z south of its north-west corner, y above the floor, m. */
export interface Point {
	x: number;
	y: number;
	z: number;
}

export interface Place {
	/** "1.2 m east, 3.4 m south of the north-west corner, at a height of 1.1 m". */
	text: string;
	/** The same with the units spelled out. */
	spoken: string;
}

/** Where a point is, from the one corner every plan has, which the compass letters on the Stage name. */
export function describePlace(point: Point, units: UnitSystem): Place {
	const east = formatLength(point.x, units);
	const south = formatLength(point.z, units);
	const height = formatLength(point.y, units);
	return {
		text: `${east.text} east, ${south.text} south of the north-west corner, at a height of ${height.text}`,
		spoken: `${east.spoken} east and ${south.spoken} south of the north-west corner, at a height of ${height.spoken}`
	};
}

export interface ReadingRow {
	key: 'direction' | 'speed' | 'average' | 'temperature' | 'particulates';
	name: string;
	value: string;
	/** True where the value says there is nothing to show yet. */
	empty?: boolean;
}

export interface Spot {
	/** "Probe 1". Empty for a point that is named where it is shown (the readout under the pointer), which a screen reader hears the name of before it hears the sentence. */
	name: string;
	place: Place;
	/** The readings, labelled, for the eye. Empty when there is nothing to read: see `message`. */
	rows: ReadingRow[];
	/** Why there are no rows, or an empty string when there are some. */
	message: string;
	/** The name, the place and every reading as sentences, for a screen reader. */
	sentence: string;
}

/** The name a Probe has before its first reading arrives. The scene labels its readings the same way. */
export const probeName = (id: string) => `Probe ${id.slice(1)}`;

/** The Slice is read as the mean of ten simulated seconds, and says when it has not had that long. */
export const AVERAGE_WINDOW = 10;

export const WAITING = 'Waiting for the first reading.';
export const NOT_IN_AIR = 'This spot is furniture or outside the home, so there is no air to read.';

/**
 * A point and what the air does there. `reading` is null while no reading of the point has arrived, and a reading that is not
 * in the air (inside furniture, or outside the Home) has nothing to say about it.
 */
export function describeSpot(name: string, point: Point, reading: AirReading | null | undefined, units: UnitSystem): Spot {
	const place = describePlace(point, units);
	const head = name ? `${name}, ${place.spoken}.` : `${place.spoken[0].toUpperCase()}${place.spoken.slice(1)}.`;
	if (!reading || !reading.inAir) {
		const message = reading ? NOT_IN_AIR : WAITING;
		return { name, place, rows: [], message, sentence: `${head} ${message}` };
	}
	const direction = describeDirection(reading.u, reading.v, reading.w);
	const speed = formatSpeed(reading.speed, units);
	const average = reading.averageSpeed === null ? null : formatSpeed(reading.averageSpeed, units);
	const temperature = formatTemperature(reading.temperature, units);
	const particulates = formatParticulates(reading.particulates);
	const rows: ReadingRow[] = [
		{ key: 'direction', name: 'Direction', value: direction.text },
		{ key: 'speed', name: 'Speed', value: speed.text },
		{ key: 'average', name: `Average, ${AVERAGE_WINDOW} s`, value: average ? average.text : 'not yet', empty: !average },
		{ key: 'temperature', name: 'Temperature', value: temperature.text },
		{ key: 'particulates', name: 'PM2.5', value: particulates.text }
	];
	const moving = direction.text === 'still' ? `Air is still, at ${speed.spoken}.` : `Air moving ${direction.spoken}, at ${speed.spoken}.`;
	const mean = average ? `Average over the last ${AVERAGE_WINDOW} seconds, ${average.spoken}.` : `The average over the last ${AVERAGE_WINDOW} seconds is not available yet.`;
	const sentence = [head, moving, mean, `Temperature ${temperature.spoken}.`, `PM2.5 ${particulates.spoken}.`].join(' ');
	return { name, place, rows, message: '', sentence };
}

/**
 * What the keyboard's cursor (the arrow keys in the 3D view, with the Probe or Smoke tool) has under it, said to a screen reader once
 * the keys stop: the Room and the height, then whether there is air to read there and what it does. Short, as it is said after every
 * run of keys; the Probe panel has the whole reading. `room` is the Room's name, or null between the Rooms (a wall) or outside them.
 */
export function describeCursor(room: string | null, point: Point, reading: AirReading | null | undefined, units: UnitSystem): string {
	const where = `${room ?? 'Not in a room'}, at a height of ${formatLength(point.y, units).spoken}.`;
	if (!reading) return `${where} ${WAITING}`;
	if (!reading.inAir) return `${where} ${room ? 'Furniture or a wall here, so there is no air to read.' : 'There is no air to read here.'}`;
	const direction = describeDirection(reading.u, reading.v, reading.w);
	const speed = formatSpeed(reading.speed, units);
	return `${where} ${direction.text === 'still' ? `Air is still, at ${speed.spoken}.` : `Air moving ${direction.spoken}, at ${speed.spoken}.`}`;
}

/** Why Enter at the keyboard's cursor did nothing: no air under it, or no reading of it yet. `action` is what Enter would have done. */
export function describeRefusal(action: 'pin' | 'smoke', room: string | null, reading: AirReading | null | undefined): string {
	const nothing = action === 'pin' ? 'No probe pinned' : 'No smoke released';
	if (!reading) return `${nothing}: the air here has not been read yet. Try again in a moment.`;
	const why = room ? 'the cursor is on furniture or a wall' : 'the cursor is not in a room';
	return `${nothing}: ${why}. Move it with the arrow keys to the air.`;
}
