import type { RasterOpening, Raster } from '../homes/rasterize';
import { rasterizeFan } from '../solver/fan';
import { Grid, type SideIndex } from '../solver/grid';
import type { FanDisk, FluidProperties, Sink } from '../solver/types';
import type { DeviceState } from '../state';
import { aimVector, fanFlow, headPosition, oscillatedYaw, purifierCadr } from './model';
import type { DeviceModel } from './types';

/**
 * How much of an ideal disk's pressure rise a disk delivering its flow in open air spends on the wake's kinetic
 * energy. An ideal actuator disk spends exactly twice ρU² (the wake leaves at twice the disk's speed); the resolved
 * disk in the solver measures 1.6. The fan's curve is built on it (below) so that the flow through the disk in open
 * air is the flow on the box. The free-jet benchmark (tests/solver/benchmarks.spec.ts) checks it: 102 % of rated.
 */
export const WAKE_FACTOR = 1.6;

/** Thickness of a fan disk, m: thin, but never less than a cell (the rasterizer enforces that). */
const DISK_THICKNESS = 0.1;

/** A window fan's effect on the faces of the opening it sits in. */
export interface WindowFanInput {
	opening: string;
	side: SideIndex;
	/** The covered faces' slots in the box side's array. */
	slots: Uint32Array;
	/** Free-delivery speed through each face, m/s: positive into the room (intake), negative out (exhaust); zero when the fan is off. */
	speed: number;
	/** Pressure rise the fan can push against with no flow, Pa. */
	shutoff: number;
}

export interface DeviceInputs {
	fans: FanDisk[];
	sinks: Sink[];
	windowFans: WindowFanInput[];
	/** For each device id, the index of its fan disk in `fans`, so the page can read the flow the solver measured. */
	fanIndex: Map<string, number>;
}

/**
 * The disk's curve for a flow `rated` (m³/s) through `area`: free delivery √2 times the rated flow and a shut-off
 * rise of 2·κ·ρ·U², so at the rated flow the rise is κ·ρ·U², exactly what the wake takes in open air.
 */
function curve(rated: number, area: number, rho: number) {
	const speed = rated / area;
	return { qMax: Math.SQRT2 * rated, dpMax: 2 * WAKE_FACTOR * rho * speed * speed };
}

/**
 * Turns the devices into what the solver pushes and cleans with. `time` is the page's simulated seconds, which
 * oscillating fans turn by. Devices are not solid: a fan's disk and a purifier's intake and outlet are regions of air
 * the solver acts on. A purifier draws its flow in through a band of its body (where it breathes in) and blows the
 * same air, cleaned, up out of the top as a jet (`purifierInputs`).
 */
export function deviceInputs(args: { devices: DeviceState[]; models: ReadonlyMap<string, DeviceModel>; raster: Raster; fluid: FluidProperties; time: number }): DeviceInputs {
	const { devices, models, raster, fluid, time } = args;
	const grid = new Grid(raster.spec);
	const fans: FanDisk[] = [];
	const sinks: Sink[] = [];
	const windowFans: WindowFanInput[] = [];
	const fanIndex = new Map<string, number>();

	for (const device of devices) {
		const model = models.get(device.model);
		if (!model || device.power <= 0.005) continue;
		if (model.kind === 'air-purifier') {
			const purifier = purifierInputs(grid, raster, device, model, purifierCadr(model, device.power), fluid.rho);
			if (!purifier) continue;
			sinks.push(purifier.sink);
			fanIndex.set(device.id, fans.length);
			fans.push(purifier.outlet);
		} else if (model.kind === 'window-fan') {
			const input = windowFanInput(raster, device, model.shutoff ?? 25, fanFlow(model, device.power));
			if (input) windowFans.push(input);
		} else {
			const area = (Math.PI * model.diameter ** 2) / 4;
			const flow = fanFlow(model, device.power);
			const disk = rasterizeFan(grid, raster.geometry, {
				center: headPosition(model, device),
				normal: aimVector(oscillatedYaw(device, time), device.tilt),
				radius: model.diameter / 2,
				thickness: DISK_THICKNESS,
				...curve(flow, area, fluid.rho)
			});
			fanIndex.set(device.id, fans.length);
			fans.push(disk);
		}
	}
	return { fans, sinks, windowFans, fanIndex };
}

/**
 * A purifier as the solver runs it: it draws `cadr` m³/s in through the band of its body where it breathes in and blows the same air out
 * of its outlet, cleaned of every particle (`Sink`), and the outlet's push makes that air a jet.
 *
 * The intake is the cells of the band, sharing the flow equally. The body turns with the purifier's yaw, as it is drawn
 * (`scene/deviceMeshes.ts`) and picked, so a cell is in the band when its centre, turned into the body's own axes, is within the body's
 * footprint. The outlet is the layer of cells that holds the top of the body, under the outlet's round grille, each sharing the flow by
 * how much of it the grille covers; the band stops below that layer, so no cell is both. The push is the momentum the jet leaves the grille
 * with: the flow times its speed through the grille, ρ·Q·U, a steady pressure rise of ρ·U² over the grille's area. It does not follow a
 * fan curve, because the pressure solve sets the flow: that is what keeps the flow and the jet the same on every grid. Null for a
 * purifier with no air over its top, which has nowhere to blow.
 */
function purifierInputs(grid: Grid, raster: Raster, device: DeviceState, model: Extract<DeviceModel, { kind: 'air-purifier' }>, cadr: number, rho: number): { sink: Sink; outlet: FanDisk } | null {
	const { nx, ny, nz, sx, sxy, h } = grid;
	const top = Math.min(ny - 1, Math.max(1, Math.floor((device.y + model.body.height) / h)));
	const area = (Math.PI * model.outletDiameter ** 2) / 4;
	const speed = cadr / area;
	const outlet = rasterizeFan(grid, raster.geometry, {
		center: [device.x, (top + 0.5) * h, device.z],
		normal: [0, 1, 0],
		radius: model.outletDiameter / 2,
		thickness: 0,
		qMax: 0,
		dpMax: rho * speed * speed
	});
	const weights = outlet.cellWeight.reduce((sum, w) => sum + w, 0);
	const pushed = outlet.faceWeight.reduce((sum, w) => sum + w, 0);
	if (!(weights > 0) || !(pushed > 0)) return null;
	// The push is spread over the faces it acts on: a face closed by a wall takes none, and the rest carry the whole momentum.
	outlet.dpMax = (rho * speed * speed * weights) / pushed;

	const half = [model.body.width / 2 + h / 2, model.body.depth / 2 + h / 2];
	const low = device.y + model.inlet.from;
	const high = device.y + model.inlet.to;
	const turn = (device.yaw * Math.PI) / 180;
	const [cos, sin] = [Math.cos(turn), Math.sin(turn)];
	const cells: number[] = [];
	for (let k = 0; k < nz; k++)
		for (let j = 0; j < top; j++)
			for (let i = 0; i < nx; i++) {
				const dx = (i + 0.5) * h - device.x;
				const y = (j + 0.5) * h;
				const dz = (k + 0.5) * h - device.z;
				const across = dx * cos + dz * sin;
				const along = dz * cos - dx * sin;
				if (Math.abs(across) <= half[0] && Math.abs(along) <= half[1] && y >= low && y <= high && raster.geometry.fluid[i + sx * j + sxy * k]) cells.push(i + sx * j + sxy * k);
			}
	// A band narrower than a cell still draws: take the cell nearest its centre, below the outlet.
	if (!cells.length) {
		const i = Math.min(nx - 1, Math.max(0, Math.floor(device.x / h)));
		const j = Math.min(top - 1, Math.max(0, Math.floor((low + high) / 2 / h)));
		const k = Math.min(nz - 1, Math.max(0, Math.floor(device.z / h)));
		cells.push(i + sx * j + sxy * k);
	}
	const sink: Sink = {
		cells: Uint32Array.from(cells),
		share: new Float32Array(cells.length).fill(1 / cells.length),
		cadr,
		outlet: { cells: outlet.cells, share: Float32Array.from(outlet.cellWeight, (w) => w / weights) }
	};
	return { sink, outlet };
}

/** A window fan fills the opening it sits in: every covered face gets the fan's curve, with the free-delivery speed that makes the whole opening pass the fan's rated flow. */
function windowFanInput(raster: Raster, device: DeviceState, shutoff: number, flow: number): WindowFanInput | null {
	const opening = raster.openings.find((o: RasterOpening) => o.spec.id === device.opening);
	if (!opening || opening.side === undefined) return null;
	// With the fan in, the window is open as far as it goes; the fan's blades fill it.
	const coverage = opening.coverage(1);
	const area = coverage.reduce((sum, c) => sum + c, 0) * raster.spec.h ** 2;
	if (area <= 0) return null;
	const slots: number[] = [];
	opening.faces.forEach((face, n) => {
		if (coverage[n] > 0) slots.push(face.slot);
	});
	return { opening: opening.spec.id, side: opening.side, slots: Uint32Array.from(slots), speed: ((device.intake ? 1 : -1) * flow) / area, shutoff };
}
