import { getContext, setContext } from 'svelte';
import { Experience, setExperience, type EngineLoader } from '../engine/experience.svelte';
import { newDevice } from './devices/placement';
import type { DeviceModel } from './devices/types';
import type { HomePlan, PlanId } from './homes/types';
import { emptyReadout, type AirflowReadout } from './readouts';
import type { Scenario } from './scenarios';
import { DEFAULT_CLOCK, DEFAULT_VIEW, LIMITS, MAX_PINS, blankSetup, type Clock, type Conditions, type DeviceState, type Pin, type Setup, type UnitSystem, type View } from './state';

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
	readout: AirflowReadout = $state(emptyReadout());
	bridge: StageBridge = {};
	private starting: Setup;
	private copiedTimer: ReturnType<typeof setTimeout> | undefined;

	constructor(options: AirflowOptions) {
		super(options.load);
		this.options = options;
		this.plans = options.plans;
		this.models = options.models;
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

	selectPlan(id: PlanId) {
		if (id === this.setup.plan) return;
		this.setup = { ...blankSetup(id), conditions: { ...this.setup.conditions }, furniture: this.setup.furniture };
		this.scenario = null;
		this.afterChange(`${this.plans.find((p) => p.id === id)?.name}.`, true);
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

	// ---- probes and smoke ----

	/** Pins a Probe at a point of the Slice. Returns false when the Home already has the most it allows. */
	pin(point: { x: number; y: number; z: number }) {
		if (this.probes.length >= MAX_PINS) {
			this.announce(`A home holds at most ${MAX_PINS} probes. Remove one to add another.`);
			return false;
		}
		const used = new Set(this.probes.map((p) => p.id));
		let n = 1;
		while (used.has(`p${n}`)) n++;
		this.probes.push({ id: `p${n}`, ...point });
		this.announce(`Probe ${n} pinned.`);
		this.wake();
		return true;
	}

	unpin(id: string) {
		this.probes = this.probes.filter((p) => p.id !== id);
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

	/** Starts the simulation over with the same setup: the air is still, the smoke is gone. */
	restart() {
		this.probes = [];
		this.restarts++;
		this.wake();
	}

	/** Back to where this visit started: the scenario, link or blank home it began with. */
	reset() {
		this.setup = clone(this.starting);
		this.probes = [];
		this.selected = null;
		this.restarts++;
		this.announce('Back to the start.');
		this.wake();
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

	/** Copies the link to this setup. Resolves to whether the browser let it. */
	async copyLink() {
		const url = this.options.link(clone(this.setup));
		let ok = false;
		try {
			await navigator.clipboard.writeText(url);
			ok = true;
		} catch {
			ok = false;
		}
		if (ok) {
			this.copied = true;
			clearTimeout(this.copiedTimer);
			this.copiedTimer = setTimeout(() => (this.copied = false), 2200);
			this.announce('Link copied.');
		} else this.announce('The browser would not copy the link. Select it from the address bar instead.');
		return ok;
	}
}

export const provideAirflow = (options: AirflowOptions) => {
	const experience = new AirflowExperience(options);
	setExperience(experience);
	return setContext(key, experience);
};
export const useAirflow = () => getContext<AirflowExperience>(key);
