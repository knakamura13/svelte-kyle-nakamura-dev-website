/**
 * The staggered (MAC) grid every solver backend shares. Axes: x east, y up, z south, so north is -z.
 *
 * Every field, whatever it holds, uses one padded layout of (nx+1) × (ny+1) × (nz+1) values, x fastest:
 * `index = i + sx·j + sxy·k`. That is the one extra layer a face-centred array needs, and it keeps every
 * array's strides identical, which keeps the CPU loops and the GPU kernels simple. A field then means:
 *
 *   u  at x-faces:  position (i, j+½, k+½)·h, valid i ≤ nx, j < ny, k < nz
 *   v  at y-faces:  position (i+½, j, k+½)·h, valid i < nx, j ≤ ny, k < nz
 *   w  at z-faces:  position (i+½, j+½, k)·h, valid i < nx, j < ny, k ≤ nz
 *   cell fields (pressure, temperature, particulates, eddy viscosity, masks): position (i+½, j+½, k+½)·h,
 *   valid i < nx, j < ny, k < nz
 *
 * The extra layer of each array is never read.
 */
export interface GridSpec {
	nx: number;
	ny: number;
	nz: number;
	/** Cell edge length, metres. Cells are cubes. */
	h: number;
}

/** The six sides of the box, in the order the solver's side arrays use. */
export const SIDE = { X0: 0, X1: 1, Y0: 2, Y1: 3, Z0: 4, Z1: 5 } as const;
export type SideIndex = (typeof SIDE)[keyof typeof SIDE];

export class Grid implements GridSpec {
	readonly nx: number;
	readonly ny: number;
	readonly nz: number;
	readonly h: number;
	/** Row, plane and total lengths of the padded layout. */
	readonly sx: number;
	readonly sxy: number;
	readonly size: number;

	constructor({ nx, ny, nz, h }: GridSpec) {
		this.nx = nx;
		this.ny = ny;
		this.nz = nz;
		this.h = h;
		this.sx = nx + 1;
		this.sxy = (nx + 1) * (ny + 1);
		this.size = this.sxy * (nz + 1);
	}

	index(i: number, j: number, k: number) {
		return i + this.sx * j + this.sxy * k;
	}

	/** Cell volume, m³. */
	get cellVolume() {
		return this.h * this.h * this.h;
	}

	/** Number of cells (not the padded size). */
	get cells() {
		return this.nx * this.ny * this.nz;
	}

	/** Values on one side of the box, which is one value per cell face on that side. */
	sideSize(side: SideIndex) {
		if (side === SIDE.X0 || side === SIDE.X1) return this.ny * this.nz;
		if (side === SIDE.Y0 || side === SIDE.Y1) return this.nx * this.nz;
		return this.nx * this.ny;
	}
}
