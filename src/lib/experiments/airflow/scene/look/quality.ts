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
	high: { tier: 'high', pixelRatio: 2, shadows: { size: 4096, radius: 3 }, ao: { scale: 1, samples: 16 }, bloom: true, smaa: true, anisotropy: 8 },
	medium: { tier: 'medium', pixelRatio: 1.5, shadows: { size: 2048, radius: 2.5 }, ao: { scale: 0.5, samples: 8 }, bloom: true, smaa: true, anisotropy: 4 },
	low: { tier: 'low', pixelRatio: 1.25, shadows: { size: 1024, radius: 1.5 }, ao: null, bloom: false, smaa: true, anisotropy: 2 }
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
