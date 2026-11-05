import type { DeviceState } from '../state';
import type { DeviceModel, FanModel, PurifierModel } from './types';

/** The marks on the power slider: Low, Medium and High (and Sleep, for a purifier) sit at these positions. */
export const FAN_MARKS = { low: 1 / 3, medium: 2 / 3, high: 1 } as const;
export const PURIFIER_MARKS = { sleep: 0.25, low: 0.5, medium: 0.75, high: 1 } as const;

/** Linear interpolation through (0, 0) and the given marks, which must be ascending in position. */
function throughMarks(power: number, marks: [position: number, value: number][]) {
	const p = Math.max(0, Math.min(1, power));
	let previous: [number, number] = [0, 0];
	for (const mark of marks) {
		if (p <= mark[0]) return previous[1] + ((mark[1] - previous[1]) * (p - previous[0])) / (mark[0] - previous[0]);
		previous = mark;
	}
	return previous[1];
}

/** Open-air flow of a fan at a slider position, m³/s: zero off, the rated Low, Medium and High at their marks, straight lines between. */
export function fanFlow(model: FanModel, power: number) {
	return throughMarks(power, [
		[FAN_MARKS.low, model.flow.low],
		[FAN_MARKS.medium, model.flow.medium],
		[FAN_MARKS.high, model.flow.high]
	]);
}

/** Clean air delivery rate of a purifier at a slider position, m³/s. */
export function purifierCadr(model: PurifierModel, power: number) {
	return throughMarks(power, [
		[PURIFIER_MARKS.sleep, model.cadr.sleep],
		[PURIFIER_MARKS.low, model.cadr.low],
		[PURIFIER_MARKS.medium, model.cadr.medium],
		[PURIFIER_MARKS.high, model.cadr.high]
	]);
}

/** Name of the nearest mark, for the readout beside the slider ("Low", "Medium", "High", "Off"), and whether the slider is on it. */
export function powerLabel(model: DeviceModel, power: number) {
	const marks: [string, number][] =
		model.kind === 'air-purifier'
			? [
					['Sleep', PURIFIER_MARKS.sleep],
					['Low', PURIFIER_MARKS.low],
					['Medium', PURIFIER_MARKS.medium],
					['High', PURIFIER_MARKS.high]
				]
			: [
					['Low', FAN_MARKS.low],
					['Medium', FAN_MARKS.medium],
					['High', FAN_MARKS.high]
				];
	if (power <= 0.005) return { name: 'Off', exact: true };
	const nearest = marks.reduce((best, mark) => (Math.abs(mark[1] - power) < Math.abs(best[1] - power) ? mark : best));
	return { name: nearest[0], exact: Math.abs(nearest[1] - power) < 0.02 };
}

/**
 * A pedestal fan's yaw at time `t` seconds, degrees: it sweeps `sweep` degrees about its set yaw, out and back in
 * `period` seconds (a gear-driven sweep is close to sinusoidal). Not oscillating, it stays at the set yaw.
 */
export function oscillatedYaw(device: DeviceState, t: number) {
	const { on, sweep, period } = device.oscillation;
	return on ? device.yaw + (sweep / 2) * Math.sin((2 * Math.PI * t) / period) : device.yaw;
}

/**
 * The direction a device blows, a unit vector in the scene's axes (x east, y up, z south): `yaw` is degrees clockwise
 * from north seen from above, `tilt` degrees up.
 */
export function aimVector(yaw: number, tilt: number): [number, number, number] {
	const heading = (yaw * Math.PI) / 180;
	const climb = (tilt * Math.PI) / 180;
	return [Math.sin(heading) * Math.cos(climb), Math.sin(climb), -Math.cos(heading) * Math.cos(climb)];
}

/** Where the airflow starts: the centre of the fan's disk. A pedestal fan's head is at its set height; a box fan stands on its base, its centre half its height up. */
export function headPosition(model: DeviceModel, device: DeviceState): [number, number, number] {
	if (model.kind === 'pedestal-fan') return [device.x, device.y + device.height, device.z];
	return [device.x, device.y + model.body.height / 2, device.z];
}
