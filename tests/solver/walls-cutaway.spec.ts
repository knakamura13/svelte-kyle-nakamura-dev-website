import { expect, test } from '@playwright/test';
import { farDistance, homeView, pose } from '../../src/lib/experiments/airflow/scene/camera/sims';
import { CUT_HEIGHT, DOWN_HEIGHT, corridorFor, cutWalls, nextWallMode, wallHeights, type WallLine } from '../../src/lib/experiments/airflow/scene/walls/cutaway';
import { wallLines } from '../../src/lib/experiments/airflow/scene/walls/walls';
import { planById } from '../../src/lib/experiments/airflow/homes/plans';
import { wallRuns } from '../../src/lib/experiments/airflow/scene/wallPieces';
import { QUALITY, chooseQuality } from '../../src/lib/experiments/airflow/scene/look/quality';

/**
 * The cutaway: which walls drop and which stand, as plain geometry. A box Home 12 by 8 m (x east, z south) with one inside wall
 * down its middle at x = 6, and the real two-bedroom plan.
 */

const north: WallLine = { ax: 0, az: 0, bx: 12, bz: 0 };
const south: WallLine = { ax: 0, az: 8, bx: 12, bz: 8 };
const west: WallLine = { ax: 0, az: 0, bx: 0, bz: 8 };
const east: WallLine = { ax: 12, az: 0, bx: 12, bz: 8 };
const middle: WallLine = { ax: 6, az: 0, bx: 6, bz: 8 };
const BOX = [north, south, west, east, middle];

test('walls up stand every wall full height, walls down drop them all, and C steps through the three', () => {
	const cut = [true, false, true, false, false];
	expect(wallHeights('up', cut, 2.4)).toEqual([2.4, 2.4, 2.4, 2.4, 2.4]);
	expect(wallHeights('down', cut, 2.4)).toEqual(Array(5).fill(DOWN_HEIGHT));
	expect(wallHeights('cutaway', cut, 2.4)).toEqual([CUT_HEIGHT, 2.4, CUT_HEIGHT, 2.4, 2.4]);
	expect(nextWallMode('cutaway')).toBe('up');
	expect(nextWallMode('up')).toBe('down');
	expect(nextWallMode('down')).toBe('cutaway');
});

test('from outside and far out, the near walls drop and the far ones stand', () => {
	// The camera south-west of the Home, looking at a point in the east half.
	const cut = cutWalls(BOX, { camera: { x: -10, z: 20 }, focus: { x: 8, z: 4 }, corridor: corridorFor(0.8) });
	expect(cut).toEqual([false, true, true, false, true]);
});

test('at eye level only the wall in front of the visitor drops: the walls round the room they stand in stay up', () => {
	// Standing in the west room looking east into the east room, through the middle wall.
	const across = cutWalls(BOX, { camera: { x: 3, z: 4 }, focus: { x: 7.5, z: 4 }, corridor: corridorFor(0) });
	expect(across).toEqual([false, false, false, false, true]);
	// Looking at the west room's own far corner: nothing stands between, so nothing drops.
	const within = cutWalls(BOX, { camera: { x: 4.5, z: 6 }, focus: { x: 2, z: 2 }, corridor: corridorFor(0) });
	expect(within).toEqual([false, false, false, false, false]);
	// A wall whose line is crossed far past its end stays up close in: a short wall at the north end of the middle line.
	const stub: WallLine = { ax: 6, az: 0, bx: 6, bz: 2 };
	expect(cutWalls([stub], { camera: { x: 3, z: 7 }, focus: { x: 8, z: 7 }, corridor: corridorFor(0) })).toEqual([false]);
	expect(cutWalls([stub], { camera: { x: -10, z: 20 }, focus: { x: 8, z: 7 }, corridor: corridorFor(1) }), 'but far out it drops').toEqual([true]);
});

test('a wall the camera stands in drops, and a cut wall stays cut until the camera is clearly past it', () => {
	expect(cutWalls([middle], { camera: { x: 6.1, z: 4 }, focus: { x: 6.5, z: 4 }, corridor: 0.5 })).toEqual([true]);
	// Just across the line, back on the focus's side: a wall that was cut stays cut, one that was not stays up.
	const near = { camera: { x: 6.4, z: 4 }, focus: { x: 8, z: 4 }, corridor: 0.5 };
	expect(cutWalls([middle], near, [true])).toEqual([true]);
	expect(cutWalls([middle], near, [false])).toEqual([false]);
	expect(cutWalls([middle], { ...near, camera: { x: 7, z: 4 } }, [true]), 'clearly past it').toEqual([false]);
});

test('the corridor is narrow close in and wide far out', () => {
	expect(corridorFor(0)).toBeLessThan(1);
	expect(corridorFor(1)).toBeGreaterThan(5);
	for (let zoom = 0.05; zoom <= 1; zoom += 0.05) expect(corridorFor(zoom)).toBeGreaterThanOrEqual(corridorFor(zoom - 0.05));
});

test('in the two-bedroom’s default view, from the south-south-west, the south wall drops and the north and east ones stand', () => {
	const plan = planById('two-bedroom')!;
	const runs = wallRuns(plan);
	const lines = wallLines(runs);
	const bounds = { width: plan.width, depth: plan.depth, ceiling: plan.ceiling };
	const view = homeView(bounds);
	const at = pose(view, bounds, farDistance(bounds, (45 * Math.PI) / 180, 1.6));
	const cut = cutWalls(lines, { camera: { x: at.position[0], z: at.position[2] }, focus: { x: view.x, z: view.z }, corridor: corridorFor(view.zoom) });
	const byId = Object.fromEntries(runs.map((run, n) => [run.id, cut[n]]));
	expect(byId).toMatchObject({ north: false, east: false, south: true });
	// The inside walls on the near side of the focus drop too, and the ones beyond it stand.
	expect(cut.some((isCut, n) => isCut && runs[n].out === 0)).toBe(true);
	expect(cut.some((isCut, n) => !isCut && runs[n].out === 0)).toBe(true);
});

test('the quality tier: a phone gets low, a small machine medium, a desktop high, and the address can ask for any', () => {
	expect(chooseQuality({ search: '', small: false })).toBe('high');
	expect(chooseQuality({ search: '', small: true })).toBe('low');
	expect(chooseQuality({ search: '', small: false, cores: 4 })).toBe('medium');
	expect(chooseQuality({ search: '?quality=low', small: false })).toBe('low');
	expect(chooseQuality({ search: '?cell=0.2&quality=high', small: true })).toBe('high');
	expect(chooseQuality({ search: '?quality=ultra', small: true }), 'an unknown tier is ignored').toBe('low');
	expect(QUALITY.low.ao, 'a phone draws no ambient occlusion').toBeNull();
	expect(QUALITY.high.ao).not.toBeNull();
	expect(QUALITY.low.shadows!.size).toBeLessThan(QUALITY.high.shadows!.size);
});
