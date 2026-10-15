# Airflow experiment: published benchmark data and sources

Date: 2026-10-07. Status: all five questions are covered at the confidence stated in each section. Anything that no readable source confirms is marked UNCONFIRMED with the reason.

## How each fact was verified

| Tag | Meaning |
|---|---|
| [P] | Read by me on the original paper's own pages (scanned page image or embedded text layer). |
| [R] | Read by me in the text of a later paper, repository or institutional page that reproduces the number. |
| [A] | Only the abstract or bibliographic record was readable (full text paywalled). |
| UNCONFIRMED | No source I could read states it. |
| derived | Algebra or arithmetic on confirmed numbers; no source states it. |

Search-engine summaries were used as leads only. No number below rests on one. "Sources agreeing" lists the IDs from the Sources section that print the same value. Paywalled originals (Ghia et al. 1982, the ASHRAE Handbook, Hortmann et al. 1990, Le Quere 1991) were not accessed or bypassed.

| § | Topic | Result |
|---|---|---|
| 1 | Ghia Re 1000 | Both centreline tables confirmed by 3 to 4 independent transcriptions (original unread). One entry disputed 2 to 1. Primary vortex confirmed. Ghia's own secondary-vortex values UNCONFIRMED. |
| 2 | de Vahl Davis | Table V read on the original scan [P], reproduced by later papers. Refined solutions cross-checked. |
| 3 | Round jet | Constants confirmed only through secondary compilations. Ranges stated. Fischer, Awbi and fan-jet constants UNCONFIRMED. |
| 4 | Orifice and stack | Orifice law, series area, per-opening stack flows, neutral level and Boussinesq form confirmed in several open sources and re-derived. The ASHRAE chapter (edition, equation numbers) and Linden's own A* UNCONFIRMED. |
| 5 | Well-mixed decay, CADR | Mass balance and CADR = V (k_e - k_n) confirmed in the original documents (Nazaroff 2004, AHAM AC-1-2020). Deposition-velocity table and several original papers UNCONFIRMED. |

## 1. Lid-driven cavity, Ghia, Ghia and Shin (1982), Re = 1000

### 1.1 Setup and conventions

- Unit square, lid (top, y = 1) moving in +x at speed 1, no-slip on the other walls, Re = U L / nu = 1000. u is horizontal, v vertical. [G2]
- Ghia's Re = 1000 solution is on a uniform 129 x 129 grid, second order [G6 Table 1]. All 34 printed coordinates equal k/128 for an integer k (printed to 4 decimals, rounded half up), so the nodes are on that grid. The TypeScript arrays below use the exact k/128. [derived]
- G5 prints Ghia's data in a mirrored frame (lid moving in -x): x_G5 = 1 - x, u_G5 = -u, v unchanged. G5 also rounds u to 4 decimals.
- The original paper (G1) was not readable. Every value is from the transcriptions listed in the tables.

### 1.2 u(y) on the vertical centreline x = 0.5

| y printed | y exact | u Ghia | u Botella-Peyret | Ghia value, sources agreeing |
|---|---|---|---|---|
| 1.0000 | 128/128 | 1.00000 | 1.0000000 | G2, G3, G4, G5 |
| 0.9766 | 125/128 | 0.65928 | 0.6644227 | G2, G3, G5 (G4 omits this row) |
| 0.9688 | 124/128 | 0.57492 | 0.5808359 | G2, G3, G4, G5 |
| 0.9609 | 123/128 | 0.51117 | 0.5169277 | G2, G3, G4, G5 |
| 0.9531 | 122/128 | 0.46604 | 0.4723329 | G2, G3, G4, G5 |
| 0.8516 | 109/128 | 0.33304 | 0.3372212 | G2, G3, G4, G5 |
| 0.7344 | 94/128 | 0.18719 | 0.1886747 | G2, G3, G4, G5 |
| 0.6172 | 79/128 | 0.05702 | 0.0570178 | G2, G3, G4, G5 |
| 0.5000 | 64/128 | -0.06080 | -0.0620561 | G2, G3, G4, G5 |
| 0.4531 | 58/128 | -0.10648 | -0.1081999 | G2, G3, G4, G5 |
| 0.2813 | 36/128 | -0.27805 | -0.2803696 | G2, G3, G4, G5 |
| 0.1719 | 22/128 | -0.38289 | -0.3885691 | G2, G3, G4, G5 |
| 0.1016 | 13/128 | -0.29730 | -0.3004561 | G2, G3, G4, G5 |
| 0.0703 | 9/128 | -0.22220 | -0.2228955 | G2, G3, G4, G5 |
| 0.0625 | 8/128 | -0.20196 | -0.2023300 | G2, G3, G4, G5 |
| 0.0547 | 7/128 | -0.18109 | -0.1812881 | G2, G3, G4, G5 |
| 0.0000 | 0 | 0.00000 | 0.0000000 | G2, G3, G4, G5 |

Botella-Peyret column: G2 (7 decimals), G5 (4 decimals, agrees). G8 is a figure digitisation and agrees only to about 1e-3, so it is a plausibility check, not a source for digits.

### 1.3 v(x) on the horizontal centreline y = 0.5

| x printed | x exact | v Ghia | v Botella-Peyret (G5 only) | Ghia value, sources agreeing |
|---|---|---|---|---|
| 1.0000 | 128/128 | 0.00000 | 0.000000 | G3, G4, G5 |
| 0.9688 | 124/128 | -0.21388 | -0.227923 | G3, G4, G5 |
| 0.9609 | 123/128 | -0.27669 | -0.293687 | G3, G4, G5 |
| 0.9531 | 122/128 | -0.33714 | -0.355321 | G3, G4, G5 |
| 0.9453 | 121/128 | -0.39188 | -0.410375 | G3, G4, G5 |
| 0.9063 | 116/128 | -0.51550 | -0.526439 | G4, G5. G3 prints -0.51500 (see below) |
| 0.8594 | 110/128 | -0.42665 | -0.426455 | G3, G4, G5 |
| 0.8047 | 103/128 | -0.31966 | -0.320214 | G3, G4, G5 |
| 0.5000 | 64/128 | 0.02526 | 0.025799 | G3, G4, G5 |
| 0.2344 | 30/128 | 0.32235 | 0.325359 | G3, G4, G5 |
| 0.2266 | 29/128 | 0.33075 | 0.333992 | G3, G4, G5 |
| 0.1563 | 20/128 | 0.37095 | 0.376919 | G3, G4, G5 |
| 0.0938 | 12/128 | 0.32627 | 0.333044 | G3, G4, G5 |
| 0.0781 | 10/128 | 0.30353 | 0.309910 | G3, G4, G5 |
| 0.0703 | 9/128 | 0.29012 | 0.296270 | G3, G4, G5 |
| 0.0625 | 8/128 | 0.27485 | 0.280706 | G3, G4, G5 |
| 0.0000 | 0 | 0.00000 | 0.000000 | G3, G4, G5 |

Disagreement at x = 0.9063: G4 and G5 print -0.5155, G3 prints -0.51500. I use -0.51550 because two independent transcriptions agree and the G3 value looks like a dropped digit. The G8 digitisation (-0.5153) cannot separate the two. The original table would settle it (UNCONFIRMED against G1).

### 1.4 How accurate the tabulated values are (derived)

Ghia's table is a second-order 129 x 129 solution. Against the Botella-Peyret spectral values at the same 17 points (lid speed 1):

| Component | Max abs difference | At | RMS |
|---|---|---|---|
| u | 0.00629 | y = 0.9531 | 0.00349 |
| v | 0.01849 | x = 0.9453 | 0.00937 |

A solver that converged to the exact solution would show an apparent error against Ghia of this size.

### 1.5 Vortex data, Re = 1000

Magnitudes are listed. Sign convention in G6: psi = 0 on the walls, primary vortex psi < 0, corner vortices BR1 and BL1 psi > 0.

| Source | Resolution | abs(psi) primary | abs(omega) primary | Centre (x, y) | Sources agreeing |
|---|---|---|---|---|---|
| Ghia et al. | 129 x 129 | 0.117929 | 2.04968 | (0.5313, 0.5625) | G6 Table 1. G2 Table A-2 gives 0.1179, 2.0497, same centre |
| Botella and Peyret | spectral | 0.1189366 | 2.067750 | (0.5308, 0.5652) | G6 Table 1. G2 Table A-2 gives 0.1189, 2.0678, same centre |
| Erturk, Corke, Gokcol, Richardson extrapolated (order 6) | 601 x 601 | 0.118942 | 2.067213 | not given | G6 |
| Erturk and Gokcol, fourth-order compact | 601 x 601 | 0.118938 | 2.067760 | (0.5300, 0.5650) | G7 |

Corner vortices, converged values (not Ghia's):

| Vortex | abs(psi) G7 (4th order) | abs(psi) G6 (2nd order, 601 x 601) | omega G7 / G6 | Centre (x, y) |
|---|---|---|---|---|
| BR1 (bottom right) | 1.7297e-3 | 1.7281e-3 | 1.118222 / 1.115505 | (0.8633, 0.1117) |
| BL1 (bottom left) | 2.3345e-4 | 2.3261e-4 | 0.354271 / 0.353473 | (0.0833, 0.0783) |

Ghia's own secondary-vortex values (stream function, vorticity, centres): UNCONFIRMED. No source I could read reproduces his Table III beyond the primary vortex. Search summaries suggested centres near (0.8594, 0.1094) and (0.0859, 0.0781); I did not verify them and do not use them.

### 1.6 TypeScript data

```ts
/** Ghia, Ghia and Shin (1982), Re = 1000, lid speed 1, cavity side 1.
 *  [coordinate, velocity] pairs ordered from the lid (1) down to 0 as printed.
 *  Coordinates are the exact 129-point grid nodes k/128; the printed 4-decimal value is in the comment. */
export const GHIA_RE1000_U_ON_X_HALF: ReadonlyArray<readonly [number, number]> = [
	[128 / 128, 1.0],
	[125 / 128, 0.65928], // 0.9766
	[124 / 128, 0.57492], // 0.9688
	[123 / 128, 0.51117], // 0.9609
	[122 / 128, 0.46604], // 0.9531
	[109 / 128, 0.33304], // 0.8516
	[94 / 128, 0.18719], // 0.7344
	[79 / 128, 0.05702], // 0.6172
	[64 / 128, -0.0608], // 0.5000
	[58 / 128, -0.10648], // 0.4531
	[36 / 128, -0.27805], // 0.2813
	[22 / 128, -0.38289], // 0.1719
	[13 / 128, -0.2973], // 0.1016
	[9 / 128, -0.2222], // 0.0703
	[8 / 128, -0.20196], // 0.0625
	[7 / 128, -0.18109], // 0.0547
	[0, 0.0]
];

/** v(x) on y = 0.5, same case. x = 0.9063 uses -0.5155 (G3 prints -0.51500). */
export const GHIA_RE1000_V_ON_Y_HALF: ReadonlyArray<readonly [number, number]> = [
	[128 / 128, 0.0],
	[124 / 128, -0.21388], // 0.9688
	[123 / 128, -0.27669], // 0.9609
	[122 / 128, -0.33714], // 0.9531
	[121 / 128, -0.39188], // 0.9453
	[116 / 128, -0.5155], // 0.9063
	[110 / 128, -0.42665], // 0.8594
	[103 / 128, -0.31966], // 0.8047
	[64 / 128, 0.02526], // 0.5000
	[30 / 128, 0.32235], // 0.2344
	[29 / 128, 0.33075], // 0.2266
	[20 / 128, 0.37095], // 0.1563
	[12 / 128, 0.32627], // 0.0938
	[10 / 128, 0.30353], // 0.0781
	[9 / 128, 0.29012], // 0.0703
	[8 / 128, 0.27485], // 0.0625
	[0, 0.0]
];

/** Botella and Peyret (1998) spectral values at the same nodes (G2 for u, G5 for v). Use for the exact-solution error. */
export const BOTELLA_PEYRET_RE1000_U_ON_X_HALF: ReadonlyArray<readonly [number, number]> = [
	[128 / 128, 1.0],
	[125 / 128, 0.6644227],
	[124 / 128, 0.5808359],
	[123 / 128, 0.5169277],
	[122 / 128, 0.4723329],
	[109 / 128, 0.3372212],
	[94 / 128, 0.1886747],
	[79 / 128, 0.0570178],
	[64 / 128, -0.0620561],
	[58 / 128, -0.1081999],
	[36 / 128, -0.2803696],
	[22 / 128, -0.3885691],
	[13 / 128, -0.3004561],
	[9 / 128, -0.2228955],
	[8 / 128, -0.20233],
	[7 / 128, -0.1812881],
	[0, 0.0]
];

export const BOTELLA_PEYRET_RE1000_V_ON_Y_HALF: ReadonlyArray<readonly [number, number]> = [
	[128 / 128, 0.0],
	[124 / 128, -0.227923],
	[123 / 128, -0.293687],
	[122 / 128, -0.355321],
	[121 / 128, -0.410375],
	[116 / 128, -0.526439],
	[110 / 128, -0.426455],
	[103 / 128, -0.320214],
	[64 / 128, 0.025799],
	[30 / 128, 0.325359],
	[29 / 128, 0.333992],
	[20 / 128, 0.376919],
	[12 / 128, 0.333044],
	[10 / 128, 0.30991],
	[9 / 128, 0.29627],
	[8 / 128, 0.280706],
	[0, 0.0]
];

/** Primary vortex, Re = 1000, magnitudes. */
export const CAVITY_RE1000_PRIMARY_VORTEX = {
	ghia129: { psi: 0.117929, omega: 2.04968, x: 0.5313, y: 0.5625 },
	botellaPeyret: { psi: 0.1189366, omega: 2.06775, x: 0.5308, y: 0.5652 }
} as const;
```

Extra, not requested: Ghia's Re = 100 and Re = 400 tables exist in G3 and G4 (G3 flags the printed Re = 400 value at x = 0.9063, -0.23827, as probably wrong). They were read but not copied here.

## 2. Differentially heated square cavity, de Vahl Davis (1983)

### 2.1 Problem and non-dimensionalisation [P] (paper pages 249 to 252)

- Boussinesq fluid, Pr = 0.71, upright square cavity of side L. All walls no-slip. Horizontal walls insulated. Vertical walls at T_h (hot, x = 0, left) and T_c (cold, x = 1, right). Axes (x, z) with z vertical upward. In the TypeScript below z is called y.
- Scale factors: length L, stream function kappa (thermal diffusivity), time L^2/kappa. So the velocity scale is kappa/L (alpha/H), not sqrt(g beta dT H). Temperature T = (T' - T_c)/(T_h - T_c).
- Dimensionless equations as printed: d(u zeta)/dx + d(w zeta)/dz = Pr laplacian(zeta) + Ra Pr dT/dx; laplacian(psi) + zeta = 0; d(u T)/dx + d(w T)/dz = laplacian(T).
- The paper does not write Ra as a formula. The buoyancy term fixes it as Ra = g beta (T_h - T_c) L^3 / (nu kappa), with Pr = nu/kappa. The nomenclature of D2 gives the same definition.
- Local heat flux Q = u T - dT/dx, which is -dT/dx on a wall. Nu_0 is the average on the hot wall x = 0, Nu_mid the average on the vertical mid-plane, Nu_avg (the paper's Nu with an overbar) the average of Q over the whole cavity. In the exact solution all three are equal.
- Conversions (derived): u_phys = u* kappa/L = u* nu/(Pr L). Free-fall scaling U_ff = sqrt(g beta dT L) gives u/U_ff = u* / sqrt(Ra Pr). The factor 1/sqrt(Ra Pr) is 0.03753, 0.011868, 3.753e-3, 1.1868e-3 for Ra = 1e3, 1e4, 1e5, 1e6. Velocities on the nu/L scale (D3) are u* / Pr.

### 2.2 Benchmark solution, Table V of the paper [P]

Method: Richardson extrapolation (second order) of finite-difference solutions, h = 0.05 and 0.025 for Ra up to 1e4, h = 0.025 and 0.0125 for Ra of 1e5 and 1e6. The paper's stated accuracy: better than 1 percent at Ra = 1e6, about one tenth of that at Ra = 1e3. Velocities are in units of kappa/L. v below is the paper's w (vertical velocity).

| Quantity | Ra = 1e3 | Ra = 1e4 | Ra = 1e5 | Ra = 1e6 | Sources agreeing |
|---|---|---|---|---|---|
| Nu_avg (whole cavity) | 1.118 | 2.243 | 4.519 | 8.800 | D1 [P]. D3, D4 (1e4 to 1e6), D5 (1e5, 1e6), D2 (rounded), D8 (8.799 at 1e6) |
| Nu_mid (mid-plane) | 1.118 | 2.243 | 4.519 | 8.799 | D1 [P]. D8 |
| Nu_0 (hot wall, x = 0) | 1.117 | 2.238 | 4.509 | 8.817 | D1 [P] only |
| Nu_max, local, hot wall | 1.505 | 3.528 | 7.717 | 17.925 | D1 [P]. D8. D2 (rounded 1.50, 3.53, 7.71, 17.92) |
| y of Nu_max | 0.092 | 0.143 | 0.081 | 0.0378 | D1 [P]. D8. D2 (0.092, 0.143, 0.08, 0.038) |
| Nu_min, local, hot wall | 0.692 | 0.586 | 0.729 | 0.989 | D1 [P]. D8. D2 |
| y of Nu_min | 1 | 1 | 1 | 1 | D1 [P]. D8. D2 |
| u_max on x = 0.5 | 3.649 | 16.178 | 34.73 | 64.63 | D1 [P]. D8. D3 (u/Pr values times 0.71 reproduce them) |
| y of u_max | 0.813 | 0.823 | 0.855 | 0.850 | D1 [P]. D8 |
| v_max on y = 0.5 | 3.697 | 19.617 | 68.59 | 219.36 | D1 [P]. D3 (scaled). D8 agrees except at 1e6 (see below) |
| x of v_max | 0.178 | 0.119 | 0.066 | 0.0379 | D1 [P]. D8 |
| abs(psi) at cavity centre | 1.174 | 5.071 | 9.111 | 16.32 | D1 [P]. D3 (1e3, 1e4, scaled) |
| abs(psi) maximum (x, y) | at the centre | at the centre | 9.612 (0.285, 0.601) | 16.750 (0.151, 0.547) | D1 [P]. D3 (scaled) |

Where sources disagree:

- v_max at Ra = 1e6: D1 prints 219.36. D8 prints 217.36 in its "de Vahl Davis' solution" column, and Nu = 8.799 at 1e6. I trust 219.36: it is the paper's final table, and the refined solutions in section 2.3 (220.47 and 220.57) sit 0.5 percent above it, while 217.36 would sit 1.4 percent below. The likely cause is that D1 says its final results differ slightly from those published earlier (its reference 6); that explanation is an inference.
- "de Vahl Davis" in later papers often means the paper's finest-mesh original solution (Tables I to IV), not Table V. At Ra = 1e6 (h = 0.0125) those are u_max 65.33 at y = 0.851, v_max 216.75 at x = 0.0387, Nu_avg 8.798, Nu_mid 8.816, Nu_0 8.928, Nu_max 18.076 at y = 0.0456, Nu_min 1.005. D2 and D6 quote them under his name. Use Table V as the benchmark. Secondary copies also carry slips: D6 prints u_max = 34.18 at Ra = 1e5 in its "de Vahl Davis" column, a transposition of the paper's finest-mesh 34.81 (Table III).
- Nu_0 (hot wall) in Table V is 8.817 at Ra = 1e6, against 8.800 for the cavity average. In the continuum they are equal. The refined solutions give 8.825 for the average. Use Nu_avg.

### 2.3 Later refinements and the differences

Refined sources: Hortmann, Peric and Scheuerer (1990; cell-centred finite volume on refined Cartesian meshes up to 320 x 320, with Richardson extrapolation applied to the mean and peak Nusselt numbers, per the text of D7) for Ra 1e4 to 1e6; Sharma et al. (2018) and Mayne, Usmani and Crapper (2000) for the other quantities; Le Quere (1991) for Nu. The original papers of all four were not readable. Their numbers are read in D6 (Tables 2 to 5, columns "Ref. 2" Hortmann and "Ref. 4" Sharma), D7 (Hortmann Nu table) and D2 (Tables 2, 3 and 5, column "Ref. [10]" Mayne). Le Quere's Nu is read in D5.

| Quantity | Ra = 1e3 | Ra = 1e4 | Ra = 1e5 | Ra = 1e6 | Sources agreeing |
|---|---|---|---|---|---|
| Nu_avg, Hortmann | not available | 2.24475 | 4.52164 | 8.82513 | D7 (5 digits). D4 prints 2.245, 4.522, 8.825 |
| Nu_avg, Le Quere | not read | not read | 4.521 | 8.8252 | D5 |
| Nu_max, Hortmann | not available | 3.53087 | 7.72013 | 17.536 | D7 (last column, labelled "Numax" on the page) |
| Nu_max (y), Mayne | 1.5062 (0.08956) | 3.5305 (0.1426) | 7.7084 (0.08353) | 17.5308 (0.03768) | D2 Table 5 [read on the page image] |
| Nu_min (at y = 1), Mayne | 0.6913 | 0.5850 | 0.7282 | 0.9845 | D2 Table 5 [read on the page image] |
| u_max (y), Hortmann | not available | 16.1759 (0.82551) | 34.7385 (0.85535) | 64.8340 (0.85036) | D6 |
| u_max (y), Sharma | 3.64945 (0.81324) | 16.18340 (0.82323) | 34.74050 (0.85461) | 64.83190 (0.84990) | D6 |
| u_max (y), Mayne | 3.6493 (0.8125) | 16.1798 (0.8235) | 34.7741 (0.8535) | 64.6912 (0.8460) | D2 Table 3 |
| v_max (x), Hortmann | not available | 19.6242 (0.12009) | 68.6359 (0.06602) | 220.473 (0.03887) | D6 |
| v_max (x), Sharma | 3.69744 (0.17832) | 19.62830 (0.11886) | 68.63500 (0.06585) | 220.56600 (0.03775) | D6 |
| v_max (x), Mayne | 3.6962 (0.1790) | 19.6177 (0.1195) | 68.6920 (0.0665) | 220.8331 (0.0380) | D2 Table 2 |

Difference of Table V from the refined values, (Table V - refined) / refined, in percent (refined = Hortmann for 1e4 to 1e6 and Sharma for 1e3 velocities; Nu_max and Nu_min against Hortmann and Mayne respectively). Derived.

| Quantity | Ra = 1e3 | Ra = 1e4 | Ra = 1e5 | Ra = 1e6 |
|---|---|---|---|---|
| u_max | -0.01 | +0.01 | -0.02 | -0.31 |
| v_max | -0.01 | -0.04 | -0.07 | -0.50 |
| Nu_avg | n/a | -0.08 | -0.06 | -0.28 |
| Nu_max | -0.08 | -0.08 | -0.04 | +2.22 |
| Nu_min | +0.10 | +0.17 | +0.11 | +0.46 |

Use: Table V agrees with the refined values to within 0.2 percent for Ra up to 1e5. At 1e6 prefer the refined values (Nu_avg 8.825, Nu_max 17.53). The paper says Nu_max at 1e6 was exceptionally sensitive to the method. The Wan, Patnaik and Wei (2001) columns for their own DSC and FEM solutions (D2) differ from all the others (for example average Nu 1.073 at Ra = 1e3 against 1.117 to 1.118) and are not used as targets.

### 2.4 TypeScript data

```ts
/** de Vahl Davis (1983), Table V "bench mark solution". Pr = 0.71.
 *  Velocities are in units of alpha/H (alpha = thermal diffusivity). Nu = hot-wall heat flux / conduction flux.
 *  Coordinates are fractions of the cavity side; y is vertical, hot wall at x = 0.
 *  psi values are in units of alpha. */
export const DE_VAHL_DAVIS_1983_TABLE_V = [
	{
		ra: 1e3,
		nuAvg: 1.118,
		nuMid: 1.118,
		nuHotWall: 1.117,
		nuMax: { value: 1.505, y: 0.092 },
		nuMin: { value: 0.692, y: 1 },
		uMax: { value: 3.649, y: 0.813 },
		vMax: { value: 3.697, x: 0.178 },
		psiMid: 1.174
	},
	{
		ra: 1e4,
		nuAvg: 2.243,
		nuMid: 2.243,
		nuHotWall: 2.238,
		nuMax: { value: 3.528, y: 0.143 },
		nuMin: { value: 0.586, y: 1 },
		uMax: { value: 16.178, y: 0.823 },
		vMax: { value: 19.617, x: 0.119 },
		psiMid: 5.071
	},
	{
		ra: 1e5,
		nuAvg: 4.519,
		nuMid: 4.519,
		nuHotWall: 4.509,
		nuMax: { value: 7.717, y: 0.081 },
		nuMin: { value: 0.729, y: 1 },
		uMax: { value: 34.73, y: 0.855 },
		vMax: { value: 68.59, x: 0.066 },
		psiMid: 9.111,
		psiMax: { value: 9.612, x: 0.285, y: 0.601 }
	},
	{
		ra: 1e6,
		nuAvg: 8.8,
		nuMid: 8.799,
		nuHotWall: 8.817,
		nuMax: { value: 17.925, y: 0.0378 },
		nuMin: { value: 0.989, y: 1 },
		uMax: { value: 64.63, y: 0.85 },
		vMax: { value: 219.36, x: 0.0379 },
		psiMid: 16.32,
		psiMax: { value: 16.75, x: 0.151, y: 0.547 }
	}
] as const;

/** Refined cavity solutions, same non-dimensionalisation (alpha/H). null = not available in the sources read. */
export const CAVITY_REFINED_REFERENCE = [
	{
		ra: 1e3,
		sharma2018: { uMax: { value: 3.64945, y: 0.81324 }, vMax: { value: 3.69744, x: 0.17832 } },
		mayne2000: {
			nuMax: { value: 1.5062, y: 0.08956 },
			nuMin: { value: 0.6913, y: 1 },
			uMax: { value: 3.6493, y: 0.8125 },
			vMax: { value: 3.6962, x: 0.179 }
		},
		hortmann1990: null
	},
	{
		ra: 1e4,
		hortmann1990: {
			nuAvg: 2.24475,
			nuMax: 3.53087,
			uMax: { value: 16.1759, y: 0.82551 },
			vMax: { value: 19.6242, x: 0.12009 }
		},
		sharma2018: { uMax: { value: 16.1834, y: 0.82323 }, vMax: { value: 19.6283, x: 0.11886 } },
		mayne2000: {
			nuMax: { value: 3.5305, y: 0.1426 },
			nuMin: { value: 0.585, y: 1 },
			uMax: { value: 16.1798, y: 0.8235 },
			vMax: { value: 19.6177, x: 0.1195 }
		}
	},
	{
		ra: 1e5,
		hortmann1990: {
			nuAvg: 4.52164,
			nuMax: 7.72013,
			uMax: { value: 34.7385, y: 0.85535 },
			vMax: { value: 68.6359, x: 0.06602 }
		},
		leQuere1991: { nuAvg: 4.521 },
		sharma2018: { uMax: { value: 34.7405, y: 0.85461 }, vMax: { value: 68.635, x: 0.06585 } },
		mayne2000: {
			nuMax: { value: 7.7084, y: 0.08353 },
			nuMin: { value: 0.7282, y: 1 },
			uMax: { value: 34.7741, y: 0.8535 },
			vMax: { value: 68.692, x: 0.0665 }
		}
	},
	{
		ra: 1e6,
		hortmann1990: {
			nuAvg: 8.82513,
			nuMax: 17.536,
			uMax: { value: 64.834, y: 0.85036 },
			vMax: { value: 220.473, x: 0.03887 }
		},
		leQuere1991: { nuAvg: 8.8252 },
		sharma2018: { uMax: { value: 64.8319, y: 0.8499 }, vMax: { value: 220.566, x: 0.03775 } },
		mayne2000: {
			nuMax: { value: 17.5308, y: 0.03768 },
			nuMin: { value: 0.9845, y: 1 },
			uMax: { value: 64.6912, y: 0.846 },
			vMax: { value: 220.8331, x: 0.038 }
		}
	}
] as const;

/** Conversions from the de Vahl Davis velocity u* (units alpha/H). */
export const uPhysicalFromDvd = (uStar: number, alpha: number, height: number) => (uStar * alpha) / height;
export const uFreeFallFromDvd = (uStar: number, ra: number, pr = 0.71) => uStar / Math.sqrt(ra * pr);
```

## 3. Turbulent free round jet

Notation: d nozzle diameter, U_0 exit (bulk) velocity, x axial distance from the nozzle, x0 virtual origin, U_c centreline velocity, r_half the radius where the velocity is half of U_c.

- Centreline decay: U_c / U_0 = B d / (x - x0). Pope (2000) eq. 5.6 per J1 (and J4 writes it as U_c / U_j = 2 B_u r_0 / (x - x0), crediting Pope, which is the same law).
- Spreading: r_half = S (x - x0). (J2 eq. 14.)

### 3.1 Constants

None of the primary papers' own constants were readable (paywalled; the Cambridge pages show abstracts only [A]). The values below are read in later compilations.

| Study | B | S (half-velocity radius slope) | abs(x0)/d | Re (as quoted) | Sources agreeing |
|---|---|---|---|---|---|
| Wygnanski and Fiedler (1969), hot wire, self-preserving beyond about 70 d [A for the 70 d] | 5.70 | 0.086 | 3.0 | about 1e5 | J14 (all four values). J2 prints B = 5.4 (conflict, see below). S also J5 |
| Hussein, Capp and George (1994), top-hat jet in a large room, hot wire and LDA | 5.8 | 0.094 | 4.0 | about 1e5 | B: J14, J2, J3. S: J14, J5. x0: J14. Re: J14, J3, J6 [A] |
| Panchapakesan and Lumley (1993), air jet | 6.06 | 0.096 (J2 gives 0.10) | 0.0 | 1.1e4 | B: J14, J2, J3, J4. S: J14, J2. x0: J14. Re: J14, J3, J4 |
| Rodi (1975) | 5.90 | 0.086 | not given | 8.7e4 | J14 only |
| O'Neill et al. | 5.6 | not given | not given | not given | J2 only |
| Bhat and Narasimha (1996) | not given | 0.09 | not given | not given | J5 |
| Pope (2000), textbook | 5.8 | 0.094 | not given | not applicable | B: J1 (eq. 5.6 as quoted by a paper that follows Pope). S: J1 (lecture notes citing Pope's Fig. 5.15 derive S = 8(sqrt2 - 1) x 0.028 = 0.094 from a constant eddy viscosity) |
| Fischer et al. (1979), via Turner (1986) in J5 | not read (UNCONFIRMED) | 1/e-width slope 0.108, which is a half-width slope of 0.090 (derived) | not given | not given | J5 |

Consensus as stated by J14 for high-Reynolds-number axisymmetric jets, citing Wygnanski and Fiedler, Panchapakesan and Lumley and Hussein et al.: B about 5.7 to 6.1, S about 0.086 to 0.096, abs(x0)/D about 3 to 4. Experiments in J14's table outside that band: Birch et al. (1978) B = 4.0 with S = 0.097 (Re 1.6e4), Fukushima et al. (2002) B = 6.70 (Re 2e3), Buchwald et al. (2024) B = 6.4 with S = 0.103 (Re 3.3e4). Most quoted single values: B = 5.8, S = 0.094 (Pope, Hussein).

Disagreement on Wygnanski and Fiedler's B: J14 prints 5.70 in a full row (B, S, x0, Re), J2 prints 5.4. I use 5.7 because the J14 row is complete and matches J14's stated band; the paper itself is paywalled, so this is unresolved against the original.

Hussein's 1/e-width slope is 0.114 (J5), a half-width slope of 0.0949 (derived), consistent with 0.094. LES in J4 finds B rising with Reynolds number (5.96 at Re 3.6e3, 6.28 to 6.37 at 8.8e4, 6.55 to 7.40 at 4e5), simulation only.

Primary-paper statements confirmed from abstracts [A], J6: Hussein et al. studied a top-hat jet, Re of about 1e5, and report that their data satisfy the momentum equations and differ from earlier work because of the smaller enclosures used earlier. Wygnanski and Fiedler: self-preserving only at about 70 d. Panchapakesan and Lumley: momentum flux across the jet within plus or minus 5 percent of the nozzle input.

### 3.2 Potential core

| Statement | Value | Sources |
|---|---|---|
| End of the core in jets studied by Sokolov et al. (1981), as cited | 4 to 5 d | J8 (arXiv 1809.02496) |
| Reference experiment for a round jet, core defined by U_x = 0.95 U_j | 7 d (simulations 6.83 and 7.9) | J8 (arXiv 1705.08723) |
| Scatter | Core length, spreading rate and peak turbulence "vary widely from experiment to experiment"; set by the exit boundary-layer state and turbulence level | J8 (NASA NTRS 19930018245) |

No single accepted value exists. The result depends on the definition (0.99, 0.95 of U_0) and on the exit boundary layer. Working range 4 to 7 d. Sanity check, derived: the far-field law reaches U_c = U_0 at x = B d + x0, about 5.8 d plus the virtual origin.

### 3.3 Entrainment

| Statement | Value | Sources |
|---|---|---|
| Ricou and Spalding (1961) establish an entrainment law linking mass flow, jet momentum, axial distance and ambient density | abstract only, constants not in it | J6 [A] |
| Far-field entrainment coefficient C_E = (d_0 / m_0) dm/dx for gas jets, Re above 25,000 | 0.32 | J7 (both papers) |
| Same, written for the entrained flux: m_e / m_0 = K_e (x/D_0) (rho_e/rho_0)^(1/2) with m_e = m(x) - m_0, K_e tends to 0.32 | 0.32 | J7 (arXiv 1605.08036 eq. 1 and section 5.1) |
| Hill (1972), local coefficient rises from about 0.1 at x/D = 2 to 0.32 at x/D = 13 | 0.1 to 0.32 | J7 (arXiv 1903.01906) |
| Han and Mungal, co-flow jet: 0.32 in the far field but only after about 35 D | 0.32 | J7 (arXiv 1903.01906) |
| Entrainment coefficient per half-width, alpha_E | 0.054 (Fischer via Turner), 0.057 (Hussein), 0.0585 (Bhat and Narasimha) | J5 |

The constant is a slope. The law is Q(x)/Q_0 = 0.32 x/d plus an offset that depends on whether Q is the total or the entrained flux (the two differ by 1). Test the slope for x/d of about 13 and above, not the absolute ratio nearer the nozzle. "x/d above 6" as the validity limit of Ricou and Spalding: UNCONFIRMED (not found in a readable source). Cross-check, derived: a Gaussian profile with U_c = B d U_0/(x - x0) and r_half = S (x - x0) gives d(Q/Q_0)/d(x/d) = 4 S^2 B / ln 2, which is 0.243 for Wygnanski and Fiedler (B = 5.70, S = 0.086), 0.296 for Hussein et al. (5.8, 0.094) and 0.322 for Panchapakesan and Lumley (6.06, 0.096), against 0.32.

### 3.4 Momentum flux

- Conserved: M = rho integral of U^2 dA is independent of x (lecture notes in J1 that cite Pope's Fig. 5.15). Nozzle value for a top-hat exit: M = rho U_0^2 pi d^2 / 4. Confirmed to within plus or minus 5 percent by Panchapakesan and Lumley and satisfied by Hussein et al. [A, J6].
- Derived, Gaussian profile u = U_c exp(-r^2/b^2), b = r_half / sqrt(ln 2): M = (pi/2) rho U_c^2 b^2, so U_c = 0.6643 sqrt(M/rho) / (S (x - x0)) and, for a top-hat exit, B S = sqrt(ln 2 / 2) = 0.5887.
- The measured pairs give B S = 0.490 (Wygnanski and Fiedler, 16.7 percent below 0.5887), 0.545 (Hussein et al. and Pope, 7.4 percent below) and 0.582 (Panchapakesan and Lumley, 1.2 percent below). So the mean-flow Gaussian closure is only approximate. Use the measured B as the test target and the closure as a sanity check.

### 3.5 Top-hat nozzle versus fan

| Item | Contoured top-hat nozzle | Fan (swirl, hub wake) | Basis |
|---|---|---|---|
| Far-field laws (1/(x - x0) decay, linear spreading, momentum conservation) | Hold once the jet is self-similar. Wygnanski and Fiedler found self-preservation only beyond about 70 d in their hot-wire work; the onset distance for the mean velocity is UNCONFIRMED here | Hold asymptotically for any exit condition in the similarity theory of George (1989); the constants depend on the exit condition | J6 [A] (Mi et al. 2001: two nozzles gave significantly different jets over 0 to 70 d at Re 16,000, supporting George) |
| B, x0, S | B 5.7 to 6.1, S 0.086 to 0.096, abs(x0)/d 3 to 4 (section 3.1) | UNCONFIRMED: no readable source gives B, x0 or S for a fan jet | none found |
| Swirl | none | Weak swirl, swirl number 0.15: scaled far field identical to the non-swirling jet; 0.25: only the virtual origin shifted (0.75 to -2.9 jet diameters as printed). Mean azimuthal velocity decays as 1/x^2, streamwise as 1/x, so the far jet behaves as a non-swirling jet. Measured to 50 d. Stronger swirl: UNCONFIRMED here | J9 [A] |
| Potential core | 4 to 7 d, definition dependent | No uniform core. A hub wake fills in over some diameters (inference, no readable source) | inference |
| Entrainment 0.32 | Measured for top-hat air jets (Re above 25,000), x/d of 13 and above | UNCONFIRMED; the near field of a swirling or non-uniform exit may entrain differently | J7 |
| Momentum reference | M = rho U_0^2 pi d^2 / 4 | Use the measured exit M = rho integral of u^2 dA. It is at least rho Q^2 / A for any profile (Cauchy-Schwarz, derived). An equivalent top-hat with the same Q and M has U_eq = integral of u^2 dA / integral of u dA, A_eq = Q / U_eq (derived) | derived |

### 3.6 Indoor round-jet correlation, K_a

Form: U_x / U_0 = K sqrt(A_0) / x, valid in the fully developed zone (zone 3) of a compact (round or nearly square) jet. A_0 is the effective discharge area C_d A_c, with C_d usually 0.65 to 0.90 for diffusers.

| Statement | Value | Sources |
|---|---|---|
| Compact free jet, K1 (typical example value in an ASHRAE Transactions review) | 5.7 | J10 [R] |
| Jet attached to a ceiling or wall | about 1.4 x the free-jet value | J10 [R] (cites Nottage et al. 1952 and Miller 1990) |
| ASHRAE Handbook (1993) diameter form: U_x / U_0 = K D / (x - x_p), x_p the virtual origin | K defined; values in the cited test depend on averaging time (6.8 to 7.7 for short windows) | J12 [R] |
| Nielsen's K_a, wall jet, U_x / U_0 = K_a sqrt(a_0) / (x + x_0), x_0 about zero | nozzles 8 to 10 (measured 8), diffusers 3 to 5, overall range 2 to 10 | J11, J13 [R] |
| Round top-hat free jet from B (derived, K_a = 2 B / sqrt(pi) = 1.128 B, using A_0 = pi d^2 / 4) | 6.4 (B = 5.7), 6.5 (B = 5.8), 6.8 (B = 6.06) | derived from J14, J3 |
| Awbi, Ventilation of Buildings, tabulated K_a | UNCONFIRMED (book not accessible) | none |
| ASHRAE Handbook Fundamentals chapter on space air diffusion | UNCONFIRMED (paywalled) | none |

Consistency check, derived: 5.7 x 1.4 = 8.0, matching Nielsen's measured nozzle value of 8. K on a sqrt(A_0) basis is 1.128 times the diameter-based B, so a quoted K of 5.8 to 7 is a sqrt(A_0)-based range (it contains 6.4 to 6.8) and is not the diameter-based B range (5.7 to 6.1).

### 3.7 TypeScript data

```ts
/** Round turbulent free jet, far field. U_c/U_0 = B d/(x - x0), r_half = S (x - x0).
 *  Values from published compilations (section 3.1); typical = Pope (2000) / Hussein et al. (1994). */
export const ROUND_JET_FAR_FIELD = {
	decayConstantB: { low: 5.7, typical: 5.8, high: 6.06 },
	spreadingRateS: { low: 0.086, typical: 0.094, high: 0.096 },
	/** abs(x0)/d, Wygnanski and Fiedler 3.0, Hussein et al. 4.0 */
	virtualOriginDiameters: { low: 3, high: 4 },
	/** d(Q/Q0)/d(x/d), x/d of about 13 and above, Ricou and Spalding (1961) as quoted in two later papers */
	entrainmentSlope: 0.32,
	/** Potential-core length in diameters; definition dependent, no single accepted value */
	potentialCoreDiameters: { low: 4, high: 7 },
	/** K on a sqrt(A0) basis for a round top-hat jet: K_a = (2 / sqrt(pi)) * B (derived) */
	kaFromB: (b: number) => (2 / Math.sqrt(Math.PI)) * b,
	/** ASHRAE-type compact free-jet K1 (Li et al. 1993, typical value) */
	ashraeCompactK1: 5.7
} as const;
```

## 4. Orifice flow and stack effect

Tags for this section: O1 to O11 were read by a research agent on extracted PDF text or rendered page images (agent-read); I did not re-read them. I re-derived the stack-effect formulas in 4.3 and 4.4 myself and checked one row of the temperature-denominator table by hand. O12 and O13 are fetch-tool summaries of HTML pages and are used only for statements marked as such. The ASHRAE Handbook Fundamentals chapter on ventilation and infiltration was not read in any edition (paywalled, not bypassed), so ASHRAE edition and equation numbers are UNCONFIRMED. Linden (1999), Linden, Lane-Serff and Smeed (1990), CIBSE AM10 and Etheridge and Sandberg were not read.

### 4.1 Orifice equation and discharge coefficient

| Item | Statement | Sources agreeing |
|---|---|---|
| Orifice law | Q = Cd A sqrt(2 dP / rho). Mass flow m = Cd A sqrt(2 rho dP). A is the free (geometric) area, dP the pressure drop, rho the density of the air passing through. Effective area A_eff = Cd A_f, equal to the vena-contracta area | O3 Eq. 20, O2 p. 225, O4 Eq. 1, O9 Eq. 5, O10 Eq. 1, O11 slide 13 (all agree) |
| Sharp-edged orifice Cd | 0.61 for a flat-plate orifice; 0.62 for aperture-to-wall ratio below 0.1; about 0.6 | O2 (0.61), O5 (0.62), O6 (about 0.6), O3 ("close to 0.6, slightly higher for other building openings") |
| Windows and doors | 0.6 to 0.7 for building flow paths (O1 p. 4). 0.6 to 0.65 for small square-edged openings and 0.6 +/- 0.1 for windows and doors, both as relayed in O10. Measured windows span about 0.2 to 1.0 (O9: 0.65 to about 1.0; Kurabuchi and Ohba 0.2 to 0.4 as relayed in O10). Values above 1 are measurement artefacts (O9) | O1, O9, O10 |
| Rounded edges | 0.9 to 0.95 | O10 (relays Andersen 2002) |
| What changes Cd | Reynolds number: a sharp-edged orifice is Re-independent above about 100 (O4, citing Etheridge 2012), window Cd varies at small dP and plateaus at larger dP (O9, O10, O11). Geometry and edge: "sharp-edged" means L/d_h below 2, rounding raises Cd (O4, O10). Area definition (O9, O10). Temperature difference (O9: Cd falls at large dT). Wind incidence: about 0.58 at 0 degrees to about 0.1 at 90 degrees (O10 Fig. 4, relayed) | as listed |
| Cd versus temperature difference, published fits | Kiel and Wilson 1989: Cd = 0.4 + 0.0075 dT. Riffat 1989: Cd = 0.0835 (dT/T)^-0.313. Both as relayed in O10. ASHRAE 2009: Cd = 0.40 + 0.0045 abs(Ti - To), as stated by the EnergyPlus and DesignBuilder pages, not read in ASHRAE. The trend sign is contested | O10 (relayed), O12 and O13 (fetch-tool summaries) |
| CONTAM default | two-way single-opening Cd = 0.78, from a profile-integrated form (a different formula) | O3 p. 65 |
| Area terminology | "effective area" differs between standards: ASHRAE 2013 uses Cd A_f, CIBSE 2005 uses Cd A_f / 0.61 | O4 |

### 4.2 Openings in series and in parallel

| Item | Statement | Sources agreeing |
|---|---|---|
| Series, general | 1 / A_eff^2 = sum over openings of 1 / (Cd_i A_i)^2. Same Q, pressure drops add | O4 Eq. 10 to 11 |
| Series, two openings, equal Cd | A_eff = Cd A1 A2 / sqrt(A1^2 + A2^2) (Cd = 0.62 in O5 procedure B) | O5, O4. Derived by equating the two flows |
| Validity | openings far enough apart that their streamlines do not interact, uniform density | O4 |
| Parallel | A_eff = sum of Cd_i A_i. Same dP, flows add | O11 slide 16. Its headings for series and parallel are swapped, the formulas match the drawings |
| Examples (derived) | two equal openings give 0.7071 A. A1 = 1 and A2 = 0.5 with Cd = 1 give 0.4472 | derived |

### 4.3 Thermal stack, two openings at different heights

A1 is the lower opening and A2 the upper one. H is the vertical distance between the opening mid-heights (O6, O7, O11 slide 6). Indoor and outdoor air each have uniform temperature (in K) and are ideal gases at the same pressure.

| Item | Statement | Sources agreeing |
|---|---|---|
| Per-opening flows, Ti above To | Inflow of outdoor air at the lower opening Q_in = Cd A1 sqrt(2 g z_n (Ti - To) / Ti). Outflow of indoor air at the upper opening Q_out = Cd A2 sqrt(2 g (H - z_n)(Ti - To) / To). Mass conservation gives Q_out / Q_in = Ti / To | O1 Eq. 6 to 7 (mass flows); volume forms re-derived by me |
| ASHRAE form | Q = Cd A sqrt(2 g dH_NPL (Ti - To) / Ti) with dH_NPL the height from the lower opening mid-point to the neutral level. The ASHRAE text itself: UNCONFIRMED | O12 (fetch-tool summary, attributes it to ASHRAE 2009) |
| Neutral pressure level above the lower opening | z_n / H = 1 / (1 + (Ti / To)(A1 / A2)^2) | O1 Eq. 8, O7 Eq. 7; re-derived by me |
| Boussinesq limit of the neutral level | Ti / To tends to 1: z_n = H A2^2 / (A1^2 + A2^2). It moves toward the larger opening | same sources; derived |
| Combined inflow volume | Q_in = Cd A1 A2 sqrt(2 g H (Ti - To) / Ti) / sqrt(A2^2 + (Ti / To) A1^2). Boussinesq form: Q = Cd (A1 A2 / sqrt(A1^2 + A2^2)) sqrt(2 g H dT / T_ref) | derived from the rows above; re-derived by me and checked numerically by the agent |
| Equal-area check (derived) | z_n = H/2 and the two forms agree: Cd A sqrt(g H dT / T) | derived |
| Reversal, To above Ti | z_n / H = 1 / (1 + (To / Ti)(A1 / A2)^2), still measured from the lower opening. Outdoor air enters at the upper opening, Q_in = Cd A2 sqrt(2 g (H - z_n)(To - Ti) / Ti), and leaves at the lower one, Q_out = Cd A1 sqrt(2 g z_n (To - Ti) / To) | O1 Eq. 10 (agent-read). O12 uses abs(dT) / T_zone and drops the sign |
| Pressure difference | dP_s = g dh (rho_o - rho_i) = rho_o g dh (Ti - To) / Ti = rho_i g dh (Ti - To) / To. O2 writes -rho_0 g 273 (h2 - h1)(1 / T_ext - 1 / T_int) with rho_0 = 1.29 kg/m3 at 273 K. O11 slide 6 writes -rho g H dT / Ti. For Ti above To the indoor-minus-outdoor pressure is negative below the neutral level and positive above it. ASHRAE's printed form: UNCONFIRMED | O1 (heights from the neutral level), O2 p. 232, O11 |
| Single tall opening | Q = (Cd A / 3) sqrt(g H dT / T), H the opening height, neutral level at mid-height, no factor 2 | O3 Eq. 69, O10 Eq. 2, O11 slide 15 Eq. 10 |

Printing slips found by the agent in sources: O11 slide 15 Eq. 9 drops the factor 2; O1's reversed two-opening example prints 49.9 percent where its own Eq. 10 gives 49.0; O8 Eq. 5 prints a squared numerator that is dimensionally inconsistent. None of these is used.

### 4.4 Boussinesq form, A* and the choice of temperature

| Item | Statement | Sources agreeing |
|---|---|---|
| Boussinesq buoyancy | g' = g dT / T_ref with beta = 1 / T_ref. Q = Cd A_eff sqrt(2 g' H) = Cd A* sqrt(g' H) | derived. O6 defines g' with the denser ambient fluid as reference, which for a warm interior is g (Ti - To) / Ti. O8 Eq. 10 uses g (T_up - T0) / T0 |
| A* | A* = sqrt(2) A_eff = A1 A2 / sqrt((A1^2 + A2^2) / 2) exactly, so Cd A* sqrt(g' H) is identical to Cd A_eff sqrt(2 g' H) | algebra, verified numerically by the agent |
| Hunt and Linden | their A* folds discharge and expansion coefficients together (Eq. 5 to 6, C_D about 0.6, 0.5 to 1 for the expansion coefficient). With C_e = C_d it equals sqrt(2) times the series A_eff with Cd; otherwise it is larger (8 percent at C_e = 0.5 and 21 percent at C_e = 1 for equal areas) | O6 p. 709. Linden's own A* (1999 review, 1990 paper): UNCONFIRMED |

Error of the Boussinesq form against the exact inflow of 4.3, for equal areas, H = 3 m, To = 273.15 K (script by the research agent; I checked the 10 K row by hand):

| dT (K) | Ti in the denominator | To in the denominator | Mean T in the denominator |
|---|---|---|---|
| 2 | +0.18 percent | +0.55 percent | +0.37 percent |
| 5 | +0.46 percent | +1.37 percent | +0.91 percent |
| 10 | +0.91 percent | +2.74 percent | +1.81 percent |
| 20 | +1.81 percent | +5.48 percent | +3.60 percent |
| 30 | +2.71 percent | +8.20 percent | +5.35 percent |

The choice matters at about dT / (2 T): 1.8 percent at 10 K and 5.4 percent at 30 K. The exact solution has Q_out / Q_in = Ti / To, so the form with Ti tracks the outdoor-air inflow and the form with To tracks the indoor-air outflow. A Boussinesq solver compared with the exact forms needs a tolerance of at least about dT / (2 T).

### 4.5 TypeScript

```ts
export const G = 9.81;

/** Volume flow through one opening. dP in Pa, rho in kg/m3. Signed by the sign of dP. */
export const orificeFlow = (cd: number, area: number, dP: number, rho: number) =>
	Math.sign(dP) * cd * area * Math.sqrt((2 * Math.abs(dP)) / rho);
/** Effective areas, each e_i = Cd_i * A_i. */
export const seriesArea = (...e: number[]) => 1 / Math.sqrt(e.reduce((s, x) => s + 1 / (x * x), 0));
export const parallelArea = (...e: number[]) => e.reduce((s, x) => s + x, 0);

/** Neutral level as a fraction of H above the lower opening. a1 lower, a2 upper, temperatures in K. */
export const neutralLevelFraction = (a1: number, a2: number, ti: number, to: number) =>
	1 / (1 + (ti / to) * (a1 / a2) ** 2);
/** Outdoor-air inflow volume through the lower opening, Ti above To, exact for ideal gases. */
export const stackInflow = (cd: number, a1: number, a2: number, h: number, ti: number, to: number) =>
	(cd * a1 * a2 * Math.sqrt((2 * G * h * (ti - to)) / ti)) / Math.sqrt(a2 ** 2 + (ti / to) * a1 ** 2);
/** Boussinesq form. dT and tRef in K. */
export const stackBoussinesq = (cd: number, a1: number, a2: number, h: number, dT: number, tRef: number) =>
	cd * ((a1 * a2) / Math.hypot(a1, a2)) * Math.sqrt((2 * G * h * dT) / tRef);
/** Linden-style effective area, sqrt(2) times the series effective area for equal Cd. */
export const aStar = (a1: number, a2: number) => (Math.SQRT2 * a1 * a2) / Math.hypot(a1, a2);
```

## 5. Well-mixed room decay of a particulate or tracer

Tags for this section: C1 (Nazaroff 2004) and C2 (AHAM AC-1-2020) are original documents. A research agent read them on rendered pages or extracted text. I re-checked Nazaroff's Eq. 1 on the page image, and in the extracted AC-1 text I re-checked Eq. 7, sections 3.13 and 3.14, the 1008 ft3 chamber, the sampling schedule, the 0.03 ACH limit and the CADR range limits. Rows marked (agent-read) were not re-read by me. Search-engine summaries were not used.

### 5.1 Mass balance and solution

| Item | Statement | Sources agreeing |
|---|---|---|
| General single-zone balance | d(C_i V)/dt = E + C_o [Q_S (1 - eta_S) + Q_N + Q_L P] - C_i [Q_F eta_F + beta V + (Q_S + Q_N + Q_L)]. Q in m3/h, E in ug/h, beta in 1/h, V in m3. P applies to the leakage flow only, natural ventilation is unattenuated, eta_F is the single-pass efficiency of the recirculating filter flow Q_F | C1 Eq. 1 [P] |
| Steady state | C_i = (E + C_o [...]) / (Q_F eta_F + beta V + sum of Q) | C1 Eq. 2 (agent-read) |
| One-pathway form and solution | dC/dt = P a C_out - (a + k + k_HAC + k_ac) C, C(t) = (P a C_out / lambda)(1 - e^(-lambda t)) + C_0 e^(-lambda t), lambda = a + k + k_HAC + k_ac. a is the air-exchange rate, k the deposition loss rate | C3 Eq. 1 to 4 [R]. C7 gives the same with a source term |
| Chamber decomposition | total decay k_e = k_V + k_dep + k_AC, natural decay k_n = k_V + k_dep, C_t = C_i e^(-k t) | C2 Annex E Eq. 6 to 7 and section 8.2.1 Eq. 1 [P] |
| Case for the solver: no source, clean supply air | dC/dt = -(lambda_vent + lambda_cleaner + lambda_dep) C, so C(t) = C_0 exp(-lambda_tot t). C falls to 36.8 percent of C_0 at t = 1 / lambda_tot | derived from the rows above |

Terms:

| Term | Definition | Sources agreeing |
|---|---|---|
| lambda_vent = Q / V | air-exchange rate, the sum of flows into the building divided by V | C1 p. 6 and Fig. 3 caption |
| lambda_cleaner = Q_F eta_F / V = CADR / V | filter flow times single-pass efficiency, over V. AC-1 defines CADR = V k_AC | C1 Eq. 1, C2 Annex E |
| lambda_dep = beta = (sum over surfaces of v_d A) / V | beta is the first-order deposition loss-rate coefficient. The relation to deposition velocity and area is in the Nazaroff and Cass model in the 1989 thesis (Eq. 5.4). The 2004 paper does not write it | C1 (beta), C5 (relation) |

The combined form dC/dt = P a C_out - (a + k) C + S/V is not printed verbatim in any source read. It is C1 Eq. 1 divided by V [derived]. Coagulation is second order and is excluded from every form above. C1 says it matters at high concentration, and AC-1's natural decay includes agglomeration.

### 5.2 CADR

| Item | Statement | Sources agreeing |
|---|---|---|
| Definition | CADR = V (k_e - k_n). CADR in cubic feet per minute, V the test-chamber volume in cubic feet, k_e the total decay rate with the cleaner on and k_n the natural decay rate with it off, both in 1/min | C2 section 8.4 Eq. 7 [P]. C8 states it in words ("rate on minus natural decay, times 1008") |
| In words | removal rate with the cleaner on, minus the natural decay rate, times the chamber volume. A system-level measure with no linear relationship to airflow itself | C2 section 3.14 [P] |
| SI and per-hour form | CADR [m3/h] = V [m3] (k_e - k_n) [1/h] | derived |
| Getting k | C(t_i) = C_i exp(-k t_i). k from a least-squares regression of ln C on t, k = -slope. Two-point form k = ln(C_1 / C_2) / (t_2 - t_1) | C2 section 8.2 Eq. 1 to 4 (agent-read; Eq. 2 prints the slope without the minus sign). C3 uses the same ln-regression for SF6. Two-point form derived |
| Natural decay | reduction by agglomeration, surface deposition (including sedimentation) and air exchange. Chamber air exchange must be below 0.03 ACH and is left out of the calculation because it cancels in k_e - k_n | C2 sections 3.13 and 4.3 [P] |
| Test schedule | natural-decay and total-decay runs made sequentially on the same day. Counts every 1 min, for 20 min (smoke, dust) or 10 min (pollen), at least 9 usable points for smoke and dust. Chamber 1008 ft3 (10.5 x 12 x 8 ft), which is 28.54 m3 | C2 [P] |
| Test aerosols | smoke 0.10 to 1.0 um at 24,000 to 35,000 per cc, dust 0.5 to 3.0 um at 200 to 400 per cc, pollen 5 to 11 um at 4 to 9 per cc | C2 (smoke concentration [P]; sizes and the other concentrations agent-read) |
| Valid CADR range | 10 to 600 cfm for smoke and dust, 25 to 450 cfm for pollen | C2 section 2 [P] |
| Worked check | smoke data sheet: 1008 (0.22726 - 0.00251) = 226.55 cfm | C2 Annex F (agent-read; arithmetic re-done) |

### 5.3 Unit conversions

| Item | Value | Sources agreeing |
|---|---|---|
| 1 cfm in m3/h | 1.69901079552 (1 ft = 0.3048 m exactly). AC-1 and AHAM print 1.699 | arithmetic. C2 informative note, C8 |
| 1 m3/h in cfm | 0.588577779 | arithmetic |
| Air changes per hour | ACH = Q [m3/h] / V [m3] | definition |
| Rate per second | lambda [1/s] = ACH / 3600 | unit arithmetic |
| Clean-air ACH of a cleaner | CADR / V. With CADR in cfm and V in ft3, ACH = 60 CADR / V | C9 (ACH from smoke CADR times 60 over V). Derived |
| AC-1 chamber | 1008 ft3 = 28.5434 m3. AC-1 prints 28.5 and 28.54, the FAQ prints 28.4 (product of rounded metric dimensions) | arithmetic. C2 Annex A and J, C8 |

### 5.4 Deposition loss-rate coefficients as published

Nazaroff 2004, Fig. 6 (a graph with no table; the curve was digitised by the research agent, so about plus or minus 10 percent). Minimum about 0.047 1/h near 0.14 um.

| Particle diameter (um) | beta (1/h) |
|---|---|
| 0.1 | 0.050 |
| 0.5 | 0.091 |
| 1 | 0.21 |
| 2.5 | 0.86 |
| 5 | 2.6 |
| 10 | about 6.5 to 7, read by eye |

NISTIR 7068 Table 4, measured in an occupied townhouse of about 400 m3 (C3), mean plus or minus SD, central fan off, with fan-on means in the last column:

| Size bin (um) | k_p, fan off (1/h) | k_p, fan on (1/h) |
|---|---|---|
| 0.3 to 0.5 | 0.30 +/- 0.09 | 0.77 |
| 0.5 to 1 | 0.42 +/- 0.18 | 0.97 |
| 1 to 2.5 | 0.78 +/- 0.37 | 1.5 |
| 2.5 to 5 | 1.4 +/- 0.34 | 3.2 |
| 5 to 10 | 2.7 +/- 0.52 | 4.8 |
| above 10 | 5.2 +/- 0.71 | 7.1 |

AC-1 natural-decay data sheets, which include agglomeration and a fan-mixed chamber: smoke (0.1 to 1 um) 0.00251 1/min = 0.151 1/h, dust (0.5 to 3 um) 0.01021 1/min = 0.613 1/h, pollen (5 to 11 um) 0.10849 1/min = 6.51 1/h. Annex J averages are 0.0034, 0.014 and 0.12 1/min (0.204, 0.84 and 7.2 1/h). Annex E gives k_dep = 0.0034 1/min (0.204 1/h) for smoke. (agent-read)

At 0.3 to 0.5 um the sources span 0.05 to 0.09 1/h (Nazaroff, quiet room), 0.204 1/h (AC-1 smoke) and 0.30 1/h (NISTIR 7068, occupied house, which attributes part of the difference to occupancy and central-fan operation). The choice is a modelling decision. Deposition velocities: UNCONFIRMED, no v_d table was read. The equivalent velocity is v_d = beta V / A_surface [derived].

### 5.5 Gravitational settling

| Item | Statement | Sources agreeing |
|---|---|---|
| Stokes settling velocity | v_s = d^2 rho_p g C_c / (18 mu) | C5 Eq. 4.7, C6 Eq. 13 and 37 [R] |
| Cunningham slip factor | C_c = 1 + Kn [1.257 + 0.400 exp(-1.10 / Kn)], Kn = 2 lambda_mfp / d. lambda_mfp = 0.065 um, mu = 1.81e-5 kg/(m s) at 293 K | C5 Eq. 4.4 (Davies form), C6 Eq. 14 to 15 |
| Settling inside v_d | In the Nazaroff and Cass model v_d = v_CP + v_t. v_CP depends on orientation: vertical (2/pi) sqrt(D K_e), upward-facing v_g / [1 - exp(-(pi/2) v_g / sqrt(D K_e))], downward-facing v_g / [exp((pi/2) v_g / sqrt(D K_e)) - 1]. For large particles v_d tends to v_g on upward-facing surfaces and to 0 on downward-facing ones | C5 Table 5.1 (agent-read) |
| Floor settling loss rate | lambda_settle = v_s A_floor / V = v_s / H when V = A_floor H. A lower bound, since other upward-facing surfaces also collect particles | derived from C5 Eq. 5.4 |
| Double counting | beta (C1) and AC-1 natural decay already include settling, so v_s / H must not be added on top of a measured or tabulated beta | C1, C2 section 3.13 |

Computed table (derived), rho_p = 1000 kg/m3, H = 2.4 m. The particle Reynolds number at 10 um is about 0.002, so Stokes flow applies. No source tabulates these values.

| d (um) | C_c | v_s (m/s) | v_s / H (1/h) |
|---|---|---|---|
| 0.1 | 2.857 | 8.60e-7 | 0.0013 |
| 0.3 | 1.558 | 4.22e-6 | 0.0063 |
| 0.5 | 1.328 | 1.00e-5 | 0.0150 |
| 1 | 1.1634 | 3.50e-5 | 0.0525 |
| 2 | 1.0817 | 1.303e-4 | 0.195 |
| 2.5 | 1.0654 | 2.005e-4 | 0.301 |
| 5 | 1.0327 | 7.774e-4 | 1.166 |
| 10 | 1.0163 | 3.060e-3 | 4.59 |

### 5.6 TypeScript

```ts
/** AHAM AC-1 CADR and single-zone decay. Use one time unit throughout (per second, per minute or per hour). */
export const FT3_IN_M3 = 0.3048 ** 3; // 0.028316846592 m3, exact
export const CFM_TO_M3H = FT3_IN_M3 * 60; // 1.69901079552
export const M3H_TO_CFM = 1 / CFM_TO_M3H; // 0.588577779
export const AC1_CHAMBER_FT3 = 1008; // 28.5434 m3

/** CADR = V (k_e - k_n). V in ft3 and k per minute give cfm. V in m3 and k per hour give m3/h. */
export const cadr = (volume: number, kTotal: number, kNatural: number) => volume * (kTotal - kNatural);
/** Decay constant from two samples of a decaying concentration. */
export const decayConstant = (c1: number, c2: number, t1: number, t2: number) => Math.log(c1 / c2) / (t2 - t1);
/** Total loss rate, no source and clean supply air. flows and v_d * A in volume per time, volume in the same volume unit. */
export const lambdaTotal = (ventFlow: number, cadrFlow: number, vDeposition: number, surfaceArea: number, volume: number) =>
	(ventFlow + cadrFlow + vDeposition * surfaceArea) / volume;
export const concentration = (c0: number, lambda: number, t: number) => c0 * Math.exp(-lambda * t);
export const achToPerSecond = (ach: number) => ach / 3600;

/** Cunningham slip factor and Stokes settling velocity, SI units. */
export const cunningham = (d: number, meanFreePath = 0.065e-6) => {
	const kn = (2 * meanFreePath) / d;
	return 1 + kn * (1.257 + 0.4 * Math.exp(-1.1 / kn));
};
export const settlingVelocity = (d: number, rhoParticle = 1000, mu = 1.81e-5, g = 9.81) =>
	(d * d * rhoParticle * g * cunningham(d)) / (18 * mu);
export const floorSettlingRate = (vs: number, roomHeight: number) => vs / roomHeight;
```

Not read: ASTM E741 (paywalled; AC-1 and C3 describe the same decay technique), Thatcher and Layton (1995), Thatcher et al. (2002), Lai and Nazaroff (2000), Offermann et al. (1985) and Shaughnessy and Sextro (2006) beyond abstracts or secondhand summaries, and Nazaroff's "Indoor bioaerosol dynamics" (the fetch tool refused that page).

## Gaps and uncertainty

1. Original Ghia et al. (1982) paper: not read. Both tables rest on independent transcriptions that agree except at v(x = 0.9063), where -0.5155 (G4, G5) is preferred to -0.51500 (G3). Ghia's Table III secondary-vortex values: UNCONFIRMED.
2. de Vahl Davis Table V was read on the scan, so it is first-hand. Hortmann, Le Quere, Mayne and Sharma numbers are read in later papers and pages, not in their originals. On the ERCOFTAC page (D7) the last Hortmann column is labelled "Numax" and the mean-Nu column header is an image; the page text says the table lists the mean and peak Nusselt numbers, and the mean column agrees with D4 (2.245, 4.522, 8.825) and the peak column with Mayne to 0.15 percent or better. D6 labels one Hortmann Nu_0 value 4.52188 at Ra = 1e5, against 4.52164 on D7; the 5th-digit difference is unresolved. Hortmann has no Ra = 1e3 values in the sources read, so Ra = 1e3 has no refined Nu_avg here; use 1.118.
3. Round jet: B, S and x0 come from secondary compilations. Wygnanski and Fiedler's B is 5.70 in J14 and 5.4 in J2 (unresolved against the paper). Pope's text, Fischer et al., Awbi and the ASHRAE chapter were not read. No accepted potential-core length. The R&S "x/d above 6" limit is UNCONFIRMED. No B, x0 or S for a fan jet was found.
4. Orifice and stack: the ASHRAE Handbook chapter was not read in any edition, so its edition, equation numbers, Cd statements, unequal-area treatment and printed pressure-difference form are UNCONFIRMED. The ASHRAE Cd fit 0.40 + 0.0045 dT is known only from the EnergyPlus and DesignBuilder pages. Linden (1999) and Linden, Lane-Serff and Smeed (1990) were not read, so Linden's own A* is UNCONFIRMED. The neutral-level formula with the Ti/To factor is confirmed from O1 and O7 plus my derivation. CIBSE AM10 and Etheridge and Sandberg were not read. The parallel-area sum has one read source (O11) plus the trivial derivation. Windows have no single Cd: published values span about 0.2 to 1.0.
5. Well-mixed decay: ASTM E741, Thatcher and Layton (1995), Thatcher et al. (2002), Lai and Nazaroff (2000), Offermann et al. (1985) and Shaughnessy and Sextro (2006) were not read beyond abstracts. Nazaroff (2004) has no loss-rate table, so the Fig. 6 values were digitised (about 10 percent). No deposition-velocity table was read. The Stokes settling values are computed, not tabulated in a source. The mass balance with a source term in the form P a C_out - (a + k) C + S/V is derived, not printed.
6. Several hosts could not be reached (repository.hku.hk, ocw.snu.ac.kr, Adelaide's repository, torroja.dmt.upm.es, thermalscience.vinca.rs) and several fetches were refused (HTTP 403); the sources that depended on them were not used.

## Sources

Section 1.
- G1. Ghia, Ghia, Shin (1982), J. Comput. Phys. 48, 387-411, DOI 10.1016/0021-9991(82)90058-4. https://www.sciencedirect.com/science/article/abs/pii/0021999182900584 (not read).
- G2. Povitsky, "Mixing in Three-dimensional Cavity by Moving Cavity Walls", appendix tables A-1 (Ghia Table 1 p. 398, Botella Table 9, Fluent) and A-2 (primary vortex, Ghia p. 408). https://arxiv.org/pdf/1807.04896 (read pages 28 to 29).
- G3. Transcription of Ghia Tables I and II, all Re. https://gist.github.com/ivan-pi/3e9326d18a366ffe6a8e5bfda6353219 (Table I) and https://gist.github.com/ivan-pi/caa6c6737d36a9140fbcf2ea59c78b3c (Table II).
- G4. Course repository CSVs. https://raw.githubusercontent.com/PN-CourseWork/02689-AdvancedNumericalAlgorithmP3/main/data/validation/ghia/ghia_Re1000_u_centerline.csv and https://raw.githubusercontent.com/PN-CourseWork/02689-AdvancedNumericalAlgorithmP3/main/data/validation/ghia/ghia_Re1000_v_centerline.csv (repository https://github.com/PN-CourseWork/02689-AdvancedNumericalAlgorithmP3).
- G5. University of Bonn, NaSt3DGP applications page, Re = 1000 tables (Ghia as column [1], Botella and Peyret as [2], mirrored frame). https://www.ins.uni-bonn.de/media/public/u/griebel/NaSt3DGP/applications.html
- G6. Erturk, Corke, Gokcol, "Numerical Solutions of 2-D Steady Incompressible Driven Cavity Flow at High Reynolds Numbers", arXiv v3, June 2005. https://arxiv.org/pdf/cs/0411047 (Tables 1 and 5).
- G7. Erturk and Gokcol, "Fourth Order Compact Formulation of Navier-Stokes Equations and Driven Cavity Flow at High Reynolds Numbers", arXiv v2, December 2005. https://arxiv.org/pdf/cs/0411049 (Table 2).
- G8. Gerris test case, digitised Ghia profiles. https://gerris.dalembert.upmc.fr/gerris/tests/tests/lid/xprof.ghia and https://gerris.dalembert.upmc.fr/gerris/tests/tests/lid/yprof.ghia
- Botella and Peyret (1998), Computers and Fluids 27, 421-433: cited through G2 and G5, not read.

Section 2.
- D1. de Vahl Davis (1983), Int. J. Numer. Meth. Fluids 3, 249-264, DOI 10.1002/fld.1650030305. Scanned copy read: https://elearning.univ-bejaia.dz/mod/resource/view.php?id=71697
- D2. Wan, Patnaik, Wei (2001), Numer. Heat Transfer B 40, 199-228. https://users.math.msu.edu/users/weig/paper/p59.pdf
- D3. Fedyushkin, "Convection and Stratification of Temperature and Concentration", Table 1 (benchmark solution, with velocities and stream function divided by Pr, i.e. on the nu/L scale). https://arxiv.org/pdf/2402.06793
- D4. Gjesdal, Wasberg, Andreassen, "Spectral element simulations of buoyancy-driven flow", Table 1. https://arxiv.org/pdf/physics/0305049
- D5. Lallemand and Dubois, "Comparison of Simulations of Convective Flows", Table 1 (de Vahl Davis and Le Quere Nu). https://arxiv.org/pdf/1401.0188
- D6. Schupbach and Premnath, "Fokker-Planck Model Based Central Moment Lattice Boltzmann Method for Effective Simulations of Thermal Convective Flows", Tables 2 to 5 (columns: de Vahl Davis finest mesh, Hortmann, Dixit and Babu, Sharma). https://arxiv.org/pdf/2504.09041
- D7. ERCOFTAC UFR 4-10 description, Hortmann et al. Table 1. https://kbwiki.ercoftac.org/w/index.php/UFR_4-10_Description
- D8. Markatos and Pericleous (1984), Int. J. Heat Mass Transfer 27, 755-772, Table 2 (column "de Vahl Davis' solution"). Scanned copy read: https://elearning.univ-bejaia.dz/mod/resource/view.php?id=71699
- Hortmann, Peric, Scheuerer (1990), Int. J. Numer. Meth. Fluids 11, 189-207, DOI 10.1002/fld.1650110206 (not read). Le Quere (1991), Computers and Fluids 20(1), pages 29-41 in most reference lists, 19-41 in some (not read). Mayne, Usmani, Crapper (2000), Int. J. Numer. Methods Heat Fluid Flow 10, 598-615 (D2 reference 10, not read). Sharma, Straka, Tavares (2018), Int. J. Thermal Sciences 134, 552-564 (D6 reference 46, not read). Dixit and Babu (2006), Int. J. Heat Mass Transfer 49, 727-739 (D6 reference 63, not read).

Section 3.
- J1. Pope (2000), Turbulent Flows, ch. 5, via https://arxiv.org/pdf/0912.4847 (B = 5.8, eq. 5.6 as quoted) and https://stern.lab.uiowa.edu/sites/stern.lab.uiowa.edu/files/2025-11/Chapter-7-Free-Shear-Flows-Part-1-final.pdf (S = 0.094 derivation, momentum conservation). The book itself was not read.
- J14. Kiran, Ayanian, Breuer, "The Structure of Merging Turbulent Jets Beneath a Small Quadrotor", Table 1 (B, S, abs(z0)/D, Re of experiments and simulations) and introduction (consensus band). https://arxiv.org/pdf/2608.30900
- J2. Bhatia and De, "Numerical Study of Trailing and Leading Vortex Dynamics in a Forced Jet with Coflow", Table 1 of decay constants and eq. 13 to 14. https://arxiv.org/pdf/2101.08749
- J3. Yang and Xu, "Wave-Particle Turbulence Simulation of Spatially Developing Round Jets: Turbulent Flow Modeling and Method Validation", Table 1 and eq. 18. https://arxiv.org/pdf/2507.14524
- J4. Varadharajan et al., "Reynolds number effects on transition, turbulence intensity and axial-velocity decay rate of turbulent round jets" (LES), Table 1 and eq. 9. https://arxiv.org/pdf/1708.03140
- J5. Diwan, Narasimha, Bhat, Sreenivas, "Laboratory Investigations of the Dynamics of Anomalous Entrainment in Cumulus-cloud flows", Table 1 (spreading rates and entrainment coefficients of classical round jets) and text. https://arxiv.org/pdf/1911.10828
- J6. Cambridge Core abstracts [A]: Wygnanski and Fiedler 1969 https://www.cambridge.org/core/journals/journal-of-fluid-mechanics/article/some-measurements-in-the-selfpreserving-jet/39C9ADF2BEBD93C3F0E984C32396CF81 ; Hussein, Capp, George 1994 https://www.cambridge.org/core/journals/journal-of-fluid-mechanics/article/velocity-measurements-in-a-highreynoldsnumber-momentumconserving-axisymmetric-turbulent-jet/9604A42E400A9F5BC0C29C7C2E1732A3 ; Panchapakesan and Lumley 1993 https://www.cambridge.org/core/journals/journal-of-fluid-mechanics/article/turbulence-measurements-in-axisymmetric-jets-of-air-and-helium-part-1-air-jet/2E18364EB919B3F5747178E7ADC6432A ; Ricou and Spalding 1961 https://www.cambridge.org/core/journals/journal-of-fluid-mechanics/article/measurements-of-entrainment-by-axisymmetrical-turbulent-jets/73EEC5773E9A7ABBF18FF4F7DB2FEE09 ; Mi, Nobes, Nathan 2001 https://www.cambridge.org/core/journals/journal-of-fluid-mechanics/article/abs/influence-of-jet-exit-conditions-on-the-passive-scalar-field-of-an-axisymmetric-free-jet/BF3FF0213B7DEE9B7189098A056A51EF
- J7. Entrainment definitions and coefficients. https://arxiv.org/pdf/1605.08036 and https://arxiv.org/pdf/1903.01906
- J8. Potential core. https://arxiv.org/pdf/1705.08723 ; https://arxiv.org/pdf/1809.02496 ; https://ntrs.nasa.gov/api/citations/19930018245/downloads/19930018245.pdf
- J9. Shiri, George, Naughton (2008), AIAA J. 46(8), 2002-2009, abstract [A]. https://research.chalmers.se/en/publication/73243
- J10. Li, Zhang, Zhivov, Christianson (1993), ASHRAE Transactions 99(1), CH-93-12-1, literature review of diffuser air jets. https://www.aivc.org/sites/default/files/airbase_6532.pdf
- J11. Nielsen and Moller, buoyant wall jet measurements in air-conditioned rooms (AIVC 2753). https://www.aivc.org/sites/default/files/airbase_2753.pdf
- J12. Yue and Malmstrom, sampling time for air jet velocity measurements (AIVC 12128). https://www.aivc.org/sites/default/files/airbase_12128.pdf
- J13. Nielsen (1988), Simplified Models for Room Air Distribution, Aalborg University. https://vbn.aau.dk/ws/files/197502919/Simplified_Models_for_Room_Air_Distribution.pdf

Section 4.
- O1. Klote, "A General Routine for Analysis of Stack Effect", NISTIR 4588 (1991), printed pages 4 to 7, Eqs. 6, 7, 8, 10. https://nvlpubs.nist.gov/nistpubs/Legacy/IR/nistir4588.pdf
- O2. Liddament, AIVC "Guide to Ventilation" (1996), pages 225, 232, 236. https://www.aivc.org/sites/default/files/members_area/medias/pdf/Guides/GU03%20GUIDE%20TO%20ENERGY%20EFFICIENT%20VENTILATION.pdf
- O3. Dols and Polidoro, CONTAM User Guide and Program Documentation v3.4, NIST TN 1887 Rev. 1 (2020), printed pages 61, 65, 263 to 264, 275 (Eqs. 20 and 69). https://nvlpubs.nist.gov/nistpubs/TechnicalNotes/NIST.TN.1887r1.pdf
- O4. Jones, Cook, Fitzgerald, Iddon, "A review of ventilation opening area terminology", Energy and Buildings 118 (2016), accepted manuscript, Eqs. 1 to 11. https://www.repository.cam.ac.uk/handle/1810/254154
- O5. Swami and Chandra, "Procedures for Calculating Natural Ventilation Airflow Rates in Buildings", ASHRAE RP-448 final report FSEC-CR-163-86 (1987), pages 1-16 and 2-22 (read by OCR). https://www.fsec.ucf.edu/en/publications/pdf/FSEC-CR-163-86.pdf
- O6. Hunt and Linden, Building and Environment 34 (1999) 707-720, page 709, Eqs. 5 to 6. https://www.aivc.org/sites/default/files/airbase_12435.pdf
- O7. Zueter, Dalaq, Daqaq, arXiv 2510.09639, Eqs. 2 to 7. https://arxiv.org/pdf/2510.09639
- O8. Mayoraz and Flynn, arXiv 1809.05963, Eqs. 5, 10, 13. https://arxiv.org/pdf/1809.05963
- O9. Heiselberg, Svidt, Nielsen, "Windows - Measurements of Air Flow Capacity", ROOMVENT 2000, pages 749-754 (AIVC airbase 13332). https://www.aivc.org/sites/default/files/airbase_13332.pdf
- O10. Karava, Stathopoulos, Athienitis, "Natural ventilation openings - a discussion of discharge coefficients", Concordia University (year not printed). https://www.irbnet.de/daten/iconda/CIB1749.pdf
- O11. Awbi, "Basic concepts for natural ventilation of buildings", CIBSE seminar, 19 May 2010, slides 6 and 13 to 16. https://www.cibse.org/media/mtrlmv25/01-hazim-awbi-university-of-reading-basic-concepts-for-natural-ventilation-of-buildings-1.pdf
- O12. EnergyPlus Engineering Reference, Infiltration/Ventilation (fetch-tool summary only). https://bigladdersoftware.com/epx/docs/9-1/engineering-reference/infiltration-ventilation.html and https://bigladdersoftware.com/epx/docs/8-3/engineering-reference/infiltration-ventilation.html
- O13. DesignBuilder help, calculated natural ventilation options (fetch-tool summary only). https://designbuilder.co.uk/helpv5.2/Content/Calculated_Natural_Ventilation_Options.htm

Section 5.
- C1. Nazaroff, "Indoor Particle Dynamics", Indoor Air 14 (Suppl. 7), 2004. https://escholarship.org/content/qt7sq4x34d/qt7sq4x34d.pdf
- C2. ANSI/AHAM AC-1-2020, Method for Measuring Performance of Portable Household Electric Room Air Cleaners. https://law.resource.org/pub/us/cfr/ibr/inc/ansi/aham.ac-1.2020.pdf
- C3. Howard-Reed, Wallace, Emmerich, "Deposition Rates of Fine and Coarse Particles in Residential Buildings", NISTIR 7068 (2003). https://nvlpubs.nist.gov/nistpubs/Legacy/IR/nistir7068.pdf
- C4. Dols, "Ventilation Characterization of the CPSC Combustion Test Chamber", NISTIR 4415 (1990). https://nvlpubs.nist.gov/nistpubs/Legacy/IR/nistir4415.pdf
- C5. Nazaroff, "Mathematical Modeling and Control of Pollutant Dynamics in Indoor Air", Caltech PhD thesis (1989); chapter 5 is the Nazaroff and Cass model. https://thesis.caltech.edu/576/5/nazaroff-ww_1989.pdf
- C6. Sippola and Nazaroff, particle deposition from turbulent flow, LBNL-51432 (2002). https://www.osti.gov/servlets/purl/815478
- C7. Jaisinghani, Ruth, Bugli, "The effectiveness of air cleaners using an environmental tobacco smoke material balance model" (AIVC 4199; venue and year not in the text read). https://www.aivc.org/sites/default/files/airbase_4199.pdf
- C8. AHAM, Air Cleaner Performance FAQs (2020). https://ahamverifide.org/wp-content/uploads/2020/06/Air-Cleaner-Performance-FAQs.pdf
- C9. AHAM, white paper "Portable Air Cleaners and Air Changes per Hour" (October 2021). https://ahamverifide.org/wp-content/uploads/2021/11/White-Paper-Portable-Air-Cleaners-and-AIr-Changes-per-Hour-FINAL-00106301.pdf
- Abstract only, not used for numbers: Thatcher et al. (2002) https://indoor.lbl.gov/publications/effects-room-furnishings-and-air ; Thatcher and Layton (1995) https://energyanalysis.lbl.gov/publications/deposition-resuspension-and ; Lai and Nazaroff (2000) https://hero.epa.gov/reference/12270 ; Offermann et al. (1985) https://www.osti.gov/biblio/876192 ; Shaughnessy and Sextro (2006) https://eta-publications.lbl.gov/bibcite/reference/22497
