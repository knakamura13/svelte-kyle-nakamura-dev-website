# Devices and particulates: source-verified numbers

- **Date:** 2026-10-07, with sections 6 and 7 researched on 2026-10-14 (issue 48)
- **Verification method:** each value below was read directly from the cited manufacturer page or the PDF's text layer in this session. Search-engine snippets and retailer listings were not accepted as confirmation. Values marked **derived** are arithmetic on confirmed values, and the working is shown.
- **Status:** the session ended part-way through. Sections 1 (partial), 3 (partial) and the fan-face velocity in 5 are confirmed. Everything else is marked **UNCONFIRMED**, with the reason, except sections 6 and 7, which were completed on 2026-10-14: each number the simulation uses for smoke and for particle settling and deposition has its source, its working and its uncertainty there, and what could not be read is listed under it.
- **Units:** inches and CFM as published, with SI beside them (1 in = 0.0254 m; 1 CFM = 0.000471947 m³/s).

## 1. Box fans, 20 inch, 3 speeds

### Air King 9723, 20" Commercial Grade Box Fan (confirmed, all three speeds)

Source: Air King spec sheet 9723, "Updated 3-23": https://www.airkinglimited.com/wp-content/uploads/2020/09/9723spec1.pdf

| Quantity | High | Medium | Low | Units | Notes |
|---|---|---|---|---|---|
| Airflow | 2163 | 1900 | 1463 | CFM | Test standard not stated on the sheet |
| Airflow (SI) | 1.0208 | 0.8967 | 0.6905 | m³/s | derived |
| Speed | 1220 | 1075 | 855 | RPM | |
| Current | 0.94 | 0.72 | 0.56 | A | 120 V |
| Power | 105 | 87 | 65 | W | |
| Sound | 60 | 55 | 51 | dB(A) | |

| Quantity | Value | Units | Notes |
|---|---|---|---|
| Blade size | 20 (0.508 m) | in | "Blade Size 20"" |
| Product dimensions | 21.38 L x 6.38 W x 22.5 H | in | In the drawing, 21.38 is the width across the face and 6.38 is the depth along the airflow |
| Product dimensions (SI) | 0.543 x 0.162 x 0.572 | m | derived |
| Motor | 3-speed, 1/25 HP, 120 V, PSC | | |
| Shipping weight | 11.4 | lb | |

### Lasko B20548, Pro Power 20" Box Fan (confirmed for High only)

Source: Lasko product page, Overview and Specifications sections: https://lasko.com/products/lasko-pro-power-20-box-fan-3-speed-weather-resistant-motor

| Quantity | Value | Units | Notes |
|---|---|---|---|
| Airflow, High | 2,000 (0.9439 m³/s) | CFM | "moves up to 2,000 CFM of air on high speed"; no test standard stated |
| Airflow, Medium and Low | UNCONFIRMED | CFM | Lasko publishes only the High figure |
| Current | 0.6 to 1 | A | Published as a range across speeds |
| Power | 65 to 90 | W | "Energy Output 65 W to 90 W" |
| Height x depth x width | 22.5 x 4.75 x 21.5 | in | Product Height, Product Length/Depth, Product Width |
| Height x depth x width (SI) | 0.572 x 0.121 x 0.546 | m | derived |
| Blade diameter | 20 | in | From the product name and the store's "⌀ 20"" tag |
| Weight | 10.0 | lb | |

### Lasko Cool Colors 20" Box Fan, B20301/B20308/B20312 (High only, dimensions not read)

Source: Lasko store product description: https://lasko.com/products/lasko-cool-colors-20-box-fan-3-speed-weather-resistant-motor

| Quantity | Value | Units | Notes |
|---|---|---|---|
| Airflow, High | 1,725 | CFM | "moves up to 1,725 CFM" |
| Medium, Low, power, dimensions | UNCONFIRMED | | The specifications section was not read before the session ended |

### Other candidates checked (not usable yet)

| Model | Status | Reason |
|---|---|---|
| Lasko 3733 | UNCONFIRMED | Lasko's product page for the 3733 returned HTTP 404 on 2026-10-07. Retailer listings disagree (1,710 to 1,820 CFM), so none of their figures is used. |
| Hurricane Classic 20" (Hydrofarm HCN736501) | UNCONFIRMED | hydrofarm.com could not be loaded (TLS certificate error). A search snippet reports 2,400 CFM and 1,100 RPM at High, but this was not verified. Use it only as a lead. |
| Maxx Air (Ventamatic) HVFF 20 | UNCONFIRMED | Retailer-only figures. It is also a tilting floor fan, not a box fan. |

## 2. Oscillating pedestal fans, 12 to 18 inch

UNCONFIRMED: not researched before the session ended. Leads:
- Air King lists pedestal-fan spec sheets (9119, 9124, 9125, 9126, 9130, 9135, 9170, 9171, 9174, 9175, 9418, 9420, 99532, 99533) at https://www.airkinglimited.com/spec-sheets-and-user-manuals/. Their blade sizes were not checked; several are industrial models of 20 inches or more.
- The Lasko store's JSON (`/collections/<collection>/products.json`) returns product text, and each product page carries a Specifications block (current, wattage, dimensions). Lasko publishes only a single maximum CFM.

## 3. Window fans, reversible for intake and exhaust

Air King's window-fan product page states for both models that "The fan can be set for intake or exhaust": https://www.airkinglimited.com/?p=990. Separate intake and exhaust CFM are not published; one value per speed is given.

### Air King 9155, 16" Window Fan (confirmed)

Source: Air King spec sheet 9155, "Updated 3-23": https://www.airkinglimited.com/wp-content/uploads/2020/09/9155Spec1.pdf

| Quantity | High | Medium | Low | Units |
|---|---|---|---|---|
| Airflow | 2470 | 1700 | 1360 | CFM |
| Airflow (SI) | 1.1657 | 0.8023 | 0.6418 | m³/s (derived) |
| Speed | 1370 | 1140 | 855 | RPM |
| Current | 0.8 | 0.6 | 0.5 | A |
| Power | 90 | 65 | 52 | W |
| Sound | 64 | 50 | 47 | dB(A) |

| Quantity | Value | Units | Notes |
|---|---|---|---|
| Blade diameter | 16 (0.406 m) | in | From the title "16" Window Fan"; ABS blade |
| Window size requirement | 26.5 to 34.5 wide x 22 high | in | Side panels extend across this range |
| Product dimensions | 26.5 L x 8.25 W x 22 H | in | W is the depth through the window |
| Product dimensions (SI) | 0.673 (to 0.876) x 0.210 x 0.559 | m | derived |
| Motor | 3-speed, 1/6 HP, 120 V, PSC | | |
| Shipping weight | 15 | lb | |

### Air King 9166 (product page: 9166F), 20" Whole House Window Fan (confirmed)

Source: Air King spec sheet 9166, "Updated 1-24": https://www.airkinglimited.com/wp-content/uploads/2020/09/9166Spec1.pdf

| Quantity | High | Medium | Low | Units |
|---|---|---|---|---|
| Airflow | 3560 | 3120 | 2510 | CFM |
| Airflow (SI) | 1.6801 | 1.4725 | 1.1846 | m³/s (derived) |
| Speed | 1600 | 1450 | 1100 | RPM |
| Current | 1.4 | 1.2 | 1.0 | A |
| Power | 170 | 145 | 115 | W |
| Sound | 64 | 57 | 50 | dB(A) |

| Quantity | Value | Units | Notes |
|---|---|---|---|
| Blade diameter | 20 (0.508 m) | in | From the title "20" Whole House Window Fan"; steel blade |
| Window size requirement | 27 to 38 wide x 26.25 high | in | The sheet's drawing labels the width 26.75" to 37.75", which does not match the text |
| Product dimensions | 26.75 L x 11.25 W x 26.25 H | in | |
| Product dimensions (SI) | 0.679 x 0.286 x 0.667 | m | derived |
| Motor | 3-speed, 1/6 HP, 120 V, PSC, totally enclosed | | |
| Shipping weight | 36.6 | lb | |

### Third model

| Model | Status | Reason |
|---|---|---|
| Lasko 2155A, 16" electrically reversible | UNCONFIRMED | Lasko's product page returned HTTP 404. A search snippet reports 0.4 to 0.8 A, 52 to 86 W and no CFM. Not verified. |
| Lasko 2138 twin window fan | UNCONFIRMED | Lasko's product page returned HTTP 404. Retailer CFM figures conflict. |

## 4. Room air purifiers (small, medium, large)

Superseded by the third pass at the end of this note (2026-10-14, issue 57), which lists three models with their CADR, sources and what could not be confirmed. The leads below were the state of the first pass and are kept for the record; none of them is a CADR value.

- **Best lead for CADR at each fan speed:** PNNL-38694, Keene, Ormanova, Tuenge, McNulty and Arnold, "Laboratory Testing of Portable Air Cleaner Products for Energy Efficiency and Clean Air Performance at Various Fan Settings", Pacific Northwest National Laboratory, 2026-05-22. The project page says it reviewed 34 portable air cleaners and tested 7 per AHAM AC-7 at several fan settings. Page: https://www.pnnl.gov/publications/laboratory-testing-portable-air-cleaner-products-energy-efficiency-and-clean-air. PDF: https://www.pnnl.gov/main/publications/external/technical_reports/PNNL-38694.pdf. The PDF was retrieved, but its tables were not extracted. It is a DOE national-laboratory technical report, not peer-reviewed.
- **Still to check:** smoke CADR at High from the AHAM Verifide directory (ahamverifide.org) or the ENERGY STAR Room Air Cleaners dataset (data.energystar.gov), and inlet/outlet geometry from the manufacturer pages.

## 5. Fan performance curve shape

| Item | Value | Units | Source |
|---|---|---|---|
| Shut-off static pressure, household axial fans | UNCONFIRMED | Pa | No source found. No box- or window-fan maker in sections 1 and 3 publishes a pressure rating. |
| Quadratic form dP = dP_max·(1 − (Q/Q_max)²) | UNCONFIRMED | | No citable source located yet |

Mean velocity at the fan face is **derived** from the confirmed specs. It is rated CFM divided by the swept disk area π·D²/4, with the hub not subtracted, so the true annulus velocity is higher. A 20" disk is 2.182 ft² (0.2027 m²); a 16" disk is 1.396 ft² (0.1297 m²).

| Model | Speed | Rated CFM | Face velocity, ft/min | Face velocity, m/s |
|---|---|---|---|---|
| Air King 9723 (20") | High / Med / Low | 2163 / 1900 / 1463 | 991 / 871 / 671 | 5.04 / 4.42 / 3.41 |
| Lasko B20548 (20") | High | 2000 | 917 | 4.66 |
| Air King 9155 (16") | High / Med / Low | 2470 / 1700 / 1360 | 1769 / 1218 / 974 | 8.99 / 6.19 / 4.95 |
| Air King 9166 (20") | High / Med / Low | 3560 / 3120 / 2510 | 1632 / 1430 / 1151 | 8.29 / 7.26 / 5.84 |

## 6. Airborne particle mass modelling constants (PM2.5)

Researched 2026-10-14 (issue 48), from the papers and reports named below, each read in full unless a row says "abstract only". The simulation carries PM2.5 as one lumped mass, and two speeds act on it. `settling` is the still-air gravitational settling speed: it carries mass down through every open face and removes it at floors and furniture tops. `deposition` is the surface deposition speed: it removes mass at every solid face (walls, floor, ceiling and furniture). In a closed, well-mixed room the two give a first-order loss rate k = v_d·A/V + v_s·A_floor/V, where A is the interior surface area, A_floor the floor area and V the volume. For the reference room used below (3 m × 4 m × 2.4 m: A = 57.6 m², A_floor = 12 m², V = 28.8 m³; A/V = 2.000 per metre, A_floor/V = 0.4167 per metre) that is k = 7200·v_d + 1500·v_s per hour, with the speeds in m/s. The code is `PARTICLE` in `src/lib/experiments/airflow/sim/world.ts`, and `tests/solver/particle-constants.spec.ts` holds it to the number in the "Used" column. The same spec runs the solver in a sealed, well-mixed 3 m × 3 m × 2.4 m room and finds the loss rate of that formula within 2 % (measured 0.4331 per hour against 0.4350, with `PARTICLE` as it is), and with the solver's settling set to zero it reads 89 % of the formula, so the formula describes what the simulation does.

| Constant | Used (m/s) | Source and where | Working | Uncertainty |
|---|---|---|---|---|
| `settling` | 3e-5 | Flagan and Seinfeld 1988, *Fundamentals of Air Pollution Engineering*, ch. 5, Eq. 5.30 p. 299 and the table on p. 300; Kim, Mulholland, Kukuck and Pui 2005, J. Res. NIST 110: 31-54, Table 1 p. 33 (the Allen and Raabe 1985 slip constants), Eqs. 9 and 11, pp. 34-35 (air viscosity and mean free path); John, Wall, Ondo and Winklmayr 1989, CARB contract A6-112-32, Table 2 (PDF p. 35) | v_s = 1000·d²·g·C_c/(18·µ) with C_c = 1 + Kn·(1.142 + 0.558·exp(−0.999/Kn)), Kn = 2λ/d, λ = 66.42 nm, µ = 1.8181e-5 kg/(m·s) at 20 °C, g = 9.80665 m/s². Averaged by mass over the SCAQS PM2.5 modes cut at 2.5 µm (summer 0.2, 0.7 and 4.4 µm; fall 0.2, 0.7 and 5.5 µm): 3.09e-5 m/s (summer), 2.56e-5 (fall), 2.4e-5 to 2.5e-5 without the coarse tail. Rounded to 3e-5, the speed of a 0.9 µm unit-density sphere (1.0 µm: 3.45e-5, and 3.5e-5 as Flagan and Seinfeld print it at 298 K) | A factor of 3 either way (1e-5 to 1e-4 m/s), from the unknown size distribution; fresh smoke (median 0.2 µm) settles at about 5e-6 m/s; the constants and air properties add under 2 %. The earlier 1.2e-4 is the speed of a 1.9 µm sphere |
| `deposition` | 5e-5 | Howard-Reed, Wallace and Emmerich 2003, NISTIR 7068, Table 4 p. 16 (central fan off) and p. 2 (a townhouse of about 400 m³); Wallace 1996, J. Air Waste Manage. Assoc. 46: 98-126, abstract (k = 0.39 per hour for fine particles, abstract only); Thatcher, Lai, Moreno-Jackson, Sextro and Nazaroff 2002, Atmos. Environ. 36: 1811-1819, p. 12 of the LBNL-48414 manuscript (2 to 4 m² of surface per m³ in real rooms) | Target: a total surface loss of k = 0.40 per hour for lumped PM2.5 in a home without a forced-air fan (0.39 per hour in the Riverside study; 0.42 per hour at 0.5 to 1 µm and 0.41 to 0.48 over 0.3 to 2.5 µm in NISTIR 7068). Measured rates include settling, so v_d = (k/3600 − v_s·A_floor/V)/(A/V) = (0.40/3600 − 3e-5 × 0.4167)/2.000 = 4.9e-5, rounded to 5e-5. Check: 7200 × 5e-5 + 1500 × 3e-5 = 0.36 + 0.045 = 0.405 per hour | The total loss is good to a factor of 2.5 (0.15 to 1.0 per hour across occupied homes without a forced-air fan), so v_d runs from about 1e-5 to 1.1e-4 m/s; it is an effective speed that absorbs furniture area; one lumped speed hides a 2.6- to 14-fold rise in loss rate from 0.3 to 2.5 µm |

### 6.1 Settling speed

The settling speed of a particle of aerodynamic diameter d in still air is v_s = ρ·d²·g·C_c/(18·µ) with ρ = 1000 kg/m³ (aerodynamic diameter is defined against unit density, so no other density enters), Flagan and Seinfeld 1988 Eq. 5.30 p. 299. The Cunningham slip correction is C_c = 1 + Kn·(α + β·exp(−γ/Kn)) with Kn = 2λ/d (Flagan and Seinfeld Eq. 5.13 p. 296; Kim et al. 2005 Eqs. 2 and 3 p. 32).

| Quantity | Value as printed | Where |
|---|---|---|
| Slip constants α, β, γ, Allen and Raabe 1985 (polystyrene spheres, Kn 0.03 to 7.2) | 1.142, 0.558, 0.999 | Kim et al. 2005, Table 1 p. 33 (second-hand: the original paper was not readable) |
| Slip constants, Kim et al. 2005 (Kn 0.5 to 83) | 1.165, 0.483, 0.997 | Kim et al. 2005, abstract p. 31 and Eq. 34 p. 48 |
| Slip constants, Davies form | 1.257, 0.40, 1.10 | Flagan and Seinfeld 1988, p. 296 |
| Air viscosity at 23 °C | 1.83245e-5 kg/(m·s) | Kim et al. 2005, p. 34 and Table 3 p. 35 |
| Mean free path at 296.15 K and 101.3 kPa | 67.3 nm | Kim et al. 2005, pp. 34-35 and Table 3 |
| Temperature scaling | µ(T) = µ23·(T/T0)^1.5·(T0 + 110.4)/(T + 110.4); λ(T, P) = λ0·(T/T0)·(P0/P)·(1 + 110.4/T0)/(1 + 110.4/T) | Kim et al. 2005, Eqs. 9 and 11, pp. 34-35 |

At 20 °C and 101.325 kPa the scaling gives µ = 1.83245e-5 × 0.984844 × 1.007434 = 1.8181e-5 kg/(m·s) and λ = 67.3 nm × 0.989870 × 0.999753 × 0.997229 = 66.42 nm (computed here; no source prints either at 20 °C). The three constant sets agree within 1 % on v_s from 0.3 to 2.5 µm, and the viscosity from the 1976 U.S. Standard Atmosphere (1.8134e-5, Eq. 51 p. 19) is 0.26 % lower, so the constants and air properties together change the result by under 2 %. The same code reproduces the five speeds Flagan and Seinfeld print (p. 300, unit-density spheres at 298 K): 8.8e-7, 1.0e-5, 3.5e-5, 7.8e-4 and 3.1e-3 m/s at 0.1, 0.5, 1, 5 and 10 µm.

| d (µm) | C_c | v_s (m/s) at 20 °C | v_s/2.4 m (per hour, settling to a floor) |
|---|---|---|---|
| 0.1 | 2.866 | 8.59e-7 | 0.0013 |
| 0.3 | 1.532 | 4.13e-6 | 0.0062 |
| 0.5 | 1.307 | 9.79e-6 | 0.015 |
| 1.0 | 1.152 | 3.45e-5 | 0.052 |
| 1.93 | 1.079 | 1.20e-4 | 0.18 |
| 2.5 | 1.061 | 1.99e-4 | 0.30 |

For 0.3 µm: v_s = 1000 × (3.0e-7)² × 9.80665 × 1.532/(18 × 1.8181e-5) = 4.13e-6 m/s. The speed rises 48-fold from 0.3 to 2.5 µm, so a lumped value needs a size distribution. None of the indoor-air papers read gives one representative diameter: Nazaroff 2004 (Indoor Air 14 Suppl. 7: 175-183, p. 3 of the manuscript) splits particle mass into three modes, Thatcher et al. 2002 (abstract) argue against one loss coefficient for PM2.5, and the measured indoor rates already include settling. The value used is the mass-weighted speed of a published PM2.5 mass distribution: the average mode parameters of the summed mass distributions of the ionic species in Los Angeles air (John et al. 1989, Table 2: summer 0.2 ± 0.1, 0.7 ± 0.2 and 4.4 ± 1.2 µm with geometric standard deviations 1.5, 1.7 and 1.9 and 4, 26 and 13 µg/m³; fall 0.2, 0.7 and 5.5 µm with 1.5, 1.9 and 1.8 and 9, 40 and 5 µg/m³). Each mode is lognormal in aerodynamic diameter, the sum is cut sharply at 2.5 µm and integrated in ln d, and the result is the mass-weighted mean v_s: 3.09e-5 m/s (summer) and 2.56e-5 (fall), the speed of a 0.94 and a 0.85 µm sphere. This is an outdoor, inorganic-ion distribution used as a stand-in for lumped indoor PM2.5. Fresh combustion smoke is finer: a single mode of median 0.2 µm and geometric standard deviation 2.1 (tobacco smoke as Nazaroff 2004 describes it, p. 9) gives 4.8e-6 m/s. Settling is a small loss term at 3e-5 m/s: v_s/H = 3e-5/2.4 × 3600 = 0.045 per hour, against 0.5 air changes per hour at the median home (Nazaroff 2004, p. 6) and a total surface loss of about 0.4 per hour.

### 6.2 Surface deposition speed

Measured "deposition rates" in homes are first-order loss rates k per hour that already contain gravitational settling, so they are compared with the model's v_d·A/V + v_s·A_floor/V, never with the v_d term alone.

| Source and where | k (per hour) | Size (µm) | Setting |
|---|---|---|---|
| NISTIR 7068 (Howard-Reed, Wallace and Emmerich 2003), Table 4 p. 16, central fan off, mean ± SD (N) | 0.30 ± 0.09 (15); 0.42 ± 0.18 (34); 0.78 ± 0.37 (48); 1.4 ± 0.34 (40) | 0.3-0.5; 0.5-1; 1-2.5; 2.5-5 | Occupied three-storey townhouse, about 400 m³ and 50 m² of floor per level (p. 2), after subtracting the air change rate |
| NISTIR 7068, Table 1 p. 8, cooking, fan off | 0.29 ± 0.11; 0.41 ± 0.10; 0.50 ± 0.11 | 0.3-0.5; 0.5-1; 1-2.5 | 15 cooking events |
| Wallace 1996 (Riverside homes, PTEAM study), abstract only | 0.39 | fine particles (PM2.5) | Homes in Riverside, California; the ± 0.16 appears only in LBNL-49321 p. 45, second-hand |
| He, Morawska and Gilbert 2005, Atmos. Environ. 39: 3891-3899, manuscript pp. 10-11 | 2.01 ± 1.11 (minimum ventilation); 3.61 ± 2.6 (normal ventilation) | PM2.5, cooking aerosol | 14 houses in Brisbane; the high outlier |
| Nazaroff 2004, Fig. 6 p. 9 (a synthesis of model and measurement results, read from the figure to about ± 5 %) | 0.059 (0.3 µm); 0.088 (0.5); 0.20 (1.0); 0.84 (2.5) | 0.3 to 2.5 | The low end: models run 10 times below house measurements under 0.5 µm (NISTIR 7068 pp. 19-20) |

None of the house studies reports its total interior surface area, so rates are converted with S/V = 2 to 4 m²/m³ (Thatcher et al. 2002, p. 12), and S/V = 2.0 is the reference room. At 0.42 per hour: 0.42/3600 = 1.167e-4 per second, and v_d = 1.167e-4/2 = 5.8e-5 m/s at A/V = 2 (3.9e-5 at 3 and 2.9e-5 at 4). The target for lumped PM2.5 is k = 0.40 per hour, from the Riverside value (0.39) and NISTIR 7068 (0.42 at the size that holds most of the mass, and 0.41 to 0.48 weighted over 0.3 to 2.5 µm by the urban mass distribution of Nazaroff 2004, Fig. 2). It is not taken from the model curves (0.07 to 0.22 per hour lumped, low), from the Brisbane cooking rates (2.0, high), or from the fan-on rates, which include duct losses. With v_s = 3e-5 m/s the settling term is 0.045 per hour, so v_d = 4.9e-5, which is the 5e-5 used. With the earlier v_s of 1.2e-4 the same target would need v_d = 3e-5, and the earlier pair (5e-5 and 1.2e-4) gave 0.54 per hour.

Furnishing raised sub-micron loss rates 2.1 times in a 14.2 m³ chamber (Thatcher et al. 2002, p. 10) and made no measurable difference in the townhouse (NISTIR 7068, p. 15); air speed up to 19 cm/s raised them 1.5 times (Thatcher et al. 2002, p. 11), which a constant speed ignores. Whether one speed for all of PM2.5 is acceptable is a judgement: the size dependence inside PM2.5 (a factor of 2.6 to 14 between 0.3 and 2.5 µm) and the slowing of a lumped decay (a factor of 1.2 to 1.8 between its start and its whole-decay average) are smaller than the spread between homes (about 10 at one size), but Thatcher et al. 2002, Riley et al. 2002 and Nazaroff 2004 all prefer two or three size classes where accuracy matters.

### 6.3 Not confirmed

- Allen and Raabe 1985 (Aerosol Sci. Technol. 4: 269-286): the publisher would not serve it, so the constants are as Kim et al. 2005 quote them. Hinds, *Aerosol Technology* (1999) and Seinfeld and Pandis (3rd ed.): no open copy, so their settling tables and constants were not used.
- Riley et al. 2002 (ES&T 36: 200-207), Thatcher et al. 2002 Table 2 and Fig. 6, Thatcher and Layton 1995 (Atmos. Environ. 29: 1487-1497), Long et al. 2001 (ES&T 35: 2089-2099), Lai and Nazaroff 2000 (J. Aerosol Sci. 31: 463-476): abstracts only, or manuscript copies without their tables, so no number was taken from them.
- The PTEAM primary report (Özkaynak et al. 1996): the 0.39 per hour is from Wallace's abstract.
- Indoor PM2.5 size distributions, and the density of indoor particles, were not researched; the settling value rests on an outdoor distribution.
- A mean free path or an air viscosity printed at 20 °C: none found; both are computed from Kim et al. 2005.
- Total interior surface area of any studied house.

## 7. PM2.5 emission reference points

Researched 2026-10-14 (issue 48). The Smoke strength slider marks four household sources, and the solver releases smoke at the rate for the slider's position, in milligrams of PM2.5 per minute. `src/lib/experiments/airflow/emission.ts` holds the table (`EMISSION_REFERENCES`): the solver's release rate and the slider's marks both read it, and `tests/solver/particle-constants.spec.ts` holds it to the "Used" column below. Every figure was read in the cited paper's text or tables. A rate in mg/hr is divided by 60 and one in µg/min by 1000. These are PM2.5 mass rates measured in homes, test rooms or chambers, from one to a few studies each, so they stand for one candle, one stick of incense or one cooking event, and real sources differ from them by factors of several with the wax, the incense, the food, the pan and the heat. The slider runs from the first row to the last.

| Reference | Used (mg/min) | Source and where | Working | Uncertainty |
|---|---|---|---|---|
| `candle` | 0.02 | Pagels, Wierzbicka, Nilsson, Isaxon, Dahl, Gudmundsson, Swietlicki and Bohgard 2009, J. Aerosol Sci. 40: 193-208, Table 1 (manuscript p. 35, per single candle, PM2.5 by TEOM); Derudi, Gelosa, Sliepcevich, Cattaneo, Cavallo, Rota and Nano 2014, Environ. Sci. Pollut. Res. 21: 4320-4330, Tables 1 and 6; Ongwandee and Pipithakul 2010, J. Environ. Res. 32(1): 69-79, Table 1 p. 74 | One steadily burning candle. Pagels steady burn 2.4 and 0.87 mg/h ÷ 60 = 0.040 and 0.0145 mg/min, geometric mean √(0.040 × 0.0145) = 0.024. Cross-check, the geometric mean of the three studies' central values (Pagels 1.445, Derudi 0.133 and Ongwandee 9.33 mg/h) = 1.21 mg/h ÷ 60 = 0.020 mg/min. Used as 0.02 | 0.0003 to 0.17 mg/min across the three chamber studies (a factor of 70 below to 8 above 0.02), from the wax and wick and from the instrument (Ongwandee's photometer was not corrected against a filter, and its table does not say whether the rate is per candle); a flame flickering in a draught gives 0.15 to 0.42 mg/min (Pagels sooting 8.9 and 25.3 mg/h ÷ 60); snuffing a candle adds a one-off 0.72 mg (Pagels Table 2) |
| `incense` | 0.6 | Jetter, Guo, McBrian and Flynn 2002, Sci. Total Environ. 295: 51-67, p. 51 (abstract only: 23 types, cyclone and filter, PM2.5 7 to 202 mg/h); Lung and Hu 2003, Chemosphere 50: 673-679 (abstract only: 561 and 661 µg/min, size cut not stated); Ongwandee and Pipithakul 2010, Table 1 p. 74; Lee, Guo and Kwok 2002, Proceedings of Indoor Air 2002, Table 2 p. 565 | One burning stick. Jetter 7 and 202 mg/h ÷ 60 = 0.117 and 3.37 mg/min; geometric midpoint √(0.117 × 3.37) = 0.63 mg/min = 38 mg/h, used as 0.6. Corroboration: Lung and Hu 561 and 661 µg/min ÷ 1000 = 0.56 and 0.66 mg/min. The two photometer studies read higher, 154 to 255 mg/h ÷ 60 = 2.6 to 4.3 mg/min (Ongwandee) and 245.7 mg/h ÷ 60 = 4.1 mg/min (Lee, Guo and Kwok), and both are uncorrected DustTrak readings; published photometer factors for incense are 0.21 to 0.25 (Mannix, Nguyen, Tan, Ho and Phalen 1996, p. 154) and 0.35 (Dacunto and others 2013, abstract), and as an illustration only, 2.6 × 0.21 to 4.3 × 0.35 = 0.5 to 1.5 mg/min | 0.12 to 4.3 mg/min across three chamber studies and 27 products (a factor of 5 below to 7 above 0.6); the value is the midpoint of a published range and is not printed in any paper read, and Jetter et al.'s chamber, burn rates and per-type values were not readable (UNCONFIRMED); cones and other forms burn higher than sticks |
| `frying` | 2 | He, Morawska, Hitchins and Gilbert 2004, Atmos. Environ. 38: 3405-3415, Table 1 (frying, N = 4, median 2.68 mg/min); Fortmann, Kariher and Clayton 2001, CARB contract 97-330, Table 3-31, pp. 104-105 (four standard stir fry tests); Buonanno, Morawska and Stabile 2009, Atmos. Environ. 43: 3235-3242, Table 6 (50 g of chips on a gas stove at full power); O'Leary, de Kluizenaar, Jacobs and others 2019, Indoor Air 29: 423-438, Table 3 (four whole meals) | Each study's central value, in mg/min: He 2.68 as printed; Fortmann stir fry 201.5, 175.1, 92.4 and 221.8 mg/hr ÷ 60 = 3.36, 2.92, 1.54 and 3.70, median 3.14; Buonanno 3.3e3, 1.6e3 and 1.2e3 µg/min ÷ 1000 = 3.3, 1.6 and 1.2, median 1.6; O'Leary 0.62, 0.80, 1.9 and 3.2 as printed, median 1.35. Median of the four: (1.60 + 2.68)/2 = 2.14, used as 2 | A factor of 1.5 either way for the typical event (the central values run 1.35 to 3.14); single frying events run from 0.03 to 10.3 mg/min, mostly 0.5 to 4; Olson and Burke 2006 (abstract only) report a frying mean of 60 mg/min, 20 times this, which could not be reconciled without its methods (UNCONFIRMED) |
| `burst` | 10 | Chan, Logue, Wu, Klepeis, Fisk, Noris and Singer 2018, Indoor Air 28: 89-101, Table 2 (836 emission events in 18 apartments: 5th to 95th percentile 3 to 582 mg/h); Fortmann et al. 2001, Table 3-31 (a worst-case stir fry with the oil hotter, and tortillas fried on an electric range); Buonanno et al. 2009, Table 3 (grilling on a gas stove at full power); Dacunto and others 2013, Environ. Sci.: Processes Impacts 15: 1511-1519 (abstract only: burned food) | Chan 95th percentile 582 mg/h ÷ 60 = 9.70 mg/min; Fortmann 545.7 mg/hr ÷ 60 = 9.10 and 617.8 mg/hr ÷ 60 = 10.30; Buonanno pork 1.0e4 µg/min ÷ 1000 = 10.0 and cheese 9.5e3 µg/min ÷ 1000 = 9.5. The full-text values cluster at 9 to 10, used as 10 | The calibrated measurements of high-emission events run 9 to 16 mg/min, with burned food at the top (15 to 16 mg/min, abstract only), so a factor of 1.6 up and 1.1 down; Olson and Burke 2006 (abstract only) report means of 470 mg/min for burned food and 173 for grilling, 20 to 50 times higher, which could not be reconciled without its methods (UNCONFIRMED) |

### 7.1 Candles and incense

| Source and where | Value as printed | Size cut and instrument | Setting |
|---|---|---|---|
| Pagels et al. 2009, Table 1 (manuscript p. 35, "for a single candle") | Steady burn: candle I 2.4 ± 0.1 and candle II 0.87 ± 0.14 mg/h; sooting burn: 8.9 ± 0.4 and 25.3 mg/h | PM2.5 mass by TEOM (filters and size distributions agree within 25 %) | A 21.6 m³ stainless-steel chamber at 0.5 air changes per hour, four tapered candles burned together, a box model fitted over about the first 2 hours |
| Pagels et al. 2009, Table 2 | 0.72 ± 0.04 mg of particles each time a candle is snuffed | PM2.5 mass | Candle II, four candles burned 10 minutes and then snuffed |
| Derudi et al. 2014, Tables 1 and 6 | PM2.5 (the four impactor bins below 2.5 µm added) 5.80, 104.52 and 271.69 µg/g of wax burned for candles A, B and C; burn rates 2.8, 1.9 and 2.7 g/h; so 0.016, 0.199 and 0.734 mg/h | Gravimetric, personal cascade impactor | A flow-through chamber, four container candles of paraffin burned together |
| Ongwandee and Pipithakul 2010, Table 1 p. 74 | Candles 9.23, 8.81 and 9.97 mg/h; incense sticks 255, 154 and 181 mg/h | PM2.5 by DustTrak II photometer, not corrected against a filter | A 1 m³ chamber, four candles or one stick per test; the table does not say whether the candle rate is per candle |
| Jetter et al. 2002, p. 51 (abstract only) | PM2.5 emission rates 7 to 202 mg/h and emission factors 5 to 56 mg/g of incense burned, for 23 types | PM2.5, cyclone and filter | A chamber (volume and ventilation not in the abstract) |
| Lee, Guo and Kwok 2002, Table 2 p. 565 | Incense PM2.5 245.7 ± 0.62 mg/h (46.08 mg/g, one 5.43 g stick) | PM2.5 by DustTrak photometer, not corrected | An 18.26 m³ chamber at 0.59 air changes per hour |
| Lung and Hu 2003 (abstract only) | 561 and 661 µg/min for two incense types | Gravimetric; the abstract does not say which size cut these two figures are | Joss sticks burned in an elutriator |

Conversions: 2.4 ÷ 60 = 0.040 mg/min; 0.87 ÷ 60 = 0.0145; 8.9 ÷ 60 = 0.148; 25.3 ÷ 60 = 0.422; Derudi A (2.51 + 0.39 + 1.89 + 1.01) × 2.8 = 16.2 µg/h = 0.0162 mg/h ÷ 60 = 0.00027 mg/min, B 104.52 × 1.9 = 198.6 µg/h, C 271.69 × 2.7 = 733.6 µg/h; Ongwandee candle 9.33 ÷ 60 = 0.156 mg/min, incense 255 ÷ 60 = 4.25, 154 ÷ 60 = 2.57 and 181 ÷ 60 = 3.02 mg/min; Jetter 7 ÷ 60 = 0.117 and 202 ÷ 60 = 3.37 mg/min. If Ongwandee's candle rate were for the four candles together, one candle would be 9.33 ÷ 4 ÷ 60 = 0.039 mg/min.

The Berkeley Lab compilation (Hu, Singer and Logue 2012, Table 4 p. 14) lists incense sticks at a mean of 41 and a geometric mean of 32 and candles at 0.46 and 0.19 "µg/hr". Its incense rows are built from Jetter's 7 to 202 mg/h, so the unit can only be mg/hr and the printed one is wrong; read as mg/hr they agree with the used values (stick mean 41 ÷ 60 = 0.68 mg/min, geometric mean 32 ÷ 60 = 0.53). The compilation was not used for any number.

### 7.2 Cooking

| Source and where | Value as printed | Size cut and instrument | What and where |
|---|---|---|---|
| He et al. 2004, Table 1 (accepted manuscript p. 27) | Emission rate, mg/min, median (SD): frying (N = 4) 2.68 (2.18); grilling (N = 6) 2.78 (17.8); other cooking (N = 24) 0.11 (0.99) | "Approximation of PM2.5", DustTrak photometer not calibrated for the aerosol | 14 houses in Brisbane, 48-hour kitchen records matched to diaries |
| Fortmann, Kariher and Clayton 2001, Table 3-31 (report pp. 104-105) | Source strength, mg/hr: stir fry 201.5, 175.1, 92.4 and 221.8; stir fry worst case (oil hotter) 545.7; tortillas on an electric range 617.8; bacon 233.0 and 86.7; French fries 65.9 and 262.2 | PM2.5 by filter, a mass balance over the cooking period | One cook following written recipes in a 187 m³ house in California |
| Buonanno, Morawska and Stabile 2009, Tables 3 and 6 (accepted manuscript pp. 10 and 14) | Mass emission factor, µg/min: chips fried on a gas stove at full power 3.3e3 (olive oil), 1.6e3 (peanut) and 1.2e3 (sunflower); grilling at full gas power: pork 1.0e4, cheese 9.5e3, bacon 4.7e3, eggplant 8.9e2 | Mass computed from size distributions of 0.006 to 20 µm (the upper cut for the mass is not stated) | A laboratory kitchen of about 224 m³ |
| O'Leary and others 2019, Table 3 (PDF p. 43) | Mean emission rate ± SE, mg/min, four whole meals: 0.62 ± 0.041, 0.80 ± 0.076, 1.9 ± 0.30 and 3.2 ± 0.24; the first meal in stainless steel pans 6.5 ± 0.62 (single tests to 8.6) | PM2.5 by optical counter scaled by gravimetric factors of 1.5 to 5.0 | A 26 m³ test kitchen with an extract fan |
| Chan and others 2018, Table 2 (accepted manuscript p. 19) | 836 emission events in 18 apartments: emission rate mean 103, median 37, geometric mean 40 mg/h (GSD 3.9), 5th to 95th percentile 3 to 582 mg/h | DustTrak readings multiplied by 0.4 | Events not attributed to an activity ("a mix of cooking and non-cooking") |
| Dacunto and others 2013 (abstract only) | Burned food and fireplaces the highest, 15 to 16 mg/min; pizza and ground beef 0.1 to 0.2 mg/min | PM2.5, photometer calibrated against a gravimetric sampler | 66 experiments |

Conversions: He as printed in mg/min; Fortmann 201.5 ÷ 60 = 3.36, 175.1 ÷ 60 = 2.92, 92.4 ÷ 60 = 1.54, 221.8 ÷ 60 = 3.70, 545.7 ÷ 60 = 9.10, 617.8 ÷ 60 = 10.30; Buonanno 3.3e3 ÷ 1000 = 3.3, 1.6e3 ÷ 1000 = 1.6, 1.2e3 ÷ 1000 = 1.2, 1.0e4 ÷ 1000 = 10.0, 9.5e3 ÷ 1000 = 9.5; Chan 37 ÷ 60 = 0.62 and 582 ÷ 60 = 9.70 mg/min. The median of the four studies' central values for frying: He 2.68, Fortmann (the median of its four stir fry tests) 3.14, Buonanno (the median of three oils) 1.6, O'Leary (the median of four meals) 1.35, so (1.6 + 2.68) ÷ 2 = 2.14. The distributions are skewed, which is why the typical event uses a median: Chan's geometric standard deviation is 3.9 and its mean is 2.8 times its median. Event lengths run from 7 minutes (the median of all cooking in Olson and Burke 2006) to 16 minutes (Chan, median) and 17 to 28 minutes (O'Leary), so an event at the frying rate releases about 2 × 7 = 14 to 2 × 28 = 56 mg.

### 7.3 Read and not used

- Olson and Burke 2006 (ES&T 40: 163-169, abstract only): 411 cooking events in 37 homes, mean 36 and median 12 mg/min, category means of 470 for burned food, 173 for grilling and 60 for frying. These are 4 to 30 times the controlled studies above, with nephelometers whose calibration and mixing volume the abstract does not give, so the figures are not used and the gap is UNCONFIRMED.
- Hu, Singer and Logue 2012, Table 3: cooking-type and appliance rows 1 to 3 orders of magnitude below Olson and Burke's values, whose events supply most of those tests (for example gas range 3.8e4 µg/hr = 0.63 mg/min against Olson's all-event mean of 36 mg/min); the cause is unresolved, so no magnitude was taken from it. Its food-type rows (1.2e5 to 2.3e5 µg/hr = 2 to 3.8 mg/min) agree with the studies above.
- Wallace, Emmerich and Howard-Reed 2004 (ES&T 38: 2304-2311, abstract only): source strengths in particle number and volume, not mass. Singer, Pass, Delp, Lorenzetti and Maddalena 2017 (Build. Environ. 122: 215-229, read as the LBNL report): gas burners run with water and no food gave a negligible rise in PM2.5, so cooking PM2.5 comes from the food and oil; no PM2.5 rate is reported. Abdullahi, Delgado-Saborit and Harrison 2013 (Atmos. Environ. 71: 260-294): no emission rate table in mg/min. Number-based or PM10-only papers (Afshari, Matson and Ekberg 2005; Manoukian and others 2013; Stabile, Fuoco and Buonanno 2012) cannot be converted to PM2.5 mass.

### 7.4 Not confirmed

- Jetter et al. 2002: chamber volume and ventilation, burn rates, per-type values and any central value (full text not readable). Lung and Hu 2003: whether 561 and 661 µg/min are PM2.5 or PM10.
- Olson and Burke 2006 beyond its abstract (the category medians, percentiles and methods); Dacunto and others 2013 beyond its abstract (its per-test values); Wallace et al. 2004 and Hussein and others 2006 (Atmos. Environ. 40: 4285-4307), whether either gives a PM2.5 mass rate.
- Fine, Cass and Simoneit 1999 (ES&T 33: 2352-2362) and Zai, Huang and Wang 2006, whose candle rates appear in this note only as quoted by Pagels et al.; Fan and Zhang 2001, whose two secondary quotations disagree.
- Journal page numbers for papers read as accepted manuscripts (He 2004, Buonanno 2009, O'Leary 2019, Chan 2018, Pagels 2009).

## 8. Air quality categories and unit conversion

| Item | Value | Status |
|---|---|---|
| US EPA PM2.5 AQI breakpoints (2024 update) | not given | UNCONFIRMED: the EPA rule and technical assistance document were not fetched, and no figures are reproduced from memory |
| WHO 2021 PM2.5 guideline values | not given | UNCONFIRMED: the WHO document was not fetched |
| Conversion µg/m³ to ppm by mass | ppm (mg/kg) = C[µg/m³] / (1000 · ρ_air[kg/m³]), with ρ_air = p·M/(R·T) | Formula is exact by definition |
| Air density at 20 °C, 101.325 kPa | 1.2041 kg/m³ | UNCONFIRMED inputs: computed with M = 0.0289647 kg/mol (dry air) and R = 8.314462618 J/(mol·K), and those constants were not checked against a cited source this session |
| 1 ppm by mass in µg/m³ (3 s.f.) | 1.20 × 10³ µg/m³ (1 µg/m³ = 8.31 × 10⁻⁴ ppm) | Follows from the density row; same caveat |

## 9. Explainer wording that depends on sections 6 and 7

For the explainer check (issue 65). `src/lib/experiments/airflow/ui/Explainer.svelte` says the following today, and each statement changes with these numbers:

1. "The smoke amounts marked on the smoke slider (a candle, incense, frying and a cooking burst) are placeholders, not measurements." They are now figures from published measurements, one to a few studies each. The sentence should say that, that real sources differ from them by factors of several (a candle's flame, an incense type, the food and the heat), and that the top mark, 10 mg/min, is about the 95th percentile of the 836 emission events (cooking and other activities) logged in 18 apartments in one study (Chan and others 2018), and sits where the calibrated measurements of hot or burned cooking cluster (9 to 16 mg/min).
2. "Their settling and deposition speeds are rough: published loss rates for one size of particle differ by several times between a quiet room, a test chamber and an occupied house, and no source gives these speeds directly." No source gives the speeds directly, which is still true, but they are now derived: the settling speed (3e-5 m/s) from a settling-speed calculation averaged over a published particle size distribution, and the deposition speed (5e-5 m/s) from the loss rate measured in occupied homes (about 0.4 per hour, a factor of 2.5 either way) with settling taken out. The sentence can say so.
3. "No source above gives the settling and deposition speeds the simulation uses. Those are rough values." (under "Smoke in a well-mixed room"). The same change, and the sources of sections 6 and 7 have to be added to the list: Flagan and Seinfeld 1988; Kim and others 2005; John and others 1989; Wallace 1996; Thatcher and others 2002; and for the smoke amounts Pagels and others 2009, Derudi and others 2014, Ongwandee and Pipithakul 2010, Jetter and others 2002 (abstract only), Lung and Hu 2003 (abstract only), He and others 2004, Fortmann and others 2001, Buonanno and others 2009, O'Leary and others 2019, Chan and others 2018. Howard-Reed and others 2003 (NISTIR 7068), Nazaroff 2004 and Sippola and Nazaroff 2002 are already listed.
4. "Nazaroff, "Indoor particle dynamics" ... Its loss rates by particle size were read off a graph, so they are good to about 10 %." This note read the same figure's curve to about 5 % from the file's vector paths (Fig. 6, manuscript p. 9); the wording can stay or take the 5 %.
5. "Particulates are PM2.5 only, as a mass in the air." It is lumped: one settling speed and one deposition speed stand for every size in PM2.5, though the loss rate rises 2.6 to 14 times from 0.3 to 2.5 µm, and the literature prefers two or three size classes where accuracy matters (Nazaroff 2004, p. 3; Thatcher and others 2002; Riley and others 2002).

## Gaps and uncertainty

- **Box fans:** only the Air King 9723 has manufacturer CFM at all three speeds. Lasko publishes a single maximum CFM per model (B20548 at 2,000; B20301 at 1,725), so their Low and Medium values are UNCONFIRMED. No sheet names a test standard, so it is not known whether the ratings follow ANSI/AMCA 230.
- **Lasko and Hydrofarm pages:** Lasko's older product URLs (3733, 2155A, 2138) return 404, and hydrofarm.com failed TLS verification. Figures for those models exist only in retailer listings and were not used.
- **Window fans:** Air King publishes one CFM per speed for both directions, so intake and exhaust are not distinguished. The 9166 sheet's text and drawing give different window-width ranges.
- **Pedestal fans (2), purifiers (4), shut-off pressure and curve form (5), AQI and WHO values (8):** none were verified before the session ended. Each needs a fresh pass against the sources named in its section. The particle constants (6) and the emission rates (7) were done on 2026-10-14, and their open items are listed in sections 6.3 and 7.4.
- **Face velocities:** these use the full disk area including the hub, so they underestimate the velocity through the blade annulus.

## Device ratings (second pass, 2026-10-09)

This section adds to the sections above and replaces none of them. It records what `src/lib/experiments/airflow/devices/catalog.ts` uses.

- **Method:** each Air King spec sheet was downloaded and its text layer extracted with PyMuPDF, and the values were read from that text. Product web pages were read through a page fetch. A value that appeared only in a search-engine summary is listed as a lead and is not used.
- **Units:** as printed (inches, CFM). The catalog converts with 1 in = 0.0254 m and 1 CFM = 0.000471947443 m³/s.
- **Test standard:** none of the Air King sheets names the standard its CFM was measured to.

### Confirmed and in the catalog

All four sheets carry "Updated 3-23", and all four were read on 2026-10-09. The 9723 and 9155 values match sections 1 and 3 exactly.

| Model | Kind | CFM Low / Med / High | Blade | Product dimensions, as printed | Source |
|---|---|---|---|---|---|
| Air King 9723, 20" Commercial Grade Box Fan | box fan | 1463 / 1900 / 2163 | 20" ("Blade Size 20"") | 21.38"L x 6.38"W x 22.5"H (L across the face, W along the airflow) | https://www.airkinglimited.com/wp-content/uploads/2020/09/9723spec1.pdf |
| Air King 9119, 18" Oscillating Pedestal Fan | pedestal fan | 1380 / 1680 / 1950 | 18" (from the title) | 20.25"L x 20.25"W x 53.75"H | https://www.airkinglimited.com/wp-content/uploads/2020/09/9119Spec1.pdf |
| Air King 9126, 16" Oscillating Pedestal Fan | pedestal fan | 1220 / 1420 / 1580 | 16" (from the title) | 18"L x 18"W x 52"H | https://www.airkinglimited.com/wp-content/uploads/2020/09/9126Spec1.pdf |
| Air King 9155, 16" Window Fan (single blade) | window fan | 1360 / 1700 / 2470 | 16" (from the title) | 26.5"L x 8.25"W x 22"H (W through the window; fits windows 26.5" to 34.5" x 22"H) | https://www.airkinglimited.com/wp-content/uploads/2020/09/9155Spec1.pdf |

Other values printed on the two pedestal sheets (new in this pass):

| Quantity | 9119 (18") | 9126 (16") |
|---|---|---|
| RPM High / Med / Low | 1100 / 950 / 800 | 1450 / 1320 / 1050 |
| Amps High / Med / Low | 0.85 / 0.67 / 0.56 | 0.60 / 0.50 / 0.45 |
| Watts High / Med / Low | 95 / 82 / 68 | 70 / 60 / 50 |
| dB A High / Med / Low | 51 / 48 / 43 | 50 / 45 / 39 |
| Oscillation | "90° or can be locked in non-oscillating position" | same |
| Height adjustment | "Telescoping from 37" to 53.75"" | "Telescoping from 36" to 52"" |
| Motor | 3-speed, 1/20 HP, 120V, PSC | same |
| Shipping weight | 16.5 lbs | 11.3 lbs |

**Derived for the catalog (not published):** the sheets give the pedestal fan's overall height, but `FanModel.heightRange` is the height of the head's centre. The catalog takes the centre as half the head's width below the top: 9119, 37 − 10.125 = 26.875" to 53.75 − 10.125 = 43.625" (0.683 to 1.108 m); 9126, 36 − 9 = 27" to 52 − 9 = 43" (0.686 to 1.092 m). This assumes that the printed width (20.25" or 18") is the head's guard and that the guard's top is the fan's top. Neither sheet says so.

**Not published, left to code defaults:** a window fan's shut-off pressure. The 9155 entry has no `shutoff`, so `devices/solver.ts` uses its default of 25 Pa, which is not sourced (see section 5).

### Twin-blade window fan: not confirmed

No manufacturer page with CFM at each speed was found for a twin-blade window fan. The one maker's page that was read gives only a maximum:

| Model | CFM as printed | Speeds | Size as printed | Other | Source, read 2026-10-09 |
|---|---|---|---|---|---|
| Lasko W09550, Twin Window Fan, electrically reversible, with remote | "moving up to 560 CFM" (maximum only; per-speed not stated) | 3 | height 12.9 in, width 24.0 in, depth 4.9 in; expander panels fit windows "from 24 to 32 inches wide" | "two 9-inch fan motors" (blade diameter not stated); 22 W to 31 W; 8.0 lb | https://lasko.com/products/lasko-3-speed-electrically-reversible-twin-window-fan-with-remote-control-w09550-white |

A web search also returned retailer listings (Comfort Zone CZ319WT, Black+Decker, Perfect Aire 2PAFW9, Shinic, Phyfalip) and one unbranded spec sheet with no CFM. None of those was read. Because the catalog's shape needs CFM at Low, Medium and High, the W09550 is not in it. The catalog's window fan is the single-blade Air King 9155 instead.

### Room air purifiers (third pass, 2026-10-14, issue 57): three in the catalog, top-speed CADR only

Each page, manual and record below was read on 2026-10-14. Everything printed below is as the source prints it. The catalog (`src/lib/experiments/airflow/devices/catalog.ts`) lists the three models, and `tests/solver/purifiers.spec.ts` holds each top-speed figure to the number in the "Used" column.

**What is published and what is not.** CADR (clean air delivery rate, the ANSI/AHAM AC-1 rating) is published for the highest fan speed only. No manual, maker page, AHAM listing or ENERGY STAR record gives CADR or airflow at any lower speed for any of the three models, and AHAM's own FAQ ("Frequently Asked Questions about Testing of Portable Air Cleaners", June 2020) says AC-1 tests the highest speed setting. So **CADR at Sleep, Low and Medium is derived, not published**: the top figure times the speed's power mark (0.25, 0.5 and 0.75 for Sleep, Low and Medium; High is 1), which takes CADR as proportional to fan speed. Real units will differ. This is the decision of 2026-10-14 (issue 57), and each model's `source` line and the explainer say so.

| Size | Model | Used: smoke CADR at High | Source and where | Body as printed | Opening geometry |
|---|---|---|---|---|---|
| small | Levoit Core 300-P (listed as the Core 300) | 143 cfm = 0.0675 m³/s | Owner's manual, p. 2 "Specifications": 143 / 153 / 167 cfm for smoke / dust / pollen (https://levoit.com/cdn/shop/files/HEAPAPLVNUS0161Y_Core_300-p_Air_Purifier_manual_US_A2-241204_1.pdf); the AHAM record for "Core 300" gives the same smoke figure (and PM2.5 148), flagged `model.deleted`, and a lapsed ENERGY STAR record certified 2024-11-20 agrees | "8.7 x 8.7 x 14.2 in / 22 x 22 x 36 cm" (manual p. 2), axes unlabelled: read as a cylinder 8.7 in across and 14.2 in tall (the drawings, pp. 5 and 8) | Manual p. 5: "L. Air Inlet" is a perforated band on the lower part of the cylinder, all the way round; "J. Air Outlet" is a round grille on the top face around the control panel. Sizes are not given |
| medium | Coway Airmega Mighty AP-1512HH | 233 cfm = 0.1100 m³/s | https://cowaymega.com/products/mighty-air-purifier-ap-1512hh prints "233 (Smoke), 246 (Dust), 240 (Pollen)" with no unit; the AHAM directory (October 2016 and January 2018 editions, printed p. 5) prints the same in cfm; an earlier ENERGY STAR record gave 233.6 / 247.7 / 232.2 cfm | "16.8 x 18.3 x 9.6 in (W x H x D)" (manual printed p. 1) | Manual printed p. 7: "Air outlet" is the slotted grille along the top at the back. No page says where the main inlet is; the filters stack behind the front cover, so air is taken to enter at the front (inference). Sizes are not given |
| large | Coway Airmega 400 | 376 cfm = 0.1775 m³/s | ENERGY STAR V3.0 certified-product data, record 4512742, model AP-2015F: smoke 376, dust 384, pollen 409, PM2.5 380 cfm (https://data.energystar.gov/resource/gaa3-swy6.json?pd_id=4512742). Coway's own page (https://cowaymega.com/products/airmega-400) prints "328 (Smoke), 328 (Dust), 400 (Pollen)" with no unit, and no certified record carries it | "22.8 x 14.8 x 14.8 in" H x W x D (manual p. 26) | Manual p. 9: "Air outlet cover", a round louvred grille filling most of the top; perforated left and right covers over each filter set (pp. 9 and 14), which the manual never calls inlets. Sizes are not given |

**Used and why.** The model takes the third-party-certified figure where one exists (ENERGY STAR for the Airmega 400, AHAM and the maker's agreeing figure for the other two). The Airmega 400's 376 and 328 disagree by a factor of 1.15, which is not a unit mix-up (that would be 1.70); ENERGY STAR's record names a test unit that Coway's manuals call the 400S, was revised twice without a new certification date, and moved to a different procedure in version 3.0; Coway left the AHAM program in 2018 and its coverage claim works out to 416 cfm, which matches none of the CADRs. Nothing explains the difference, so the simulation's large purifier cleans 15 % faster than Coway's own page says.

**Estimated, not published (UNCONFIRMED).** The size of every inlet and outlet, and for the Mighty where the inlet is. The catalog's choices, read off the undimensioned drawings: Levoit, inlet band 6 in tall from just above the base, outlet an equivalent round opening 0.176 m across (a ring 7.8 in across round a 3.6 in disc); Mighty, inlet the lower three quarters of the body, outlet an equivalent round opening 0.14 m across (a slot about 11.5 in by 2 in); Airmega 400, inlet the side faces above the legs, outlet a round grille 12 in across (gross, not the open area). Only the round-outlet diameter changes how fast the jet leaves: 2.8 m/s for the Levoit, 7.1 m/s for the Mighty and 2.4 m/s for the Airmega 400, at High.

**What the simulation does with them** (`tests/solver/purifiers.spec.ts`, a 3 m by 3 m by 2.4 m sealed room, 0.2 m cells). In well-mixed air (an eddy diffusivity of 0.3 m²/s, as the benchmark of the solver's decay law has, standing for the fan in an AHAM test chamber) the smoke decays at 90.5 % of CADR over the room's volume for the Levoit at High, 95.1 % at half power, 90.1 % for the Mighty and 87.6 % for the Airmega 400: the rest is the smoke already gone from the few cells in front of the inlet. In a still room with only the purifier's own jet to stir the air, it decays at 60 % (Levoit) and 76 % (Mighty) of what the CADR implies, and half the power clears half as fast. That is the mixing a real room gets: a CADR describes mixed air, and a purifier in a closed bedroom is not 100 % as effective as its rating.

**Not found.** CADR or airflow at any speed below the highest, for any of the three. A printed statement of where the Mighty draws air in, or whether the Airmega 400 also draws through its perforated front cover. The size of any opening. Why ENERGY STAR's values for the Airmega 400 changed. A certified source for Coway's 328 / 328 / 400. What the AHAM `model.deleted` flag on the Core 300 means. The rendered ENERGY STAR product-finder page for the Airmega 400 (the dataset record was read instead). Pacific Northwest National Laboratory's report PNNL-38694 tested purifiers at several fan settings under AHAM AC-1, but it anonymizes the units and shows CADR by setting only in plots, so no figure from it is attached to a model; it says room coverage "drops 70-85% for most products" at the lowest setting and "drops 40-60%" at the medium setting, which is close to what the derived 0.25 and 0.5 marks give (drops of 75 % and 50 %).
