import { expect, test } from '@playwright/test';
import { DEVICE_MODELS } from '../../src/lib/experiments/airflow/devices/catalog';
import { deviceDefaults } from '../../src/lib/experiments/airflow/devices/placement';
import { newDevice } from '../../src/lib/experiments/airflow/devices/placement';
import { plans } from '../../src/lib/experiments/airflow/homes/plans';
import { isExterior, type HomePlan, type OpeningSpec } from '../../src/lib/experiments/airflow/homes/types';
import { anchorOf, deviceBox, openingBox, pickTarget, rayBox, type Vec3 } from '../../src/lib/experiments/airflow/scene/selection';
import { LIMITS, type DeviceState } from '../../src/lib/experiments/airflow/state';
import { cardLines, inTab, towardMiddle } from '../../src/lib/experiments/airflow/ui/hud/catalog';
import { bearingFromPointer, dialPoint, snapBearing, stepBearing, windWords } from '../../src/lib/experiments/airflow/ui/hud/compass';
import { placeCard } from '../../src/lib/experiments/airflow/ui/hud/layout';
import { deviceMenu, openingMenu } from '../../src/lib/experiments/airflow/ui/hud/menus';
import { AIR_PRESETS, WIND_PRESETS, activePreset, airPreset, stepValue, WINDOW_PRESETS } from '../../src/lib/experiments/airflow/ui/hud/presets';
import { OVERLAYS, overlayOfLayer } from '../../src/lib/experiments/airflow/ui/hud/tools';

/** The HUD's pure parts (milestone 3 of the immersive redesign): the compass dial, the presets, the card placement, the menu models and picking. */

const models = new Map(DEVICE_MODELS.map((m) => [m.id, m]));
const close = (a: number, b: number, digits = 6) => expect(a).toBeCloseTo(b, digits);

test.describe('compass dial', () => {
	test('a pointer up the dial is north, then clockwise, and a turned dial turns with it', () => {
		close(bearingFromPointer(0, -10)!, 0);
		close(bearingFromPointer(10, 0)!, 90);
		close(bearingFromPointer(0, 10)!, 180);
		close(bearingFromPointer(-10, 0)!, 270);
		expect(bearingFromPointer(0, 0)).toBeNull();
		// North drawn 90° round: the top of the dial is then west.
		close(bearingFromPointer(0, -10, 90)!, 270);
	});

	test('dialPoint is the inverse of bearingFromPointer at any rotation', () => {
		for (const rotation of [0, 37, 180, 300])
			for (let bearing = 0; bearing < 360; bearing += 15) {
				const p = dialPoint(bearing, 40, rotation);
				close(bearingFromPointer(p.x, p.y, rotation)!, bearing, 6);
			}
	});

	test('keys step and wrap like a slider, and snapping never gives 360', () => {
		expect(stepBearing(270, 'ArrowRight')).toBe(275);
		expect(stepBearing(0, 'ArrowLeft')).toBe(355);
		expect(stepBearing(355, 'ArrowUp')).toBe(0);
		expect(stepBearing(10, 'ArrowDown', true)).toBe(0);
		expect(stepBearing(270, 'PageUp')).toBe(315);
		expect(stepBearing(10, 'PageDown')).toBe(315);
		expect(stepBearing(123, 'Home')).toBe(0);
		expect(stepBearing(123, 'Tab')).toBeNull();
		expect(snapBearing(358)).toBe(0);
		expect(windWords(270, 4).short).toBe('from W 270°');
		expect(windWords(270, 0).short).toMatch(/^Calm/);
	});
});

test.describe('presets', () => {
	test('outdoor air and wind presets are values the state allows, on the controls’ steps', () => {
		for (const preset of AIR_PRESETS) {
			expect(preset.value).toBeGreaterThanOrEqual(LIMITS.outdoorPm25.min);
			expect(preset.value).toBeLessThanOrEqual(LIMITS.outdoorPm25.max);
			close(preset.value / LIMITS.outdoorPm25.step, Math.round(preset.value / LIMITS.outdoorPm25.step));
			expect(airPreset(preset.value)?.id).toBe(preset.id);
		}
		for (const preset of WIND_PRESETS) {
			expect(preset.value).toBeGreaterThanOrEqual(LIMITS.windSpeed.min);
			expect(preset.value).toBeLessThanOrEqual(LIMITS.windSpeed.max);
			close(preset.value / LIMITS.windSpeed.step, Math.round(preset.value / LIMITS.windSpeed.step));
		}
		expect(activePreset(WINDOW_PRESETS, 0.5)?.id).toBe('half');
		expect(activePreset(WINDOW_PRESETS, 0.3)).toBeNull();
	});

	test('a stepper moves one step of the visitor’s units and stops at the limits', () => {
		close(stepValue('outdoorTemp', 18, 'metric', 1), 19);
		close(stepValue('indoorTemp', 21, 'metric', -1), 20.5);
		// 18 °C is 64.4 °F: the first press up lands on 65 °F, the next on 66 °F.
		const once = stepValue('outdoorTemp', 18, 'imperial', 1);
		close(once * 1.8 + 32, 65, 6);
		close(stepValue('outdoorTemp', once, 'imperial', 1) * 1.8 + 32, 66, 6);
		expect(stepValue('outdoorTemp', LIMITS.outdoorTemp.max, 'metric', 1)).toBe(LIMITS.outdoorTemp.max);
		expect(stepValue('windSpeed', 0, 'metric', -1)).toBe(0);
	});
});

test.describe('context menu card placement', () => {
	const viewport = { width: 1440, height: 900 };
	const safe = { left: 100, right: 360, top: 80, bottom: 100 };
	const card = { width: 300, height: 200 };

	test('right of the anchor when there is room, else left, else above or below, inside the free space', () => {
		const right = placeCard({ x: 500, y: 400 }, card, viewport, safe);
		expect(right.side).toBe('right');
		expect(right.left).toBe(518);
		expect(right.notch).toEqual({ x: 0, y: 100 });
		const left = placeCard({ x: 1000, y: 400 }, card, viewport, safe);
		expect(left.side).toBe('left');
		expect(left.left + card.width).toBe(982);
		const narrow = { width: 500, height: 900 };
		const above = placeCard({ x: 250, y: 600 }, card, narrow, { left: 10, right: 10, top: 10, bottom: 10 });
		expect(above.side).toBe('above');
		const below = placeCard({ x: 250, y: 100 }, card, narrow, { left: 10, right: 10, top: 10, bottom: 10 });
		expect(below.side).toBe('below');
		// Near the top, the card is held below the top bar.
		expect(placeCard({ x: 500, y: 20 }, card, viewport, safe).top).toBe(safe.top);
		expect(placeCard(null, card, viewport, safe).side).toBe('free');
	});
});

test.describe('menu models', () => {
	test('every door gets Closed and Open, every window four presets and a fine control to its limit', () => {
		for (const plan of plans)
			for (const opening of plan.openings) {
				const menu = openingMenu(plan, opening, 0.5);
				expect(menu.title).toBe(opening.name);
				if (opening.kind === 'door') {
					expect(menu.kind).toBe('door');
					expect(menu.presets.map((p) => p.label)).toEqual(['Closed', 'Open']);
					expect(menu.fine).toBeNull();
				} else {
					expect(menu.kind).toBe('window');
					expect(menu.presets.map((p) => p.label)).toEqual(['Closed', 'Cracked', 'Half', 'Wide']);
					expect(menu.presets.find((p) => p.pressed)?.id).toBe('half');
					expect(menu.fine).toMatchObject({ min: 0, max: 100, value: 50 });
					expect(menu.caption).toContain(`${Math.round(50 * opening.maxOpen)}% of the frame`);
				}
			}
	});

	test('fans offer speeds and the actions their kind has; purifiers Sleep to High, Move and Remove', () => {
		for (const model of DEVICE_MODELS) {
			const device: DeviceState = { ...deviceDefaults(model), id: 'd1', x: 3, z: 3, yaw: 90, power: 2 / 3 };
			const menu = deviceMenu(model, device, 'metric');
			const actions = menu.actions.map((a) => a.id);
			expect(actions.slice(-2)).toEqual(['move', 'remove']);
			if (model.kind === 'air-purifier') {
				expect(menu.presets.map((p) => p.label)).toEqual(['Off', 'Sleep', 'Low', 'Medium', 'High']);
				expect(actions).toEqual(['move', 'remove']);
			} else {
				expect(menu.presets.map((p) => p.label)).toEqual(['Off', 'Low', 'Medium', 'High']);
				expect(menu.presets.find((p) => p.pressed)?.id).toBe('medium');
				expect(actions.includes('oscillate')).toBe(model.kind === 'pedestal-fan');
				expect(actions.includes('turn-right')).toBe(model.kind !== 'window-fan');
				expect(actions.includes('exhaust')).toBe(model.kind === 'window-fan');
			}
		}
	});
});

test.describe('the Build catalog', () => {
	test('tabs split fans from purifiers, cards name what each is, and a carried device faces the middle', () => {
		expect(DEVICE_MODELS.filter((m) => inTab(m, 'fans')).every((m) => m.kind !== 'air-purifier')).toBe(true);
		expect(DEVICE_MODELS.filter((m) => inTab(m, 'purifiers')).length).toBe(3);
		expect(cardLines(DEVICE_MODELS.find((m) => m.id === 'air-king-9723')!)).toEqual({ title: '20″ box fan', maker: 'Air King 9723' });
		expect(cardLines(DEVICE_MODELS.find((m) => m.id === 'levoit-core-300p')!)).toEqual({ title: 'Small air purifier', maker: 'Levoit Core 300-P' });
		const plan = { width: 10, depth: 6 };
		close(towardMiddle(plan, 5, 5), 0);
		close(towardMiddle(plan, 1, 3), 90);
	});
});

/** A point just inside the room in front of an Opening, and the way to it: a ray that must take that Opening. */
function rayAt(plan: HomePlan, opening: OpeningSpec): { origin: Vec3; direction: Vec3 } {
	const y = opening.sill + opening.height / 2;
	const p = opening.placement;
	if (isExterior(p)) {
		if (p.facade === 'north') return { origin: [p.center, y, 0.3], direction: [0, 0, -1] };
		if (p.facade === 'south') return { origin: [p.center, y, plan.depth - 0.3], direction: [0, 0, 1] };
		if (p.facade === 'west') return { origin: [0.3, y, p.center], direction: [-1, 0, 0] };
		return { origin: [plan.width - 0.3, y, p.center], direction: [1, 0, 0] };
	}
	return p.axis === 'x' ? { origin: [p.center, y, p.at + 0.3], direction: [0, 0, -1] } : { origin: [p.at + 0.3, y, p.center], direction: [-1, 0, 0] };
}

test.describe('picking in the 3D world', () => {
	test('a ray at every door and window of every plan takes that Opening, and its anchor is on its wall', () => {
		for (const plan of plans)
			for (const opening of plan.openings) {
				const { origin, direction } = rayAt(plan, opening);
				const picked = pickTarget(origin, direction, { plan, devices: [], models, probes: [], furniture: false }, ['opening']);
				expect(picked?.id, `${plan.id} ${opening.id}`).toBe(opening.id);
				const anchor = anchorOf({ kind: 'opening', id: opening.id }, { plan, devices: [], models, probes: [] })!;
				expect(rayBox(anchor, [0, 1, 0], openingBox(plan, opening))).toBe(0);
			}
	});

	test('a window fan wins over the window it sits in, a Probe over the air behind it, and furniture hides what is behind it', () => {
		const plan = plans.find((p) => p.id === 'two-bedroom')!;
		const windowFan = DEVICE_MODELS.find((m) => m.kind === 'window-fan')!;
		const made = newDevice(plan, windowFan, []);
		if (!('device' in made)) throw new Error(made.reason);
		const fan = made.device;
		const window = plan.openings.find((o) => o.id === fan.opening)!;
		// Level with the fan's body, which fills only the bottom of a tall window.
		const { origin: atWindow, direction } = rayAt(plan, window);
		const origin: Vec3 = [atWindow[0], fan.y + windowFan.body.height / 2, atWindow[2]];
		const scene = { plan, devices: [fan], models, probes: [], furniture: false };
		expect(pickTarget(origin, direction, scene)?.kind).toBe('device');
		expect(rayBox(origin, direction, deviceBox(windowFan, fan))).not.toBeNull();

		const pin = { id: 'p1', x: origin[0] + direction[0] * 0.15, y: origin[1], z: origin[2] + direction[2] * 0.15 };
		expect(pickTarget(origin, direction, { ...scene, devices: [], probes: [pin] })?.kind).toBe('probe');

		// A wardrobe-sized box between the eye and the window hides it, and only while the furniture stands.
		const piece = { id: 'f', name: 'Wardrobe', x: Math.min(origin[0], origin[0] + direction[0] * 0.2) - 0.05, z: Math.min(origin[2], origin[2] + direction[2] * 0.2) - 0.05, w: 0.1 + Math.abs(direction[0]) * 0.2 + 0.4 * Math.abs(direction[2]), d: 0.1 + Math.abs(direction[2]) * 0.2 + 0.4 * Math.abs(direction[0]), h: 2 };
		const blocked: HomePlan = { ...plan, furniture: [piece] };
		const back: Vec3 = [origin[0] - direction[0] * 0.4, origin[1], origin[2] - direction[2] * 0.4];
		const behind = { plan: blocked, devices: [], models, probes: [] };
		expect(pickTarget(back, direction, { ...behind, furniture: true }, ['opening'])).toBeNull();
		expect(pickTarget(back, direction, { ...behind, furniture: false }, ['opening'])?.id).toBe(window.id);
	});
});

test('overlays map to today’s slice layers, and back', () => {
	expect(OVERLAYS.map((o) => o.label)).toEqual(['Off', 'Air speed', 'Temperature', 'Smoke']);
	for (const overlay of OVERLAYS) if (overlay.layer) expect(overlayOfLayer(overlay.layer)).toBe(overlay.id);
	expect(overlayOfLayer('direction')).toBe('speed');
});
