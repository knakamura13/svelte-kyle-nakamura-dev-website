import { BufferGeometry, DoubleSide, DynamicDrawUsage, Float32BufferAttribute, InstancedMesh, Matrix4, MeshBasicMaterial, Vector3 } from 'three';
import type { Slice } from '../solver/types';
import { DIRECTION_EXPONENT, scaleFraction, type ScaleOptions } from '../viz/palettes';
import { RENDER_ORDER, emptySample, sampleAt } from './sliceLayer';

/** Default lattice spacing, m, and the most arrows drawn; a larger plan spreads them out instead. */
export const ARROW_SPACING = 0.35;
const MAX_ARROWS = 3000;
/** Arrow length as a share of the spacing, for the faintest flow shown and at the top of the scale. */
const SHORTEST = 0.34;
const LONGEST = 0.92;
/** Below this strength (speed fraction to DIRECTION_EXPONENT: 1.4 % of the range, 4 cm/s at sensitivity 1) the air counts as still. */
const STILL = 0.12;
/** Arrows float this far above the slice, so they never fight it for depth. */
const LIFT = 0.012;
/** The site's ink, a little transparent so the heatmap shows around the glyphs. */
const INK = 0x202a24;
const OPACITY = 0.78;

/** A flat arrow one unit long, centred on the origin, lying in the x–z plane and pointing along +x. */
function glyph() {
	const shaft = 0.055;
	const head = 0.2;
	const neck = 0.1;
	// prettier-ignore
	const vertices = [
		-0.5, 0, -shaft, neck, 0, -shaft, neck, 0, shaft,
		-0.5, 0, -shaft, neck, 0, shaft, -0.5, 0, shaft,
		neck, 0, -head, 0.5, 0, 0, neck, 0, head
	];
	const geometry = new BufferGeometry();
	geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
	return geometry;
}

/**
 * The direction layer's cue that does not rely on color: one arrow per lattice point of the slice, pointing along the
 * flow there, tilted up or down with it, and longer the faster it goes. Still air and cells that are not air get none.
 * One draw call; updating allocates nothing.
 */
export class DirectionArrows {
	readonly mesh: InstancedMesh<BufferGeometry, MeshBasicMaterial>;
	private readonly lattice: Float32Array;
	private readonly spacing: number;
	private readonly sample = emptySample();
	private readonly matrix = new Matrix4();
	private readonly forward = new Vector3();
	private readonly normal = new Vector3();
	private readonly side = new Vector3();
	private readonly size = new Vector3();
	private readonly range = { start: 0, count: 0 };
	private slice: Slice | null = null;
	private sensitivity = NaN;

	/**
	 * Covers the plan's footprint: x from 0 to `width`, z from 0 to `depth`, metres. `spacing` is the distance between
	 * arrows in metres: the default suits a Stage a few hundred pixels across per ten metres of plan; a compact Stage
	 * should ask for about twice that so each arrow stays a readable size.
	 */
	constructor(width: number, depth: number, spacing = ARROW_SPACING) {
		this.spacing = Math.max(spacing, Math.sqrt((width * depth) / MAX_ARROWS));
		const columns = Math.max(1, Math.floor(width / this.spacing));
		const rows = Math.max(1, Math.floor(depth / this.spacing));
		const x0 = (width - (columns - 1) * this.spacing) / 2;
		const z0 = (depth - (rows - 1) * this.spacing) / 2;
		this.lattice = new Float32Array(2 * columns * rows);
		for (let r = 0; r < rows; r++)
			for (let c = 0; c < columns; c++) {
				this.lattice[2 * (r * columns + c)] = x0 + c * this.spacing;
				this.lattice[2 * (r * columns + c) + 1] = z0 + r * this.spacing;
			}
		const material = new MeshBasicMaterial({ color: INK, transparent: true, opacity: OPACITY, side: DoubleSide, depthWrite: false });
		this.mesh = new InstancedMesh(glyph(), material, columns * rows);
		this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
		this.mesh.count = 0;
		// Instances spread over the whole plan; the glyph's own bounds would cull them wrongly.
		this.mesh.frustumCulled = false;
		this.mesh.renderOrder = RENDER_ORDER.arrows;
		this.mesh.position.y = LIFT;
	}

	/** Points the arrows along `slice`. Does nothing unless the slice or the sensitivity changed. */
	update(slice: Slice, options: ScaleOptions) {
		if (slice === this.slice && options.sensitivity === this.sensitivity) return;
		this.slice = slice;
		this.sensitivity = options.sensitivity;
		const { lattice, sample, forward, normal, side, size, matrix } = this;
		let count = 0;
		for (let n = 0; n < lattice.length / 2; n++) {
			const x = lattice[2 * n];
			const z = lattice[2 * n + 1];
			sampleAt(slice, x, z, sample);
			if (!sample.air) continue;
			const speed = Math.hypot(sample.u, sample.v, sample.w);
			const t = scaleFraction('speed', speed, options);
			const strength = t > 0 ? t ** DIRECTION_EXPONENT : 0;
			if (strength < STILL) continue;
			forward.set(sample.u, sample.v, sample.w).divideScalar(speed);
			// Face up as far as the tilt allows, so the glyph reads from above; straight up or down, face east.
			normal.set(0, 1, 0).addScaledVector(forward, -forward.y);
			if (normal.lengthSq() < 1e-6) normal.set(1, 0, 0).addScaledVector(forward, -forward.x);
			normal.normalize();
			side.crossVectors(forward, normal);
			const length = this.spacing * (SHORTEST + ((LONGEST - SHORTEST) * (strength - STILL)) / (1 - STILL));
			matrix.makeBasis(forward, normal, side).scale(size.setScalar(length)).setPosition(x, 0, z);
			this.mesh.setMatrixAt(count++, matrix);
		}
		this.mesh.count = count;
		if (count === 0) return;
		const attribute = this.mesh.instanceMatrix;
		// Upload only the matrices in use, through one reused range so nothing is allocated. (A range of length 0
		// would mean "to the end" to WebGL, hence the early return.)
		attribute.clearUpdateRanges();
		this.range.count = 16 * count;
		attribute.updateRanges.push(this.range);
		attribute.needsUpdate = true;
	}

	/** Height of the slice the arrows sit on, m. */
	setHeight(y: number) {
		this.mesh.position.y = y + LIFT;
	}

	dispose() {
		this.mesh.geometry.dispose();
		this.mesh.material.dispose();
		this.mesh.dispose();
	}
}
