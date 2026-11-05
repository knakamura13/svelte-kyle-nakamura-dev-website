import type { DeviceModel } from '../../devices/types';
import type { AirflowExperience } from '../../experience.svelte';
import type { HomeContext } from './inventory';

const maps = new WeakMap<readonly DeviceModel[], ReadonlyMap<string, DeviceModel>>();

/** The Home on screen as the HUD's words and menus read it (`inventory.ts`). Read inside a `$derived`, so it follows every change. */
export function homeContext(experience: AirflowExperience): HomeContext {
	let models = maps.get(experience.models);
	if (!models) {
		models = new Map(experience.models.map((model) => [model.id, model]));
		maps.set(experience.models, models);
	}
	return {
		plan: experience.plan,
		setup: experience.setup,
		probes: experience.probes,
		models,
		readings: experience.readout.probes,
		units: experience.view.units,
		amount: (id) => experience.openingAmount(id)
	};
}
