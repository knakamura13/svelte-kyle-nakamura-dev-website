/**
 * Screenshots the dollhouse scene in Chromium (issue #30). Throwaway QA tooling, not shipped.
 *
 *   node scripts/airflow-qa/dollhouse/shoot.mjs <outDir> [set ...] [--swiftshader] [--sizes=1280x800,390x800]
 *
 * Sets: overview (every plan, three-quarter, furniture), north, topdown, openings (each kind at 0, 0.5, 1), bare (furniture
 * off), all (the default), or `state:<json>` for one shot. It bundles entry.ts with esbuild, serves the page on a free
 * port, and prints every console message and page error first, because a shader compile error shows up there.
 */
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith('--'));
const positional = args.filter((a) => !a.startsWith('--'));
// Screenshots are evidence, not source: default to the system temp directory so they never land in the repo.
const outDir = resolve(positional.shift() ?? join(tmpdir(), 'airflow-dollhouse-qa'));
const sets = positional.length ? positional : ['all'];
const sizes = (flags.find((f) => f.startsWith('--sizes='))?.slice(8) ?? '1280x800,390x800').split(',').map((s) => s.split('x').map(Number));
const swiftshader = flags.includes('--swiftshader');
const dpr = Number(flags.find((f) => f.startsWith('--dpr='))?.slice(6) ?? 1);
// --clip=x,y,w,h crops each screenshot to that rectangle, in CSS pixels.
const clip = flags.find((f) => f.startsWith('--clip='))?.slice(7).split(',').map(Number);

mkdirSync(outDir, { recursive: true });
execFileSync(join(root, 'node_modules/.bin/esbuild'), [join(here, 'entry.ts'), '--bundle', '--format=esm', '--alias:$lib=./src/lib', `--outfile=${join(outDir, 'dollhouse.js')}`, '--log-level=warning'], { cwd: root, stdio: 'inherit' });

const server = createServer((request, response) => {
	const path = request.url?.split('?')[0] ?? '/';
	try {
		if (path === '/' || path === '/index.html') {
			response.setHeader('content-type', 'text/html');
			response.end(readFileSync(join(here, 'index.html')));
		} else if (path === '/dollhouse.js') {
			response.setHeader('content-type', 'text/javascript');
			response.end(readFileSync(join(outDir, 'dollhouse.js')));
		} else {
			response.statusCode = 404;
			response.end('not found');
		}
	} catch (error) {
		response.statusCode = 500;
		response.end(String(error));
	}
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const url = `http://127.0.0.1:${server.address().port}/`;

const HOUSE = 'house';
const SHOTS = {
	overview: () => ['studio', 'one-bedroom', 'two-bedroom', 'house'].map((plan) => ({ name: `${plan}-three-quarter`, state: { plan, furniture: true } })),
	north: () => [{ name: 'two-bedroom-from-north', state: { plan: 'two-bedroom', yaw: 180, furniture: true } }, { name: 'house-from-north', state: { plan: HOUSE, yaw: 180, furniture: true } }],
	topdown: () => ['studio', 'one-bedroom', 'two-bedroom', 'house'].map((plan) => ({ name: `${plan}-topdown`, state: { plan, topDown: true, furniture: true } })),
	bare: () => [{ name: 'house-no-furniture', state: { plan: HOUSE, furniture: false } }, { name: 'studio-no-furniture', state: { plan: 'studio', furniture: false } }],
	openings: () => {
		// One of each kind of opening on a far wall of the house (it has all four kinds), at 0, 0.5 and 1 of its travel.
		const kinds = {
			'double-hung': 'living-north-window-1',
			'sliding-door': 'patio-door',
			casement: 'living-east-window',
			'casement-hopper': 'clerestory-window',
			door: 'front-door',
			'door-inner': 'bedroom-2-door'
		};
		return Object.entries(kinds).flatMap(([kind, id]) =>
			[0, 0.5, 1].map((open) => ({ name: `open-${kind}-${String(open).replace('.', '_')}`, state: { plan: HOUSE, focus: id, openings: { [id]: open }, side: 'in', furniture: true } }))
		);
	}
};
const order = ['overview', 'north', 'topdown', 'bare', 'openings'];
const wanted = sets.includes('all') ? order : sets;
const shots = wanted.flatMap((set, n) => (set.startsWith('state:') ? [{ name: `custom${n}`, state: JSON.parse(set.slice(6)) }] : (SHOTS[set]?.() ?? (console.error(`Unknown set ${set}`), []))));

const browser = await chromium.launch(swiftshader ? { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } : {});
const log = [];
let failed = false;
for (const [width, height] of sizes) {
	const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr });
	const page = await context.newPage();
	page.on('console', (message) => log.push(`[${width}x${height} console.${message.type()}] ${message.text()}`));
	page.on('pageerror', (error) => log.push(`[${width}x${height} pageerror] ${error.message}`));
	await page.goto(url);
	await page.waitForFunction(() => window.__ready === true, null, { timeout: 15000 }).catch(() => {
		failed = true;
	});
	if (failed) break;
	for (const { name, state } of shots) {
		try {
			await page.evaluate((s) => window.__setState(s), state);
			const file = join(outDir, `${name}-${width}x${height}.png`);
			await page.screenshot({ path: file, ...(clip ? { clip: { x: clip[0], y: clip[1], width: clip[2], height: clip[3] } } : {}) });
			console.log(`shot ${file}`);
		} catch (error) {
			log.push(`[${width}x${height} shot ${name}] ${error.message}`);
		}
	}
	if (process.env.DEBUG_STATE) console.log(JSON.stringify(await page.evaluate(() => window.__debug())));
	await context.close();
}
await browser.close();
server.close();
writeFileSync(join(outDir, 'console.log'), log.join('\n'));
console.log(failed ? 'PAGE NEVER BECAME READY' : '');
console.log(log.length ? `--- ${log.length} console messages ---\n${log.join('\n')}` : '--- no console messages ---');
