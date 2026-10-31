import { expect, test } from '@playwright/test';
import { BoxGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera } from 'three';
import type { Point3 } from '../../src/lib/experiments/airflow/scene/deviceMath';
import { AirflowInput, CURSOR_STEP, HOLD_MS, SLOP_PX, type InputHost } from '../../src/lib/experiments/airflow/scene/input';
import { pointOnPlane } from '../../src/lib/experiments/airflow/scene/pick';
import type { HoverReading } from '../../src/lib/experiments/airflow/readouts';
import type { PointerMode } from '../../src/lib/experiments/airflow/state';

/**
 * The Stage's pointer and key handling, driven with plain objects and a clock the test moves. A mouse hovers, clicks to pin
 * and holds to release smoke; a finger and the keyboard follow the mode toggle.
 */

const AIR: HoverReading = { x: 0, y: 1.1, z: 0, u: 0, v: 0, w: 0, speed: 0, averageSpeed: null, temperature: 21, particulates: 0, inAir: true };

/** A host over a 6 × 4 m home whose slice is air everywhere except a piece of furniture at x 4 to 5. */
function harness(mode: PointerMode = 'look') {
	const log = { pins: [] as Point3[], unpins: [] as string[], emits: [] as (Point3 | null)[], hovers: [] as (Point3 | null)[], refusals: 0 };
	let clock = 0;
	let full = false;
	let picked: Point3 | null = { x: 1, y: 1.1, z: 1 };
	const host: InputHost = {
		mode: () => mode,
		pick: () => picked,
		plane: () => ({ width: 6, depth: 4, y: 1.1 }),
		read: (point) => ({ ...AIR, x: point.x, y: point.y, z: point.z, inAir: !(point.x >= 4 && point.x <= 5) }),
		hover: (point) => log.hovers.push(point),
		pin: (point) => {
			if (full) {
				log.refusals++;
				return null;
			}
			log.pins.push(point);
			return `p${log.pins.length}`;
		},
		unpin: (id) => log.unpins.push(id),
		emit: (point) => log.emits.push(point),
		now: () => clock,
		full: () => full
	};
	const input = new AirflowInput(host);
	const ndc = { x: 0, y: 0 };
	const pointer = (type: 'mouse' | 'touch', id = 1) => ({ pointerType: type, pointerId: id, clientX: 100, clientY: 100, button: 0 }) as unknown as PointerEvent;
	const key = (name: string, extra: Partial<KeyboardEvent> = {}, type = 'keydown') => ({ key: name, type, repeat: false, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, ...extra }) as unknown as KeyboardEvent;
	return {
		input,
		log,
		ndc,
		pointer,
		key,
		setMode: (next: PointerMode) => (mode = next),
		fill: () => (full = true),
		pick: (point: Point3 | null) => (picked = point),
		advance: (ms: number) => (clock += ms),
		moved: (event: PointerEvent, dx: number, dy = 0) => ({ ...event, pointerType: event.pointerType, pointerId: event.pointerId, clientX: event.clientX + dx, clientY: event.clientY + dy }) as PointerEvent
	};
}

test.describe('a mouse', () => {
	test('reads the air under it as it moves, and stops reading when it leaves', () => {
		const h = harness();
		h.input.pointer('move', h.pointer('mouse'), h.ndc);
		expect(h.log.hovers.at(-1)).toEqual({ x: 1, y: 1.1, z: 1 });
		h.pick(null);
		h.input.pointer('move', h.pointer('mouse'), h.ndc);
		expect(h.log.hovers.at(-1)).toBeNull();
		h.pick({ x: 2, y: 1.1, z: 2 });
		h.input.pointer('move', h.pointer('mouse'), h.ndc);
		h.input.pointer('leave', h.pointer('mouse'), h.ndc);
		expect(h.log.hovers.at(-1)).toBeNull();
	});

	test('a quick click pins a probe where it pressed and leaves the drag to the camera', () => {
		const h = harness();
		expect(h.input.pointer('down', h.pointer('mouse'), h.ndc), 'the camera keeps the gesture').toBe(false);
		h.advance(HOLD_MS - 100);
		h.input.pointer('up', h.pointer('mouse'), h.ndc);
		expect(h.log.pins).toEqual([{ x: 1, y: 1.1, z: 1 }]);
		expect(h.log.emits).toEqual([]);
	});

	test('a click on furniture or outside the home pins nothing', () => {
		const h = harness();
		h.pick({ x: 4.5, y: 1.1, z: 1 });
		h.input.pointer('down', h.pointer('mouse'), h.ndc);
		h.input.pointer('up', h.pointer('mouse'), h.ndc);
		h.pick(null);
		h.input.pointer('down', h.pointer('mouse'), h.ndc);
		h.input.pointer('up', h.pointer('mouse'), h.ndc);
		expect(h.log.pins).toEqual([]);
	});

	test('a still press becomes a hold that releases smoke until the button lifts, and pins nothing', () => {
		const h = harness();
		h.input.pointer('down', h.pointer('mouse'), h.ndc);
		expect(h.input.tick(), 'busy while it may still become a hold').toBe(true);
		h.advance(HOLD_MS - 1);
		h.input.tick();
		expect(h.log.emits).toEqual([]);
		h.advance(2);
		h.input.tick();
		expect(h.log.emits).toEqual([{ x: 1, y: 1.1, z: 1 }]);
		h.advance(500);
		h.input.tick();
		expect(h.log.emits, 'one start, not one per frame').toHaveLength(1);
		h.input.pointer('up', h.pointer('mouse'), h.ndc);
		expect(h.log.emits.at(-1)).toBeNull();
		expect(h.log.pins).toEqual([]);
		expect(h.input.busy).toBe(false);
	});

	test('a drag is not a click or a hold, however long it lasts', () => {
		const h = harness();
		const down = h.pointer('mouse');
		h.input.pointer('down', down, h.ndc);
		h.input.pointer('move', h.moved(down, SLOP_PX + 1), h.ndc);
		expect(h.input.busy, 'nothing more to wait for').toBe(false);
		h.advance(HOLD_MS * 3);
		h.input.tick();
		h.input.pointer('up', down, h.ndc);
		expect(h.log.pins).toEqual([]);
		expect(h.log.emits).toEqual([]);
	});

	test('a small wobble still counts as a click', () => {
		const h = harness();
		const down = h.pointer('mouse');
		h.input.pointer('down', down, h.ndc);
		h.input.pointer('move', h.moved(down, SLOP_PX - 1), h.ndc);
		h.input.pointer('up', down, h.ndc);
		expect(h.log.pins).toHaveLength(1);
	});

	test('a hold on furniture releases nothing and the press ends quietly', () => {
		const h = harness();
		h.pick({ x: 4.5, y: 1.1, z: 1 });
		h.input.pointer('down', h.pointer('mouse'), h.ndc);
		h.advance(HOLD_MS + 10);
		h.input.tick();
		h.input.pointer('up', h.pointer('mouse'), h.ndc);
		expect(h.log.emits).toEqual([]);
		expect(h.log.pins).toEqual([]);
	});

	test('an up with no press, as a lost-pointer-capture event sends after the pointer-up, does nothing', () => {
		const h = harness();
		h.input.pointer('down', h.pointer('mouse'), h.ndc);
		h.input.pointer('up', h.pointer('mouse'), h.ndc);
		h.input.pointer('up', h.pointer('mouse'), h.ndc);
		expect(h.log.pins).toHaveLength(1);
	});
});

test.describe('a double click', () => {
	const click = (h: ReturnType<typeof harness>, event: PointerEvent) => {
		h.input.pointer('down', event, h.ndc);
		h.input.pointer('up', event, h.ndc);
	};

	test('is the camera reset, not two probes: the second quick click takes the first one back', () => {
		const h = harness();
		const event = h.pointer('mouse');
		click(h, event);
		h.advance(120);
		click(h, event);
		expect(h.log.pins).toHaveLength(1);
		expect(h.log.unpins).toEqual(['p1']);
	});

	test('a third click after it starts over and pins', () => {
		const h = harness();
		const event = h.pointer('mouse');
		click(h, event);
		h.advance(100);
		click(h, event);
		h.advance(100);
		click(h, event);
		expect(h.log.pins).toHaveLength(2);
		expect(h.log.unpins).toEqual(['p1']);
	});

	test('two clicks 450 ms apart, a slow double click on macOS, are still one', () => {
		const h = harness();
		const event = h.pointer('mouse');
		click(h, event);
		h.advance(450);
		click(h, event);
		expect(h.log.pins).toHaveLength(1);
		expect(h.log.unpins).toEqual(['p1']);
	});

	test('two clicks well apart in time are two probes', () => {
		const h = harness();
		const event = h.pointer('mouse');
		click(h, event);
		h.advance(600);
		click(h, event);
		expect(h.log.pins).toHaveLength(2);
		expect(h.log.unpins).toEqual([]);
	});

	test('two quick clicks in different places are two probes', () => {
		const h = harness();
		const event = h.pointer('mouse');
		click(h, event);
		h.advance(100);
		click(h, h.moved(event, 40));
		expect(h.log.pins).toHaveLength(2);
		expect(h.log.unpins).toEqual([]);
	});

	test('does not take back a probe that was never pinned because the home was full', () => {
		const h = harness();
		h.fill();
		const event = h.pointer('mouse');
		click(h, event);
		h.advance(100);
		click(h, event);
		expect(h.log.unpins).toEqual([]);
	});

	test('in a full home says nothing about a refused probe, since it asked for none; one click alone is told, once it cannot be a double click', () => {
		const h = harness();
		h.fill();
		const event = h.pointer('mouse');
		click(h, event);
		h.advance(120);
		click(h, event);
		h.advance(600);
		h.input.tick();
		expect(h.log.refusals, 'a double click').toBe(0);
		click(h, event);
		h.input.tick();
		expect(h.log.refusals, 'not yet: a second click may follow').toBe(0);
		expect(h.input.busy, 'the Stage keeps drawing until it knows').toBe(true);
		h.advance(500);
		h.input.tick();
		expect(h.log.refusals, 'a single click').toBe(1);
		expect(h.input.busy).toBe(false);
	});

	test('a finger in probe mode that taps twice in one place pins once', () => {
		const h = harness('probe');
		const tap = h.pointer('touch');
		click(h, tap);
		h.advance(150);
		click(h, h.moved(tap, 20));
		expect(h.log.pins).toHaveLength(1);
		expect(h.log.unpins).toEqual(['p1']);
		h.advance(150);
		click(h, tap);
		expect(h.log.pins, 'and the next tap pins again').toHaveLength(2);
	});
});

test.describe('a finger', () => {
	test('in look mode only orbits and scrolls: the scene never claims it and shows no hover', () => {
		const h = harness('look');
		expect(h.input.pointer('down', h.pointer('touch'), h.ndc)).toBe(false);
		h.input.pointer('move', h.pointer('touch'), h.ndc);
		h.input.pointer('up', h.pointer('touch'), h.ndc);
		expect(h.log.hovers).toEqual([]);
		expect(h.log.pins).toEqual([]);
		expect(h.input.touchAction()).toBe('pan-y');
	});

	test('in probe mode owns the gesture, reads where it is, and pins where it lifts', () => {
		const h = harness('probe');
		expect(h.input.touchAction()).toBe('none');
		expect(h.input.pointer('down', h.pointer('touch'), h.ndc), 'the scene claims it').toBe(true);
		h.pick({ x: 2, y: 1.1, z: 3 });
		h.input.pointer('move', h.pointer('touch'), h.ndc);
		expect(h.log.hovers.at(-1)).toEqual({ x: 2, y: 1.1, z: 3 });
		h.input.pointer('up', h.pointer('touch'), h.ndc);
		expect(h.log.pins).toEqual([{ x: 2, y: 1.1, z: 3 }]);
		expect(h.log.hovers.at(-1), 'a finger has no hover once it lifts').toBeNull();
	});

	test('in probe mode a lift over furniture pins nothing', () => {
		const h = harness('probe');
		h.input.pointer('down', h.pointer('touch'), h.ndc);
		h.pick({ x: 4.5, y: 1.1, z: 1 });
		h.input.pointer('move', h.pointer('touch'), h.ndc);
		h.input.pointer('up', h.pointer('touch'), h.ndc);
		expect(h.log.pins).toEqual([]);
	});

	test('in emit mode releases smoke at once, drags the source with it, and stops when it lifts', () => {
		const h = harness('emit');
		expect(h.input.pointer('down', h.pointer('touch'), h.ndc)).toBe(true);
		expect(h.log.emits).toEqual([{ x: 1, y: 1.1, z: 1 }]);
		expect(h.input.busy).toBe(true);
		h.pick({ x: 3, y: 1.1, z: 2 });
		h.input.pointer('move', h.pointer('touch'), h.ndc);
		expect(h.log.emits.at(-1)).toEqual({ x: 3, y: 1.1, z: 2 });
		h.pick({ x: 4.5, y: 1.1, z: 2 });
		h.input.pointer('move', h.pointer('touch'), h.ndc);
		expect(h.log.emits.at(-1), 'the source stays put while the finger is over furniture').toEqual({ x: 3, y: 1.1, z: 2 });
		h.input.pointer('up', h.pointer('touch'), h.ndc);
		expect(h.log.emits.at(-1)).toBeNull();
		expect(h.log.pins).toEqual([]);
	});

	test('a second finger ends the first press instead of leaving smoke running', () => {
		const h = harness('emit');
		h.input.pointer('down', h.pointer('touch', 1), h.ndc);
		h.input.pointer('down', h.pointer('touch', 2), h.ndc);
		h.input.pointer('up', h.pointer('touch', 1), h.ndc);
		h.input.pointer('up', h.pointer('touch', 2), h.ndc);
		expect(h.log.emits.at(-1)).toBeNull();
		expect(h.input.busy).toBe(false);
	});
});

test.describe('the keyboard', () => {
	test('in look mode leaves every key to the camera', () => {
		const h = harness('look');
		for (const name of ['ArrowLeft', 'Enter', ' ', 'Escape']) expect(h.input.key(h.key(name)), name).toBe(false);
	});

	test('in probe mode moves a cursor from the middle of the home, pins it, and clamps it to the walls', () => {
		const h = harness('probe');
		expect(h.input.key(h.key('ArrowRight'))).toBe(true);
		expect(h.log.hovers.at(-1)).toEqual({ x: 3 + CURSOR_STEP, y: 1.1, z: 2 });
		h.input.key(h.key('ArrowUp'));
		expect(h.log.hovers.at(-1), 'up the plan is north, toward -z').toEqual({ x: 3 + CURSOR_STEP, y: 1.1, z: 2 - CURSOR_STEP });
		h.input.key(h.key('Enter'));
		expect(h.log.pins).toEqual([{ x: 3 + CURSOR_STEP, y: 1.1, z: 2 - CURSOR_STEP }]);
		for (let n = 0; n < 40; n++) h.input.key(h.key('ArrowLeft', { shiftKey: true }));
		expect(h.log.hovers.at(-1)?.x).toBe(0);
		expect(h.input.key(h.key('ArrowLeft', {}, 'keyup')), 'a release is used too, so the camera does not see it').toBe(true);
	});

	test('a held key pins once, and a cursor over furniture pins nothing', () => {
		const h = harness('probe');
		h.input.key(h.key('Enter'));
		h.input.key(h.key('Enter', { repeat: true }));
		expect(h.log.pins).toHaveLength(1);
		for (let n = 0; n < 6; n++) h.input.key(h.key('ArrowRight'));
		h.input.key(h.key(' '));
		expect(h.log.pins, 'x = 4.5 is furniture').toHaveLength(1);
	});

	test('in emit mode Enter toggles smoke at the cursor, the cursor drags it along, and Escape ends it', () => {
		const h = harness('emit');
		h.input.key(h.key(' '));
		expect(h.log.emits).toEqual([{ x: 3, y: 1.1, z: 2 }]);
		expect(h.input.busy).toBe(true);
		h.input.key(h.key('ArrowDown'));
		expect(h.log.emits.at(-1)).toEqual({ x: 3, y: 1.1, z: 2 + CURSOR_STEP });
		h.input.key(h.key('Escape'));
		expect(h.log.emits.at(-1)).toBeNull();
		expect(h.log.hovers.at(-1)).toBeNull();
		expect(h.input.busy).toBe(false);
		h.input.key(h.key('Enter'));
		h.input.key(h.key('Enter'));
		expect(h.log.emits.at(-1), 'a second Enter turns it off').toBeNull();
	});

	test('Escape with nothing to cancel is left to the page', () => {
		const h = harness('probe');
		expect(h.input.key(h.key('Escape'))).toBe(false);
	});

	test('a reset, as when the mode changes, drops the cursor and any smoke', () => {
		const h = harness('emit');
		h.input.key(h.key('Enter'));
		h.input.reset();
		expect(h.log.emits.at(-1)).toBeNull();
		expect(h.log.hovers.at(-1)).toBeNull();
	});
});

test.describe('picking the slice plane', () => {
	const camera = () => {
		// Looking straight down from 10 m over the middle of a 6 × 4 m home.
		const c = new PerspectiveCamera(40, 1.5, 0.1, 100);
		c.position.set(3, 10, 2);
		c.up.set(0, 0, -1);
		c.lookAt(3, 0, 2);
		c.updateMatrixWorld(true);
		return c;
	};
	const home = { width: 6, depth: 4 };

	test('the middle of the Stage looks at the middle of the plane, at the plane’s height', () => {
		const point = pointOnPlane(camera(), { x: 0, y: 0 }, 1.1, home)!;
		expect(point.x).toBeCloseTo(3, 6);
		expect(point.z).toBeCloseTo(2, 6);
		expect(point.y).toBe(1.1);
	});

	test('east is to the right and north is up when the camera looks down with north up', () => {
		const right = pointOnPlane(camera(), { x: 0.3, y: 0 }, 1.1, home)!;
		const up = pointOnPlane(camera(), { x: 0, y: 0.3 }, 1.1, home)!;
		expect(right.x).toBeGreaterThan(3);
		expect(up.z).toBeLessThan(2);
	});

	test('a ray that meets the plane outside the footprint, or points at the sky, is a miss', () => {
		expect(pointOnPlane(camera(), { x: 0.95, y: 0.95 }, 1.1, home)).toBeNull();
		const sky = new PerspectiveCamera(40, 1, 0.1, 100);
		sky.position.set(3, 3, 8);
		sky.lookAt(3, 8, 0);
		sky.updateMatrixWorld(true);
		expect(pointOnPlane(sky, { x: 0, y: 0 }, 1.1, home)).toBeNull();
	});

	test('furniture standing above the plane between the camera and the point hides it, and furniture below the plane does not', () => {
		// From the south and above, looking at the middle of the home: the ray meets the plane at about (3, 1.1, 3.5).
		const c = new PerspectiveCamera(40, 1.5, 0.1, 100);
		c.position.set(3, 6, 10);
		c.lookAt(3, 0, 2);
		c.updateMatrixWorld(true);
		const stand = (height: number, z: number) => {
			const box = new Mesh(new BoxGeometry(0.6, height, 0.6), new MeshBasicMaterial());
			box.position.set(3, height / 2, z);
			box.updateMatrixWorld(true);
			return box;
		};
		const open = pointOnPlane(c, { x: 0, y: 0 }, 1.1, home)!;
		expect(open.z).toBeGreaterThan(3.3);
		expect(open.z).toBeLessThan(3.7);
		expect(pointOnPlane(c, { x: 0, y: 0 }, 1.1, home, [stand(2.4, 4.2)]), 'a wardrobe in front').toBeNull();
		expect(pointOnPlane(c, { x: 0, y: 0 }, 1.1, home, [stand(0.5, 4.2)]), 'a low table in front').toEqual(open);
		expect(pointOnPlane(c, { x: 0, y: 0 }, 1.1, home, [stand(2.4, 1)]), 'a wardrobe behind the point').toEqual(open);
		// The ray goes on past the plane and meets this table top (at about z = 2.67), which is farther away than the plane: not a blocker.
		expect(pointOnPlane(c, { x: 0, y: 0 }, 1.1, home, [stand(0.5, 2.6)]), 'a low table the ray reaches only after the plane').toEqual(open);
		expect(pointOnPlane(c, { x: 0, y: 0 }, 1.1, home, []), 'nothing to hide it').toEqual(open);
	});

	test('the plane height moves the point the same ray reaches', () => {
		const high = pointOnPlane(camera(), { x: 0.4, y: 0 }, 2.0, home)!;
		const low = pointOnPlane(camera(), { x: 0.4, y: 0 }, 0.2, home)!;
		expect(high.x).toBeLessThan(low.x);
	});
});
