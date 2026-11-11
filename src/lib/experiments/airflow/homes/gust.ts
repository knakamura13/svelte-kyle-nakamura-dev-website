/**
 * Gusty wind at the eaves: the wind's speed and direction about their means, the same for every run with the same seed, so a test and a
 * Share link see the same gusts. docs/research/airflow/openings-and-wind.md, section 2d, has the sources, the working and the measured
 * statistics of the series against them.
 *
 * The wind at the eaves is the mean Ū along the mean direction plus two departures, one along it (u′) and one across it (v′). Each is an
 * Ornstein–Uhlenbeck process: Gaussian, with an exponential autocorrelation whose area is its integral time scale. That is the simplest
 * process with the three statistics the sources give (an intensity, a time scale, and through them the gust factor), and its spectrum
 * matches the Eurocode's below the spectral peak, where the variance that moves air through a window is. Above the peak it falls as
 * f^-2 where the real spectrum falls as f^-5/3, which leaves out eddies of under a second that a window's flow barely follows.
 *
 * Time scales follow Taylor's frozen turbulence: a gust of length L passes in L/Ū, so the series runs on the distance the mean wind has
 * travelled in units of L, τ = t·Ū/L, and stronger wind brings shorter gusts. The series itself is a function of τ alone.
 */

/** Turbulence intensity σu/Ū of the wind at the eaves of a suburban house: EN 1991-1-4 eq. 4.7, terrain category III (z0 0.3 m), held at its zmin of 5 m below that height. */
export const GUST_INTENSITY = 1 / Math.log(5 / 0.3);

/** The across-wind departure's spread as a share of the along-wind one, σv/σu (IEC 61400-1's Kaimal model). */
export const GUST_LATERAL = 0.8;

/** Integral length scale of the along-wind departure, m: EN 1991-1-4 Annex B, L = 300·(z/200)^α with α = 0.67 + 0.05·ln z0, at zmin = 5 m for z0 = 0.3 m. */
export const GUST_LENGTH = 300 * (5 / 200) ** (0.67 + 0.05 * Math.log(0.3));

/** The across-wind departure's time scale as a share of the along-wind one (IEC 61400-1's Kaimal model: 2.7Λ against 8.1Λ). */
export const GUST_LATERAL_TIME = 1 / 3;

/**
 * The gust factor the sources give: the peak gust's speed over the mean, √(1 + 7·Iv), the speed whose dynamic pressure is the Eurocode's
 * peak velocity pressure (EN 1991-1-4 eq. 4.8). A target the series is measured against, not an input to it.
 */
export const GUST_FACTOR = Math.sqrt(1 + 7 * GUST_INTENSITY);

/**
 * The long-run mean of U(t)² over Ū²: (Ū + u′)² + v′² averages to Ū²(1 + Iu² + Iv²), with Iv = GUST_LATERAL·Iu. The pressure
 * coefficients are mean pressures over the mean wind's dynamic pressure, measured in turbulent wind, so ½ρU(t)²Cp would count the
 * turbulence twice and push about a fifth harder on average than the steady wind. The gusts' dynamic pressure is divided by this,
 * so its long-run mean is the steady wind's (docs/research/airflow/openings-and-wind.md, section 2d).
 */
export const GUST_MEAN_SQUARE = 1 + GUST_INTENSITY ** 2 + (GUST_LATERAL * GUST_INTENSITY) ** 2;

/** The seed the page uses, so the same setup always blows the same gusts. */
export const GUST_SEED = 1;

/** Step of the series in τ: a fiftieth of the along-wind time scale, under a sixth of the across-wind one. Values between steps are interpolated. */
const STEP = 1 / 50;

/** Two independent standard Ornstein–Uhlenbeck processes, along and across the wind, sampled every STEP in τ from a seeded generator. */
export class GustSeries {
	private state: number;
	/** The sample index `a` is at, and the samples either side of the last τ asked for. */
	private index = 0;
	private a = [0, 0];
	private b = [0, 0];
	private readonly decayU = Math.exp(-STEP);
	private readonly decayV = Math.exp(-STEP / GUST_LATERAL_TIME);

	constructor(readonly seed = GUST_SEED) {
		this.state = 0;
		this.restart();
	}

	private restart() {
		this.state = this.seed >>> 0 || 1;
		this.index = 0;
		// The first sample is drawn from the stationary distribution, so the series has its statistics from the start.
		this.a = [this.normal(), this.normal()];
		this.b = this.next(this.a);
	}

	/** mulberry32, uniform in (0, 1). */
	private uniform() {
		this.state = (this.state + 0x6d2b79f5) >>> 0;
		let t = this.state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return (((t ^ (t >>> 14)) >>> 0) + 0.5) / 4294967296;
	}

	/** A standard normal number (Box–Muller, the cosine half). */
	private normal() {
		return Math.sqrt(-2 * Math.log(this.uniform())) * Math.cos(2 * Math.PI * this.uniform());
	}

	/** The exact Ornstein–Uhlenbeck update over one STEP. */
	private next([u, v]: number[]) {
		const { decayU, decayV } = this;
		return [decayU * u + Math.sqrt(1 - decayU * decayU) * this.normal(), decayV * v + Math.sqrt(1 - decayV * decayV) * this.normal()];
	}

	/**
	 * The two departures at `tau`, in units of their own standard deviation. Asked in increasing order it is a step or two of work; asked
	 * for an earlier τ it starts the series again from its seed, so it is always the same function of τ.
	 */
	at(tau: number): [along: number, across: number] {
		const at = Math.max(0, Number.isFinite(tau) ? tau : 0) / STEP;
		const whole = Math.floor(at);
		if (whole < this.index) this.restart();
		while (this.index < whole) {
			this.a = this.b;
			this.b = this.next(this.a);
			this.index++;
		}
		const share = at - whole;
		return [this.a[0] + share * (this.b[0] - this.a[0]), this.a[1] + share * (this.b[1] - this.a[1])];
	}
}

/** The wind at the eaves at one moment: its speed, m/s, and how far its direction has turned from the mean, degrees (clockwise positive). */
export interface Gust {
	speed: number;
	veer: number;
}

/**
 * The gusty wind at `time` simulated seconds for a mean wind of `mean` m/s at the eaves. The along-wind and across-wind parts add as a
 * vector, so the speed is never negative and the direction wobbles by about σv/Ū. A calm wind stays calm.
 */
export function gustAt(series: GustSeries, time: number, mean: number): Gust {
	if (!(mean > 0)) return { speed: 0, veer: 0 };
	const [u, v] = series.at((time * mean) / GUST_LENGTH);
	const along = mean * (1 + GUST_INTENSITY * u);
	const across = mean * GUST_LATERAL * GUST_INTENSITY * v;
	return { speed: Math.hypot(along, across), veer: (Math.atan2(across, along) * 180) / Math.PI };
}
