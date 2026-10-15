import { expect, test } from '@playwright/test';
import { DEFAULT_VIEW, LIMITS, type LayerId, type UnitSystem } from '../../src/lib/experiments/airflow/state';
import { UNIT_SPACE } from '../../src/lib/experiments/airflow/units';
import { dockLegend } from '../../src/lib/experiments/airflow/viz/dockLegend';
import { colorFor, rgbToOklab, scaleFraction } from '../../src/lib/experiments/airflow/viz/palettes';
import {
	LAYER_OPTIONS,
	SENSITIVITY_SLIDER,
	UNIT_OPTIONS,
	describeLayer,
	describeSensitivity,
	describeSliceHeight,
	describeToggle,
	describeUnits,
	formatSensitivity,
	sensitivityFromSlider,
	sensitivityHint,
	sliceHeightFromSlider,
	sliderFromSensitivity,
	sliderFromSliceHeight,
	spokenSensitivity
} from '../../src/lib/experiments/airflow/viz/viewControls';

/**
 * The View group's logic, with no browser: what the Dock's legend says for each Layer in each unit system, that it is the
 * scale the Stage draws, and the words and numbers behind the sensitivity and slice height sliders.
 */

const LAYERS: LayerId[] = ['speed', 'direction', 'particulates', 'temperature'];
const UNITS: UnitSystem[] = ['metric', 'imperial'];
/** The slider's seventeen stops, as sensitivities. */
const STOPS = Array.from({ length: 17 }, (_, n) => sensitivityFromSlider(SENSITIVITY_SLIDER.min + n * SENSITIVITY_SLIDER.step));
const METRES_PER_SECOND_PER_MPH = 0.44704;

/** A label's number read back: the true minus sign and the digit grouping undone. */
const read = (value: string) => Number(value.replace('−', '-').replaceAll(',', ''));
/** A number and its unit as the formatters join them: with the narrow no-break space, so a line never ends between the two. */
const u = (value: string, unit: string) => `${value}${UNIT_SPACE}${unit}`;

test.describe('the legend in the Dock', () => {
	test('says the speed scale in the unit shown, at the default sensitivity', () => {
		const metric = dockLegend({ layer: 'speed', sensitivity: 0.5, units: 'metric', reference: 21 });
		expect(metric.title).toBe('Air speed');
		expect(metric.unit).toBe('m/s');
		expect(metric.ticks.map((tick) => tick.label.value)).toEqual(['0', '0.5', '1.0', '1.5']);
		expect(metric.ticks.map((tick) => tick.label.text)).toEqual([u('0', 'm/s'), u('0.5', 'm/s'), u('1.0', 'm/s'), u('1.5', 'm/s')]);
		expect(metric.description).toBe('Air speed, 0 to 1.5 metres per second, from pale to dark blue.');

		const imperial = dockLegend({ layer: 'speed', sensitivity: 0.5, units: 'imperial', reference: 21 });
		expect(imperial.unit).toBe('mph');
		expect(imperial.ticks.map((tick) => tick.label.text)).toEqual([u('0', 'mph'), u('1', 'mph'), u('2', 'mph'), u('3', 'mph')]);
		expect(imperial.description).toBe('Air speed, 0 to 3.4 miles per hour, from pale to dark blue.');
	});

	test('says the temperature scale around where the indoor air started, with that temperature as its neutral middle', () => {
		const metric = dockLegend({ layer: 'temperature', sensitivity: 0.5, units: 'metric', reference: 21 });
		expect(metric.unit).toBe('°C');
		expect(metric.ticks.map((tick) => tick.label.value)).toEqual(['18', '20', '22', '24']);
		expect(metric.midpoint?.label.text).toBe(u('21', '°C'));
		expect(metric.midpoint?.at).toBe(0.5);
		expect(metric.description).toBe('Temperature, 18 to 24 degrees Celsius, from blue for cooler through grey at 21 degrees Celsius to orange for warmer.');
		expect(metric.caption).toBe(`Blue is cooler and orange is warmer. Grey is where the indoor air started, ${u('21', '°C')}.`);

		// 21 °C is 69.8 °F, a fifth of a degree from the round 70, so the neutral is labelled with its tenth and no tick sits on top of it.
		const imperial = dockLegend({ layer: 'temperature', sensitivity: 0.5, units: 'imperial', reference: 21 });
		expect(imperial.unit).toBe('°F');
		expect(imperial.midpoint?.label.text).toBe(u('69.8', '°F'));
		expect(imperial.ticks.map((tick) => tick.label.value)).toEqual(['66', '68', '72', '74']);
		expect(imperial.description).toBe('Temperature, 64.4 to 75.2 degrees Fahrenheit, from blue for cooler through grey at 69.8 degrees Fahrenheit to orange for warmer.');
		// The neutral follows the starting temperature the visitor chose.
		expect(dockLegend({ layer: 'temperature', sensitivity: 0.5, units: 'metric', reference: 25.5 }).midpoint?.label.text).toBe(u('25.5', '°C'));
	});

	test('says the particulate scale in ppm by mass with µg/m³ beside it, which does not change with the unit system', () => {
		const metric = dockLegend({ layer: 'particulates', sensitivity: 1, units: 'metric', reference: 21 });
		expect(metric.unit).toBe('ppm above, µg/m³ below');
		expect(metric.ticks.map((tick) => tick.label.value)).toEqual(['0.001', '0.01', '0.1', '1', '10']);
		expect(metric.ticks.map((tick) => tick.second?.value)).toEqual(['1.2', '12', '120', '1,200', '12,000']);
		expect(metric.ticks.map((tick) => tick.at)).toEqual([0, 0.25, 0.5, 0.75, 1]);
		expect(metric.description).toBe(
			'Particulates (PM2.5), 0.001 to 10 parts per million by mass, which is 1.2 to 12,000 micrograms per cubic metre, on a logarithmic scale, from pale to dark orange.'
		);
		expect(dockLegend({ layer: 'particulates', sensitivity: 1, units: 'imperial', reference: 21 })).toEqual(metric);
		// Sensitivity slides the window along the decades, and the caption names where the palest end now is.
		const lower = dockLegend({ layer: 'particulates', sensitivity: 0.5, units: 'metric', reference: 21 });
		expect(lower.ticks.map((tick) => tick.label.value)).toEqual(['0.001', '0.01', '0.1', '1']);
		expect(lower.caption).toContain(`The palest is ${u('0.0005', 'ppm')} or less.`);
	});

	test('draws direction as a wheel: the four compass points, and a ring at each speed in the unit shown', () => {
		const metric = dockLegend({ layer: 'direction', sensitivity: 0.5, units: 'metric', reference: 21 });
		expect(metric.title).toBe('Direction of flow');
		expect(metric.ticks, 'no bar').toEqual([]);
		expect(metric.wheel?.headings).toEqual([
			{ label: 'N', spoken: 'north', bearing: 0 },
			{ label: 'E', spoken: 'east', bearing: 90 },
			{ label: 'S', spoken: 'south', bearing: 180 },
			{ label: 'W', spoken: 'west', bearing: 270 }
		]);
		expect(metric.wheel?.rings.map((ring) => ring.label.text)).toEqual([u('0.5', 'm/s'), u('1.0', 'm/s'), u('1.5', 'm/s')]);
		expect(metric.wheel?.background).toContain('conic-gradient');
		expect(metric.description).toContain('full colour at 1.5 metres per second');
		const imperial = dockLegend({ layer: 'direction', sensitivity: 0.5, units: 'imperial', reference: 21 });
		expect(imperial.wheel?.rings.map((ring) => ring.label.text)).toEqual([u('1', 'mph'), u('2', 'mph'), u('3', 'mph')]);
		expect(imperial.description).toContain('full colour at 3.4 miles per hour');
	});

	test('draws the Stage’s scale: every tick stands where the Stage colors its value, at every sensitivity, unit system and indoor temperature', () => {
		for (const layer of LAYERS) {
			for (const units of UNITS) {
				for (const sensitivity of STOPS) {
					for (const reference of [10, 20.5, 21, 32]) {
						const where = `${layer}, ${units}, sensitivity ${sensitivity}, indoor ${reference} °C`;
						const scale = { sensitivity, baseline: 0 };
						const legend = dockLegend({ layer, sensitivity, units, reference });
						const marks = layer === 'direction' ? legend.wheel!.rings : [...legend.ticks, ...(legend.midpoint ? [legend.midpoint] : [])];
						expect(marks.length, `${where}: something to read`).toBeGreaterThan(0);
						for (const mark of marks) {
							const shown = read(mark.label.value);
							let fraction: number;
							if (layer === 'speed' || layer === 'direction') fraction = scaleFraction(layer, units === 'imperial' ? shown * METRES_PER_SECOND_PER_MPH : shown, scale);
							else if (layer === 'particulates') fraction = scaleFraction(layer, shown, scale);
							else fraction = scaleFraction(layer, (units === 'imperial' ? (shown - 32) / 1.8 : shown) - reference, scale);
							expect(mark.at, `${where}: the tick labelled ${mark.label.text}`).toBeCloseTo(fraction, 6);
						}
						const ats = marks.map((mark) => mark.at);
						expect([...ats].sort((a, b) => a - b), `${where}: in order`).toEqual(layer === 'temperature' ? [...ats].sort((a, b) => a - b) : ats);
						for (const at of ats) {
							expect(at).toBeGreaterThanOrEqual(0);
							expect(at).toBeLessThanOrEqual(1);
						}
						expect(legend.description.length, where).toBeGreaterThan(20);
					}
				}
			}
		}
	});

	test('reads only in the unit system shown, in the labels, the unit and the description alike', () => {
		const other = { metric: /\b(mph|miles per hour|°F|degrees Fahrenheit)\b/, imperial: /\b(m\/s|metres? per second|°C|degrees Celsius)\b/ };
		for (const layer of LAYERS) {
			for (const units of UNITS) {
				const legend = dockLegend({ layer, sensitivity: 0.5, units, reference: 21 });
				const marks = layer === 'direction' ? legend.wheel!.rings : legend.ticks;
				const text = [legend.unit, legend.description, legend.caption, ...marks.flatMap((mark) => [mark.label.text, mark.label.spoken]), legend.midpoint?.label.text ?? ''].join(' | ');
				expect(text, `${layer} in ${units}`).not.toMatch(other[units]);
			}
		}
		expect(dockLegend({ layer: 'speed', sensitivity: 0.5, units: 'imperial', reference: 21 }).ticks[1].label.spoken).toBe('1 mile per hour');
		expect(dockLegend({ layer: 'speed', sensitivity: 0.5, units: 'metric', reference: 21 }).ticks[1].label.spoken).toBe('0.5 metres per second');
	});

	test('thins its ticks for a narrow bar, and keeps every label of one row to the same decimals', () => {
		expect(dockLegend({ layer: 'particulates', sensitivity: 1, units: 'metric', reference: 21, maxTicks: 3 }).ticks.map((tick) => tick.label.value)).toEqual(['0.001', '0.1', '10']);
		expect(dockLegend({ layer: 'speed', sensitivity: 1, units: 'metric', reference: 21, maxTicks: 3 }).ticks.length).toBeLessThanOrEqual(3);
		// 0.5 steps need a tenth, so the 1 of 0.5, 1.0, 1.5 is written 1.0; the zero never carries decimals.
		expect(dockLegend({ layer: 'speed', sensitivity: 0.25, units: 'imperial', reference: 21 }).ticks.map((tick) => tick.label.value)).toEqual(['0', '0.5', '1.0', '1.5']);
	});
});

test.describe('the sensitivity slider', () => {
	test('is a log scale from 0.25 to 4 whose stops are round numbers', () => {
		expect(sensitivityFromSlider(SENSITIVITY_SLIDER.min)).toBe(LIMITS.sensitivity.min);
		expect(sensitivityFromSlider(SENSITIVITY_SLIDER.max)).toBe(LIMITS.sensitivity.max);
		expect(STOPS).toEqual([0.25, 0.3, 0.35, 0.42, 0.5, 0.59, 0.71, 0.84, 1, 1.2, 1.4, 1.7, 2, 2.4, 2.8, 3.4, 4]);
		for (let n = 1; n < STOPS.length; n++) {
			// Equal steps along the slider are equal ratios (a quarter octave, 1.19), whatever the rounding to two digits does.
			expect(STOPS[n] / STOPS[n - 1]).toBeGreaterThan(1.1);
			expect(STOPS[n] / STOPS[n - 1]).toBeLessThan(1.28);
		}
		// Each stop reads back as itself, so a value that came from the slider sits on the stop it came from.
		for (let n = 0; n < STOPS.length; n++) {
			const position = SENSITIVITY_SLIDER.min + n * SENSITIVITY_SLIDER.step;
			expect(sliderFromSensitivity(STOPS[n])).toBe(position);
			expect(sensitivityFromSlider(position)).toBe(STOPS[n]);
		}
		// A value from elsewhere gets the nearest stop, and nothing leaves the slider.
		expect(sliderFromSensitivity(0.7)).toBe(-0.5);
		expect(sliderFromSensitivity(100)).toBe(SENSITIVITY_SLIDER.max);
		expect(sliderFromSensitivity(0)).toBe(SENSITIVITY_SLIDER.min);
		expect(sensitivityFromSlider(9)).toBe(LIMITS.sensitivity.max);
		expect(sensitivityFromSlider(-9)).toBe(LIMITS.sensitivity.min);
	});

	test('starts at 0.5, on a stop of the slider, because 1 shows ordinary room air almost the same pale blue as still air', () => {
		expect(DEFAULT_VIEW.sensitivity).toBe(0.5);
		expect(STOPS).toContain(DEFAULT_VIEW.sensitivity);
		// Ordinary room air moves at a tenth of a metre a second. How far its color is from still air's, in OKLab ΔE ×100 (about 2 is the least that shows):
		const apart = (sensitivity: number) => {
			const [still, room] = [0, 0.1].map((speed) => rgbToOklab(colorFor('speed', speed, { sensitivity, baseline: 0 })));
			return 100 * Math.hypot(still[0] - room[0], still[1] - room[1], still[2] - room[2]);
		};
		expect(apart(1), 'at 1 it is barely told from still air').toBeLessThan(2.5);
		expect(apart(DEFAULT_VIEW.sensitivity), 'at the default it plainly is').toBeGreaterThan(3.5);
	});

	test('names what each direction does to the Layer, and that is what the scale does', () => {
		// Below 1 the scale covers less, so the same value sits further along it, in stronger color: the sentences say so.
		const speed = (sensitivity: number) => scaleFraction('speed', 0.5, { sensitivity, baseline: 0 });
		expect(speed(0.5)).toBeGreaterThan(speed(1));
		expect(speed(2)).toBeLessThan(speed(1));
		const smoke = (sensitivity: number) => scaleFraction('particulates', 0.01, { sensitivity, baseline: 0 });
		expect(smoke(0.5)).toBeGreaterThan(smoke(1));
		const warm = (sensitivity: number) => scaleFraction('temperature', 1, { sensitivity, baseline: 0 });
		expect(warm(0.5)).toBeGreaterThan(warm(1));
		expect(sensitivityHint('speed')).toBe('Lower: weaker flow shows in stronger colour. Higher: only stronger flow shows in strong colour.');
		expect(sensitivityHint('temperature')).toBe('Lower: smaller temperature differences show in stronger colour. Higher: only larger differences show in strong colour.');
		expect(sensitivityHint('particulates')).toContain('lower particulate levels');
	});

	test('is announced with its effect and the Layer’s new scale, or just the scale at 1', () => {
		const scale = (layer: LayerId, sensitivity: number) => dockLegend({ layer, sensitivity, units: 'metric', reference: 21 }).description;
		expect(describeSensitivity('speed', 0.5, scale('speed', 0.5))).toBe(
			'Colour sensitivity 0.5: weaker flow shows in stronger colour. Air speed, 0 to 1.5 metres per second, from pale to dark blue.'
		);
		expect(describeSensitivity('speed', 2, scale('speed', 2))).toBe(
			'Colour sensitivity 2: only stronger flow shows in strong colour. Air speed, 0 to 6 metres per second, from pale to dark blue.'
		);
		expect(describeSensitivity('speed', 1, scale('speed', 1))).toBe('Colour sensitivity 1. Air speed, 0 to 3 metres per second, from pale to dark blue.');
		expect(formatSensitivity(0.5)).toBe('0.5×');
		expect(formatSensitivity(0.25)).toBe('0.25×');
		expect(formatSensitivity(1)).toBe('1×');
		expect(spokenSensitivity(1.4)).toBe('1.4 times');
	});
});

test.describe('the slice height slider', () => {
	test('moves in the unit shown and always gives back metres inside the limits', () => {
		const { min, max } = LIMITS.sliceHeight;
		// Metres: the slider holds metres. Imperial: it holds whole inches, two at a step.
		expect(sliderFromSliceHeight(1.1, 'metric')).toBe(1.1);
		expect(sliceHeightFromSlider(1.15, 'metric')).toBe(1.15);
		expect(sliderFromSliceHeight(1.1, 'imperial')).toBeCloseTo(43.307, 3);
		expect(sliceHeightFromSlider(44, 'imperial')).toBeCloseTo(1.1176, 4);
		for (const units of UNITS) {
			expect(sliceHeightFromSlider(sliderFromSliceHeight(min, units), units)).toBeGreaterThanOrEqual(min);
			expect(sliceHeightFromSlider(sliderFromSliceHeight(max, units), units)).toBeLessThanOrEqual(max);
			expect(sliceHeightFromSlider(-1000, units)).toBe(min);
			expect(sliceHeightFromSlider(1000, units)).toBe(max);
			expect(sliderFromSliceHeight(100, units)).toBeLessThan(1000);
		}
		// The ends of the imperial slider, 4 and 90 inches, are heights the range allows.
		expect(sliceHeightFromSlider(4, 'imperial')).toBeCloseTo(0.1016, 4);
		expect(sliceHeightFromSlider(90, 'imperial')).toBeCloseTo(2.286, 3);
	});

	test('is announced in the unit shown, in words', () => {
		expect(describeSliceHeight(1.1, 'metric')).toBe('Slice height: 1.10 metres.');
		expect(describeSliceHeight(1.1, 'imperial')).toBe('Slice height: 3 feet 7 inches.');
		expect(describeSliceHeight(sliceHeightFromSlider(44, 'imperial'), 'imperial')).toBe('Slice height: 3 feet 8 inches.');
		expect(describeSliceHeight(2.3, 'metric')).toBe('Slice height: 2.30 metres.');
	});
});

test.describe('the other controls', () => {
	test('list the four Layers in the order the Slice names them, and both unit systems', () => {
		expect(LAYER_OPTIONS.map((option) => option.value)).toEqual(LAYERS);
		expect(LAYER_OPTIONS.map((option) => option.label)).toEqual(['Speed', 'Direction', 'Particulates', 'Temperature']);
		expect(UNIT_OPTIONS.map((option) => option.value)).toEqual(['imperial', 'metric']);
	});

	test('announce a change in a few plain words', () => {
		expect(describeToggle('Top-down view', true)).toBe('Top-down view on.');
		expect(describeToggle('Tracers', false)).toBe('Tracers off.');
		expect(describeUnits('metric')).toBe('Units: metric.');
		expect(describeUnits('imperial')).toBe('Units: imperial.');
		const scale = dockLegend({ layer: 'temperature', sensitivity: 0.5, units: 'imperial', reference: 21 }).description;
		expect(describeLayer(scale)).toBe(`Layer: ${scale}`);
		expect(describeLayer(scale)).toContain('degrees Fahrenheit');
	});
});
