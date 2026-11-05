import type { FaceUpdate } from '../solver/backend';
import { Grid, SIDE, type GridSpec, type SideIndex } from '../solver/grid';
import type { Geometry } from '../solver/types';
import { isExterior, type Facade, type HomePlan, type OpeningSpec } from './types';

/** One face an opening covers, with where it sits on the wall plane (u along the wall, y up, metres). */
interface OpeningFace {
	index: number;
	/** Position in its box side's array for an exterior opening. */
	slot: number;
	u0: number;
	u1: number;
	y0: number;
	y1: number;
	/** 0 if furniture stands in front of it, so it can never open. */
	reachable: number;
}

/** An opening as the solver sees it: the faces it covers, and how much of each is open for a given amount. */
export class RasterOpening {
	/** Which face array its faces live in: 0 for u (a wall facing east or west), 2 for w (a wall facing north or south). */
	readonly axis: 0 | 2;
	/** For an exterior opening: the box side it is on. */
	readonly side?: SideIndex;
	readonly facade?: Facade;
	readonly faces: OpeningFace[];
	private readonly frame: { u0: number; u1: number; y0: number; y1: number };

	constructor(
		readonly spec: OpeningSpec,
		axis: 0 | 2,
		faces: OpeningFace[],
		side: SideIndex | undefined,
		facade: Facade | undefined,
		private readonly h: number
	) {
		this.axis = axis;
		this.faces = faces;
		this.side = side;
		this.facade = facade;
		const centre = spec.placement.center;
		this.frame = { u0: centre - spec.width / 2, u1: centre + spec.width / 2, y0: spec.sill, y1: spec.sill + spec.height };
	}

	/** The part of the frame that is open at `amount` (0 to 1 of the opening's travel), as a rectangle on the wall plane. */
	private openRegion(amount: number) {
		const { u0, u1, y0, y1 } = this.frame;
		const fraction = Math.max(0, Math.min(1, amount)) * this.spec.maxOpen;
		switch (this.spec.anchor) {
			case 'start':
				return { u0, u1: u0 + fraction * (u1 - u0), y0, y1 };
			case 'end':
				return { u0: u1 - fraction * (u1 - u0), u1, y0, y1 };
			case 'bottom':
				return { u0, u1, y0, y1: y0 + fraction * (y1 - y0) };
			default:
				return { u0, u1, y0: y1 - fraction * (y1 - y0), y1 };
		}
	}

	/** The fraction of each covered face that is open at `amount`: the exact overlap of the open region with the face. */
	coverage(amount: number) {
		const region = this.openRegion(amount);
		const area = this.h * this.h;
		return this.faces.map((face) => {
			const du = Math.min(face.u1, region.u1) - Math.max(face.u0, region.u0);
			const dy = Math.min(face.y1, region.y1) - Math.max(face.y0, region.y0);
			return du > 0 && dy > 0 ? (face.reachable * du * dy) / area : 0;
		});
	}

	/** Open area, m², at `amount`. Exact whatever the grid. */
	area(amount: number) {
		return this.coverage(amount).reduce((sum, c) => sum + c, 0) * this.h * this.h;
	}

	/** The change to the solver's face array that sets the opening to `amount`. */
	update(amount: number): FaceUpdate {
		const values = Float32Array.from(this.coverage(amount));
		return { axis: this.axis, indices: Uint32Array.from(this.faces.map((face) => face.index)), values };
	}
}

export interface Raster {
	plan: HomePlan;
	spec: GridSpec;
	geometry: Geometry;
	openings: RasterOpening[];
	roomNames: string[];
	/** Whether furniture was built in. */
	furniture: boolean;
}

const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

/**
 * Turns a plan into what the solver needs. The box is the footprint exactly (the plan's sizes are multiples of
 * 0.6 m, so a whole number of cells fit at every grid size). Interior walls become blocked faces on the nearest
 * grid plane, furniture becomes solid cells, and every opening is a set of faces whose open fraction is the exact
 * overlap of its open part with the face, so a door's open area does not depend on the grid.
 *
 * The geometry comes back with every opening at its plan-specified starting position.
 */
export function rasterizePlan(plan: HomePlan, h: number, options: { furniture: boolean }): Raster {
	const nx = Math.round(plan.width / h);
	const ny = Math.round(plan.ceiling / h);
	const nz = Math.round(plan.depth / h);
	if (!near(nx * h, plan.width) || !near(ny * h, plan.ceiling) || !near(nz * h, plan.depth)) throw new Error(`A cell size of ${h} m does not divide the ${plan.name} plan into whole cells.`);
	const spec: GridSpec = { nx, ny, nz, h };
	const grid = new Grid(spec);
	const { sx, sxy } = grid;
	const fluid = new Uint8Array(grid.size);
	const au = new Float32Array(grid.size);
	const av = new Float32Array(grid.size);
	const aw = new Float32Array(grid.size);
	const room = new Uint8Array(grid.size);

	// Air everywhere inside the box, every face between two cells open, the box itself a wall.
	for (let k = 0; k < nz; k++)
		for (let j = 0; j < ny; j++)
			for (let i = 0; i < nx; i++) {
				const c = i + sx * j + sxy * k;
				fluid[c] = 1;
				if (i > 0) au[c] = 1;
				if (j > 0) av[c] = 1;
				if (k > 0) aw[c] = 1;
				const x = (i + 0.5) * h;
				const z = (k + 0.5) * h;
				const index = plan.rooms.findIndex((r) => r.rects.some((rect) => x >= rect.x && x < rect.x + rect.w && z >= rect.z && z < rect.z + rect.d));
				room[c] = index + 1;
			}

	// Interior walls: a layer of blocked faces floor to ceiling.
	for (const wall of plan.walls) {
		const plane = Math.round(wall.at / h);
		const from = Math.round(wall.from / h);
		const to = Math.round(wall.to / h);
		for (let along = from; along < to; along++)
			for (let j = 0; j < ny; j++) {
				if (wall.axis === 'x') aw[along + sx * j + sxy * plane] = 0;
				else au[plane + sx * j + sxy * along] = 0;
			}
	}

	// Furniture: solid cells, and no air through any face of one.
	if (options.furniture) {
		for (const item of plan.furniture) {
			const y0 = item.y ?? 0;
			for (let k = 0; k < nz; k++)
				for (let j = 0; j < ny; j++)
					for (let i = 0; i < nx; i++) {
						const x = (i + 0.5) * h;
						const y = (j + 0.5) * h;
						const z = (k + 0.5) * h;
						if (x >= item.x && x < item.x + item.w && z >= item.z && z < item.z + item.d && y >= y0 && y < y0 + item.h) fluid[i + sx * j + sxy * k] = 0;
					}
		}
	}

	// Openings: every face the frame touches. The wall (or the box) is a wall there until the opening opens.
	const openings: RasterOpening[] = [];
	for (const opening of plan.openings) {
		const { placement } = opening;
		const faces: OpeningFace[] = [];
		const u0 = placement.center - opening.width / 2;
		const u1 = placement.center + opening.width / 2;
		const y0 = opening.sill;
		const y1 = opening.sill + opening.height;
		let axis: 0 | 2;
		let side: SideIndex | undefined;
		let facade: Facade | undefined;
		let plane: number;
		let alongCells: number;
		if (isExterior(placement)) {
			facade = placement.facade;
			const alongX = facade === 'north' || facade === 'south';
			axis = alongX ? 2 : 0;
			side = facade === 'north' ? SIDE.Z0 : facade === 'south' ? SIDE.Z1 : facade === 'west' ? SIDE.X0 : SIDE.X1;
			plane = facade === 'north' || facade === 'west' ? 0 : alongX ? nz : nx;
			alongCells = alongX ? nx : nz;
		} else {
			axis = placement.axis === 'x' ? 2 : 0;
			plane = Math.round(placement.at / h);
			alongCells = placement.axis === 'x' ? nx : nz;
		}
		const firstAlong = Math.max(0, Math.floor(u0 / h));
		const lastAlong = Math.min(alongCells - 1, Math.ceil(u1 / h) - 1);
		const firstRow = Math.max(0, Math.floor(y0 / h));
		const lastRow = Math.min(ny - 1, Math.ceil(y1 / h) - 1);
		for (let j = firstRow; j <= lastRow; j++)
			for (let along = firstAlong; along <= lastAlong; along++) {
				const [i, k] = axis === 2 ? [along, plane] : [plane, along];
				const index = i + sx * j + sxy * k;
				// The cells either side of the face: furniture in either means it can never open.
				const neighbours: number[] = [];
				if (axis === 0) {
					if (i > 0) neighbours.push(index - 1);
					if (i < nx) neighbours.push(index);
				} else {
					if (k > 0) neighbours.push(index - sxy);
					if (k < nz) neighbours.push(index);
				}
				const reachable = neighbours.every((cell) => fluid[cell] === 1) ? 1 : 0;
				const slot = side === SIDE.X0 || side === SIDE.X1 ? j + ny * along : along + nx * j;
				faces.push({ index, slot, u0: along * h, u1: (along + 1) * h, y0: j * h, y1: (j + 1) * h, reachable });
			}
		openings.push(new RasterOpening(opening, axis, faces, side, facade, h));
	}

	const geometry: Geometry = { fluid, au, av, aw, room, rooms: plan.rooms.length };
	for (const opening of openings) {
		const coverage = opening.coverage(opening.spec.open ?? 0);
		const field = opening.axis === 0 ? au : aw;
		opening.faces.forEach((face, n) => (field[face.index] = coverage[n]));
	}

	// No air through any face of a solid cell, whatever opened it.
	for (let k = 0; k < nz; k++)
		for (let j = 0; j < ny; j++)
			for (let i = 0; i < nx; i++) {
				const c = i + sx * j + sxy * k;
				if (fluid[c]) continue;
				au[c] = au[c + 1] = av[c] = av[c + sx] = aw[c] = aw[c + sxy] = 0;
			}
	return { plan, spec, geometry, openings, roomNames: plan.rooms.map((r) => r.name), furniture: options.furniture };
}
