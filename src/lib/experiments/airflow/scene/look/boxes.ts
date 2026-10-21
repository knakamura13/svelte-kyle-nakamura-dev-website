import { BufferGeometry, Color, Float32BufferAttribute, MeshDepthMaterial } from 'three';

/** The six faces of an axis-aligned box, by the axis and the way their normal points. */
export type Face = 'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz';

/** A colour for every face, or one for all of them. */
export type FaceColors = Color | Partial<Record<Face, Color>> & { all?: Color };

const WHITE = new Color(1, 1, 1);

const FACES: { face: Face; normal: [number, number, number]; corners: (b: number[]) => number[] }[] = [
	{ face: 'px', normal: [1, 0, 0], corners: ([x0, x1, y0, y1, z0, z1]) => [x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1] },
	{ face: 'nx', normal: [-1, 0, 0], corners: ([x0, , y0, y1, z0, z1]) => [x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0] },
	{ face: 'py', normal: [0, 1, 0], corners: ([x0, x1, , y1, z0, z1]) => [x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0] },
	{ face: 'ny', normal: [0, -1, 0], corners: ([x0, x1, y0, , z0, z1]) => [x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1] },
	{ face: 'pz', normal: [0, 0, 1], corners: ([x0, x1, y0, y1, , z1]) => [x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1] },
	{ face: 'nz', normal: [0, 0, -1], corners: ([x0, x1, y0, y1, z0]) => [x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0] }
];

export interface BoxOptions {
	colors?: FaceColors;
	/** Faces to leave out (one that is always against something). */
	skip?: Face[];
	/** The height below which a cut drops the box whole, m: its own bottom unless given (see `CutBoxes`). */
	bottom?: number;
}

/** What a geometry needs to be cut down on the processor: where every vertex was built, the bottom of its box, and the box's middle. */
export interface CutData {
	base: Float32Array;
	bottom: Float32Array;
	anchor: Float32Array;
}

/**
 * Axis-aligned boxes gathered into one geometry, with a colour per face and texture coordinates in world metres divided by
 * `metres` (so a texture `metres` across repeats at its real size whatever the box). Each vertex also remembers its box's bottom
 * and middle, so the walls can be cut down by moving vertices (`applyCut`) instead of in a shader, which keeps the shadows, the
 * ambient occlusion and picking right without any special materials.
 */
export class CutBoxes {
	private readonly positions: number[] = [];
	private readonly normals: number[] = [];
	private readonly colors: number[] = [];
	private readonly uvs: number[] = [];
	private readonly bottoms: number[] = [];
	private readonly anchors: number[] = [];
	private readonly indices: number[] = [];

	constructor(private readonly metres = 1) {}

	get empty() {
		return this.indices.length === 0;
	}

	add(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, options: BoxOptions = {}) {
		if (x1 - x0 < 1e-6 || y1 - y0 < 1e-6 || z1 - z0 < 1e-6) return;
		const bounds = [x0, x1, y0, y1, z0, z1];
		const colors = options.colors;
		const bottom = options.bottom ?? y0;
		const cx = (x0 + x1) / 2;
		const cz = (z0 + z1) / 2;
		const m = this.metres;
		for (const { face, normal, corners } of FACES) {
			if (options.skip?.includes(face)) continue;
			const tone = !colors ? WHITE : colors instanceof Color ? colors : (colors[face] ?? colors.all ?? WHITE);
			const base = this.positions.length / 3;
			const points = corners(bounds);
			this.positions.push(...points);
			for (let i = 0; i < 4; i++) {
				const px = points[i * 3];
				const py = points[i * 3 + 1];
				const pz = points[i * 3 + 2];
				this.normals.push(...normal);
				this.colors.push(tone.r, tone.g, tone.b);
				// World-space texture coordinates: across the face, in metres over the texture's size.
				if (normal[0] !== 0) this.uvs.push(pz / m, py / m);
				else if (normal[1] !== 0) this.uvs.push(px / m, pz / m);
				else this.uvs.push(px / m, py / m);
				this.bottoms.push(bottom);
				this.anchors.push(cx, cz);
			}
			this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
		}
	}

	/** The geometry, and what `applyCut` needs to cut it. */
	build(): { geometry: BufferGeometry; cut: CutData } {
		const geometry = new BufferGeometry();
		geometry.setAttribute('position', new Float32BufferAttribute(this.positions, 3));
		geometry.setAttribute('normal', new Float32BufferAttribute(this.normals, 3));
		geometry.setAttribute('color', new Float32BufferAttribute(this.colors, 3));
		geometry.setAttribute('uv', new Float32BufferAttribute(this.uvs, 2));
		// Where every vertex was built, before any cut: the sun's shadow is cast from this (`uncutShadow`).
		geometry.setAttribute('basePosition', new Float32BufferAttribute(this.positions, 3));
		geometry.setIndex(this.indices);
		geometry.computeBoundingSphere();
		geometry.computeBoundingBox();
		return { geometry, cut: { base: new Float32Array(this.positions), bottom: new Float32Array(this.bottoms), anchor: new Float32Array(this.anchors) } };
	}
}

/**
 * The material a cut mesh casts the sun's shadow with: its vertices where they were built (`basePosition`), not where the cut moved
 * them. A wall dropped by the cutaway still shades the room as the standing wall does, so the light in a room does not change as the
 * camera moves round it, and the shadow map only needs drawing again when something really moves (a door, a window).
 */
export function uncutShadow() {
	const material = new MeshDepthMaterial();
	material.onBeforeCompile = (shader) => {
		shader.vertexShader = shader.vertexShader
			.replace('#include <common>', '#include <common>\nattribute vec3 basePosition;')
			.replace('#include <begin_vertex>', 'vec3 transformed = vec3( basePosition );');
	};
	material.customProgramCacheKey = () => 'airflow-uncut-shadow';
	return material;
}

/**
 * Cuts a geometry built by `CutBoxes` at height `cut` (in the geometry's own frame, less `lift`, the height of the frame's
 * origin): every vertex above the cut comes down to it, so a cut box keeps a real top face, and a box whose bottom is at or above
 * the cut collapses to a point, so a lintel over a door never squashes into a sheet across it.
 */
export function applyCut(geometry: BufferGeometry, data: CutData, cut: number, lift = 0) {
	const position = geometry.getAttribute('position') as Float32BufferAttribute;
	const out = position.array as Float32Array;
	const { base, bottom, anchor } = data;
	const level = cut - lift;
	for (let i = 0, n = bottom.length; i < n; i++) {
		const k = i * 3;
		if (level <= bottom[i] + 1e-4) {
			out[k] = anchor[i * 2];
			out[k + 1] = bottom[i];
			out[k + 2] = anchor[i * 2 + 1];
		} else {
			out[k] = base[k];
			out[k + 1] = Math.min(base[k + 1], level);
			out[k + 2] = base[k + 2];
		}
	}
	position.needsUpdate = true;
}
