import type { DeviceModel } from '../../devices/types';
import type { HomePlan } from '../../homes/types';

/**
 * The Build catalog as data: its tabs, the two lines each card shows, and the way a device being carried faces before the visitor
 * turns it. Plain data, so Node tests it against the catalog.
 */

export type CatalogTab = 'fans' | 'purifiers';

export const CATALOG_TABS: readonly { id: CatalogTab; label: string }[] = [
	{ id: 'fans', label: 'Fans' },
	{ id: 'purifiers', label: 'Purifiers' }
];

export const inTab = (model: DeviceModel, tab: CatalogTab) => (tab === 'purifiers' ? model.kind === 'air-purifier' : model.kind !== 'air-purifier');

const SIZES = { small: 'Small', medium: 'Medium', large: 'Large' } as const;

/**
 * A card's two lines: what it is ("20″ box fan", "Small air purifier") and who makes it ("Air King 9723"). A fan's name in the
 * catalog is the maker, the model number and what it is ("Air King 9723 20″ box fan"); a purifier's is the maker and model, then
 * "air purifier", and its size class says how big it is.
 */
export function cardLines(model: DeviceModel): { title: string; maker: string } {
	if (model.kind === 'air-purifier') {
		const maker = model.name.replace(/\s*air purifier$/i, '');
		return { title: `${SIZES[model.size]} air purifier`, maker };
	}
	const split = /^(.*?\d{3,5}[A-Za-z-]*)\s+(.+)$/.exec(model.name);
	if (!split) return { title: model.name, maker: '' };
	const what = split[2];
	return { title: what.charAt(0).toUpperCase() + what.slice(1), maker: split[1] };
}

/**
 * The bearing a device faces when it is put down at (x, z) without being turned: toward the middle of the home, so what it blows
 * goes into the rooms. The same rule `deviceAt` (devices/surfaces.ts) gives a device dropped from the catalog.
 */
export function towardMiddle(plan: Pick<HomePlan, 'width' | 'depth'>, x: number, z: number): number {
	return (((Math.atan2(plan.width / 2 - x, -(plan.depth / 2 - z)) * 180) / Math.PI) + 360) % 360;
}

/** One press of R while carrying a device turns it this far clockwise (Shift+R the other way). */
export const TURN_STEP = 45;
