/**
 * Which walls stand and which are cut down, as plain numbers, so Node checks the rule. Three modes, as in The Sims: walls up (every
 * wall full height), walls down (every wall a low outline), and cutaway, the default, where the walls that stand between the camera
 * and what it looks at drop to a low cut with a clean cap and the rest stand full height.
 *
 * The rule for cutaway is plan geometry. A wall is between the camera and its focus when the wall's line has the camera on one side
 * and the focus on the other, and the line of sight from the camera to the focus crosses that line within the wall's length, give
 * or take a corridor either side. The corridor is narrow at eye level, so only the wall in front of the visitor drops, and wide when
 * the camera is far out, so every wall on the near side of the Home drops and the rooms show. A wall the camera stands in (or very
 * near) drops too. A wall that was cut stays cut until the camera is clearly past it, so nothing flickers on the line.
 */

export type WallMode = 'up' | 'cutaway' | 'down';

/** The modes in the order the temporary C key steps through them, from the default. */
export const WALL_MODES: readonly WallMode[] = ['cutaway', 'up', 'down'];

/** How high a cut wall stands, m, and every wall in walls-down mode. */
export const CUT_HEIGHT = 0.4;
export const DOWN_HEIGHT = 0.14;

/** A wall's centre line in the plan, metres, from (ax, az) to (bx, bz). */
export interface WallLine {
	ax: number;
	az: number;
	bx: number;
	bz: number;
}

export interface CutawayView {
	/** The camera's position (only x and z matter). */
	camera: { x: number; z: number };
	/** The point it looks at on the floor. */
	focus: { x: number; z: number };
	/** How far past a wall's ends, m, a line of sight may cross the wall's line and still count as crossing the wall. */
	corridor: number;
}

/** A camera this close to a wall's line, m, is in it (or right at its face): the wall drops. */
const IN_WALL = 0.3;
/** A focus this close to a wall's line counts as being on its far side. */
const ON_LINE = 0.05;
/** A cut wall stays cut until the camera is this much further past it, m. */
const KEEP = 0.25;

/** The corridor for a zoom (0 at eye level, 1 at bird's-eye), m: narrow close in, wide far out. */
export function corridorFor(zoom: number): number {
	const t = Math.min(1, Math.max(0, (zoom - 0.25) / 0.6));
	const s = t * t * (3 - 2 * t);
	return 0.5 + s * 7.5;
}

/** Whether each wall is cut in cutaway mode. `previous` is the last answer, for walls that were cut and should stay so a little longer. */
export function cutWalls(walls: readonly WallLine[], view: CutawayView, previous?: readonly boolean[]): boolean[] {
	const { camera, focus } = view;
	return walls.map((wall, n) => {
		const was = previous?.length === walls.length ? previous[n] : false;
		const keep = was ? KEEP : 0;
		const dx = wall.bx - wall.ax;
		const dz = wall.bz - wall.az;
		const length = Math.hypot(dx, dz);
		if (length < 1e-6) return false;
		const ux = dx / length;
		const uz = dz / length;
		// Signed distances from the wall's line (positive on its left, seen from a to b), and positions along it.
		const side = (x: number, z: number) => ux * (z - wall.az) - uz * (x - wall.ax);
		const along = (x: number, z: number) => ux * (x - wall.ax) + uz * (z - wall.az);
		const sc = side(camera.x, camera.z);
		const sf = side(focus.x, focus.z);
		// The camera stands in the wall, or at its face.
		if (Math.abs(sc) < IN_WALL + keep) {
			const u = along(camera.x, camera.z);
			if (u > -IN_WALL - keep && u < length + IN_WALL + keep) return true;
		}
		const opposite = Math.abs(sf) < ON_LINE || Math.sign(sc) !== Math.sign(sf);
		if (!opposite) {
			// On the same side now, but a cut wall stands again only once the camera is clearly back on the focus's side.
			if (!was || Math.abs(sc) > KEEP) return false;
		}
		// Where the line of sight crosses the wall's line, along the wall. A focus on the line is the crossing itself.
		const t = Math.abs(sc - sf) < 1e-9 ? 1 : Math.min(1, Math.max(0, sc / (sc - sf)));
		const px = camera.x + t * (focus.x - camera.x);
		const pz = camera.z + t * (focus.z - camera.z);
		const u = along(px, pz);
		const reach = view.corridor + keep;
		return u > -reach && u < length + reach;
	});
}

/**
 * The height each wall should stand at, m: `ceiling` or the cut. `cut` is what `cutWalls` decided (ignored unless the mode is
 * cutaway).
 */
export function wallHeights(mode: WallMode, cut: readonly boolean[], ceiling: number): number[] {
	return cut.map((isCut) => (mode === 'up' ? ceiling : mode === 'down' ? DOWN_HEIGHT : isCut ? CUT_HEIGHT : ceiling));
}

/** The next mode for the temporary C key. */
export function nextWallMode(mode: WallMode): WallMode {
	return WALL_MODES[(WALL_MODES.indexOf(mode) + 1) % WALL_MODES.length];
}
