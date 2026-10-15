import { getContext, setContext } from 'svelte';
import { Experience, setExperience, type EngineLoader } from '../engine/experience.svelte';
import { newDevice } from './devices/placement';
import { deviceAt, placeAt } from './devices/surfaces';
import type { DeviceModel } from './devices/types';
import type { HomePlan, PlanId } from './homes/types';
import { describeBearing } from './readout';
import { emptyReadout, type AirflowReadout } from './readouts';
import type { Scenario } from './scenarios';
import { DEFAULT_CLOCK, DEFAULT_VIEW, LIMITS, MAX_DEVICES, MAX_PINS, blankSetup, type Clock, type Conditions, type DeviceState, type Pin, type Setup, type UnitSystem, type View } from './state';

const key = Symbol('airflow');

/** Everything the page is built from that is data: the plans, the device models, the scenarios, and how to turn a setup into a link. */
export interface AirflowOptions {
	load: EngineLoader;
	plans: readonly HomePlan[];
	models: readonly DeviceModel[];
	scenarios: readonly Scenario[];
	/** The setup to start from, decoded from the address by the page, or null. */
	initial: Setup | null;
	/** The scenario to start from when the address carries no setup. */
	defaultScenario: string;
	/** The share link for a setup, as a full URL. */
	link: (setup: Setup) => string;
}

/** The scene's side of a few things only it can do, filled in once the scene exists. */
export interface StageBridge {
	/** Where a screen point lands on the floor or on furniture of the Home, or null if it misses: for dragging a device off the tray. */
	pick?: (clientX: number, clientY: number) => { x: number; y: number; z: number } | null;
	/** Whether the pointer is over the Stage, so a tray drag knows when to preview. */
	over?: (clientX: number, clientY: number) => boolean;
}

const clone = <T>(value: T): T => structuredClone($state.snapshot(value)) as T;

/**
 * Everything the airflow page reads and changes. The Dock's controls call the methods here; the scene reads `setup`,
 * `view`, `clock` and the rest each frame and writes `readout`. Nothing here touches three.js or the solver.
 */
export class AirflowExperience extends Experience {
	readonly plans: readonly HomePlan[];
	readonly models: readonly DeviceModel[];
	readonly scenarios: readonly Scenario[];
	private readonly options: AirflowOptions;

	setup: Setup = $state(blankSetup('two-bedroom'));
	view: View = $state({ ...DEFAULT_VIEW, units: 'metric' });
	clock: Clock = $state({ ...DEFAULT_CLOCK });
	probes: Pin[] = $state([]);
	/** The device whose handles and inspector are showing, by id. */
	selected: string | null = $state(null);
	/** The id of the scenario that was last applied, or null for a setup the visitor made or a shared link. */
	scenario: string | null = $state(null);
	emission = $state({ strength: 0.5, active: false });
	/** Bumps to start the simulation over with the same setup (clears smoke, flow and probes' history). */
	restarts = $state(0);
	/** Particulates in the indoor air when a run starts, ppm. */
	startingSmoke = $state(0);
	copied = $state(false);
	/** Restart or Reset has just been pressed: the button says so for a moment, as Copy link does, because the air may be paused and show nothing. */
	acknowledged: 'restart' | 'reset' | null = $state(null);
	/** Whether the Dock shows the share link to be copied by hand, because the browser would not copy it. The link shown is always the setup's current one. */
	linkShown = $state(false);
	readout: AirflowReadout = $state(emptyReadout());
	bridge: StageBridge = {};
	/** A device being dragged from the tray, and where it would land: the Stage draws a ghost there, and a drop takes the spot or says why not. Null when nothing is being dragged. */
	drag: { model: string; x: number; y: number; z: number; ok: boolean; reason: string | null } | null = $state(null);
	private readonly modelMap: ReadonlyMap<string, DeviceModel>;
	private starting: Setup;
	/** The scenario `starting` is, or null when it is a home the visitor picked or a link's setup. */
	private startingScenario: string | null = null;
	private copiedTimer: ReturnType<typeof setTimeout> | undefined;
	private acknowledgedTimer: ReturnType<typeof setTimeout> | undefined;

	constructor(options: AirflowOptions) {
		super(options.load);
		this.options = options;
		this.plans = options.plans;
		this.models = options.models;
		this.modelMap = new Map(options.models.map((m) => [m.id, m]));
		this.scenarios = options.scenarios;
		const first = options.initial ?? options.scenarios.find((s) => s.id === options.defaultScenario)?.setup ?? blankSetup('two-bedroom');
		this.setup = clone(first);
		this.starting = clone(first);
		if (!options.initial) this.adoptScenario(options.defaultScenario, false);
	}

	get plan() {
		return this.plans.find((p) => p.id === this.setup.plan) ?? this.plans[0];
	}

	modelOf(device: DeviceState) {
		return this.models.find((m) => m.id === device.model);
	}

	/** Browser only. Starts paused for a visitor who prefers reduced motion, and in the units their locale uses. */
	override start(units?: UnitSystem) {
		const stop = super.start();
		if (units) this.view.units = units;
		if (this.reducedMotion) this.clock.paused = true;
		return stop;
	}

	// ---- the home ----

	/** A new home, closed up and empty, in the weather the visitor had. Reset returns to it, not to whatever the visit began with. */
	selectPlan(id: PlanId) {
		if (id === this.setup.plan) return;
		this.setup = { ...blankSetup(id), conditions: { ...this.setup.conditions }, furniture: this.setup.furniture };
		this.starting = clone(this.setup);
		this.startingScenario = null;
		this.startingSmoke = 0;
		this.scenario = null;
		const plan = this.plans.find((p) => p.id === id);
		this.afterChange(plan ? `${plan.name}. ${plan.blurb}` : '', true);
	}

	setFurniture(on: boolean) {
		this.setup.furniture = on;
		this.afterChange(on ? 'Furniture on.' : 'Furniture off.');
	}

	setOpening(id: string, amount: number) {
		this.setup.openings[id] = Math.max(0, Math.min(1, amount));
		this.scenario = null;
		this.wake();
	}

	openingAmount(id: string) {
		return this.setup.openings[id] ?? this.plan.openings.find((o) => o.id === id)?.open ?? 0;
	}

	setCondition<K extends keyof Conditions>(name: K, value: Conditions[K]) {
		const limits = (LIMITS as Record<string, { min: number; max: number } | undefined>)[name];
		this.setup.conditions[name] = (limits ? Math.max(limits.min, Math.min(limits.max, value as number)) : value) as Conditions[K];
		this.scenario = null;
		// A new starting indoor temperature resets the indoor air; everything else changes the weather while it runs.
		if (name === 'indoorTemp') this.restarts++;
		this.wake();
	}

	// ---- devices ----

	/** Adds a device by model id. Returns a reason in words if it could not be added. */
	addDevice(modelId: string): string | null {
		const model = this.models.find((m) => m.id === modelId);
		if (!model) return 'That device is not in the catalog.';
		const made = newDevice(this.plan, model, this.setup.devices);
		if ('reason' in made) {
			this.announce(made.reason);
			return made.reason;
		}
		this.setup.devices.push(made.device);
		this.selected = made.device.id;
		this.scenario = null;
		this.announce(`${model.name} added.`);
		this.wake();
		return null;
	}

	removeDevice(id: string) {
		const index = this.setup.devices.findIndex((d) => d.id === id);
		if (index < 0) return;
		const [removed] = this.setup.devices.splice(index, 1);
		if (this.selected === id) this.selected = null;
		this.scenario = null;
		this.announce(`${this.modelOf(removed)?.name ?? 'Device'} removed.`);
		this.wake();
	}

	updateDevice(id: string, patch: Partial<Omit<DeviceState, 'id' | 'model'>>) {
		const device = this.setup.devices.find((d) => d.id === id);
		if (!device) return;
		Object.assign(device, patch);
		this.scenario = null;
		this.wake();
	}

	selectDevice(id: string | null) {
		this.selected = id;
		this.wake();
	}

	private nameOf(device: DeviceState) {
		return this.modelOf(device)?.name ?? 'Device';
	}

	/** Adds a device where the visitor put it, as a drop from the tray does. Returns the reason in words when it cannot go there, which it also announces. */
	addDeviceAt(modelId: string, x: number, z: number): string | null {
		const model = this.modelMap.get(modelId);
		if (!model) return 'That device is not in the catalog.';
		const refuse = (reason: string) => {
			this.announce(reason);
			return reason;
		};
		if (this.setup.devices.length >= MAX_DEVICES) return refuse(`A home holds at most ${MAX_DEVICES} fans and purifiers. Remove one to add another.`);
		const placed = placeAt(this.plan, model, x, z, this.setup.devices, this.modelMap);
		if (!placed.ok) return refuse(placed.reason);
		const made = deviceAt(this.plan, model, placed.placement, this.setup.devices);
		if ('reason' in made) return refuse(made.reason);
		this.setup.devices.push(made.device);
		this.selected = made.device.id;
		this.scenario = null;
		this.announce(`${model.name} added${placed.placement.surface === 'sill' ? ' in a window' : placed.placement.surface === 'furniture' ? ' on a table' : ''}.`);
		this.wake();
		return null;
	}

	/** Where a device being dragged would land, for the ghost on the Stage. `null` ends the drag. */
	previewDrag(modelId: string | null, x = 0, z = 0) {
		const model = modelId ? this.modelMap.get(modelId) : undefined;
		if (!model) {
			this.drag = null;
			this.wake();
			return;
		}
		const placed = placeAt(this.plan, model, x, z, this.setup.devices, this.modelMap);
		this.drag = placed.ok ? { model: model.id, x: placed.placement.x, y: placed.placement.y, z: placed.placement.z, ok: true, reason: null } : { model: model.id, x, y: 0, z, ok: false, reason: placed.reason };
		this.wake();
	}

	/** Moves a placed device to where the visitor dragged it, or says why it cannot go there (a window fan goes to another window). Returns the reason, or null. */
	moveDevice(id: string, x: number, z: number): string | null {
		const device = this.setup.devices.find((d) => d.id === id);
		const model = device ? this.modelMap.get(device.model) : undefined;
		if (!device || !model) return null;
		const placed = placeAt(this.plan, model, x, z, this.setup.devices, this.modelMap, id);
		if (!placed.ok) {
			this.announce(placed.reason);
			return placed.reason;
		}
		const { placement } = placed;
		const patch: Partial<Omit<DeviceState, 'id' | 'model'>> = { x: placement.x, z: placement.z, y: placement.y };
		if (placement.opening) Object.assign(patch, { opening: placement.opening, yaw: placement.yaw ?? device.yaw });
		else if (device.opening) Object.assign(patch, { opening: undefined, intake: undefined });
		Object.assign(device, patch);
		this.scenario = null;
		this.announce(`Moved the ${model.name}.`);
		this.wake();
		return null;
	}

	/** A step of a key or a button: moves a device by `dx` east and `dz` south, metres. */
	nudgeDevice(id: string, dx: number, dz: number): string | null {
		const device = this.setup.devices.find((d) => d.id === id);
		return device ? this.moveDevice(id, device.x + dx, device.z + dz) : null;
	}

	/** Turns a device to face `yaw` degrees clockwise from north, and says which way that is once the visitor stops. */
	turnDevice(id: string, yaw: number) {
		const device = this.setup.devices.find((d) => d.id === id);
		if (!device) return;
		const wrapped = ((Math.round(yaw) % 360) + 360) % 360;
		device.yaw = wrapped;
		this.scenario = null;
		this.announce(`${this.nameOf(device)} faces ${describeBearing(wrapped).spoken}.`);
		this.wake();
	}

	/** Aims a device up (positive) or down, degrees, within the limits, and says so once the visitor stops. */
	aimDevice(id: string, tilt: number) {
		const device = this.setup.devices.find((d) => d.id === id);
		if (!device) return;
		device.tilt = Math.max(LIMITS.tilt.min, Math.min(LIMITS.tilt.max, Math.round(tilt)));
		this.scenario = null;
		this.announce(`${this.nameOf(device)} aimed ${device.tilt === 0 ? 'level' : `${Math.abs(device.tilt)} degrees ${device.tilt > 0 ? 'up' : 'down'}`}.`);
		this.wake();
	}

	// ---- probes and smoke ----

	/** Pins a Probe at a point of the Slice. Returns its id, or null when the Home already has the most it allows. */
	pin(point: { x: number; y: number; z: number }): string | null {
		if (this.probes.length >= MAX_PINS) {
			this.announce(`A home holds at most ${MAX_PINS} probes. Remove one to add another.`);
			return null;
		}
		const used = new Set(this.probes.map((p) => p.id));
		let n = 1;
		while (used.has(`p${n}`)) n++;
		this.probes.push({ id: `p${n}`, ...point });
		this.announce(`Probe ${n} pinned.`);
		this.wake();
		return `p${n}`;
	}

	/** Takes a Probe away. `quiet` is for one that was never meant to be there, so no "pinned" announcement is left waiting and nothing says "removed". */
	unpin(id: string, quiet = false) {
		if (!this.probes.some((p) => p.id === id)) return;
		this.probes = this.probes.filter((p) => p.id !== id);
		this.announce(quiet ? '' : `Probe ${id.slice(1)} removed.`);
		this.wake();
	}

	setEmitting(on: boolean) {
		this.emission.active = on;
		this.wake();
	}

	// ---- view and clock ----

	setView(patch: Partial<View>) {
		Object.assign(this.view, patch);
		this.wake();
	}

	togglePause() {
		this.clock.paused = !this.clock.paused;
		this.announce(this.clock.paused ? 'Paused.' : 'Running.');
		this.wake();
	}

	setSpeed(speed: Clock['speed']) {
		this.clock.speed = speed;
		this.announce(`${speed} times real time.`);
		this.wake();
	}

	// ---- whole-setup actions ----

	/** Starts the simulation over with the same setup: the air is still and the smoke is gone, and the probes stay where they are, reading the new air. */
	restart() {
		this.acknowledge('restart');
		this.restarts++;
		this.announce('Restarted. The air is still and the smoke is gone.');
		this.wake();
	}

	/** Back to how this home, scenario or link began: its setup as it was first loaded, with the air still. */
	reset() {
		this.acknowledge('reset');
		this.setup = clone(this.starting);
		this.scenario = this.startingScenario;
		this.probes = [];
		this.selected = null;
		this.restarts++;
		this.announce('Back to the start.');
		this.wake();
	}

	private acknowledge(what: 'restart' | 'reset') {
		this.acknowledged = what;
		clearTimeout(this.acknowledgedTimer);
		this.acknowledgedTimer = setTimeout(() => (this.acknowledged = null), 2200);
	}

	private adoptScenario(id: string, announce: boolean) {
		const scenario = this.scenarios.find((s) => s.id === id);
		if (!scenario) return;
		this.setup = clone(scenario.setup);
		this.starting = clone(scenario.setup);
		Object.assign(this.view, scenario.view ?? {});
		Object.assign(this.clock, { ...DEFAULT_CLOCK, ...scenario.clock });
		if (this.reducedMotion) this.clock.paused = true;
		this.startingSmoke = scenario.smoke ?? 0;
		this.startingScenario = id;
		this.probes = [];
		this.selected = null;
		this.scenario = id;
		this.restarts++;
		if (announce) this.announce(`${scenario.name}. ${scenario.notice}`);
		this.wake();
	}

	applyScenario(id: string) {
		this.adoptScenario(id, true);
	}

	/** Starts from a setup a share link carried: a fresh run of it, with the view and the clock left as the visitor has them. */
	adoptSetup(setup: Setup) {
		this.setup = clone(setup);
		this.starting = clone(setup);
		this.startingScenario = null;
		this.startingSmoke = 0;
		this.probes = [];
		this.selected = null;
		this.scenario = null;
		this.restarts++;
		this.wake();
	}

	private afterChange(message: string, restart = false) {
		if (restart) {
			this.probes = [];
			this.selected = null;
			this.restarts++;
		}
		this.announce(message);
		this.wake();
	}

	/** The share link for the setup as it is now, as a full URL. */
	shareUrl() {
		return this.options.link(clone(this.setup));
	}

	/**
	 * Copies the link to this setup. Resolves to whether the browser let it. When it would not (a page without permission to
	 * write to the clipboard), `linkShown` turns on, for the Dock to show the link to be copied by hand.
	 */
	async copyLink() {
		let ok = false;
		try {
			await navigator.clipboard.writeText(this.shareUrl());
			ok = true;
		} catch {
			ok = false;
		}
		clearTimeout(this.copiedTimer);
		this.linkShown = !ok;
		this.copied = ok;
		if (ok) {
			this.copiedTimer = setTimeout(() => (this.copied = false), 2200);
			this.announce('Link copied.');
		} else this.announce('The browser would not copy the link. It is shown below the buttons, to copy by hand.');
		return ok;
	}
}

export const provideAirflow = (options: AirflowOptions) => {
	const experience = new AirflowExperience(options);
	setExperience(experience);
	return setContext(key, experience);
};
export const useAirflow = () => getContext<AirflowExperience>(key);
