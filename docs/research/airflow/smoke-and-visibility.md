# Smoke and visibility: how much light wildfire smoke takes out

- **Date:** 2026-11-10 (issue 94)
- **Verification method:** Reid et al. (2005) was read from the journal's PDF in this session, its text extracted and the values below found on the pages given. Seidel et al. (2012) was read from its abstract. The Koschmieder relation was checked against Lee and Shang (2016) through a search summary, not the paper itself. Values marked **derived** are arithmetic on these, with the working shown. Values marked **chosen** are this project's picks within a sourced range.
- **Used by:** `src/lib/experiments/airflow/scene/look/smokyDay.ts` (the sky, the far ground and the sun on a smoky day) and `scene/air/excess.ts` (why smoke spread evenly through a room is not drawn).

## 1. Mass extinction of smoke

Source: J. S. Reid, T. F. Eck, S. A. Christopher, R. Koppmann, O. Dubovik, D. P. Eleuterio, B. N. Holben, E. A. Reid and J. Zhang, "A review of biomass burning emissions part III: intensive optical properties of biomass burning particles", Atmos. Chem. Phys. 5, 827–849, 2005. https://doi.org/10.5194/acp-5-827-2005

| Quantity | Value | Where |
|---|---|---|
| Dry mass scattering efficiency of fresh smoke, 550 nm | "solidly measured between 3–4 m2 g−1" | the closing summary, p. 843 |
| Recommended dry mass scattering efficiency of aged smoke, 550 nm | "on the order of 4.0 to 4.3 ±0.5 m2 g−1" | p. 844 |
| Recommended mass absorption efficiency | "∼0.50±0.15 m2 g−1" (tropical forest, and the same for boreal and temperate fires) | p. 844 |
| Single scattering albedo, AERONET, boreal forest (440/670/870/1020 nm) | 0.94/0.935/0.92/0.91 ±0.02 | Table 3, p. 839 |
| Asymmetry parameter g at 670 nm, AERONET | 0.53 to 0.61 | Table 3, p. 839 |
| Ångström exponent, AERONET, by region | 1.0 to 2.3 (boreal forest 1.0 ≤ α ≤ 2.3) | Table 3, p. 839 |

**Mass extinction, chosen: 4.5 m²/g at 550 nm.** Extinction is scattering plus absorption: 4.0 + 0.5 = 4.5 m²/g at the low end of the aged range, up to 4.8 for 4.3 + 0.5 (**derived**). The "about 4 m²/g" the spec has used since check-in 3 is the scattering alone. Reid et al. note that the bulk efficiency rises as smoke ages and its particles grow, and Saide et al. (2022, below) find a factor of 2 to 3 between fresh and day-old smoke, so any single figure is good to perhaps ±30%. These are dry values. Humid air makes them larger, which this project leaves out.

Saide et al., "Understanding the evolution of smoke mass extinction efficiency using field campaign measurements", Geophys. Res. Lett. 49, e2022GL099175, https://doi.org/10.1029/2022GL099175. Its abstract: mid-visible smoke mass extinction "can change by a factor of 2–3 between fresh smoke (<2 hr old) and one-day-old smoke". It gives no absolute value in the abstract.

## 2. Visibility (the Koschmieder relation)

Visual range V = 3.912 / b_ext, where b_ext is the extinction coefficient and 3.912 = −ln(0.02), the eye's contrast threshold of 2% for a black target against the horizon sky. Lee and Shang, "Visibility: how applicable is the century-old Koschmieder model?", J. Atmos. Sci. 73, 4573–4581, 2016, https://doi.org/10.1175/JAS-D-16-0102.1, read through a search summary: the model holds to within about 10% for a reasonably black target and an averaged extinction coefficient. Air's own (Rayleigh) extinction matters only past about 30 km, so it is left out here.

**Derived, at the Smoky preset's 150 µg/m³ (1.5 × 10⁻⁴ g/m³):**
- b_ext = 4.5 m²/g × 1.5 × 10⁻⁴ g/m³ = 6.75 × 10⁻⁴ per metre.
- V = 3.912 / 6.75 × 10⁻⁴ = 5.8 km. With the scattering alone (4.0 m²/g) it is 6.5 km, the figure in the #63 analysis.
- Across a 4 m room the smoke takes out 1 − e^(−6.75 × 10⁻⁴ × 4) = 0.27% of the light. Smoke spread evenly through a room at that level looks clear, which is why the smoke volume draws only the smoke above each room's average (#94).
- Across the lawn, which reaches 90 m from the middle of the Home, it takes out 1 − e^(−0.061) = 5.9%.

## 3. The sky and the sun

Seen from the ground, the sky and the sun are looked at through the whole depth of the smoke, not across a room. How deep the smoke is cannot be read from the PM2.5 at the ground, so this project assumes that the smoke is mixed evenly through the daytime mixed layer.

Source: D. J. Seidel, Y. Zhang, A. Beljaars, J.-C. Golaz, A. R. Jacobson and B. Medeiros, "Climatology of the planetary boundary layer over the continental United States and Europe", J. Geophys. Res. 117, D17106, 2012, https://doi.org/10.1029/2012JD018143. Abstract: "Climatological heights are typically <1 km during daytime and <0.5 km at night over both regions."

**Chosen: the smoke fills a layer 1 km deep.** That is the top of the typical daytime range. Real wildfire smoke often also rides above the mixed layer, which makes the sky far darker than the PM2.5 at the ground would say (the orange skies of September 2020 had moderate PM2.5 under them). The model leaves that out, so it errs toward a lighter sky.

**Derived, at 150 µg/m³:**
- Optical depth straight up, at 550 nm: τ = 4.5 m²/g × 1.5 × 10⁻⁴ g/m³ × 1,000 m = 0.675.
- Along a line of sight at elevation e the smoke is 1/sin e as deep (a plane layer, good above a few degrees). At the scene's sun, 31 degrees up, τ = 0.675 / 0.515 = 1.31, and the sun's direct light at 550 nm is e^(−1.31) = 27% of a clear day's.
- The sky seen through the smoke keeps e^(−τ / sin e) of its own light and takes on the smoke's colour for the rest: half its own light straight up, 7% of it 10 degrees up, none at the horizon.

**The sun warms** because smoke takes out more blue than red. Extinction scales as wavelength to the minus Ångström exponent. **Chosen: α = 1.7**, the middle of AERONET's range for smoke (1.0 to 2.3, Table 3 above). The scene's red, green and blue are taken at about 610, 550 and 465 nm, near the dominant wavelengths of the sRGB primaries. Then τ scales by (610/550)^(−1.7) = 0.84 for red and (465/550)^(−1.7) = 1.33 for blue (**derived**), and at 150 µg/m³ the sun's direct light is 33% in red, 27% in green and 17% in blue of a clear day's: dimmer and more orange.

**Where the light the smoke takes out goes.** Smoke absorbs about a tenth of it (single scattering albedo 0.9 to 0.94 above) and scatters the rest, mostly forward (g about 0.6), so much of the sunlight taken out of the beam reaches the ground as light from the whole sky. **Chosen: half of it.** In the scene the direct sun on level ground is about 1.4 times the sky's light and the fill together (the sun's 3.1 at 31 degrees, 1.6, against the fill's 0.75 and the sky's 0.42), so the sky's light grows by 0.5 × 1.4 = 0.7 times the share of the sun the smoke takes out. At 150 µg/m³ the sky's light is 1.5 times a clear day's and the sun's 0.27 times; on level ground the total is about 0.79 of a clear day's (**derived**: (1.6 × 0.27 + 1.17 × 1.51) / 2.77). That is within the 10 to 30% that heavy smoke is commonly reported to take off the sunlight reaching the ground, but that figure was not read from a source in this session (**UNCONFIRMED**).

## 4. What is not modelled

- Smoke above the mixed layer (see section 3).
- Water taken up by the particles in humid air, which raises the extinction.
- The sky's own brightening near the sun under smoke (forward scattering): the sky is hazed toward one colour at every bearing.
- Indoors, the smoke's real extinction: the smoke volume keeps its look (`SMOKE_LOOK`), which is far stronger than real smoke on purpose so that a released plume reads on the grid. It draws only the smoke above each room's average.
