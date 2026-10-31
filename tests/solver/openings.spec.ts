import { expect, test } from '@playwright/test';
import { DEVICE_MODELS } from '../../src/lib/experiments/airflow/devices/catalog';
import { newDevice } from '../../src/lib/experiments/airflow/devices/placement';
import type { DeviceModel } from '../../src/lib/experiments/airflow/devices/types';
import { planById } from '../../src/lib/experiments/airflow/homes/plans';
import { effectiveOpenings } from '../../src/lib/experiments/airflow/sim/world';
import { blankSetup, type DeviceState } from '../../src/lib/experiments/airflow/state';

/**
 * How far open each opening is, as the solver has it. The world draws from the same function, so a window the solver
 * holds open is never drawn shut.
 */

const models = new Map<string, DeviceModel>(DEVICE_MODELS.map((m) => [m.id, m]));
const plan = planById('two-bedroom')!;
const windowFan = DEVICE_MODELS.find((m) => m.kind === 'window-fan')!;

function fanInWindow(power: number): DeviceState {
	const made = newDevice(plan, windowFan, []);
	if (!('device' in made)) throw new Error(made.reason);
	return { ...made.device, power };
}

test.describe('effective openings', () => {
	test('are the visitor’s setting, or the plan’s own position where they set nothing', () => {
		const setup = { ...blankSetup(plan.id), openings: { 'bedroom-1-window': 0.4 } };
		const amounts = effectiveOpenings(plan, setup, models);
		expect(amounts.get('bedroom-1-window')).toBe(0.4);
		for (const spec of plan.openings.filter((o) => o.id !== 'bedroom-1-window')) expect(amounts.get(spec.id), spec.id).toBe(spec.open ?? 0);
		expect(amounts.size).toBe(plan.openings.length);
	});

	test('a running window fan holds its window fully open, whatever the visitor set', () => {
		const fan = fanInWindow(2 / 3);
		const closed = effectiveOpenings(plan, { ...blankSetup(plan.id), devices: [fan], openings: { [fan.opening!]: 0 } }, models);
		expect(closed.get(fan.opening!)).toBe(1);
	});

	test('a window fan that is off shuts its window, the way the fan’s blades and frame do', () => {
		const fan = fanInWindow(0);
		const shut = effectiveOpenings(plan, { ...blankSetup(plan.id), devices: [fan], openings: { [fan.opening!]: 1 } }, models);
		expect(shut.get(fan.opening!)).toBe(0);
	});

	test('a fan leaves every other opening alone, and a fan naming no opening of this plan changes nothing', () => {
		const fan = fanInWindow(1);
		const others = plan.openings.filter((o) => o.id !== fan.opening);
		const setup = { ...blankSetup(plan.id), devices: [fan, { ...fan, id: 'stray', opening: 'no-such-window' }], openings: Object.fromEntries(others.map((o) => [o.id, 0.25])) };
		const amounts = effectiveOpenings(plan, setup, models);
		for (const spec of others) expect(amounts.get(spec.id), spec.id).toBe(0.25);
		expect(amounts.has('no-such-window')).toBe(false);
	});

	test('a box fan or an unknown model does not touch a window', () => {
		const box = DEVICE_MODELS.find((m) => m.kind === 'box-fan')!;
		const made = newDevice(plan, box, []);
		if (!('device' in made)) throw new Error(made.reason);
		const setup = { ...blankSetup(plan.id), devices: [{ ...made.device, opening: 'bedroom-1-window' }, { ...made.device, id: 'x', model: 'unknown', opening: 'bedroom-1-window' }], openings: { 'bedroom-1-window': 0.6 } };
		expect(effectiveOpenings(plan, setup, models).get('bedroom-1-window')).toBe(0.6);
	});
});
