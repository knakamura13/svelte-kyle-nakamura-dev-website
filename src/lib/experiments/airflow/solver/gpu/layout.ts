/**
 * Uniform buffer layouts. Each is declared once, as a list of fields, and both the WGSL struct and the bytes the
 * host writes come from that list, so the two cannot drift apart. Scalars take 4 bytes; an array of vec4 starts on a
 * 16-byte boundary (WGSL's alignment rule) and the struct's size rounds up to 16 bytes.
 */
type ScalarType = 'f32' | 'i32' | 'u32';
type Field = { name: string; type: ScalarType } | { name: string; type: 'vec4<f32>' | 'vec4<i32>'; count: number };

export class UniformLayout {
	/** Offset of each field, in 4-byte words. */
	private readonly offsets = new Map<string, { offset: number; field: Field }>();
	/** Size in bytes. */
	readonly size: number;

	constructor(
		readonly name: string,
		private readonly fields: Field[]
	) {
		let words = 0;
		for (const field of fields) {
			if ('count' in field) words = Math.ceil(words / 4) * 4;
			this.offsets.set(field.name, { offset: words, field });
			words += 'count' in field ? 4 * field.count : 1;
		}
		this.size = Math.ceil(words / 4) * 16;
	}

	wgsl() {
		const members = this.fields.map((f) => `\t${f.name}: ${'count' in f ? `array<${f.type}, ${f.count}>` : f.type},`).join('\n');
		return `struct ${this.name} {\n${members}\n}\n`;
	}

	/** A zeroed buffer of the right size, with setters that place each value where WGSL reads it. */
	writer() {
		return new UniformWriter(this.offsets, this.size);
	}
}

export class UniformWriter {
	readonly data: ArrayBuffer;
	private readonly f32: Float32Array;
	private readonly i32: Int32Array;
	private readonly u32: Uint32Array;

	constructor(
		private readonly offsets: Map<string, { offset: number; field: Field }>,
		size: number
	) {
		this.data = new ArrayBuffer(size);
		this.f32 = new Float32Array(this.data);
		this.i32 = new Int32Array(this.data);
		this.u32 = new Uint32Array(this.data);
	}

	private slot(name: string) {
		const entry = this.offsets.get(name);
		if (!entry) throw new Error(`No uniform field ${name}.`);
		return entry;
	}

	set(name: string, value: number) {
		const { offset, field } = this.slot(name);
		if (field.type === 'f32') this.f32[offset] = value;
		else if (field.type === 'i32') this.i32[offset] = value;
		else if (field.type === 'u32') this.u32[offset] = value;
		else throw new Error(`${name} is an array.`);
		return this;
	}

	/** Sets element `index` of a vec4 array field. */
	vec(name: string, index: number, values: [number, number, number, number]) {
		const { offset, field } = this.slot(name);
		if (!('count' in field) || index >= field.count) throw new Error(`${name}[${index}] is not a vec4 array element.`);
		const view = field.type === 'vec4<f32>' ? this.f32 : this.i32;
		view.set(values, offset + 4 * index);
		return this;
	}
}

const f = (name: string): Field => ({ name, type: 'f32' });
const i = (name: string): Field => ({ name, type: 'i32' });
const u = (name: string): Field => ({ name, type: 'u32' });

/**
 * Everything about the grid and the fluid that changes only when the setup does. `flags`: 1 MacCormack correction,
 * 2 buoyancy, 4 turbulence closure. `side[s]` is (free-slip ? 1 : 0, wall velocity) for box side s; `wall[s]` is
 * (fixed temperature ? 1 : 0, temperature); `sideBase` holds the first slot of each side in the packed side arrays.
 */
export const CONSTS = new UniformLayout('Consts', [
	i('nx'),
	i('ny'),
	i('nz'),
	i('sx'),
	i('sxy'),
	i('size'),
	u('flags'),
	u('pad0'),
	f('h'),
	f('rho'),
	f('nu'),
	f('cd'),
	f('shear'),
	f('maxLength'),
	f('nutMax'),
	f('alpha'),
	f('prT'),
	f('scT'),
	f('particleD'),
	f('settling'),
	f('deposition'),
	f('extTheta'),
	f('extC'),
	f('pad1'),
	{ name: 'side', type: 'vec4<f32>', count: 6 },
	{ name: 'wall', type: 'vec4<f32>', count: 6 },
	{ name: 'sideBase', type: 'vec4<i32>', count: 2 }
]);

/** What one step needs: its length and the coefficients derived from it, and which slot of the tally log it fills. */
export const STEP = new UniformLayout('Step', [
	f('dt'),
	/** dt / h, the advection backtrace in cells per (m/s). */
	f('dtg'),
	/** half / (ρ h): the pressure-gradient half step, and the projection's. */
	f('kgrad'),
	/** half · g · β · ½: buoyancy for half a step, applied to the sum of the two cells' θ. */
	f('kbuoy'),
	/** (dt / substeps) / h²: one explicit diffusion substep. */
	f('kdiff'),
	/** h · half / ρ: a face's conductance per unit open fraction. */
	f('kcond'),
	/** dt / scalar substeps. */
	f('dtau'),
	f('half'),
	u('slot'),
	u('pad0'),
	u('pad1'),
	u('pad2')
]);

/** One multigrid level and the next coarser one. `colour` picks the red or black cells of a sweep. */
export const LEVEL = new UniformLayout('Level', [
	i('nx'),
	i('ny'),
	i('nz'),
	i('sx'),
	i('sxy'),
	i('colour'),
	i('fx'),
	i('fy'),
	i('fz'),
	i('cnx'),
	i('cny'),
	i('cnz'),
	i('csx'),
	i('csxy'),
	i('sweeps'),
	i('pad0')
]);

/** One side of the box for the exterior-opening kernel: face index = base + strideA·a + strideB·b, the cell is `shift` before it. */
export const SIDE = new UniformLayout('Side', [i('side'), i('axis'), i('sign'), i('na'), i('nb'), i('base'), i('strideA'), i('strideB'), i('shift'), i('slotBase'), i('pad0'), i('pad1')]);

/** Small integer parameters for readouts and reductions; each kernel says what a, b, c and d mean. */
export const COUNTS = new UniformLayout('Counts', [i('a'), i('b'), i('c'), i('d')]);

/** The particles: how many, how many cells to respawn into, the step and the smoke scale. `mode` 0 places them, 1 moves them. */
export const PARTICLES = new UniformLayout('Particles', [u('count'), u('places'), u('seed'), u('mode'), f('dt'), f('scale'), u('frame'), u('pad0')]);

export const UNIFORM_STRUCTS = [CONSTS, STEP, LEVEL, SIDE, COUNTS, PARTICLES].map((layout) => layout.wgsl()).join('\n');
