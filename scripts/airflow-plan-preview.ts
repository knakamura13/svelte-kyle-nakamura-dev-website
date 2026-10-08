/**
 * Draws every airflow home plan top-down from its data, as SVG and PNG, to check by eye that each is a believable
 * home: walls, doors with their swings, windows coloured by kind, the sliding door, furniture, room names and
 * areas, a scale bar, and anything `validatePlan` objects to. Nothing is written inside the repository.
 *
 * Run from the repository root (the second argument is the output folder, default the OS temp folder):
 *
 *   node_modules/.bin/esbuild scripts/airflow-plan-preview.ts --bundle --platform=node --format=esm \
 *     --packages=external --outfile=/tmp/airflow-plan-preview.mjs && node /tmp/airflow-plan-preview.mjs /tmp/airflow-plans
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { plans } from '../src/lib/experiments/airflow/homes/plans';
import { isExterior, squareFeet, type HomePlan, type OpeningSpec, type Room } from '../src/lib/experiments/airflow/homes/types';
import { validatePlan } from '../src/lib/experiments/airflow/homes/validate';

// Resolved from the repository, wherever esbuild wrote the bundle.
const load = createRequire(resolve('package.json'));
const { chromium } = load('@playwright/test') as typeof import('@playwright/test');

/** Pixels per metre, and how thick walls are drawn (the plan's walls are lines; its outside dimensions are the rooms'). */
const S = 64;
const OUTER = 0.16;
const INNER = 0.1;
const MARGIN = 90;
const PANEL = 600;

const COLOURS: Record<OpeningSpec['kind'], string> = { door: '#92400e', 'sliding-door': '#c2410c', 'double-hung': '#1d4ed8', casement: '#047857' };
const ROOM_FILLS: [RegExp, string][] = [
	[/bath/i, '#dbeafe'],
	[/bed/i, '#ede9fe'],
	[/kitchen/i, '#fef3c7'],
	[/dining/i, '#ffedd5'],
	[/living|main/i, '#dcfce7'],
	[/laundry/i, '#ccfbf1'],
	[/hall/i, '#f1f5f9']
];

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fixed = (value: number, digits = 2) => Number(value.toFixed(digits)).toString();
const roomArea = (room: Room) => room.rects.reduce((sum, r) => sum + r.w * r.d, 0);
const roomAt = (plan: HomePlan, x: number, z: number) => plan.rooms.find((room) => room.rects.some((r) => x >= r.x && x < r.x + r.w && z >= r.z && z < r.z + r.d));

/** Where an opening sits: which way its wall runs, the wall's line, its frame along the wall, and (outside walls) which way is in. */
function frameOf(plan: HomePlan, opening: OpeningSpec) {
	const p = opening.placement;
	const alongX = isExterior(p) ? p.facade === 'north' || p.facade === 'south' : p.axis === 'x';
	const line = isExterior(p) ? (p.facade === 'north' || p.facade === 'west' ? 0 : alongX ? plan.depth : plan.width) : p.at;
	const inward = isExterior(p) ? (p.facade === 'north' || p.facade === 'west' ? 1 : -1) : 0;
	return { alongX, line, u0: p.center - opening.width / 2, u1: p.center + opening.width / 2, inward };
}

/** A point `u` along a wall and `v` across it, in plan metres. */
const at = (alongX: boolean, line: number, u: number, v: number): [number, number] => (alongX ? [u, line + v] : [line + v, u]);

/** Doors swing into the room they serve: an entry door into the home, others away from the hall, else into the smaller room. */
function swingSide(plan: HomePlan, opening: OpeningSpec): 1 | -1 {
	const f = frameOf(plan, opening);
	if (f.inward) return f.inward as 1 | -1;
	const a = roomAt(plan, ...at(f.alongX, f.line, opening.placement.center, -0.05));
	const b = roomAt(plan, ...at(f.alongX, f.line, opening.placement.center, 0.05));
	if (!a || !b) return 1;
	const hall = (room: Room) => /hall/i.test(room.name);
	if (hall(a) !== hall(b)) return hall(a) ? 1 : -1;
	return roomArea(a) <= roomArea(b) ? -1 : 1;
}

/** The parts of [from, to] that no opening covers. */
function gaps(from: number, to: number, spans: [number, number][]) {
	const pieces: [number, number][] = [];
	let start = from;
	for (const [a, b] of [...spans].sort((p, q) => p[0] - q[0])) {
		if (a > start) pieces.push([start, Math.min(a, to)]);
		start = Math.max(start, b);
	}
	if (start < to) pieces.push([start, to]);
	return pieces.filter(([a, b]) => b - a > 1e-6);
}

function drawPlan(plan: HomePlan) {
	const problems = validatePlan(plan);
	const header = 110 + problems.length * 18;
	const width = MARGIN * 2 + plan.width * S + PANEL;
	const height = Math.max(header + MARGIN * 2 + plan.depth * S + 60, header + 60 + plan.openings.length * 34 + 260);
	const X = (x: number) => MARGIN + x * S;
	const Y = (z: number) => header + MARGIN + z * S;
	const out: string[] = [];
	const rect = (x: number, z: number, w: number, d: number, attrs: string) => out.push(`<rect x="${X(x)}" y="${Y(z)}" width="${w * S}" height="${d * S}" ${attrs}/>`);
	const text = (x: number, y: number, content: string, attrs = '') => out.push(`<text x="${x}" y="${y}" ${attrs}>${escape(content)}</text>`);
	const halo = 'paint-order="stroke" stroke="#fff" stroke-width="3" stroke-linejoin="round"';

	// Rooms, and the 0.6 m module the plans are drawn on.
	for (const room of plan.rooms) {
		const fill = ROOM_FILLS.find(([pattern]) => pattern.test(room.name))?.[1] ?? '#f5f5f4';
		for (const r of room.rects) rect(r.x, r.z, r.w, r.d, `fill="${fill}"`);
	}
	for (let x = 0.6; x < plan.width - 1e-6; x += 0.6) out.push(`<line x1="${X(x)}" y1="${Y(0)}" x2="${X(x)}" y2="${Y(plan.depth)}" stroke="#000" stroke-opacity="0.05"/>`);
	for (let z = 0.6; z < plan.depth - 1e-6; z += 0.6) out.push(`<line x1="${X(0)}" y1="${Y(z)}" x2="${X(plan.width)}" y2="${Y(z)}" stroke="#000" stroke-opacity="0.05"/>`);

	// Furniture: grey boxes, darker the taller they are, labelled with name and height.
	for (const item of plan.furniture) {
		const shade = Math.round(215 - Math.min(item.h, 2) * 45);
		rect(item.x, item.z, item.w, item.d, `fill="rgb(${shade},${shade},${shade})" stroke="#555" stroke-width="1"`);
		const cx = X(item.x + item.w / 2);
		const cy = Y(item.z + item.d / 2);
		const long = Math.max(item.w, item.d) * S;
		const label = `${item.name} ${fixed(item.h)}`;
		const vertical = item.d > item.w * 1.3 && label.length * 5.6 > item.w * S;
		const fits = label.length * 5.6 <= long;
		const shown = fits ? label : `${item.name.split(' ').map((word) => word[0]).join('')} ${fixed(item.h)}`;
		text(cx, cy + 3.5, shown, `font-size="10" text-anchor="middle" fill="#111" ${halo}${vertical ? ` transform="rotate(-90 ${cx} ${cy})"` : ''}`);
	}

	// Walls, broken where an opening is.
	const wallKeyOf = (o: OpeningSpec) => (isExterior(o.placement) ? o.placement.facade : `${o.placement.axis}@${o.placement.at}`);
	const spansOn = (key: string) => plan.openings.filter((o) => wallKeyOf(o) === key).map((o): [number, number] => [o.placement.center - o.width / 2, o.placement.center + o.width / 2]);
	const band = (alongX: boolean, line: number, u0: number, u1: number, v0: number, v1: number, attrs: string) => {
		const [x0, z0] = at(alongX, line, u0, Math.min(v0, v1));
		const [x1, z1] = at(alongX, line, u1, Math.max(v0, v1));
		rect(Math.min(x0, x1), Math.min(z0, z1), Math.abs(x1 - x0), Math.abs(z1 - z0), attrs);
	};
	const facades = [
		{ facade: 'north', alongX: true, line: 0, length: plan.width, inward: 1 },
		{ facade: 'south', alongX: true, line: plan.depth, length: plan.width, inward: -1 },
		{ facade: 'west', alongX: false, line: 0, length: plan.depth, inward: 1 },
		{ facade: 'east', alongX: false, line: plan.width, length: plan.depth, inward: -1 }
	] as const;
	for (const f of facades) {
		// North and south bands run past the corners to close them.
		const reach = f.alongX ? OUTER : 0;
		for (const [a, b] of gaps(-reach, f.length + reach, spansOn(f.facade))) band(f.alongX, f.line, a, b, 0, -f.inward * OUTER, 'fill="#1f2937"');
		const [lx, lz] = at(f.alongX, f.line, f.length / 2, -f.inward * (OUTER + 0.45));
		text(X(lx), Y(lz) + 4, f.facade.toUpperCase(), 'font-size="11" text-anchor="middle" fill="#9ca3af" letter-spacing="2"');
	}
	for (const wall of plan.walls) {
		const alongX = wall.axis === 'x';
		for (const [a, b] of gaps(wall.from, wall.to, spansOn(`${wall.axis}@${wall.at}`))) band(alongX, wall.at, a, b, -INNER / 2, INNER / 2, 'fill="#374151"');
	}

	// Openings.
	for (const [n, o] of plan.openings.entries()) {
		const f = frameOf(plan, o);
		const colour = COLOURS[o.kind];
		const thick = f.inward ? OUTER : INNER;
		// The wall's band across this opening: v from `near` (the inside face, or one face of a partition) to `far`.
		const near = f.inward ? 0 : -INNER / 2;
		const far = f.inward ? -f.inward * OUTER : INNER / 2;
		const across = (t: number) => near + (far - near) * t;
		const line = (u0: number, v0: number, u1: number, v1: number, attrs: string) => {
			const [x0, z0] = at(f.alongX, f.line, u0, v0);
			const [x1, z1] = at(f.alongX, f.line, u1, v1);
			out.push(`<line x1="${X(x0)}" y1="${Y(z0)}" x2="${X(x1)}" y2="${Y(z1)}" ${attrs}/>`);
		};
		if (o.kind === 'door') {
			const side = swingSide(plan, o);
			const hinge = o.anchor === 'start' ? f.u1 : f.u0;
			const latch = o.anchor === 'start' ? f.u0 : f.u1;
			const base = f.inward ? 0 : side * (INNER / 2);
			const points: string[] = [];
			for (let s = 0; s <= 24; s++) {
				const angle = (s / 24) * (Math.PI / 2);
				const [x, z] = at(f.alongX, f.line, hinge + (latch - hinge) * Math.cos(angle), base + side * o.width * Math.sin(angle));
				points.push(`${X(x)},${Y(z)}`);
			}
			out.push(`<polyline points="${points.join(' ')}" fill="none" stroke="${colour}" stroke-width="1" stroke-dasharray="4 3"/>`);
			line(hinge, base, hinge, base + side * o.width, `stroke="${colour}" stroke-width="3"`);
			line(f.u0, across(0), f.u0, across(1), `stroke="${colour}" stroke-width="2"`);
			line(f.u1, across(0), f.u1, across(1), `stroke="${colour}" stroke-width="2"`);
		} else if (o.kind === 'sliding-door') {
			// Two panels, the one at the anchor end slides behind the other; the arrow shows which way it opens.
			const middle = (f.u0 + f.u1) / 2;
			const moving: [number, number] = o.anchor === 'start' ? [f.u0, middle + 0.05] : [middle - 0.05, f.u1];
			const fixedPanel: [number, number] = o.anchor === 'start' ? [middle - 0.05, f.u1] : [f.u0, middle + 0.05];
			band(f.alongX, f.line, moving[0], moving[1], across(0.15), across(0.45), `fill="${colour}"`);
			band(f.alongX, f.line, fixedPanel[0], fixedPanel[1], across(0.55), across(0.85), `fill="#fdba74" stroke="${colour}"`);
			const direction = o.anchor === 'start' ? 1 : -1;
			const start = o.anchor === 'start' ? f.u0 + 0.15 : f.u1 - 0.15;
			line(start, across(0) + f.inward * 0.25, start + direction * 0.6, across(0) + f.inward * 0.25, `stroke="${colour}" stroke-width="2" marker-end="url(#arrow)"`);
		} else {
			const high = o.sill >= 1.5;
			const dash = high ? 'stroke-dasharray="5 3"' : '';
			band(f.alongX, f.line, f.u0, f.u1, near, far, 'fill="#fff"');
			line(f.u0, across(0.3), f.u1, across(0.3), `stroke="${colour}" stroke-width="2.5" ${dash}`);
			line(f.u0, across(0.7), f.u1, across(0.7), `stroke="${colour}" stroke-width="2.5" ${dash}`);
			line(f.u0, across(0), f.u0, across(1), `stroke="${colour}" stroke-width="1.5"`);
			line(f.u1, across(0), f.u1, across(1), `stroke="${colour}" stroke-width="1.5"`);
		}
		// The opening's number from the list, outside the wall (or on the side a door does not swing to).
		const offset = f.inward ? -f.inward * (thick + 0.22) : (o.kind === 'door' ? -swingSide(plan, o) : 1) * 0.25;
		const [nx, nz] = at(f.alongX, f.line, o.placement.center, offset);
		out.push(`<circle cx="${X(nx)}" cy="${Y(nz)}" r="9" fill="#fff" stroke="${colour}" stroke-width="1.5"/>`);
		text(X(nx), Y(nz) + 3.5, String(n + 1), `font-size="10" font-weight="700" text-anchor="middle" fill="${colour}"`);
	}

	// Room names and areas, over everything else.
	for (const room of plan.rooms) {
		const r = room.rects.reduce((a, b) => (b.w * b.d > a.w * a.d ? b : a));
		const area = roomArea(room);
		const cx = X(r.x + r.w / 2);
		const cy = Y(r.z + r.d / 2);
		text(cx, cy - 2, room.name, `font-size="13" font-weight="700" text-anchor="middle" fill="#111827" ${halo}`);
		text(cx, cy + 13, `${fixed(area, 1)} m² · ${Math.round(area / 0.09290304)} sq ft`, `font-size="10.5" text-anchor="middle" fill="#374151" ${halo}`);
	}

	// Compass and scale bars (metres and feet).
	const nx = X(plan.width) + 40;
	const ny = Y(0) - 50;
	out.push(`<path d="M ${nx} ${ny - 18} L ${nx - 7} ${ny + 4} L ${nx} ${ny} L ${nx + 7} ${ny + 4} Z" fill="#111827"/>`);
	text(nx, ny + 18, 'N', 'font-size="12" font-weight="700" text-anchor="middle"');
	const sy = Y(plan.depth) + OUTER * S + 44;
	for (let m = 0; m < 3; m++) out.push(`<rect x="${X(m)}" y="${sy}" width="${S}" height="6" fill="${m % 2 ? '#fff' : '#111827'}" stroke="#111827"/>`);
	for (let m = 0; m <= 3; m++) text(X(m), sy - 4, `${m}`, 'font-size="10" text-anchor="middle"');
	text(X(3) + 8, sy + 6, 'm', 'font-size="10"');
	const foot = 0.3048;
	for (let ft = 0; ft < 10; ft += 5) out.push(`<rect x="${X(ft * foot)}" y="${sy + 16}" width="${5 * foot * S}" height="6" fill="${ft % 10 ? '#fff' : '#111827'}" stroke="#111827"/>`);
	for (const ft of [0, 5, 10]) text(X(ft * foot), sy + 34, `${ft}`, 'font-size="10" text-anchor="middle"');
	text(X(10 * foot) + 8, sy + 22, 'ft', 'font-size="10"');

	// Title, and anything the validator objects to.
	text(MARGIN, 34, plan.name, 'font-size="24" font-weight="700" fill="#111827"');
	text(MARGIN, 58, `${fixed(plan.width)} × ${fixed(plan.depth)} m, ceiling ${fixed(plan.ceiling)} m · ${fixed(plan.width * plan.depth, 1)} m² · ${Math.round(squareFeet(plan))} sq ft`, 'font-size="14" fill="#374151"');
	text(MARGIN, 80, plan.blurb, 'font-size="12.5" fill="#6b7280" font-style="italic"');
	if (problems.length) problems.forEach((p, i) => text(MARGIN, 100 + i * 18, p, 'font-size="12" fill="#b91c1c"'));
	else text(MARGIN, 100, 'validatePlan: no problems', 'font-size="12" fill="#047857"');

	// The openings, numbered as on the plan.
	const px = X(plan.width) + MARGIN + 10;
	let py = header + 10;
	text(px, py, 'Openings', 'font-size="15" font-weight="700"');
	py += 22;
	for (const [n, o] of plan.openings.entries()) {
		const where = isExterior(o.placement) ? `${o.placement.facade} wall at ${fixed(o.placement.center)}` : `${o.placement.axis === 'x' ? 'E-W' : 'N-S'} wall ${fixed(o.placement.at)}, at ${fixed(o.placement.center)}`;
		text(px, py, `${n + 1}. ${o.name}`, `font-size="12.5" font-weight="700" fill="${COLOURS[o.kind]}"`);
		text(px + 14, py + 15, `${o.kind}, ${fixed(o.width)} × ${fixed(o.height)} m, sill ${fixed(o.sill)}, opens ${Math.round(o.maxOpen * 100)} % from ${o.anchor}; ${where}`, 'font-size="10.5" fill="#4b5563"');
		py += 34;
	}
	py += 10;
	text(px, py, `${plan.furniture.length} pieces of furniture; label = name and height (m). Dashed window = sill 1.5 m or higher.`, 'font-size="11" fill="#4b5563"');
	py += 22;
	for (const [kind, colour] of Object.entries(COLOURS)) {
		out.push(`<rect x="${px}" y="${py - 9}" width="22" height="8" fill="${colour}"/>`);
		text(px + 30, py, kind, 'font-size="11"');
		py += 16;
	}

	const svg = [
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Helvetica, Arial, sans-serif">`,
		'<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#c2410c"/></marker></defs>',
		`<rect width="${width}" height="${height}" fill="#fff"/>`,
		...out,
		'</svg>'
	].join('\n');
	return { svg, width, height, problems };
}

const folder = resolve(process.argv[2] ?? join(tmpdir(), 'airflow-plans'));
mkdirSync(folder, { recursive: true });
const browser = await chromium.launch();
try {
	const page = await browser.newPage();
	for (const plan of plans) {
		const { svg, width, height, problems } = drawPlan(plan);
		writeFileSync(join(folder, `${plan.id}.svg`), svg);
		await page.setViewportSize({ width: Math.ceil(width), height: Math.ceil(height) });
		await page.setContent(`<!doctype html><html><body style="margin:0">${svg}</body></html>`);
		await page.screenshot({ path: join(folder, `${plan.id}.png`) });
		console.log(`${plan.id}: ${Math.round(squareFeet(plan))} sq ft, ${problems.length ? problems.join('; ') : 'valid'} -> ${join(folder, `${plan.id}.png`)}`);
	}
} finally {
	await browser.close();
}
