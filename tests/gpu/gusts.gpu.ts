import { expect, test } from '@playwright/test';
import { openHarness } from './harness';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Issue 92 on the GPU: a minute of gusty cross-ventilation in tests/solver/gustyRoom.ts's room, and a minute of the steady wind. The
 * west window's outside pressure, read back from its flow, follows the gust series, and the air the gusty minute moves is what
 * quasi-steady theory expects of that minute and about the steady wind's. tests/solver/gusts.spec.ts holds the CPU to the same bounds
 * and says why they are what they are.
 */
test('on the GPU, an opening’s pressure follows the gust series, and a gusty minute of cross-ventilation moves about the steady wind’s air', async ({ page }) => {
	test.setTimeout(300_000);
	await openHarness(page, 'gusts.ts');
	const r = await page.evaluate(() => (window as any).gusts.run());
	const ratio = r.gustyVolume / r.steadyVolume;
	console.log(
		`gpu: west pressure against the series: correlation ${r.correlation.toFixed(4)}, RMS difference ${(r.error * 100).toFixed(2)} % of its spread ${r.spread.toFixed(2)} Pa; steady ${r.steadyOutside.toFixed(3)} Pa against ${r.steadySeries.toFixed(3)}; a minute moves ${r.gustyVolume.toFixed(2)} m³ gusty, ${r.steadyVolume.toFixed(2)} m³ steady (${(ratio * 100).toFixed(1)} %), quasi-steady theory ${(r.expected.ratio * 100).toFixed(1)} %`
	);
	expect(r.kind).toBe('webgpu');
	expect(r.correlation).toBeGreaterThan(0.99);
	expect(r.error).toBeLessThan(0.05);
	expect(Math.abs(r.steadyOutside / r.steadySeries - 1)).toBeLessThan(0.02);
	expect(Math.abs(ratio / r.expected.ratio - 1)).toBeLessThan(0.03);
	expect(Math.abs(ratio - 1)).toBeLessThan(0.3);
});

/** The long-run mean outside pressure, as tests/solver/gusts.spec.ts checks it on the CPU, with the same bounds and the reasons for them there. */
test('on the GPU, the long-run mean outside pressure on each window is the steady wind’s', async ({ page }) => {
	test.setTimeout(600_000);
	await openHarness(page, 'gusts.ts');
	const r = await page.evaluate(() => (window as any).gusts.long(3600));
	const across = (r.west - r.east) / (r.steadyWest - r.steadyEast);
	console.log(
		`gpu, an hour: west ${r.west.toFixed(3)} Pa (series ${r.seriesWest.toFixed(3)}, steady ${r.steadyWest.toFixed(3)}, ${((r.west / r.steadyWest) * 100).toFixed(2)} %), east ${r.east.toFixed(3)} Pa (series ${r.seriesEast.toFixed(3)}, steady ${r.steadyEast.toFixed(3)}, ${((r.east / r.steadyEast) * 100).toFixed(2)} %), across ${(across * 100).toFixed(2)} %`
	);
	expect(r.kind).toBe('webgpu');
	expect(Math.abs(r.west / r.steadyWest - 1)).toBeLessThan(0.15);
	expect(Math.abs(r.east / r.steadyEast - 1)).toBeLessThan(0.15);
	expect(Math.abs(across - 1)).toBeLessThan(0.08);
	expect(Math.abs(r.west / r.seriesWest - 1)).toBeLessThan(0.01);
	expect(Math.abs(r.east / r.seriesEast - 1)).toBeLessThan(0.01);
});
