/**
 * Builds the visualization harness with esbuild, serves it on a free port, runs a CPU world in Chromium and takes the
 * screenshots listed below. Nothing is written inside the repository except what you point `--out` at (use a scratch
 * folder: never commit the PNGs).
 *
 *   node scripts/airflow-qa/viz/shoot.mjs --out /tmp/airflow-viz [--only name,name] [--seconds 30] [--plan two-bedroom] [--swiftshader] [--fan] [--purifier] [--wind 6] [--probe]
 *
 * Console messages and page errors are printed first: shader compile errors show up there.
 */
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const args = process.argv.slice(2);
const option = (name, fallback) => {
	const at = args.indexOf(`--${name}`);
	return at >= 0 && args[at + 1] && !args[at + 1].startsWith('--') ? args[at + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);
const out = resolve(option('out', '/tmp/airflow-viz'));
const only = option('only', '')?.split(',').filter(Boolean);
const seconds = Number(option('seconds', '30'));
const plan = option('plan', 'two-bedroom');
mkdirSync(out, { recursive: true });

await build({
	entryPoints: [join(here, 'main.ts')],
	bundle: true,
	format: 'esm',
	outfile: join(out, 'viz.js'),
	alias: { $lib: join(root, 'src/lib') },
	sourcemap: 'inline',
	logLevel: 'warning'
});

const server = createServer((request, response) => {
	const path = request.url?.split('?')[0] ?? '/';
	try {
		if (path === '/' || path === '/index.html') response.writeHead(200, { 'content-type': 'text/html' }).end(readFileSync(join(here, 'index.html')));
		else if (path === '/viz.js') response.writeHead(200, { 'content-type': 'text/javascript' }).end(readFileSync(join(out, 'viz.js')));
		else response.writeHead(404).end();
	} catch (error) {
		response.writeHead(500).end(String(error));
	}
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const url = `http://127.0.0.1:${server.address().port}/`;

const DESKTOP = [1280, 800];
const PHONE = [390, 800];
const smokeBurst = { at: [2.4, 1.1, 5.2], mgPerMinute: 20 };

/** name, viewport and the view state to draw. */
const shots = [];
const add = (name, viewport, state) => shots.push({ name, viewport, state });
for (const [tag, viewport, pixelRatio] of [['desktop', DESKTOP, 1], ['phone', PHONE, 2]]) {
	for (const layer of ['speed', 'direction', 'particulates', 'temperature']) add(`${tag}-${layer}`, viewport, { layer, pixelRatio });
	for (const layer of ['speed', 'direction', 'particulates', 'temperature']) add(`${tag}-topdown-${layer}`, viewport, { layer, topDown: true, pixelRatio });
}
add('desktop-speed-sens0.5', DESKTOP, { layer: 'speed', sensitivity: 0.5 });
add('desktop-speed-sens2', DESKTOP, { layer: 'speed', sensitivity: 2 });
add('desktop-particulates-sens0.5', DESKTOP, { layer: 'particulates', sensitivity: 0.5 });
add('desktop-particulates-sens2', DESKTOP, { layer: 'particulates', sensitivity: 2 });
add('desktop-temperature-sens0.5', DESKTOP, { layer: 'temperature', sensitivity: 0.5 });
add('desktop-temperature-sens2', DESKTOP, { layer: 'temperature', sensitivity: 2 });
add('desktop-direction-sens0.5', DESKTOP, { layer: 'direction', sensitivity: 0.5 });
add('desktop-direction-sens2', DESKTOP, { layer: 'direction', sensitivity: 2 });
add('desktop-speed-h0.3', DESKTOP, { layer: 'speed', sliceHeight: 0.3 });
add('desktop-speed-h1.7', DESKTOP, { layer: 'speed', sliceHeight: 1.7 });
add('desktop-topdown-speed-h0.3', DESKTOP, { layer: 'speed', sliceHeight: 0.3, topDown: true });
add('desktop-topdown-speed-h1.7', DESKTOP, { layer: 'speed', sliceHeight: 1.7, topDown: true });
add('desktop-direction-h0.3', DESKTOP, { layer: 'direction', sliceHeight: 0.3 });
add('desktop-direction-h1.7', DESKTOP, { layer: 'direction', sliceHeight: 1.7 });
add('desktop-speed-tracers-off', DESKTOP, { layer: 'speed', tracers: false });
add('desktop-speed-tracers-only', DESKTOP, { layer: 'speed', slice: false, smoke: false });
add('desktop-smoke-only', DESKTOP, { layer: 'speed', slice: false, tracers: false });
add('desktop-topdown-labels', DESKTOP, { layer: 'speed', topDown: true, labels: 'all', tracers: false, smoke: false });
add('desktop-topdown-metric', DESKTOP, { layer: 'speed', topDown: true, units: 'metric' });
for (const [tint, layer] of [['peach', 'particulates'], ['butter', 'particulates'], ['sage', 'temperature'], ['peach', 'speed'], ['lilac', 'direction']]) add(`tint-${tint}-${layer}`, DESKTOP, { layer, tint, topDown: true });
add('dark-speed', DESKTOP, { layer: 'speed', theme: 'dark' });
add('dark-direction', DESKTOP, { layer: 'direction', theme: 'dark' });
add('dark-particulates', DESKTOP, { layer: 'particulates', theme: 'dark' });
add('dark-temperature', DESKTOP, { layer: 'temperature', theme: 'dark' });
add('dark-topdown-direction', DESKTOP, { layer: 'direction', theme: 'dark', topDown: true });

const launch = { args: flag('swiftshader') ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [] };
const browser = await chromium.launch(launch);
let failed = false;
try {
	const context = await browser.newContext({ viewport: { width: DESKTOP[0], height: DESKTOP[1] }, deviceScaleFactor: 1 });
	const page = await context.newPage();
	page.setDefaultTimeout(600_000);
	const messages = [];
	page.on('console', (message) => {
		const line = `[console.${message.type()}] ${message.text()}`;
		messages.push(line);
		console.log(line);
	});
	page.on('pageerror', (error) => {
		failed = true;
		console.log(`[pageerror] ${error.stack ?? error.message}`);
	});
	await page.goto(url);
	await page.waitForFunction(() => window.__ready === true);
	console.log(await page.evaluate((o) => window.__init(o), { plan, smoke: smokeBurst, fan: flag('fan'), purifier: flag('purifier'), windSpeed: Number(option('wind', '6')) }));
	console.log(await page.evaluate((s) => window.__simulate(s), seconds));
	if (flag('probe')) {
		for (const layer of ['speed', 'direction', 'particulates', 'temperature'])
			for (const sensitivity of [1, 0.5, 2]) {
				const result = await page.evaluate(([l, s]) => window.__probe(l, s), [layer, sensitivity]);
				console.log(`probe ${layer} sensitivity ${sensitivity}: worst difference ${Math.max(...result.rows.map((r) => r.maxDiff))} bytes\n  ${result.rows.map((r) => `${r.value}: expected ${r.expected} got ${r.estimate}`).join('\n  ')}`);
			}
	}
	for (const shot of shots) {
		if (flag('probe') && !only.length) break;
		if (only.length && !only.some((name) => shot.name === name || shot.name.includes(name))) continue;
		await page.setViewportSize({ width: shot.viewport[0], height: shot.viewport[1] });
		const base = { layer: 'speed', sensitivity: 1, sliceHeight: 1.1, tracers: true, smoke: true, topDown: false, theme: 'light', tint: 'mist', units: 'imperial', baseline: 0, labels: 'compass', slice: true, pixelRatio: 1, azimuth: 28 };
		const report = await page.evaluate((s) => window.__setState(s), { ...base, ...shot.state });
		const file = join(out, `${shot.name}.png`);
		await page.screenshot({ path: file });
		console.log(`${shot.name}: ${file}\n  ${JSON.stringify(report)}`);
	}
	if (messages.some((m) => /error|warn/i.test(m))) console.log('(console had warnings or errors, see above)');
} finally {
	await browser.close();
	server.close();
}
if (failed) process.exitCode = 1;
