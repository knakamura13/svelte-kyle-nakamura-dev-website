import { expect, test } from '@playwright/test';
import { SMALL_SIDE, cellFromSearch, isSmallDevice } from '../../src/lib/experiments/airflow/sim/device';
import { CELL_SIZES } from '../../src/lib/experiments/airflow/sim/tuner';

/**
 * What the page knows about the device that the auto-tuner does not measure its way to. Both are functions of what the browser
 * reports, so they are tested here with made-up facts; the page's own test (tests/airflow-tune.spec.ts) shows each browser's
 * emulation of a touch screen reaching them.
 */

test.describe('a phone or a small tablet', () => {
	const touch = (width: number, height: number) => isSmallDevice({ coarsePointer: true, width, height });
	const mouse = (width: number, height: number) => isSmallDevice({ coarsePointer: false, width, height });

	test('is a touch screen whose short side is at most 820 CSS px, held either way up', () => {
		expect(SMALL_SIDE).toBe(820);
		for (const [name, width, height] of [
			['iPhone SE', 375, 667],
			['iPhone 15', 393, 852],
			['a phone on its side', 852, 393],
			['Pixel 7', 412, 915],
			['iPad mini', 744, 1133],
			['iPad, tenth generation', 820, 1180],
			['the same on its side', 1180, 820]
		] as const)
			expect(touch(width, height), name).toBe(true);
		for (const [name, width, height] of [
			['iPad Pro 11 inch', 834, 1194],
			['iPad Pro 12.9 inch', 1024, 1366],
			['a Surface held as a tablet', 1368, 912]
		] as const)
			expect(touch(width, height), name).toBe(false);
	});

	test('is never a screen with a mouse or a trackpad, however small the window is: a narrow window on a desktop is not a small device', () => {
		for (const [width, height] of [
			[390, 844],
			[800, 600],
			[1440, 900]
		]) expect(mouse(width, height), `${width} by ${height}`).toBe(false);
	});
});

test.describe('a cell size asked for in the address', () => {
	test('is one of the sizes the simulation runs at, written as a number of metres', () => {
		for (const h of CELL_SIZES) expect(cellFromSearch(`?cell=${h}`), `${h}`).toBe(h);
		expect(cellFromSearch('?cell=0.15')).toBe(0.15);
		expect(cellFromSearch('?debug=1&cell=0.075&x=2')).toBe(0.075);
		expect(cellFromSearch('?cell=.2')).toBe(0.2);
		expect(cellFromSearch('?cell=0.15&cell=0.2'), 'the first of two is the one').toBe(0.15);
	});

	test('is nothing when it is missing or is not one of them, so a mistyped address runs the tuner as usual', () => {
		for (const search of ['', '?', '?cell=', '?cell=abc', '?cell=0.12', '?cell=15', '?cell=-0.15', '?cell=0', '?cell=0.15cm', '?cell=0.2x&cell=0.15', '?Cell=0.15']) expect(cellFromSearch(search), search).toBeUndefined();
	});
});
