/**
 * GLSL the air's shaders share: reading the volume (`fields.ts`), hashing, a ray against a box, and the distance to the nearest
 * surface from the depth pre-pass (`depth.ts`). Every function is plain GLSL ES 3.00, which three.js compiles every shader as.
 */

/**
 * The volume, blended from the older read (A) to the newer (B) by `uBlend`. `uExtent` is the volume's size in metres, so a point
 * in the home's metres divided by it is a texture coordinate; the textures clamp at their edges, so a point outside the home reads
 * the air at the nearest wall.
 */
export const VOLUME_GLSL = /* glsl */ `
uniform highp sampler3D uVelocityA;
uniform highp sampler3D uVelocityB;
uniform highp sampler3D uLookA;
uniform highp sampler3D uLookB;
uniform float uBlend;
uniform vec3 uExtent;

vec3 airVelocity(vec3 p) {
	vec3 uvw = p / uExtent;
	return mix(texture(uVelocityA, uvw).xyz, texture(uVelocityB, uvw).xyz, uBlend);
}

/** Speed (m/s), temperature (K above the reference), PM2.5 (ppm by mass) and the share of air. */
vec4 airLook(vec3 p) {
	vec3 uvw = p / uExtent;
	return mix(texture(uLookA, uvw), texture(uLookB, uvw), uBlend);
}
`;

/** A good integer hash (PCG), and a number from 0 to 1 from two integers. */
export const HASH_GLSL = /* glsl */ `
uint pcgHash(uint v) {
	uint state = v * 747796405u + 2891336453u;
	uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
	return (word >> 22u) ^ word;
}

float hash01(uint a, uint b) {
	return float(pcgHash(a ^ pcgHash(b))) / 4294967295.0;
}

/** Interleaved gradient noise: a dither that hides banding at a fixed pattern per pixel. */
float gradientNoise(vec2 pixel) {
	return fract(52.9829189 * fract(dot(pixel, vec2(0.06711056, 0.00583715))));
}
`;

/** Where a ray enters and leaves an axis-aligned box: (near, far), with far < near for a miss. */
export const BOX_GLSL = /* glsl */ `
vec2 boxHit(vec3 origin, vec3 direction, vec3 lo, vec3 hi) {
	vec3 inverse = 1.0 / direction;
	vec3 a = (lo - origin) * inverse;
	vec3 b = (hi - origin) * inverse;
	vec3 near = min(a, b);
	vec3 far = max(a, b);
	return vec2(max(max(near.x, near.y), near.z), min(min(far.x, far.y), far.z));
}
`;

/**
 * The distance along a view ray to the nearest opaque surface, from the depth pre-pass, at a point of the screen given from 0 to 1.
 * `uCameraForward` is the camera's unit view direction in the world; a pixel where nothing was drawn is infinitely far.
 */
export const DEPTH_GLSL = /* glsl */ `
uniform highp sampler2D uDepth;
uniform float uCameraNear;
uniform float uCameraFar;
uniform vec3 uCameraForward;

float surfaceDistance(vec2 screen, vec3 direction) {
	float depth = texture(uDepth, screen).x;
	if (depth >= 1.0) return 1e6;
	float viewZ = (uCameraNear * uCameraFar) / ((uCameraFar - uCameraNear) * depth - uCameraFar);
	return -viewZ / max(dot(direction, uCameraForward), 1e-4);
}
`;

/**
 * The solid mask (`mask.ts`) and the rule that keeps anything that moves through the air out of walls and furniture: a move never
 * crosses a closed face of the solver's grid. `uCells` is the grid's cells along x, y and z, `uCellSize` their size and `uBox` the
 * home's box, m.
 */
export const MASK_GLSL = /* glsl */ `
uniform highp sampler3D uMask;
uniform vec3 uCells;
uniform float uCellSize;
uniform vec3 uBox;

const float EDGE = 1e-3;

/** The mask at texel c: air, and the open share of the x, y and z faces at c's low corner. */
vec4 maskAt(ivec3 c) {
	return texelFetch(uMask, clamp(c, ivec3(0), ivec3(uCells)), 0);
}

bool inBox(vec3 p) {
	return all(greaterThanEqual(p, vec3(0.0))) && all(lessThan(p, uBox));
}

/**
 * The move from p to next, short of every closed face it would cross: x, then y, then z, each checked at the cell the move has
 * reached. A face on the far side of a cell is the near face of the next, so the face between cells a and a + 1 is face a + 1.
 * Outside the box nothing blocks; the box's own faces are shut except where an Opening is open.
 */
vec3 constrain(vec3 p, vec3 next) {
	ivec3 cells = ivec3(uCells);
	ivec3 c = ivec3(floor(p / uCellSize));
	vec3 q = p;

	int x = int(floor(next.x / uCellSize));
	if (x != c.x) {
		int face = max(x, c.x);
		bool across = c.y >= 0 && c.y < cells.y && c.z >= 0 && c.z < cells.z && face >= 0 && face <= cells.x;
		if (across && maskAt(ivec3(face, c.y, c.z)).g <= 0.0) q.x = clamp(next.x, float(c.x) * uCellSize + EDGE, float(c.x + 1) * uCellSize - EDGE);
		else {
			q.x = next.x;
			c.x = x;
		}
	} else q.x = next.x;

	int y = int(floor(next.y / uCellSize));
	if (y != c.y) {
		int face = max(y, c.y);
		bool across = c.x >= 0 && c.x < cells.x && c.z >= 0 && c.z < cells.z && face >= 0 && face <= cells.y;
		if (across && maskAt(ivec3(c.x, face, c.z)).b <= 0.0) q.y = clamp(next.y, float(c.y) * uCellSize + EDGE, float(c.y + 1) * uCellSize - EDGE);
		else {
			q.y = next.y;
			c.y = y;
		}
	} else q.y = next.y;

	int z = int(floor(next.z / uCellSize));
	if (z != c.z) {
		int face = max(z, c.z);
		bool across = c.x >= 0 && c.x < cells.x && c.y >= 0 && c.y < cells.y && face >= 0 && face <= cells.z;
		if (across && maskAt(ivec3(c.x, c.y, face)).a <= 0.0) q.z = clamp(next.z, float(c.z) * uCellSize + EDGE, float(c.z + 1) * uCellSize - EDGE);
		else {
			q.z = next.z;
			c.z = z;
		}
	} else q.z = next.z;

	// A diagonal move can reach a solid cell past an edge without crossing a closed face head on: it stays where it was.
	if (inBox(q) && maskAt(c).r <= 0.0) return p;
	return q;
}
`;
