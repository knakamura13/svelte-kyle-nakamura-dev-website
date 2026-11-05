import { Grid, type GridSpec } from './grid';
import type { Geometry } from './types';

/**
 * A box of air with walls on all six sides and nothing inside: every cell is fluid, every face between two
 * cells is open, and every face on the box is a wall. The benchmarks use it directly; a home starts from it
 * and adds walls, furniture and openings.
 */
export function boxGeometry(spec: GridSpec): Geometry {
	const grid = new Grid(spec);
	const { nx, ny, nz, sx, sxy } = grid;
	const fluid = new Uint8Array(grid.size);
	const au = new Float32Array(grid.size);
	const av = new Float32Array(grid.size);
	const aw = new Float32Array(grid.size);
	for (let k = 0; k < nz; k++)
		for (let j = 0; j < ny; j++)
			for (let i = 0; i < nx; i++) {
				const c = i + sx * j + sxy * k;
				fluid[c] = 1;
				if (i > 0) au[c] = 1;
				if (j > 0) av[c] = 1;
				if (k > 0) aw[c] = 1;
			}
	return { fluid, au, av, aw, room: new Uint8Array(grid.size), rooms: 0 };
}
