# Devices and particulates: source-verified numbers

- **Date:** 2026-10-07
- **Verification method:** each value below was read directly from the cited manufacturer page or the PDF's text layer in this session. Search-engine snippets and retailer listings were not accepted as confirmation. Values marked **derived** are arithmetic on confirmed values, and the working is shown.
- **Status:** the session ended part-way through. Sections 1 (partial), 3 (partial) and the fan-face velocity in 5 are confirmed. Everything else is marked **UNCONFIRMED**, with the reason.
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

UNCONFIRMED: no model was verified before the session ended. Nothing below should be read as a CADR value.

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

| Item | Value | Status |
|---|---|---|
| (a) Settling velocity, 1 to 3 µm, Stokes with slip correction | Formula only: v_s = ρ_p·d²·g·C_c / (18·μ), with C_c = 1 + Kn·(A + B·exp(−C/Kn)) and Kn = 2λ/d | UNCONFIRMED: the constants A, B, C, λ and μ and the resulting numbers were not taken from a cited source in this session. Candidate sources: Allen and Raabe 1985 (Aerosol Sci. Technol.); Kim et al. 2005 (J. Res. NIST, open access). |
| (b) Surface deposition, 1 to 3 µm, smooth vs furnished, low vs high air speed | UNCONFIRMED | Not researched. Named sources still to read: Lai and Nazaroff 2000; Thatcher et al. 2002; Riley et al. 2002; Nazaroff 2004; Chen and Zhao 2011. |
| (c) Typical closed-room decay constants | UNCONFIRMED | Not researched |

## 7. PM2.5 emission reference points

UNCONFIRMED for every item (candle, incense, frying or sautéing, toasting, gas burner, wildfire-smoke ingress). None were researched before the session ended. Candidate peer-reviewed or EPA sources to read first:
- Incense: Jetter et al. 2002, EPA authors, Sci. Total Environ.
- Cooking and toasting: He et al. 2004, Atmos. Environ.; Olson and Burke 2006, ES&T; Abdullahi et al. 2013 review, Atmos. Environ.
- Gas burners without food: Singer et al. 2017, Building and Environment.
- Candles: Pagels et al. 2009, J. Aerosol Sci.

## 8. Air quality categories and unit conversion

| Item | Value | Status |
|---|---|---|
| US EPA PM2.5 AQI breakpoints (2024 update) | not given | UNCONFIRMED: the EPA rule and technical assistance document were not fetched, and no figures are reproduced from memory |
| WHO 2021 PM2.5 guideline values | not given | UNCONFIRMED: the WHO document was not fetched |
| Conversion µg/m³ to ppm by mass | ppm (mg/kg) = C[µg/m³] / (1000 · ρ_air[kg/m³]), with ρ_air = p·M/(R·T) | Formula is exact by definition |
| Air density at 20 °C, 101.325 kPa | 1.2041 kg/m³ | UNCONFIRMED inputs: computed with M = 0.0289647 kg/mol (dry air) and R = 8.314462618 J/(mol·K), and those constants were not checked against a cited source this session |
| 1 ppm by mass in µg/m³ (3 s.f.) | 1.20 × 10³ µg/m³ (1 µg/m³ = 8.31 × 10⁻⁴ ppm) | Follows from the density row; same caveat |

## Gaps and uncertainty

- **Box fans:** only the Air King 9723 has manufacturer CFM at all three speeds. Lasko publishes a single maximum CFM per model (B20548 at 2,000; B20301 at 1,725), so their Low and Medium values are UNCONFIRMED. No sheet names a test standard, so it is not known whether the ratings follow ANSI/AMCA 230.
- **Lasko and Hydrofarm pages:** Lasko's older product URLs (3733, 2155A, 2138) return 404, and hydrofarm.com failed TLS verification. Figures for those models exist only in retailer listings and were not used.
- **Window fans:** Air King publishes one CFM per speed for both directions, so intake and exhaust are not distinguished. The 9166 sheet's text and drawing give different window-width ranges.
- **Pedestal fans (2), purifiers (4), shut-off pressure and curve form (5), particle constants (6), emission rates (7), AQI and WHO values (8):** none were verified before the session ended. Each needs a fresh pass against the sources named in its section.
- **Face velocities:** these use the full disk area including the hub, so they underestimate the velocity through the blade annulus.
