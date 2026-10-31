# Airflow assets and their licences

Every file in this folder is CC0 (public domain dedication). None needs attribution; the sources are credited here anyway. Fetched on 2026-10-20 with Kyle's approval, from the set chosen in `docs/research/airflow/cc0-assets.md`.

| Folder or file | Source | Licence | Notes |
| --- | --- | --- | --- |
| `models/furniture/*.glb` (140) | Kenney, Furniture Kit 2.0, https://kenney.nl/assets/furniture-kit | CC0 1.0 (the kit's `License.txt`) | The kit's `Models/GLTF format` folder, unchanged |
| `models/nature/*.glb` (329) | Kenney, Nature Kit 2.1, https://kenney.nl/assets/nature-kit | CC0 1.0 (the kit's `License.txt`) | The kit's `Models/GLTF format` folder, unchanged |
| `textures/laminate_floor_02_{diff,nor_gl,arm}_1k.jpg` | Poly Haven, Laminate Floor 02, https://polyhaven.com/a/laminate_floor_02 | CC0 | 1K JPG, unchanged |
| `textures/interior_tiles_{diff,nor_gl,arm}_1k.jpg` | Poly Haven, Interior Tiles, https://polyhaven.com/a/interior_tiles | CC0 | 1K JPG, unchanged |
| `textures/beige_wall_001_{diff,nor_gl,arm}_1k.jpg` | Poly Haven, Beige Wall 001, https://polyhaven.com/a/beige_wall_001 | CC0 | 1K JPG, unchanged |
| `textures/grass004_{color,normal_gl,roughness}_512.jpg` | ambientCG, Grass004, https://ambientcg.com/view?id=Grass004 | CC0 1.0 | From the 1K JPG set, downscaled to 512 px (JPEG quality 82) to save about 4.8 MB |
| `sky/kloppenheim_06_puresky_1k.hdr` | Poly Haven, Kloppenheim 06 (Pure Sky), https://polyhaven.com/a/kloppenheim_06_puresky | CC0 | 1K HDR, unchanged |

Poly Haven's `arm` maps pack ambient occlusion, roughness and metalness into the red, green and blue channels, and `nor_gl` is the OpenGL normal convention three.js expects.
