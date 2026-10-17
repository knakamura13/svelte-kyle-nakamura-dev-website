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
}

export const QUALITY: Record<QualityTier, Quality> = {
	high: { tier: 'high', pixelRatio: 2, shadows: { size: 4096, radius: 3 }, ao: { scale: 0.5, samples: 16 }, bloom: true, smaa: true, anisotropy: 8 },
	medium: { tier: 'medium', pixelRatio: 1.5, shadows: { size: 2048, radius: 2.5 }, ao: { scale: 0.5, samples: 8 }, bloom: true, smaa: true, anisotropy: 4 },
	low: { tier: 'low', pixelRatio: 1.25, shadows: { size: 1024, radius: 1.5 }, ao: null, bloom: false, smaa: true, anisotropy: 2 }
};

export const isTier = (value: unknown): value is QualityTier => value === 'high' || value === 'medium' || value === 'low';

/**
 * The tier for this device: what the address asks for, else low on a phone or a small tablet (`small`, from `detectSmallDevice`),
 * medium on a machine with few cores, and high otherwise.
 */
export function chooseQuality(input: { search: string; small: boolean; cores?: number }): QualityTier {
	const asked = new URLSearchParams(input.search).get('quality');
	if (isTier(asked)) return asked;
	if (input.small) return 'low';
	if (input.cores !== undefined && input.cores > 0 && input.cores < 6) return 'medium';
	return 'high';
}
