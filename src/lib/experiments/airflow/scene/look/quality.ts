import type { AirLook } from '../air';

/**
 * How much the look costs on each kind of device. A desktop draws everything; a phone keeps the light and the materials but drops
 * ambient occlusion, draws fewer and coarser shadows, and fewer pixels. `?quality=high`, `medium` or `low` in the address overrides
 * the guess, for testing and for a visitor who wants it.
 */

export type QualityTier = 'high' | 'medium' | 'low';

export interface Quality {
	tier: QualityTier;
	/** The most device pixels per CSS pixel the canvas draws. */
	pixelRatio: number;
	/** The sun's shadow map, texels a side, and how soft its edge is, texels. Null: no shadows. */
	shadows: { size: number; radius: number } | null;
	/** Ambient occlusion (`GTAOPass`), and the share of the canvas's resolution it is worked out at. */
	ao: { scale: number; samples: number } | null;
	/** A gentle bloom on what is brighter than white (the sun on glass, the sky). */
	bloom: boolean;
	/** Edge smoothing after tone mapping (`SMAAPass`). */
	smaa: boolean;
	/** Anisotropic filtering for the floors, which are mostly seen at a slant. */
	anisotropy: number;
	/** What the tier asks of the air's look beyond the air's own defaults (`scene/air/`); absent, the defaults. */
	air?: AirLook;
}

/**
 * The air on the low tier, which is a phone's. A phone shows the whole home from far out, on a small screen drawn at fewer pixels than
 * it has, and the desktop's air was a faint blue speckle there (check-in 2): a streak 1.4 cm wide is under a pixel from 20 m away, and
 * one drawn wider than it is is drawn fainter, so each was at 30% of its opacity. So a phone's streak is 5 cm wide (opaque from a
 * bird's-eye distance, and still a veil at eye level), fully opaque, at least 3 CSS pixels wide, fades in from slower air, and shows
 * 1.2 s of travel rather than 0.5 s, so from far out it reads as a line along the air rather than a dot. A third more of them than
 * before, still a quarter of the desktop's. The smoke's puffs are twice as many and more opaque, so a plume reads as smoke rather than
 * a few grey dots. `tests/airflow-phone.spec.ts` measures both on the page, and the frame rate they cost under a phone's processor.
 */
export const LOW_AIR: AirLook = {
	streaks: { count: 4_000, pixels: [3, 6.5], opacity: 1, tail: 1.2, maxLength: 1.5, width: 0.05, speedFade: [0.015, 0.25] },
	puffs: { count: 2_400, size: 0.55, opacity: 0.65 }
};

export const QUALITY: Record<QualityTier, Quality> = {
	high: { tier: 'high', pixelRatio: 2, shadows: { size: 4096, radius: 3 }, ao: { scale: 1, samples: 16 }, bloom: true, smaa: true, anisotropy: 8 },
	medium: { tier: 'medium', pixelRatio: 1.5, shadows: { size: 2048, radius: 2.5 }, ao: { scale: 0.5, samples: 8 }, bloom: true, smaa: true, anisotropy: 4 },
	low: { tier: 'low', pixelRatio: 1.25, shadows: { size: 1024, radius: 1.5 }, ao: null, bloom: false, smaa: true, anisotropy: 2, air: LOW_AIR }
};

export const isTier = (value: unknown): value is QualityTier => value === 'high' || value === 'medium' || value === 'low';

/**
 * The tier for this device: what the address asks for, else low on a phone or a small tablet (`small`, from `detectSmallDevice`) and
 * where WebGL is drawn in software (`software`: no GPU, as in a headless test browser or a machine without drivers), medium on a
 * machine with few cores, and high otherwise.
 */
export function chooseQuality(input: { search: string; small: boolean; cores?: number; software?: boolean }): QualityTier {
	const asked = new URLSearchParams(input.search).get('quality');
	if (isTier(asked)) return asked;
	if (input.small || input.software) return 'low';
	if (input.cores !== undefined && input.cores > 0 && input.cores < 6) return 'medium';
	return 'high';
}

/** Whether a WebGL renderer's name (`WEBGL_debug_renderer_info`) is a software rasterizer rather than a GPU. */
export const isSoftwareRenderer = (name: string) => /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);

/**
 * The low tier where WebGL is drawn in software, unless the address asks for a tier: every pixel costs the processor, which also runs
 * the page, so it draws half the pixels, no shadows and no edge smoothing, and the page stays usable.
 */
export const SOFTWARE: Quality = { ...QUALITY.low, pixelRatio: 0.5, shadows: null, smaa: false };
