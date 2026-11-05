import { BufferGeometry, Float32BufferAttribute, Group, Mesh } from 'three';
import { isExterior, type HomePlan, type Room } from '../../homes/types';
import { EXTERIOR_WALL, INTERIOR_WALL } from '../wallPieces';
import { CutBoxes } from './boxes';
import { WALL_COLORS, floorFor, type FloorKind, type Materials } from './materials';

/** How far below the floor the lawn is, m: the house stands on a foundation that shows as a grey band under the siding. */
export const GRADE = -0.18;
/** A threshold stands this proud of the floor, m. */
const THRESHOLD = 0.006;

/**
 * Quads lying flat at y = 0 with texture coordinates in world metres over `metres`, along x or (with `turn`) along z, so a floor's
 * planks run the long way of its Room.
 */
class FloorQuads {
	private readonly positions: number[] = [];
	private readonly uvs: number[] = [];
	private readonly indices: number[] = [];

	constructor(private readonly metres: number) {}

	get empty() {
		return this.indices.length === 0;
	}

	add(x0: number, x1: number, z0: number, z1: number, y: number, turn: boolean) {
		const base = this.positions.length / 3;
		const corners: [number, number][] = [
			[x0, z1],
			[x1, z1],
			[x1, z0],
			[x0, z0]
		];
		for (const [x, z] of corners) {
			this.positions.push(x, y, z);
			if (turn) this.uvs.push(z / this.metres, x / this.metres);
			else this.uvs.push(x / this.metres, -z / this.metres);
		}
		this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
	}

	build() {
		const geometry = new BufferGeometry();
		geometry.setAttribute('position', new Float32BufferAttribute(this.positions, 3));
		const normals = new Float32Array(this.positions.length);
		for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
		geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
		geometry.setAttribute('uv', new Float32BufferAttribute(this.uvs, 2));
		geometry.setIndex(this.indices);
		geometry.computeBoundingSphere();
		return geometry;
	}
}

/** Whether a Room's floor boards run north-south: its longest rectangle is deeper than it is wide. */
function runsSouth(room: Room) {
	const largest = room.rects.reduce((best, r) => (r.w * r.d > best.w * best.d ? r : best));
	return largest.d > largest.w;
}

/**
 * The floors of a Home, one mesh per kind of floor, the foundation it stands on, and a threshold under every door: oak-look laminate in
 * the living rooms, bedrooms and halls, tile in the kitchens, bathrooms and laundry. `floors` are what a pointer can land on.
 */
export function buildFloors(plan: HomePlan, materials: Materials): { group: Group; floors: Mesh[]; dispose(): void } {
	const group = new Group();
	const byKind = new Map<FloorKind, FloorQuads>();
	for (const room of plan.rooms) {
		const kind = floorFor(room);
		let quads = byKind.get(kind);
		if (!quads) byKind.set(kind, (quads = new FloorQuads(materials.floorMetres(kind))));
		const turn = runsSouth(room);
		for (const r of room.rects) quads.add(r.x, r.x + r.w, r.z, r.z + r.d, 0, turn);
	}
	const floors: Mesh[] = [];
	for (const [kind, quads] of byKind) {
		if (quads.empty) continue;
		const mesh = new Mesh(quads.build(), materials.floor(kind));
		mesh.receiveShadow = true;
		mesh.name = `floor:${kind}`;
		group.add(mesh);
		floors.push(mesh);
	}

	// The foundation: under the floors and the outside walls, from the lawn up to the floor, so a grey band shows under the siding.
	const t = EXTERIOR_WALL;
	const base = new CutBoxes(1);
	base.add(-t - 0.03, plan.width + t + 0.03, GRADE - 0.02, -0.002, -t - 0.03, plan.depth + t + 0.03, { colors: WALL_COLORS.foundation, skip: ['ny'] });
	const foundation = new Mesh(base.build().geometry, materials.concrete);
	foundation.receiveShadow = true;
	foundation.castShadow = true;
	group.add(foundation);

	// A threshold under every door: a strip of pale stone through the wall, and a step outside each outside door.
	const sills = new CutBoxes(1);
	for (const opening of plan.openings) {
		if (opening.kind !== 'door' && opening.kind !== 'sliding-door') continue;
		const { placement, width } = opening;
		const u0 = placement.center - width / 2;
		const u1 = placement.center + width / 2;
		if (isExterior(placement)) {
			// The threshold through the wall, and a step outside it down toward the lawn.
			const step = { out: 0.7, wide: 0.35 };
			const y = -0.09;
			switch (placement.facade) {
				case 'north':
					sills.add(u0, u1, -0.04, THRESHOLD, -t, 0);
					sills.add(u0 - step.wide, u1 + step.wide, GRADE, y, -t - step.out, -t);
					break;
				case 'south':
					sills.add(u0, u1, -0.04, THRESHOLD, plan.depth, plan.depth + t);
					sills.add(u0 - step.wide, u1 + step.wide, GRADE, y, plan.depth + t, plan.depth + t + step.out);
					break;
				case 'west':
					sills.add(-t, 0, -0.04, THRESHOLD, u0, u1);
					sills.add(-t - step.out, -t, GRADE, y, u0 - step.wide, u1 + step.wide);
					break;
				case 'east':
					sills.add(plan.width, plan.width + t, -0.04, THRESHOLD, u0, u1);
					sills.add(plan.width + t, plan.width + t + step.out, GRADE, y, u0 - step.wide, u1 + step.wide);
					break;
			}
		} else {
			const half = INTERIOR_WALL / 2;
			if (placement.axis === 'x') sills.add(u0, u1, -0.01, THRESHOLD, placement.at - half, placement.at + half);
			else sills.add(placement.at - half, placement.at + half, -0.01, THRESHOLD, u0, u1);
		}
	}
	if (!sills.empty) {
		const mesh = new Mesh(sills.build().geometry, materials.paint(0xe8e1d4, 0.55));
		mesh.receiveShadow = true;
		mesh.castShadow = true;
		group.add(mesh);
	}
	return {
		group,
		floors,
		dispose() {
			group.removeFromParent();
			group.traverse((object) => (object as Mesh).geometry?.dispose());
		}
	};
}
