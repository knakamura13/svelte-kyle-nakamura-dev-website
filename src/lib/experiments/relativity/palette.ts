/**
 * Colors for the 3D scenes. The neutrals and tints are the site's tokens (src/lib/styles/site.css);
 * the four "roles" are this experiment's own and are repeated in experiments.css for the Dock:
 * the same hue always means the same thing in every Stage.
 */
export const palette = {
	ink: 0x202a24,
	muted: 0x5c655e,
	canvas: 0xf7f8f5,
	surface: 0xffffff,
	rule: 0xd9ded6,
	accent: 0x276b42,

	sage: 0xe1e9d9,
	sageCard: 0xdfe9d3,
	cream: 0xf0e3cf,
	sand: 0xf4e9d8,
	butter: 0xf5e1bb,
	peach: 0xf1dfcd,
	mist: 0xdde7ee,
	lilac: 0xe6ddf0,

	/** The observer who is not moving: the station, the platform, Earth. */
	rest: 0x3f63c8,
	/** The traveler and whatever rides with them. Same green as the site's accent. */
	mover: 0x276b42,
	/** Light. */
	light: 0xf2a01f,
	/** Softer clay versions of the roles, for the bodies of objects. Lines and labels use the strong ones. */
	restClay: 0x7fa6e8,
	moverClay: 0x7fb08f,
	/** What Newton's arithmetic predicts, and things that decay. */
	ghost: 0xd4583a,
	/** Muons. */
	muon: 0x7a56c8
} as const;

export type Tint = keyof Pick<
	typeof palette,
	'sage' | 'sageCard' | 'cream' | 'sand' | 'butter' | 'peach' | 'mist' | 'lilac'
>;
