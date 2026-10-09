import { AXIS, ENTRY, LIMITS, LINEAR, U32, VEC2, VEC4, read, sampler, uniform, write, type KernelSource } from './common';

/**
 * cpu/particles.ts on the GPU. Each particle keeps its own random stream (a PCG hash of its state) instead of
 * sharing one, so the dots are not the CPU's dots, but every rule is the CPU's: midpoint (RK2) advection, respawn in a
 * random cell of air when a particle leaves the air, tracers respawn after a random lifetime, and a smoke particle
 * that has drifted out of the smoke or lived its life tries eight random cells and takes the first one a draw on the
 * local concentration accepts.
 *
 * `P.mode`: 0 places every particle (the constructor's placement), 1 steps tracers, 2 steps smoke.
 * `parts`: (x, y, z, speed or concentration); `state`: (random state, age bits).
 */
export const particles: KernelSource = {
	name: 'particles',
	bindings: [uniform('C', 'Consts'), uniform('P', 'Particles'), read('vel', VEC4), read('geo', VEC4), read('scal', VEC2), read('places', U32), write('parts', VEC4), write('state', 'array<vec2<u32>>')],
	code: `${AXIS}
${sampler('faceU', 'vel', 'x', LIMITS.x)}
${sampler('faceV', 'vel', 'y', LIMITS.y)}
${sampler('faceW', 'vel', 'z', LIMITS.z)}
const SHORTEST: f32 = 6.0;
const LONGEST: f32 = 12.0;
const TRIES: i32 = 8;
var<private> rng: u32;
fn hash(x: u32) -> u32 {
	let state = x * 747796405u + 2891336453u;
	let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
	return (word >> 22u) ^ word;
}
fn random() -> f32 {
	rng = hash(rng);
	return f32(rng >> 8u) * (1.0 / 16777216.0);
}
fn flowAt(q: vec3<f32>) -> vec3<f32> {
	let g = q / C.h;
	let origin = vec3<i32>(0);
	return vec3<f32>(faceU(origin, g + vec3<f32>(0.0, -0.5, -0.5)), faceV(origin, g + vec3<f32>(-0.5, 0.0, -0.5)), faceW(origin, g + vec3<f32>(-0.5, -0.5, 0.0)));
}
fn cellAt(q: vec3<f32>) -> i32 {
	let i = i32(floor(q.x / C.h));
	let j = i32(floor(q.y / C.h));
	let k = i32(floor(q.z / C.h));
	if (i < 0 || j < 0 || k < 0 || i >= C.nx || j >= C.ny || k >= C.nz) {
		return -1;
	}
	return i + C.sx * j + C.sxy * k;
}
fn randomCell() -> i32 {
	return i32(places[min(u32(random() * f32(P.places)), P.places - 1u)]);
}
// A random point in \`cell\` (cpu/particles.ts place), with the age it would give.
fn placeIn(cell: i32) -> vec4<f32> {
	let k = cell / C.sxy;
	let r = cell - k * C.sxy;
	let j = r / C.sx;
	let i = r - j * C.sx;
	let x = (f32(i) + random()) * C.h;
	let y = (f32(j) + random()) * C.h;
	let z = (f32(k) + random()) * C.h;
	return vec4<f32>(x, y, z, random() * (LONGEST - SHORTEST) * 0.5);
}
${ENTRY} {
	${LINEAR}
	if (u32(id) >= P.count || P.places == 0u) {
		return;
	}
	let n = id;
	if (P.mode == 0u) {
		rng = hash(P.seed ^ hash(u32(n) + 1u));
		let placed = placeIn(randomCell());
		parts[n] = vec4<f32>(placed.xyz, 0.0);
		state[n] = vec2<u32>(rng, bitcast<u32>(placed.w));
		return;
	}
	let tracer = P.mode == 1u;
	var part = parts[n];
	let st = state[n];
	rng = st.x;
	var age = bitcast<f32>(st.y);
	let dt = P.dt;
	let v1 = flowAt(part.xyz);
	let v2 = flowAt(part.xyz + 0.5 * dt * v1);
	let moved = part.xyz + dt * v2;
	age = age + dt;
	let cell = cellAt(moved);
	let limit = vec3<f32>(f32(C.nx), f32(C.ny), f32(C.nz)) * C.h;
	if (cell < 0 || geo[max(cell, 0)].w <= 0.0 || moved.x > limit.x || moved.y > limit.y || moved.z > limit.z) {
		let placed = placeIn(randomCell());
		age = 0.0;
		var value = length(v2);
		if (!tracer) {
			let at = cellAt(placed.xyz);
			value = select(0.0, scal[max(at, 0)].y, at >= 0);
		}
		part = vec4<f32>(placed.xyz, value);
	} else if (tracer && age > SHORTEST + random() * (LONGEST - SHORTEST)) {
		let placed = placeIn(randomCell());
		age = 0.0;
		part = vec4<f32>(placed.xyz, 0.0);
	} else {
		var value = length(v2);
		if (!tracer) {
			value = scal[cell].y;
		}
		part = vec4<f32>(moved, value);
	}
	if (!tracer && !(part.w > 0.02 * P.scale && age < LONGEST)) {
		var found = false;
		for (var t = 0; t < TRIES; t = t + 1) {
			let candidate = randomCell();
			if (random() * P.scale < scal[candidate].y) {
				let placed = placeIn(candidate);
				part = vec4<f32>(placed.xyz, scal[candidate].y);
				age = random() * (LONGEST - SHORTEST);
				found = true;
				break;
			}
		}
		if (!found) {
			part.w = 0.0;
			age = 0.0;
		}
	}
	parts[n] = part;
	state[n] = vec2<u32>(rng, bitcast<u32>(age));
}`
};

/**
 * Sparse writes to the geometry: entry n sets the faces flagged in vals[n].w (bit per axis) at index idx[n] to
 * vals[n].xyz. The host merges every change to one index into one entry, so no two threads touch one vec4.
 */
export const geometryScatter: KernelSource = {
	name: 'geometryScatter',
	bindings: [uniform('N', 'Counts'), read('idx', U32), read('vals', VEC4), write('geo', VEC4)],
	code: `${ENTRY} {
	${LINEAR}
	if (id >= N.a) {
		return;
	}
	let index = idx[id];
	let v = vals[id];
	let mask = u32(v.w);
	var g = geo[index];
	if ((mask & 1u) != 0u) {
		g.x = v.x;
	}
	if ((mask & 2u) != 0u) {
		g.y = v.y;
	}
	if ((mask & 4u) != 0u) {
		g.z = v.z;
	}
	geo[index] = g;
}`
};

/** Sparse writes of the per-cell release and removal rates (cpu/solver.ts `setEmitters`, `setSinks`), one entry per cell. */
export const sourceScatter: KernelSource = {
	name: 'sourceScatter',
	bindings: [uniform('N', 'Counts'), read('idx', U32), read('vals', VEC2), write('srcsink', VEC2)],
	code: `${ENTRY} {
	${LINEAR}
	if (id >= N.a) {
		return;
	}
	srcsink[idx[id]] = vals[id];
}`
};

export const PARTICLE_KERNELS = [particles, geometryScatter, sourceScatter];
