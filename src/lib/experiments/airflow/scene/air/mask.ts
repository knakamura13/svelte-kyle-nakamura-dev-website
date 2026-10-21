import type { GridSpec } from '../../solver/grid';
import type { Geometry } from '../../solver/types';

/**
 * Where the streaks may go, at the solver's own resolution. Walls are blocked faces between cells rather than cells
 * (homes/rasterize.ts), and every face of a piece of furniture is blocked, so a streak that never crosses a closed face stays
 * out of both. The mask holds, for every cell of the solver's padded grid (solver/grid.ts), four bytes: whether the cell is
 * air, and how far open its three low faces are (the face at x = i·h, at y = j·h and at z = k·h), 0 for shut and 255 for wide
 * open. That is the layout of the solver's own arrays, so texel (i, j, k) is solver index i + sx·j + sxy·k, and the faces on
 * the far side of the box (an east or a south window) are in its padding layer.
 *
 * It is drawn from `raster.geometry`, which the World keeps current as Openings open and close (it bumps `World.revision`
 * each time), so the mask is rebuilt whenever the revision moves.
 */

export const MASK_STRIDE = 4;

export interface SolidMask {
	/** Texels along x, y and z: the grid's cells plus the padding layer, as in the solver's arrays. */
	width: number;
	height: number;
	depth: number;
	/** The solver's cell size, m. */
	h: number;
	/** RGBA bytes, x fastest: air (255) or solid (0), then the open share of the x, y and z faces. */
	data: Uint8Array;
}

/** A face's open share as a byte. A face open at all is at least 1, so a window open a crack still lets a streak through. */
export const faceByte = (open: number) => (open > 0 ? Math.max(1, Math.min(255, Math.round(open * 255))) : 0);

/** The mask of a grid and its geometry. `reuse` is a mask of the same grid whose bytes are written over, so a rebuild allocates nothing. */
export function solidMask(spec: GridSpec, geometry: Geometry, reuse?: SolidMask | null): SolidMask {
	const width = spec.nx + 1;
	const height = spec.ny + 1;
	const depth = spec.nz + 1;
	const size = width * height * depth;
	const data = reuse && reuse.data.length === MASK_STRIDE * size ? reuse.data : new Uint8Array(MASK_STRIDE * size);
	const { fluid, au, av, aw } = geometry;
	for (let c = 0, o = 0; c < size; c++, o += MASK_STRIDE) {
		data[o] = fluid[c] ? 255 : 0;
		data[o + 1] = faceByte(au[c]);
		data[o + 2] = faceByte(av[c]);
		data[o + 3] = faceByte(aw[c]);
	}
	return { width, height, depth, h: spec.h, data };
}

/**
 * Whether a straight move from `from` to `to` (metres, at most one cell along each axis) crosses no closed face, by the same rule
 * the streaks' shader follows (`streaks.ts`): each axis's crossing is checked in turn, x then y then z, at the cell the move has
 * reached. Outside the box nothing blocks, and a face of the box itself is shut unless an exterior Opening opens it. For tests.
 */
export function passes(mask: SolidMask, from: readonly [number, number, number], to: readonly [number, number, number]) {
	const { width, height, depth, h, data } = mask;
	const cells = [width - 1, height - 1, depth - 1];
	const cell = [Math.floor(from[0] / h), Math.floor(from[1] / h), Math.floor(from[2] / h)];
	for (let axis = 0; axis < 3; axis++) {
		const next = Math.floor(to[axis] / h);
		if (next === cell[axis]) continue;
		const face = Math.max(next, cell[axis]);
		const [a, b] = axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1];
		const across = cell[a] >= 0 && cell[a] < cells[a] && cell[b] >= 0 && cell[b] < cells[b];
		if (across && face >= 0 && face <= cells[axis]) {
			const at = [...cell];
			at[axis] = face;
			if (data[MASK_STRIDE * (at[0] + width * at[1] + width * height * at[2]) + 1 + axis] === 0) return false;
		}
		cell[axis] = next;
	}
	return true;
}
