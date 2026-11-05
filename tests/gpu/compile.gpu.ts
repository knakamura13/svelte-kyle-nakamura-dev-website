import { expect, test } from '@playwright/test';
import { openHarness } from './harness';
import type { KernelReport } from './entries/compile';

test('every solver kernel compiles, builds a pipeline and accepts its declared bindings', async ({ page }) => {
	await openHarness(page, 'compile.ts');
	const reports = await page.evaluate(() => (window as unknown as { compileAll(): Promise<KernelReport[]> }).compileAll());
	const failures = reports.filter((r) => r.errors.length || r.pipeline || r.bindGroup);
	for (const r of reports) {
		const status = r.errors.length ? 'COMPILE' : r.pipeline ? 'PIPELINE' : r.bindGroup ? 'BINDINGS' : 'ok';
		console.log(`${status.padEnd(8)} ${r.name}`);
		for (const e of r.errors) console.log(`    ${e}`);
		if (r.pipeline) console.log(`    ${r.pipeline}`);
		if (r.bindGroup) console.log(`    ${r.bindGroup}`);
	}
	console.log(`${reports.length - failures.length}/${reports.length} kernels ok`);
	expect(failures.map((r) => r.name)).toEqual([]);
});
