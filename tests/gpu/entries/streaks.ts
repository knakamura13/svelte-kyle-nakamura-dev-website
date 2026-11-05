/* Browser side of streaks.gpu.ts: the streaks' particles moved by the real advection shader in WebGL2, through a made-up air. */
import { WebGLRenderer } from 'three';
import { AirFields } from '$lib/experiments/airflow/scene/air/fields';
import { solidMask } from '$lib/experiments/airflow/scene/air/mask';
import { ParticleField } from '$lib/experiments/airflow/scene/air/particles';
import { Grid } from '$lib/experiments/airflow/solver/grid';
import type { Geometry } from '$lib/experiments/airflow/solver/types';
import { SCALAR_STRIDE, type Volume } from '$lib/experiments/airflow/solver/volume';

/* eslint-disable @typescript-eslint/no-explicit-any */

const H = 0.1;
/** A box of 4 × 2.4 × 4 m at 0.1 m cells. */
const SPEC = { nx: 40, ny: 24, nz: 40, h: H };

/** The same velocity everywhere, on a volume of the solver's own grid. */
function uniformVolume(velocity: [number, number, number]): Volume {
	const cells = SPEC.nx * SPEC.ny * SPEC.nz;
	const flow = new Float32Array(4 * cells);
	for (let n = 0; n < cells; n++) flow.set([...velocity, 1], 4 * n);
	return { ...SPEC, sx: 1, sy: 1, sz: 1, flow, scalars: new Float32Array(SCALAR_STRIDE * cells) };
}

/**
 * An empty box: air everywhere, every face between two cells open and the box's own faces shut. `wall` shuts every face of the plane
 * x = wall·h, as an interior wall does; `window` opens the faces of the west side (x = 0) whose cell is in its z range, at every height.
 */
function boxGeometry(options: { wall?: number; window?: [number, number] }): Geometry {
	const grid = new Grid(SPEC);
	const fluid = new Uint8Array(grid.size);
	const au = new Float32Array(grid.size);
	const av = new Float32Array(grid.size);
	const aw = new Float32Array(grid.size);
	for (let k = 0; k < SPEC.nz; k++)
		for (let j = 0; j < SPEC.ny; j++)
			for (let i = 0; i < SPEC.nx; i++) {
				const c = grid.index(i, j, k);
				fluid[c] = 1;
				if (i > 0 && i !== options.wall) au[c] = 1;
				if (j > 0) av[c] = 1;
				if (k > 0) aw[c] = 1;
				if (i === 0 && options.window && k >= options.window[0] && k < options.window[1]) au[c] = 1;
			}
	return { fluid, au, av, aw, room: new Uint8Array(grid.size), rooms: 1 };
}

let renderer: WebGLRenderer | null = null;

/**
 * Births `count` particles at `at` (they wait at most a microsecond to be born), moves them `frames` frames of `dt` seconds through the
 * uniform `velocity`, and reads them back.
 */
function run(options: { velocity: [number, number, number]; at: [number, number, number]; frames: number; dt: number; count?: number; wall?: number; window?: [number, number]; life?: number }) {
	renderer ??= new WebGLRenderer({ canvas: document.createElement('canvas') });
	const fields = new AirFields();
	fields.push(uniformVolume(options.velocity), 0);
	fields.tick(0);
	fields.setMask(solidMask(SPEC, boxGeometry(options)), { width: SPEC.nx * H, ceiling: SPEC.ny * H, depth: SPEC.nz * H });
	const field = new ParticleField({ count: options.count ?? 256, life: [1e-6, 1e-6], fadeOut: 0.5, outside: 0.3, poolWidth: 8 }, fields.uniforms);
	field.setPool({ points: new Float32Array([...options.at, 0]), count: 1, atOpenings: 0 });
	// The reset pass, and the birth: every particle is at `at`, aged 0, with the life asked for.
	field.step(renderer, 0);
	field.setLife(options.life ?? 1000, options.life ?? 1000);
	field.step(renderer, 1e-3);
	const born = field.read(renderer);
	for (let n = 0; n < options.frames; n++) field.step(renderer, options.dt);
	const after = field.read(renderer);
	renderer.setRenderTarget(null);
	const particles = [];
	for (let n = 0; n < field.count; n++)
		particles.push({
			born: [...born.state.subarray(4 * n, 4 * n + 4)],
			at: [...after.state.subarray(4 * n, 4 * n + 3)],
			age: after.state[4 * n + 3],
			life: after.extra[4 * n],
			generation: after.extra[4 * n + 1],
			outside: after.extra[4 * n + 2]
		});
	field.dispose();
	fields.dispose();
	return { particles, error: renderer.getContext().getError() };
}

(window as any).streaks = { run };
(window as any).harnessReady = true;
