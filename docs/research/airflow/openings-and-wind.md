# Openings and wind: source-verified inputs for the home-airflow simulation

- Date: 2026-10-07 (first pass; items marked UNCONFIRMED are open for a second pass)
- Scope: single-story home, outdoors not simulated. Wind reaches open windows and doors through wall pressure coefficients (Cp) by facade and wind angle; flow through each opening follows the orifice equation.
- Verification method: pages fetched with WebFetch; scanned PDFs (FSEC-CR-163-86, AIVC TN 44, NISTIR 6585) read from the saved PDF through the OCR text layer (PyMuPDF) or tesseract, then checked by eye against rendered page images. Every table value labelled "computed" and every code block below was executed with node 20.19.0 (TypeScript transpiled with esbuild); the check script is not stored in the repo.
- ASHRAE Handbook text was not read (paywalled; ASHRAE terms bar entering its content into AI tools). Every "ASHRAE" value below comes from a document that cites it.
- Labels. CONFIRMED: two or more independent sources agree, or a primary source was read directly and cross-checked numerically. SINGLE-SOURCE: one source read directly. UNCONFIRMED: not verified; reason given. Tags [S1] to [S28] resolve in section 6 ([S10] is unused).

## 1. Wall pressure coefficients (Cp) for a low-rise rectangular building

### 1a. Swami & Chandra correlation (EnergyPlus AirflowNetwork "AVERAGE-SURFACE CALCULATION", building type LowRise)

Formula as documented in the EnergyPlus Engineering Reference 9.6 [S2]. Trig arguments in radians, ln is the natural log.

```
Cp(a, S) = 0.6 * ln( 1.248
                   - 0.703 * sin(a/2)
                   - 1.175 * sin(a)^2
                   + 0.131 * sin(2*a*G)^3
                   + 0.769 * cos(a/2)
                   + 0.07  * G^2 * sin(a/2)^2
                   + 0.717 * cos(a/2)^2 )
G = ln(S)
```

| Symbol | Definition | Sources agreeing |
|---|---|---|
| a | Angle between the wind direction (where it blows from) and the outward normal of the wall under consideration. 0 = wind straight onto the face, 180 = face on the lee side. The fit is defined on 0..180: the original report defines the angle as always positive, between 0 and 180 degrees; EnergyPlus folds a > 180 to 360 - a; the Buildings library mirrors about pi. With wind from azimuth w and wall-normal azimuth n: a = abs(w - n), then 360 - a if a > 180. | [S1] p. 1-8, 2-6; [S2]; [S3]; [S4] |
| S | Side ratio = width of the wall under consideration / width of the adjacent wall. Plan L x W (L >= W): long walls S = L/W, short walls S = W/L. Below, "1:2" means S = 0.5 and "2:1" means S = 2. | [S1] p. 1-8, Fig. 2-5; [S2]; [S4] docs; [S5] p. 5 |
| G | G = ln(S), natural log. G = 0 for a square plan. | [S1] p. 2-16; [S2]; [S3] (`SideRatioFac = std::log(SideRatio)`) |
| 0.6 | Scale factor Cp0. The authors tell users to use Cp at zero incidence = 0.6. The log term at a = 0 is ln(2.734) = 1.0058, so Cp(0) = 0.6035 (computed), not exactly 0.6. | [S1] p. 1-10 step 4; [S2]; [S3]; [S4] (Cp0 default 0.6); [S5] App. B |

Coefficient notes:

- G^2 term: 0.07 in EnergyPlus ER and source [S2][S3] and in NISTIR [S5]; 0.071 in the original report [S1] p. 1-10 and 2-16 (its regression value is 0.070752, Table 2-30) and in the Buildings library code [S4]. Effect on Cp (computed): at most 0.0006 for S between 1/2 and 2; up to 0.0045 at S = 1/8 or 8.
- Sign of the sin^3 term: +0.131 in [S1], [S2], [S3] and the Buildings code [S4]. NISTIR 6585 eq. (2) prints -0.131 and the IDEAS documentation text shows -0.131, but NISTIR's own Table 3 numbers match +0.131 (max deviation 0.0005) and not -0.131 (max deviation 0.226, computed). The printed minus is a typographical error; use +0.131. [S4] code was read through WebFetch's summary, not verbatim.
- EnergyPlus evaluates the formula at 30-degree steps (12 wind directions, wrapped at 360) and stores a table [S3]; its output matches the formula exactly only at multiples of 30 degrees. Interpolation type between steps: UNCONFIRMED.

Validity range of the source data [S1] p. 1-2 (SINGLE-SOURCE, primary; EnergyPlus ER gives only "low rise" and no numeric limits):

| Parameter | Range in the data behind the fit |
|---|---|
| Plan | rectangular only |
| Long / short wall | 1 to 8, hence S from 1/8 to 8 (S derived from this statement) |
| Eave height / short-wall width | 0.1 to 0.4 (the report calls this typical of 1 to 2 storeys) |
| Overhang / eave height | 0 to 0.2 |
| Roof angle | 0 to 60 degrees (not a parameter of the fit) |
| Openings | windows and other wall apertures only; not roof apertures |
| Fit quality | correlation coefficient 0.797 for the final equation ([S1] p. 2-16) |
| Numerical behaviour (computed) | log argument stays above 0.186 for S in [1/16, 16]; Cp stays between -1.010 and +0.603; no clamp needed in that range |

Check table (computed with the sketch below: Cp0 = 0.6, G^2 coefficient 0.07). Rows give wall incidence angle a in degrees (225 to 315 mirror 135 to 45).

| S (wall width / adjacent width) | 0 | 45 | 90 | 135 | 180 | 225 | 270 | 315 | Sources agreeing |
|---|---|---|---|---|---|---|---|---|---|
| 1 (1:1) | 0.603 | 0.323 | -0.443 | -0.535 | -0.364 | -0.535 | -0.443 | 0.323 | formula only: [S1], [S2], [S3], [S4]; no independent numeric table found |
| 0.5 (1:2, short wall) | 0.603 | 0.292 | -0.517 | -0.494 | -0.226 | -0.494 | -0.517 | 0.292 | formula only: [S1], [S2], [S3], [S4] |
| 2 (2:1, long wall) | 0.603 | 0.356 | -0.340 | -0.494 | -0.452 | -0.494 | -0.340 | 0.356 | [S1], [S2], [S3], [S4] and numeric agreement with [S5] Table 3 (CONTAM S&C_2_Long, 25 angles from 0 to 360 in 15-degree steps; max deviation 0.0005, 0.0010 with 0.071) |

```ts
const DEG = Math.PI / 180;

/** Swami & Chandra (1987) wall-average Cp, rectangular low-rise building.
 *  incidenceDeg: angle between the wind direction (where it blows from) and the
 *                wall's OUTWARD normal. 0 = windward face-on, 180 = leeward.
 *  sideRatio:    S = width of this wall / width of the adjacent wall.
 *  cp0:          Cp at zero incidence the authors tell users to apply (0.6). */
export function cpSwamiChandra(
  incidenceDeg: number,
  sideRatio: number,
  cp0 = 0.6,
  g2Coeff = 0.07, // EnergyPlus ER and source: 0.07; FSEC original and Modelica Buildings: 0.071
): number {
  let a = Math.abs(incidenceDeg) % 360; // fold onto 0..180 (the correlation is defined there)
  if (a > 180) a = 360 - a;
  const alpha = a * DEG;
  const half = alpha / 2;
  const g = Math.log(sideRatio); // G = ln(S), natural log
  const inner =
    1.248 -
    0.703 * Math.sin(half) -
    1.175 * Math.sin(alpha) ** 2 +
    0.131 * Math.sin(2 * alpha * g) ** 3 + // alpha in radians, cube keeps the sign
    0.769 * Math.cos(half) +
    g2Coeff * g * g * Math.sin(half) ** 2 +
    0.717 * Math.cos(half) ** 2;
  return cp0 * Math.log(inner);
}
```

### 1b. AIVC Technical Note 44 wall values (Orme, Liddament & Wilson), Tables 3.5(i) to 3.5(vi)

What the tables are [S6] pp. 63, 81 to 87: one mean Cp per face for low-rise buildings (up to 3 storeys); length-to-width 1:1 and 2:1 only; three shielding classes; wind angle 0 to 315 degrees in 45-degree steps; wind speed reference level = building height; derived from Wiren (1985) and Bowen (1976) data. TN 44 is the 1998 printing (copyright Oscar Faber Group 1998); NISTIR 6585 cites it as 1994. The user brief says "semi-exposed"; TN 44 says "semi-sheltered".

Shielding classes: exposed = open countryside, no obstructions; semi-sheltered = surrounded by obstructions equivalent to half the building height (rural, some obstructions); sheltered = surrounded by obstructions equal to the building height (urban).

Layout: Face 1 faces the wind at 0 degrees; Face 3 at 90, Face 2 at 180, Face 4 at 270. In the 2:1 tables Faces 1 and 2 are the long walls (from the plan sketch and the Cp pattern). Each printed 4 x 8 table is the one row below rotated, so the wall Cp by incidence angle phi (0 = windward, 180 = leeward; phi = abs(wind angle - face windward angle), folded to 0..180) carries all the information:

| Table | Plan | Shielding | Wall | phi 0 | 45 | 90 | 135 | 180 | Sources agreeing |
|---|---|---|---|---|---|---|---|---|---|
| 3.5(i) | 1:1 | exposed | all | 0.7 | 0.35 | -0.5 | -0.4 | -0.2 | [S6] only; symmetry check passes |
| 3.5(ii) | 1:1 | semi-sheltered | all | 0.4 | 0.1 | -0.3 | -0.35 | -0.2 | [S6] only; symmetry check passes |
| 3.5(iii) | 1:1 | sheltered | all | 0.2 | 0.05 | -0.25 | -0.3 | -0.25 | [S6] only; symmetry check passes |
| 3.5(iv) | 2:1 | exposed | long | 0.5 | 0.25 | -0.5 | -0.8 | -0.7 | [S6] only; symmetry check passes |
| 3.5(iv) | 2:1 | exposed | short | 0.6 | 0.2 | -0.9 | -0.6 | -0.35 | [S6] only; symmetry check passes |
| 3.5(v) | 2:1 | semi-sheltered | long | 0.25 | 0.06 | -0.35 | -0.6 | -0.5 | [S6] only; symmetry check passes |
| 3.5(v) | 2:1 | semi-sheltered | short | 0.4 | 0.2 | -0.6 | -0.5 | -0.3 | [S6] only; one printed cell off (below) |
| 3.5(vi) | 2:1 | sheltered | long | 0.06 | -0.12 | -0.2 | -0.38 | -0.3 | [S6] only; one printed cell off (below) |
| 3.5(vi) | 2:1 | sheltered | short | 0.18 | 0.15 | -0.3 | -0.32 | -0.2 | [S6] only; symmetry check passes |

Apparent print errors in [S6] (found by the incidence-symmetry check; values above use the symmetric value): Table 3.5(v) Face 4 at 225 degrees is printed 0.5 (symmetry with Face 3 and with Face 4 at 315 degrees gives 0.2); Table 3.5(vi) Face 1 at 315 degrees is printed +0.12 (symmetry with 45 degrees and with Face 2 gives -0.12).

Numbers are SINGLE-SOURCE. [S7] (DesignBuilder) independently describes the AIVC default Cp set as buildings of 3 storeys or less, square surfaces, three exposure levels, 45-degree steps, but lists no values. TN 44 p. 63 says the values are approximate indications only. TN 44 p. 71 (Fig. 3.2 text): exposed buildings are rarely encountered and exposed data are normally inappropriate for infiltration and ventilation; uniformly shielded sites should use the sheltered data.

Windward and leeward comparison, 1:1 plan (S&C computed from the sketch; TN 44 read from tables):

| Quantity | S&C | TN 44 exposed | TN 44 semi-sheltered | TN 44 sheltered |
|---|---|---|---|---|
| Windward Cp (phi 0) | 0.603 | 0.7 | 0.4 | 0.2 |
| Leeward Cp (phi 180) | -0.364 | -0.2 | -0.2 | -0.25 |
| Windward minus leeward | 0.968 | 0.9 | 0.6 | 0.45 |

### 1c. Which set suits an interactive teaching simulation

- Judgement, based on the facts below: use (a), the S&C formula, as the model. It takes any wind direction and any rectangle continuously, has a documented derivation, and is the model EnergyPlus and CONTAM use [S2][S3][S5]. TN 44 covers only two plan aspect ratios, eight angles, three shielding classes, needs interpolation, rests on one printed source with two print errors, and states its values are approximate [S6]. Keep (b) as a cross-check or as a "sheltered lot" preset.
- Limit: isolated building. The S&C base fit is for the unobstructed building; surrounding-building effects are a separate additive correction ([S1] p. 1-12) that is not part of the formula. Its Cp(0) = 0.6 is near the TN 44 exposed class (0.5 to 0.7) and well above the sheltered class (0.06 to 0.2), so on a shielded suburban lot S&C overstates the windward-minus-leeward pressure difference (0.97 vs 0.45 to 0.6 for a square plan).
- Limit: no roof effects. The procedure is valid for wall apertures only, not roof-level apertures ([S1] p. 1-2, 1-4).
- Limit: wall-averaged values. The authors argue the strongest Cp variations are near wall edges and windows are seldom placed there, and their own comparison of local and wall-average Cp found excellent agreement in all but one case ([S1] p. 1-4, 2-5). Averages therefore apply to openings at any position on the wall, with reduced accuracy near corners.
- Limit: rectangular plans only; the authors' corrections for L- and U-shaped plans, garages and wing walls are unvalidated estimates ([S1] p. 1-2, 1-10).
- Limit (computed from the stated range): eave height / short-wall width must be 0.1 to 0.4. For a 1:2 studio of about 450 sq ft (short wall about 4.6 m) the ratio is 0.52 to 0.66 at 2.4 to 3.0 m eaves, outside the fitted range; a 700 sq ft one-bedroom at 1:1.75 (short wall about 6.1 m) gives 0.39 to 0.49. Treat small units as extrapolation.
- Limit: mean Cp only. No gust or turbulence term, and no single-sided (one-wall) ventilation model; TN 44 p. 66 leaves the fluctuating (rms) pressure coefficient, which matters for single-sided flow, out of its tables.

## 2. Wind speed convention

### 2a. Pressure formula and reference height (CONFIRMED)

```
p_w = 0.5 * rho * U^2 * Cp          rho = 1.2 kg/m^3
```

U is the mean undisturbed wind speed at building height (eave or roof). Sources agreeing: [S2] (p_w = Cp rho V_ref^2 / 2, with V_ref the reference wind speed at the local height); [S6] p. 65 and every Table 3.5 header (wind speed reference level is the building height); [S5] p. 4 (wind speed at the building height); [S1] p. 2-7 (Cp referenced to the velocity at building height) and p. 2-5 (validation run used eave-height wind speed). Check (computed): Cp 0.6, U 3 m/s gives 3.240 Pa; Cp -0.5 gives -2.700 Pa.

### 2b. From a 10 m open-terrain meteorological speed to eave height

ASHRAE 2005 form as documented by EnergyPlus [S8] (station defaults: z_met 10 m, alpha_met 0.14, delta_met 270 m):

```
U(z) = U_met * (delta_met / z_met)^alpha_met * (z / delta)^alpha
```

| Terrain | alpha | delta (m) | Sources agreeing |
|---|---|---|---|
| Flat, open country | 0.14 | 270 | [S8]; [S9] `country` |
| Rough, wooded country / suburbs | 0.22 | 370 | [S8]; [S9] `suburban` |
| Towns and cities | 0.33 | 460 | [S8]; [S9] `city` |
| Ocean | 0.10 | 210 | [S8]; [S9] `water` |
| Urban, industrial, forest | 0.22 | 370 | [S8] only |

Two independent implementations agree; [S8] cites ASHRAE Fundamentals 2005 ch. 16. The Handbook table itself was not read: UNCONFIRMED against the Handbook. "ASHRAE" is edition-dependent: the 1993 values differ (below).

Older and alternative parameter sets (all computed in the check):

| Family | Terrain rows (parameters) | Sources agreeing |
|---|---|---|
| K * z^a with U_met at 10 m open country (BS 5925:1991) | open flat country 0.68/0.17; country with scattered wind breaks 0.52/0.20; urban 0.35/0.25; city 0.21/0.33 | [S6] Table 3.1 only |
| K * z^a (ASHRAE Fundamentals 1993) | airport 0.71/0.15; suburban 0.32/0.28; urban 0.14/0.40 | [S6] Table 3.2 only |
| a * (z/10)^b, classes I to V (LBL / Sherman-Grimsrud) | ocean 1.30/0.10; flat with isolated obstacles 1.00/0.15; rural low buildings 0.85/0.20; urban, industrial, forest 0.67/0.25; centre of large city 0.47/0.35 (a/b) | [S1] Table 1-1 and [S6] Table 3.3 (identical) |

Speed ratio U(z) / U_met at eave height (computed):

| Parameter set | z = 2.4 m | z = 3.0 m |
|---|---|---|
| ASHRAE 2005 (via [S8]) open country | 0.819 | 0.845 |
| ASHRAE 2005 suburbs / urban | 0.524 | 0.550 |
| ASHRAE 2005 city | 0.280 | 0.301 |
| BS 5925 country with wind breaks | 0.620 | 0.648 |
| BS 5925 urban | 0.436 | 0.461 |
| BS 5925 city | 0.280 | 0.302 |
| ASHRAE 1993 suburban | 0.409 | 0.435 |
| ASHRAE 1993 urban | 0.199 | 0.217 |
| LBL class III rural | 0.639 | 0.668 |
| LBL class IV urban/industrial/forest | 0.469 | 0.496 |
| LBL class V large-city centre | 0.285 | 0.308 |

The suburban/urban class spans 0.435 to 0.550 at 3.0 m across the four published sets, about +-12% in speed and -22% to +25% in pressure.

### 2c. Recommended slider convention (judgement built on the sources above)

- Label the slider "Wind speed (weather report, 10 m, open ground)" in m/s. Convert once: U_eave = f * U_met with f = speedAtHeight(1, z_eave, suburbs) = 0.524 for z_eave 2.4 m, 0.550 for 3.0 m. Use U_eave in p_w = 0.5 rho U_eave^2 Cp, because every Cp set above is referenced to building height. Show U_eave as a read-out.
- Alternative with no terrain assumption: label it "Wind speed at roof height" and use f = 1.
- Do not feed a 10 m speed straight into p_w; in suburbs that overstates pressure by about 3.3 times (1/0.55^2).

```ts
/** Wind pressure on a facade: p_w = 0.5 * rho * U^2 * Cp, U at the reference height. */
export function windPressure(uRef: number, cp: number, rho = 1.2): number {
  return 0.5 * rho * uRef * uRef * cp;
}

export interface Terrain {
  alpha: number; // power-law exponent
  delta: number; // boundary-layer thickness, m
}

/** EnergyPlus Engineering Reference "Local Wind Speed Calculation" (cites ASHRAE Fundamentals 2005, ch. 16):
 *  U(z) = U_met * (delta_met / z_met)^alpha_met * (z / delta)^alpha */
export function speedAtHeight(
  uMet: number,
  z: number,
  site: Terrain,
  met: Terrain = { alpha: 0.14, delta: 270 },
  zMet = 10,
): number {
  return uMet * (met.delta / zMet) ** met.alpha * (z / site.delta) ** site.alpha;
}

/** Older K * z^a form (BS 5925:1991 and ASHRAE 1993 rows, AIVC TN44 tables 3.1 and 3.2). */
export function speedKza(uMet10: number, z: number, k: number, a: number): number {
  return uMet10 * k * z ** a;
}

/** LBL / Sherman-Grimsrud form with terrain classes a (factor) and b (exponent): FSEC Table 1-1, TN44 Table 3.3.
 *  Station in reference class II (a = 1.0, b = 0.15) at 10 m. */
export function speedLbl(uMet10: number, z: number, aSite: number, bSite: number, aRef = 1.0): number {
  return uMet10 * (aSite / aRef) * (z / 10) ** bSite;
}
```

## 3. Discharge coefficients and effective open areas

### 3a. Flow equations (CONFIRMED)

```
Q = Cd * A * sqrt(2 * dP / rho)                    orifice equation, A = geometric free area
Ae = Ai * Ao / sqrt(Ai^2 + Ao^2)                   two openings in series (one inlet, one outlet), same Cd
```

Orifice equation: [S5] p. 7 eq. (4); [S11] eq. (1); [S1] eq. 1.8.1. Series area: [S1] p. 1-16 (single source), proved numerically here: with Cd 0.62, Ai 1 m^2, Ao 2 m^2, total dP 3 Pa and rho 1.2, flow through the inlet, the outlet and Ae are all 1.24000 m^3/s; Ae = 0.8944 m^2. Orifice example (computed): Cd 0.62, A 1 m^2, dP 2 Pa gives 1.1320 m^3/s.

```ts
/** Orifice equation, signed: positive when dP > 0 drives flow from side 1 to side 2. m^3/s. */
export function orificeFlow(cd: number, areaM2: number, dP: number, rho = 1.2): number {
  return Math.sign(dP) * cd * areaM2 * Math.sqrt((2 * Math.abs(dP)) / rho);
}

/** Two openings in series (inlet + outlet), FSEC-CR-163-86 eq. 1.8.1: Ae = Ai*Ao / sqrt(Ai^2 + Ao^2). */
export function seriesArea(ai: number, ao: number): number {
  return (ai * ao) / Math.hypot(ai, ao);
}
```

### 3b. Discharge coefficients

| Opening | Cd | Sources agreeing | Status |
|---|---|---|---|
| Sharp-edged / small square-edged opening | 0.60 to 0.65; 0.61 to 0.62 in lab and procedure values | [S11] (cites ASHRAE Fundamentals 2001: 0.6 to 0.65); [S13] (cites ASHRAE 2009 and others: 0.60 to 0.65; sharp-edged orifice about 0.61); [S12] (0.6 is commonly used for window or door openings); [S1] p. 2-22 (0.62); [S14] (0.62) | CONFIRMED |
| Wall apertures (windows, sliding glass door) in the Swami & Chandra procedure | 0.62 for all calculations, valid while opening area / wall area < 0.1 (a 4 ft x 7 ft sliding door is 3% to 5% of the wall, at most 10%) | [S1] p. 2-22, 1-16 | SINGLE-SOURCE (primary); built on Vickery (1983) orifice data |
| Round-edged opening | 0.90 to 0.95 | [S11] (Andersen 2002) | SINGLE-SOURCE |
| Windows and doors in real buildings | 0.6 +- 0.1 | [S11] Table 1 (Flourentzou et al. 1998) | SINGLE-SOURCE (via review) |
| Measured window openings, cross ventilation | not a constant: reported 0.65 to 1 (Heiselberg et al. 2001), 0.48 (Sawachi 2002, 1% and 9% porosity), 0.2 to 0.4 (Kurabuchi and Ohba 2002); falls from 0.58 to 0.1 as wind incidence goes from 0 to 90 degrees (Sawachi wind tunnel, Jensen CFD) | [S11] pp. 4 to 7 (review of other studies) | SINGLE-SOURCE (review); studies disagree by up to 50% below 15% porosity |
| Same, laboratory side-hung and bottom-hung windows | varies with opening area, window type, pressure and temperature difference; numeric values only in figures not extracted | [S12] pp. 749 to 754; [S11] | numbers UNCONFIRMED |
| Interior or exterior doorway, single-sided buoyancy flow | exterior doorway Cd = 0.4 + 0.0075 dT (dT in C, Kiel and Wilson 1989); interior doorways about 0.43 or 0.21 * sqrt(H) for 1.5 m <= H <= 2 m (Pelletret et al. 1991) | [S11] Table 1 and Fig. 5 | SINGLE-SOURCE; not for wind-driven through-flow |
| Full-scale products tested in a wind tunnel (Brazil, Germany; Cd on nominal window area) | 0.55 (parallel-opening window), 0.24, 0.13, 0.06 for louvred or perforated sliding types; the paper says the 0.60 to 0.65 default overestimates flow for most real windows | [S13] p. 210 | SINGLE-SOURCE; none of these is one of the four types asked about |
| Casement, double-hung, sliding glass door, swing door, each with or without screen | no confirmed per-type value | none found | UNCONFIRMED |
| Insect screen factor | none confirmed. [S12] says insect screens can significantly influence discharge; [S13] cites Chu et al. (2017) for screen dependence; no numeric window-screen factor found | [S12]; [S13] | UNCONFIRMED |

Implementation default (judgement, not a per-type value): Cd = 0.62 on the geometric free area of section 3c, for inflow and outflow, with a visible "assumed" note and no screen reduction until a source is confirmed.

### 3c. Free-area fraction of the frame by type

| Type | Free area / frame (nominal) area | Sources agreeing | Status |
|---|---|---|---|
| Double-hung window | 0.40 to 0.50: code counting rule 0.5; measured 0.41 to 0.43 of total window area for single 1500 x 1200 mm windows | [S15] IMC 2024 commentary to section 402.2 (only half of the area of a double-hung window counts as openable); [S26] Appendix A (0.77 and 0.74 m^2 of 1.80 m^2; 40% average at model sizes; 19% for a 2100 x 2400 mm three-panel configuration) | CONFIRMED as a range (two independent sources; [S26] is a vendor bulletin) |
| Horizontal sliding window (two panels, one operable) | 0.41 to 0.43 measured at 1200 x 1500 mm; 0.26 to 0.27 for four-panel 2100 x 2400 mm configurations; 0.5 is the geometric ceiling for a two-panel unit (one panel fixed; derived, not sourced) | [S26] Appendix A only (average 40% at model sizes, 25% at common sizes) | SINGLE-SOURCE (vendor bulletin); sliding glass doors were not measured: UNCONFIRMED |
| Casement (single sash) | 0.78 to 0.80 measured for 1500 x 600 mm single sashes, not 1.0; 0.34 to 0.35 for a 2100 x 2400 mm three-sash opening with fixed lites; depends on wind direction because the open sash can funnel or shield the opening | [S26] Appendix A and p. 3 (open sash assumed perpendicular to the window, frame deducted, sill obstruction ignored); [S22] adds that its clear-opening dimensions (5.7 sq ft, 20 in, 24 in) are met only with the appropriate hinge, so the clear opening is smaller than the frame even fully open | SINGLE-SOURCE for the number (vendor bulletin); angle dependence of the fraction UNCONFIRMED |
| Swing door | 1.0 of its net free area when fully open | [S15]: net free area is defined as the free area of a door, window, louver, vent or skylight when fully open; fraction of nominal door size not sourced (the egress minimum clear opening of 32 in x 78 in against a 36 in x 80 in door is 0.87, computed) | definition CONFIRMED; fraction UNCONFIRMED |

Method of [S26] (Breezway Technical Bulletin, 9 August 2012, Australian aluminium windows): fraction = ventilation area / total window area including the frame, counting only portions with an unimpeded view perpendicular to the wall (views through glass count as blocked); sill obstruction ignored. It is a vendor document, not a code.

Angle dependence for a side-hung casement (geometry, derived, not sourced and not executed): with sash width W and height H opened to angle theta, the gap between the free edge and the opposite jamb is H * 2 * W * sin(theta/2); it equals the frame width at theta = 60 degrees. The sash obstructs the stream, so Cd must fall with angle ([S12], [S11]).

## 4. Typical dimensions

| Item | Inches | Metres | Sources agreeing | Status |
|---|---|---|---|---|
| Entry door, standard single | 36 x 80 (3'0" x 6'8") | 0.91 x 2.03 | [S19] Pella (36 in is the most typical width, 80 in height); [S20] Andersen (3' x 6'8"; also 3'6" and 8'0") | CONFIRMED |
| Egress door minimum clear opening | 32 wide x 78 high | 0.81 x 1.98 | [S16] IRC 2012 R311.2 only | SINGLE-SOURCE |
| Interior doors | widths 24, 28, 30, 32, 36; height 80 (lead only) | 0.61, 0.71, 0.76, 0.81, 0.91; 2.03 | seen only in search-result summaries of Home Depot and Lowe's buying guides; both pages and Milgard's returned HTTP 403 on fetch, and the JELD-WEN and Masonite pages exposed no size values | UNCONFIRMED |
| Sliding glass door, two panels | 60, 72, 96 wide x 80 tall (codes 5068, 6068, 8068); other heights 83, 96, 120 | 1.52, 1.83, 2.44 x 2.03; 2.11, 2.44, 3.05 | [S21] Andersen A-Series sheet; Milgard widths 60, 72, 96 seen only in a search summary | SINGLE-SOURCE |
| Double-hung window, standard codes 2030, 2044, 2840, 2852 | 24x36, 24x52, 32x48, 32x62 (code = width ft+in, height ft+in) | 0.61x0.91, 0.61x1.32, 0.81x1.22, 0.81x1.57 | [S19] Pella only | SINGLE-SOURCE |
| Casement window, standard codes 2436, 2640, 2850, 3060 | 28x42, 30x48, 32x60, 36x72 | 0.71x1.07, 0.76x1.22, 0.81x1.52, 0.91x1.83 | [S19] Pella only; the [S22] Andersen sheet was read by OCR and its size grid is jumbled, so it was not itemized | SINGLE-SOURCE |
| Bedroom window sill (bottom of opening) above floor | at most 44; at least 24 where the sill is more than 72 in above grade | 1.12 max; 0.61 min | maximum 44 in: [S18] Boise #438 and [S19] Pella; minimum 24 in: [S16] IRC 2012 R312.2 and [S19] Pella (guidance) | CONFIRMED |
| Glazing treated as hazardous | bottom edge below 18, top edge above 36, area over 9 sq ft | 0.46, 0.91, 0.84 m^2 | [S16] R308.4.3 (2012) only | SINGLE-SOURCE |
| Typical sill height | no sourced typical value (36 in is a common rule of thumb but not confirmed) | | none | UNCONFIRMED |
| Ceiling height, habitable rooms and hallways | 84 (7 ft) | 2.13 | [S16] R305.1 (2012); [S18] Boise #434 (R305.1) | CONFIRMED |
| Ceiling height, bathrooms, toilet and laundry rooms | 80 (6 ft 8 in) in the Boise handout; the 2012 text read states 84 (7 ft) and its bathroom wording was not separated out | 2.03 (2.13) | [S18] Boise #434 | SINGLE-SOURCE; edition dependent |
| Hallway minimum width | 36 | 0.91 | [S16] R311.6 (2012) only | SINGLE-SOURCE |
| Emergency escape opening | net clear 5.7 sq ft (5 grade floor), height >= 24, width >= 20 | 0.53 m^2 (0.46), 0.61, 0.51 | [S16] R310.1.1 to 310.1.3; [S18] Boise #438; [S19] Pella; [S22] note | CONFIRMED |

## 5. Typical single-story plans

### 5a. Code and housing-standard facts

| Item | Value | Sources agreeing | Status |
|---|---|---|---|
| Minimum area of a habitable room | 70 sq ft (6.5 m^2) in every habitable room; the older rule of one 120 sq ft (11.1 m^2) room was deleted by the 2021 IRC | [S16] (2012: R304.1 120 sq ft, R304.2 70 sq ft); [S17] (2012 vs 2021 comparison) | CONFIRMED for 70 and 120; the kitchen exception from the area and dimension rules appears only in secondary sources: UNCONFIRMED |
| Minimum horizontal dimension of a habitable room | 7 ft (2.13 m) | [S16] R304.3 (2012) only; renumbered in later editions (not verified) | SINGLE-SOURCE |
| Ceiling height | 7 ft; bathrooms 6 ft 8 in (edition dependent) | see section 4 | CONFIRMED (7 ft) |
| Light and ventilation | glazing 8% of floor area; openable area 4% of floor area; bathroom 3 sq ft glazing, half openable, or exhaust | [S16] R303.1, R303.3 (2012); [S15] (IMC 4% rule); [S19] Pella (bathroom 3 sq ft, 50% openable or 50 cfm) | CONFIRMED |
| Spaces a dwelling must have | living room, kitchen area, own bathroom (sink, tub or shower, toilet); at least one bedroom or living/sleeping room per two persons (voucher units) | [S24] 24 CFR 5.703(d) | SINGLE-SOURCE |
| HUD room-size table | HUD MPS 4910.1 (1994) chapter 4 has no room-size table (space planning covers baths, doors, circulation) | [S23] | no HUD table found: UNCONFIRMED |

### 5b. Unit areas (US averages by bedroom count, 2025)

| Unit | Average (sq ft) | Average (m^2) | Target plan (sq ft / m^2) | Sources agreeing | Status |
|---|---|---|---|---|---|
| Studio | 460 | 42.7 | 450 / 41.8 | [S25] RentCafe via Multifamily Executive | SINGLE-SOURCE |
| One-bedroom | 735 | 68.3 | 700 / 65.0 | [S25] | SINGLE-SOURCE |
| Two-bedroom | 1,095 | 101.7 | 1,000 / 92.9 | [S25] | SINGLE-SOURCE |
| Single-story house | no fetched figure; the 3-bedroom apartment average is 1,355 sq ft (125.9 m^2) | | 1,500 / 139.4 | [S25] (apartment only) | UNCONFIRMED for houses |

The four target sizes sit at 0.91 to 0.98 of the apartment averages (studio, one-, two-bedroom). [S25] gives no building-type sample definition.

### 5c. Room names and dimensions

Room names backed by [S24]: living room, kitchen area, bathroom, bedroom or living/sleeping room; hallway width is regulated by [S16]. No source gives a generic table of typical room sizes: UNCONFIRMED as a general range. Dimensioned single-story catalog plans read directly from the sheets (rooms in ft as printed; areas in sq ft computed as width x depth):

| Plan | Total | Rooms (ft, area) | Sources agreeing | Status |
|---|---|---|---|---|
| Garfield IV studio, footprint 14' x 32' | 399 SF, studio, 1 bath | living 13 x 13.5 (175.5); kitchen/dining 13 x 10 (130); bath 13 x 6.5 (84.5) | [S27] Garfield sheet only | SINGLE-SOURCE |
| Daisy one-bedroom, footprint 20' x 33.5' | 518 SF, 1 bed, 1 bath | bed 10 x 10 (100); living 12.5 x 11 (137.5); dining 8 x 11 (88); kitchen 11 x 7 (77); bath 6 x 8.5 (51) | [S27] Daisy sheet only | SINGLE-SOURCE |
| Billy two-bedroom house, footprint 25' x 67'-10" | 1,296 SF, 2 bed, 2 bath | bed 1 11 x 13 (143); bed 2 10 x 10 (100); living 13 x 15 (195); dining 12.5 x 11 (137.5); kitchen 11 x 15 (165); entry 9 x 5 (45); bath 1 10 x 7 (70); bath 2 10 x 6 (60) | [S27] Billy sheet only | SINGLE-SOURCE |
| Lewis three-bedroom house, footprint 30' x 50'-8" (the Palm sheet lists the same rooms in a ranch style) | 1,259 SF, 3 bed, 2 bath | bed 1 11 x 12 (132); bed 2 11 x 9.5 (104.5); bed 3 8.5 x 10 (85); living 17.5 x 16.5 (288.75); dining 14 x 7 (98); kitchen 14 x 10 (140); bath 1 11 x 6 (66); bath 2 9 x 7 (63); pantry 3 x 5.5 | [S27] Lewis and Palm sheets agree | SINGLE-SOURCE (one design, two styles) |
| Plan 109-1098 ranch (commercial catalog) | 1,500 SF heated, 3 bed, 2 bath, 1 story | great room 16 x 18 (288); kitchen 10 x 14 (140); dining 11 x 11 (121); primary bedroom 14 x 14 (196); other rooms not listed | [S28] only | SINGLE-SOURCE |

Across these five plans (computed): living areas 137.5 to 288.75 sq ft; kitchens 77 to 165 sq ft; bedrooms 85 to 196 sq ft; bathrooms 51 to 84.5 sq ft. None gives a hallway dimension (minimum width 36 in, [S16]). Not covered: a dimensioned one-bedroom near 700 sq ft or a two-bedroom through-unit near 1,000 sq ft (nearest are Daisy at 518 SF and Billy at 1,296 SF): UNCONFIRMED.

Leads seen only in search-result summaries (pages not opened; do not use as data until fetched):

| Lead | Claim in the summary | URL |
|---|---|---|
| Planner 5D bedroom guide | medium bedroom 10 x 12 ft, primary suite from 12 x 14 ft | https://planner5d.com/blog/standard-bedroom-size/ |
| Homestyler room-dimension guide | kitchen 10 x 12 to 12 x 14 ft; full bath about 5 x 8 ft (40 sq ft); living room 12 x 18 to 15 x 20 ft | https://www.homestyler.com/article/understanding-average-room-dimensions |
| NKBA kitchen and bath planning guidelines (2022 edition) | walkway at least 36 in; work aisle 42 in (48 in for two cooks); 30 x 48 in clear floor space at fixtures | https://media.nkba.org/uploads/2022/05/Kitchen-Planning-Guidelines.pdf and https://media.nkba.org/uploads/2022/05/Bath-Planning-Guidelines.pdf |
| Santa Barbara County pre-approved ADUs | 448 sq ft studio/one-bedroom with a bedroom of about 105 sq ft; 672 sq ft one-bedroom with a bedroom of about 143 sq ft | https://www.independent.com/2026/04/08/county-launches-preapproved-adu-plans/ |
| HireAHelper (cites American Housing Survey) | studio 440, one-bedroom 804, two-bedroom 1,089, three-bedroom 1,593 sq ft | https://www.hireahelper.com/advice/average-apartment-size/ |

## 6. Sources

- [S1] Swami, M.V. and Chandra, S., "Procedures for Calculating Natural Ventilation Airflow Rates in Buildings", FSEC-CR-163-86, Florida Solar Energy Center, March 1987 (ASHRAE 448-RP). http://publications.energyresearch.ucf.edu/wp-content/uploads/2018/06/FSEC-CR-163-86.pdf (scanned; pages read: 1-2, 1-4, 1-8 to 1-10, 1-12, 1-16, 1-20, 2-5 to 2-7, 2-16, 2-22, 2-57, Table 2-30)
- [S2] EnergyPlus Engineering Reference 9.6, AirflowNetwork Model, wind pressure coefficients. https://bigladdersoftware.com/epx/docs/9-6/engineering-reference/airflownetwork-model.html
- [S3] EnergyPlus source, `calculate_Cps()` in `Solver.cpp`, develop branch fetched 2026-10-07 (read through WebFetch). https://raw.githubusercontent.com/NREL/EnergyPlus/develop/src/EnergyPlus/AirflowNetwork/src/Solver.cpp
- [S4] Modelica Buildings library, `windPressureLowRise` code and `Outside_CpLowRise` documentation; IDEAS library documentation (read through WebFetch summaries). https://raw.githubusercontent.com/lbl-srg/modelica-buildings/master/Buildings/Airflow/Multizone/BaseClasses/windPressureLowRise.mo ; https://build.openmodelica.org/Documentation/Buildings.Fluid.Sources.Outside_CpLowRise.html ; https://build.openmodelica.org/Documentation/IDEAS.Airflow.Multizone.BaseClasses.windPressureLowRise.html
- [S5] Persily, A.K. and Ivy, E.M., "Input Data for Multizone Airflow and IAQ Analysis", NISTIR 6585, January 2001 (scanned; pp. 4, 5, 7, 20 read). https://nvlpubs.nist.gov/nistpubs/Legacy/IR/nistir6585.pdf
- [S6] Orme, M., Liddament, M. and Wilson, A., "Numerical Data for Air Infiltration and Natural Ventilation Calculations", AIVC Technical Note 44 (1998 printing; scanned; printed pp. 63, 65 to 71, 81 to 87 read). https://aivc.org/sites/default/files/members_area/medias/pdf/Technotes/TN44%20NUMERICAL%20DATA%20FOR%20AIR%20INFILTRATION.PDF
- [S7] DesignBuilder help, wind pressure coefficient templates. https://designbuilder.co.uk/helpv5.3/Content/Pressure_Coefficients_Data.htm
- [S8] EnergyPlus Engineering Reference 9.6, Outside Surface Heat Balance, "Atmospheric Variation" (local wind speed; table cites ASHRAE Fundamentals 2005 ch. 16). https://bigladdersoftware.com/epx/docs/9-6/engineering-reference/outside-surface-heat-balance.html ; terrain names: https://bigladdersoftware.com/epx/docs/9-6/input-output-reference/group-simulation-parameters.html
- [S9] Ladybug `windprofile.py`, TERRAIN_PARAMETERS. https://raw.githubusercontent.com/ladybug-tools/ladybug/master/ladybug/windprofile.py
- [S11] Karava, P., Stathopoulos, T. and Athienitis, A.K., "Natural ventilation openings - a discussion of discharge coefficients", Concordia University conference paper (the International Journal of Ventilation 3(3) review, 2004, was not read; record at https://www.aivc.org/resource/wind-driven-flow-through-openings-review-discharge-coefficients). https://www.irbnet.de/daten/iconda/CIB1749.pdf
- [S12] Heiselberg, P., Svidt, K. and Nielsen, P.V., "Windows - measurements of air flow capacity", ROOMVENT 2000, pp. 749 to 754. https://www.aivc.org/sites/default/files/airbase_13332.pdf
- [S13] Fernandes, L. et al., "Evaluation of discharge coefficients of large openable windows using full-scale samples in wind tunnel tests", Revista Ingenieria de Construccion 35(2), 2020, pp. 203 to 214. https://www.repos.hcu-hamburg.de/bitstream/hcu/783/1/en_0718-5073-ric-35-02-203.pdf
- [S14] Designing Buildings wiki, free, equivalent areas and the discharge coefficient. https://www.designingbuildings.co.uk/wiki/Free,_equivalent_areas_and_the_discharge_coefficient
- [S15] ICC Building Safety Journal, "Code Corner: 2024 International Mechanical Code Chapter 4 Ventilation" (section 402.2 and commentary). https://www.iccsafe.org/building-safety-journal/bsj-technical/code-corner-2024-international-mechanical-code-chapter-4-ventilation/
- [S16] International Residential Code 2012 full text (Public.Resource.Org copy at the Internet Archive; sections read through WebFetch: R303.1, R303.3, R304.1 to R304.3, R305.1, R308.4.3, R310.1.1 to R310.1.3, R311.2, R311.6, R312.2). https://archive.org/download/gov.law.icc.irc.2012/icc.irc.2012_djvu.txt (item page https://archive.org/details/gov.law.icc.irc.2012)
- [S17] Sussex County (Delaware), "Significant Changes to the International Residential Code, comparison between the 2012 IRC and 2021 IRC editions". https://sussexcountyde.gov/sites/default/files/PDFs/2021%20IRC%20Significant%20Changes.pdf
- [S18] City of Boise IRC code handouts #434 "Ceiling Height" (01/2022) https://www.cityofboise.org/media/3924/434-irc-code-section-r305-ceiling-height.pdf and #438 "Emergency Escape & Rescue Openings" (03/2022) https://www.cityofboise.org/media/14485/438_egress-windows-code-hand-out-2022_final.pdf (the handouts do not state the IRC edition in the extracted text)
- [S19] Pella, "Making Sense of Standard Window Sizes" https://www.pella.com/ideas/windows/standard-window-sizes/ ; Pella, "Standard Front Door Sizes" https://www.pella.com/ideas/doors/entry-doors/standard-sizing-guide/
- [S20] Andersen, "Front door size guide". https://www.andersenwindows.com/ideas-and-inspiration/blog/tips/front-door-size-guide
- [S21] Andersen, A-Series gliding patio door sizing sheet (2023-24 product guide). https://www.andersenwindows.com/-/media/Project/AndersenCorporation/AndersenWindows/AndersenWindows/files/technical-docs/sizing/sizing-patiodoors--a-series-gliding.pdf
- [S22] Andersen, 400 Series casement and awning window sizing sheet. https://www.andersenwindows.com/-/media/Project/AndersenCorporation/AndersenWindows/AndersenWindows/files/technical-docs/sizing/sizing-windows--400series-casement-casement-awningtransom.pdf
- [S23] HUD Handbook 4910.1, Minimum Property Standards for Housing (1994), chapter 4. https://www.hud.gov/sites/documents/49101c4hsgh.pdf (index: https://www.hud.gov/hudclips/handbooks/housing-4910-1)
- [S24] 24 CFR 5.703, HUD physical condition standards (Cornell LII). https://www.law.cornell.edu/cfr/text/24/5.703
- [S25] Multifamily Executive, "Average Apartment Size Climbs to 910 Square Feet in 2025" (RentCafe analysis). https://www.multifamilyexecutive.com/design-development/average-apartment-size-climbs-910-square-feet-2025
- [S26] Breezway Technical Bulletin, "Comparative Ventilation Openings Of Various Window Types", 9 August 2012 (vendor bulletin, 5 pages, Australian aluminium windows; read from the saved PDF text layer). https://www.breezway.com.au/downloads/hawaii/TB_Ventilation_Openings.pdf
- [S27] The Foothill Catalog Foundation fact sheets hosted by LA County Planning (read from the saved PDF text layers): Garfield IV https://planning.lacounty.gov/wp-content/uploads/2026/07/2026-06-11_Garfield-Factsheet-4.pdf ; Daisy https://planning.lacounty.gov/wp-content/uploads/2025/11/2025-11-14-Daisy-Fact-Sheet.pdf ; Billy https://planning.lacounty.gov/wp-content/uploads/2025/12/BILLY-FACT-SHEET.pdf ; Lewis https://planning.lacounty.gov/wp-content/uploads/2025/06/2025-04-25-2501-The-Lewis-Fact-Sheet.pdf ; Palm https://planning.lacounty.gov/wp-content/uploads/2025/06/2025-04-25-2501-The-Palm-Fact-Sheet.pdf
- [S28] The Plan Collection, plan 109-1098 (read through WebFetch). https://www.theplancollection.com/house-plans/plan-1500-square-feet-3-bedroom-2-bathroom-ranch-style-14403
- Unfetched leads: Home Depot interior door guide https://www.homedepot.com/c/ab/interior-door-buying-guide/9ba683603be9fa5395fab90ba405845 ; Lowe's interior door guide https://www.lowes.com/n/buying-guide/interior-doors-buying-guide ; Milgard sliding doors https://www.milgard.com/patio-doors/sliding-glass-doors (HTTP 403 on fetch) ; NatHERS technical note https://www.homeenergyrating.gov.au/sites/default/files/2024-07/NatHERS%20Tech%20Note%2020220901.pdf (fetch timed out)

## Gaps and uncertainty

- ASHRAE Handbook not read. The S&C formula, terrain (alpha, delta) table and Cd statements are confirmed through EnergyPlus, Ladybug, the FSEC original and secondary citations, not through the Handbook.
- EnergyPlus source lines [S3] and the Modelica code and docs [S4] were read through WebFetch's summarising model, not as raw text. They agree with the original report [S1] (read from page images) and with the numeric table in [S5]. The EnergyPlus ER page [S2] states no numeric validity range.
- TN 44 numbers [S6] come from scanned pages read by eye at 110 to 200 dpi, single printed source, two apparent print errors (section 1b). Edition date differs between sources (1998 printing; NISTIR cites 1994).
- UNCONFIRMED, reasons: per-type Cd for casement, double-hung, sliding glass door and swing door with and without screens (no source gives them; the Heiselberg 2001 Building and Environment paper, Heiselberg and Sandberg 2006 and Karava 2011 papers were not read; reviewed studies disagree from 0.2 to 1.0); any numeric insect-screen factor; the free-area fraction of sliding glass doors and swing doors, and the angle dependence of the casement fraction (the window fractions in section 3c rest on one code commentary and one vendor bulletin measured on Australian aluminium windows); interior door sizes (retailer pages returned HTTP 403); typical sill height; a typical single-story house area and dimensioned plans near 700 sq ft (one-bedroom) and 1,000 sq ft (two-bedroom); a general table of room sizes; a HUD room-size table; EnergyPlus interpolation between its 30-degree table steps; the 2021 numbering and kitchen exception of the minimum-room rules.
- Fit and scope risks for the simulation: S&C is extrapolated for walls with eave height / short wall above 0.4 (studio and one-bedroom scale); the model is isolated-building and mean-pressure only; the plan units may be through-units in a larger building where neighbours shield facades, which the formula does not represent; Cd on geometric free area is a single assumed value; single-sided ventilation (one open wall) needs a different Cd and turbulence treatment ([S11] reports lower values).
- Wind speed: the suburban conversion factor spans 0.435 to 0.550 at 3 m across published parameter sets; the recommended 0.55 (z = 3 m) is the upper end and comes from the newest of them.
