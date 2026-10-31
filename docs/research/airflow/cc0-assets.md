# CC0 assets for the Sims-like roof-off homes

Researched 2026-10-16. Pages were read only: no archive, model or texture was downloaded.

How sizes are reported:
- "Stated" means the asset's own page gives the size.
- Poly Haven and ambientCG sizes are exact byte counts from their public APIs (`api.polyhaven.com/files/<id>`, `ambientcg.com/api/v2/full_json`).
- Where kenney.nl states no size, the figure is the length of the Internet Archive's capture record of the same zip URL. This is approximate (the record adds a few hundred bytes of HTTP headers). As a check, the record for Kenney's Building Kit (1,530,865 B) matches the "1.5 MB" its itch.io page states.

---

## 1. Recommended set

One primary furniture kit (Kenney), Poly Haven surfaces and sky, an ambientCG lawn, and Kenney nature.

| # | Role | Asset | Size | Licence as stated on the page |
|---|---|---|---|---|
| 1 | Furniture + doorways | Kenney Furniture Kit 1.0 | not stated; about 5.0 MB (archive record 4,995,338 B) | "Creative Commons CC0" |
| 2 | Trees, bushes, flowers | Kenney Nature Kit | not stated; about 9.8 MB (archive record 9,752,502 B) | "Creative Commons CC0" |
| 3 | Wood floor | Poly Haven Laminate Floor 02, 1K JPG: diff + nor_gl + arm | 1,833,193 B (1.83 MB) | "CC0" |
| 4 | Tile floor | Poly Haven Interior Tiles, 1K JPG: diff + nor_gl + arm | 1,674,197 B (1.67 MB) | "CC0" |
| 5 | Painted plaster wall | Poly Haven Beige Wall 001, 1K JPG: diff + nor_gl + arm | 273,866 B (0.27 MB) | "CC0" |
| 6 | Lawn | ambientCG Grass 004, 1K-JPG zip | stated "10 MB" (API: 11,003,149 B) | "All assets are released under the Creative Commons CC0 license" |
| 7 | Sky and IBL | Poly Haven Kloppenheim 06 (Pure Sky), 1K .hdr | 1,173,154 B (1.17 MB) | "CC0" |

**Total source download: about 30.7 MB** (30,705,399 B).
- The 2K HDRI (4,434,394 B) instead of the 1K one gives about 34.0 MB.
- A procedural lawn instead of item 6 gives about 19.7 MB.
- Kenney City Kit (Suburban) for the trees instead of the Nature Kit (stated 1.9 MB on itch.io) gives about 22.9 MB.

**Shipped payload (what the page loads): estimated 10 to 15 MB.** This is an estimate, not a measurement.
- Furniture: a third-party GLB-only repack of all 140 Kenney furniture models is a 2.7 MB zip, so the 40 to 60 models a scene uses come to about 1 to 2 MB.
- Nature: about 10 GLBs, under 0.5 MB.
- Wood, tile and plaster maps: 3.78 MB (exact).
- Grass: Color + NormalGL + Roughness out of the 11 MB zip, size not published; measure after download.
- HDRI: 1.17 MB (1K) or 4.43 MB (2K).

Why this set is coherent:
- Kenney's own sample render for the Furniture Kit is a roof-off isometric house: warm wood floors, white walls, red sofas, a fitted kitchen, a bathroom with a bath and shower, a bedroom and a desk corner. That is the Sims build-mode look, and it reads well at bird's-eye.
- The Nature Kit is by the same author, in the same flat-colour low-poly style.
- The three Poly Haven surfaces were picked for low visual noise, so the photo textures do not fight the flat-coloured furniture: smooth laminate, soft-bevel ceramic tiles, and a matte plaster with an almost flat albedo.
- The sky is low contrast and warm.

---

## 2. Gaps the set leaves, and how to fill them

| Gap | Fill |
|---|---|
| **Wardrobe** (no wardrobe in Kenney or Quaternius) | Stand-in: Kenney "Bookcase Closed Doors" or "Bookcase Closed Wide". Or build it procedurally: a box, two door panels and two bar handles (5 boxes), using the Kenney wood colour. |
| **Standalone window frames.** Kenney has windows only as a wall segment ("Wall Window"), which does not fit procedural walls with cut openings. | Quaternius Ultimate House Interior `Window_Large1/2`, `Window_Small1-3` and `Window_Round1-3` (CC0, FBX, convert to GLB). Or build them procedurally: 4 frame boxes, a sill, and a glass plane (`MeshPhysicalMaterial`, transmission or low opacity). |
| **Interior doors beyond Kenney's doorway pieces.** Check on import whether "Doorway", "Doorway Front" and "Doorway Open" carry a wall section. | Quaternius `Door_1` to `Door_9` and `Door_Double` (standalone, FBX). |
| **Walls, floors, skirting, the house shell** | Procedural, from the room polygons, with items 3 to 5. Kenney "Paneling" works as wainscot. No ceilings are needed with the roof off. |
| **Kitchen worktop runs of arbitrary length** | Tile the 1-unit Kenney cabinets. Make the worktop slab a procedural box. |
| **Few house plants** (Kenney has "Potted Plant" and "Plant Small" only) | Quaternius `Houseplant_1` to `Houseplant_8` (FBX). Or Tiny Treats House Plants, but it is 17 MB and pastel, so it is a poor fit. |
| **Wall art, cushions, curtains, small decor** | Wall art: procedural picture frame (box plus a canvas texture). Curtains: Quaternius `Curtains_Single` and `Curtains_Double`. Cushions and frames: KayKit Furniture Bits has them, but in a chunkier style. |
| **Square shower** (Kenney has "Shower Round" only) | Procedural glass box and tray. |
| **Garden paths, edging, patio** | Procedural. The Nature Kit has fences. |

---

## 3. Recommended items in detail

### 3.1 Kenney Furniture Kit (primary furniture)
- Page: https://kenney.nl/assets/furniture-kit
- Direct download: https://kenney.nl/media/pages/assets/furniture-kit/440e0608a4-1677580847/kenney_furniture-kit.zip. The page shows this link behind "Continue without donating...". The hash segment changes when Kenney updates the page, so re-copy it if it 404s.
- Licence on page: "Creative Commons CC0". Version 1.0, "Released in 2018". "Files 140×".
- Format: not stated on the page.
  - The zip ships `.glb` files in `Models/GLTF format/`. Source: a third-party build script (`scripts/fetch-assets.mjs` in github.com/ChingAmazing/OpenHome3D-html), which extracts the GLBs without converting them.
  - The Poly Pizza mirror (https://poly.pizza/bundle/Furniture-Kit-NoG1sEUD1z, "Public Domain (CC0)", 116 models) offers "Download FBX" and "Download GLTF".
- Size: not stated. About 5.0 MB (archive record, captured 2026-10-01). The Eclair Assets GLB-only repack of the same 140 models is stated at 2.7 MB.
- Materials: flat colours, no textures. The OpenHome3D README says "GLB assets keep their original flat colors".
- Style fit:
  - Best of the CC0 kits checked for this brief. It is clean, warm and slightly toy-like, with realistic proportions and very readable silhouettes from above.
  - At eye level the low polygon count shows. Per-material roughness, contact AO and soft shadows lift it towards "stylized realism".
  - Scale is not documented. Check it against a 1 m reference on import. OpenHome3D keeps per-model real-world size rules (`scripts/size-rules.mjs`), which suggests the models needed normalising.
- Coverage. Model names are from the Poly Pizza listing; some names are cut off there.
  - Sofa: Lounge Sofa, Lounge Sofa Long, Lounge Sofa Corner, Lounge Design Sofa (+ corner)
  - Armchair: Lounge Chair, Lounge Design Chair
  - Coffee table: Coffee Table, Table Coffee Glass, Table Coffee Square
  - TV and stand: Television, Television Vintage, Cabinet Television, Cabinet Television Doors
  - Dining: Table, Round Table, Table Cross, Table Cross Cloth; Chair, Chair Cushion, Chair Rounded, Chair Modern Cushion
  - Kitchen: Kitchen Cabinet, Kitchen Cabinet Corner, Kitchen Cabinet Drawer, Kitchen Cabinet Upper (+ variants), Kitchen Sink, Kitchen Bar
  - Fridge: Kitchen Fridge, Kitchen Fridge Large, Kitchen Fridge Small, Kitchen Fridge Built In
  - Stove: Kitchen Stove, Kitchen Stove Electric, Kitchen Hood Large, Kitchen Microwave
  - Bed: Bed Single, Bed Double, Bed Bunk
  - Nightstand: Cabinet Bed, Cabinet Bed Drawer, Cabinet Bed Drawer Table, Side Table, Side Table Drawers
  - Wardrobe: none
  - Desk and chair: Desk, Desk Corner, Desk Chair, Computer Screen, Computer Keyboard, Laptop
  - Bookshelf: Bookcase Open, Bookcase Open Low, Bookcase Closed, Books
  - Toilet: Toilet, Toilet Square
  - Sink: Bathroom Sink, Bathroom Sink Square, Bathroom Mirror, Bathroom Cabinet
  - Bath and shower: Bathtub, Shower Round
  - Rug: Rug Rectangle, Rug Round, Rug Rounded, Rug Square, Rug Doormat
  - Plants: Potted Plant, Plant Small
  - Doors: Doorway, Doorway Front, Doorway Open, Wall Doorway, Wall Doorway Wide
  - Windows: Wall Window (a wall segment only)
  - Extras: Washer, Dryer, lamps, Ceiling Fan, Coat Rack, Trashcan, Toaster, Coffee Machine, Blender, Radio, Speaker, Paneling, Stairs

### 3.2 Kenney Nature Kit (trees and bushes)
- Page: https://kenney.nl/assets/nature-kit
- Direct download: https://kenney.nl/media/pages/assets/nature-kit/37ac38a37b-1677698939/kenney_nature-kit.zip (behind "Continue without donating...")
- Licence on page: "Creative Commons CC0". Version 1.0, "Released in 2020". "Files 330×".
- Format: not stated on the page. Expect the same layout as the Furniture Kit; confirm after download.
- Size: not stated. About 9.8 MB (archive record, captured 2026-09-15). OpenGameArt's older "Nature Kit (2.1).zip" is stated at 10.5 MB (https://opengameart.org/content/nature-kit).
- Contents (preview): round, pine, palm and autumn trees, bushes, flowers, grass tufts, rocks, fences, logs.
- Style fit: matches the furniture exactly (same author, flat colour, low poly). Its greens lean teal, so override the leaf material colour towards a warm green for the Sims palette. Only about 10 models ship, so the 9.8 MB zip is a one-time download cost.
- Lighter alternative: Kenney City Kit (Suburban).
  - Page: https://kenney.nl/assets/city-kit-suburban ("Creative Commons CC0", v2.0 "Completely remade").
  - itch.io (https://kenney-assets.itch.io/city-kit-suburban) states `kenney_cityKitSuburban.zip`, 1.9 MB, and OBJ/FBX/DAE/STL/glTF.
  - Its trees are small and plain.

### 3.3 Wood floor: Poly Haven Laminate Floor 02
- Page: https://polyhaven.com/a/laminate_floor_02 (licence on page: "CC0").
- Direct files (1K JPG, from the Poly Haven files API):
  - https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/laminate_floor_02/laminate_floor_02_diff_1k.jpg (721,641 B)
  - https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/laminate_floor_02/laminate_floor_02_nor_gl_1k.jpg (515,725 B)
  - https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/laminate_floor_02/laminate_floor_02_arm_1k.jpg (595,827 B)
- Covers 1.7 m × 1.7 m (1K is 6 px/cm).
- Style fit: Poly Haven describes it as smooth, even brown planks with subtle grain, a light satin sheen and fine seams. It is the least noisy wood checked, warm and clean.
- Alternative: ambientCG WoodFloor051 (tags: clean, modern, polished, light). Its 1K-JPG zip is 5,104,319 B: https://ambientcg.com/get?file=WoodFloor051_1K-JPG.zip

### 3.4 Tile floor: Poly Haven Interior Tiles
- Page: https://polyhaven.com/a/interior_tiles (licence on page: "CC0").
- Direct files (1K JPG):
  - https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/interior_tiles/interior_tiles_diff_1k.jpg (694,562 B)
  - https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/interior_tiles/interior_tiles_nor_gl_1k.jpg (414,639 B)
  - https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/interior_tiles/interior_tiles_arm_1k.jpg (564,996 B)
- Covers 1.9 m × 1.9 m.
- Style fit: beige ceramic squares with dark grout, soft bevels and a low sheen. This is the classic Sims kitchen and bath floor.
- Alternatives:
  - Poly Haven `tiled_floor_001`: warm brown large tiles, 1.5 m.
  - ambientCG Tiles101 (clean painted pattern): 1K-JPG zip 5,942,649 B.

### 3.5 Painted plaster wall: Poly Haven Beige Wall 001
- Page: https://polyhaven.com/a/beige_wall_001 (licence on page: "CC0").
- Direct files (1K JPG):
  - https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/beige_wall_001/beige_wall_001_diff_1k.jpg (33,074 B)
  - https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/beige_wall_001/beige_wall_001_nor_gl_1k.jpg (153,434 B)
  - https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/beige_wall_001/beige_wall_001_arm_1k.jpg (87,358 B)
- Covers 3 m × 3 m.
- Style fit: smooth, matte painted plaster with subtle grain. The albedo is almost flat (a 33 KB diffuse), so it tints well per room, like Sims wall paint. Keep the normal and ARM maps and multiply the colour per room.
- Alternative: ambientCG PaintedPlaster017 (white). Its 1K-JPG zip is 4,721,132 B. A white base tints more accurately but costs 17 times as much.

### 3.6 Lawn: ambientCG Grass 004
- Page: https://ambientcg.com/view?id=Grass004
- Licence on page: "All assets are released under the Creative Commons CC0 license, making them free to use without attribution."
- Direct download: https://ambientcg.com/get?file=Grass004_1K-JPG.zip (link from ambientCG's API).
- Size: the page states 1K-JPG "10 MB"; the API gives 11,003,149 B. Released 2021-03-28. Covers about 1.4 m × 1.4 m.
- Tags: dense, garden, lawn, lush, short, soft, suburban.
- Poly Haven has no green lawn. Its grass, terrain and natural categories hold only dry, sparse, path or rocky grass. Every ambientCG 1K grass zip is 10.0 to 11.0 MB (Grass001 to Grass008 checked) because each zip carries 6 or more maps.
- Use NormalGL, not NormalDX.
- Style fit: photographic, and slightly more realistic than everything else in the set. From above, the 1.4 m repeat shows, so break it up with a large-scale noise tint. A cheaper option is a procedural lawn (flat warm green plus noise), which saves about 11 MB.
- Alternative: Grass005 (tags: clean, lawn, short; released 2025-02-02). Its zip is 10,442,657 B.

### 3.7 Sky: Poly Haven Kloppenheim 06 (Pure Sky)
- Page: https://polyhaven.com/a/kloppenheim_06_puresky (licence on page: "CC0").
- Direct files:
  - 1K .hdr: https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloppenheim_06_puresky_1k.hdr (1,173,154 B)
  - 2K .hdr: https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/kloppenheim_06_puresky_2k.hdr (4,434,394 B)
  - The .exr versions are 4 to 5 times larger.
- Description on page:
  - "Edited sky-only version of Kloppenheim 06".
  - Attributes: Sunset, Partly Cloudy, Low contrast. 12 EVs, 5319K.
  - Alt text: "Soft, low-contrast sunrise with warm sun rays breaking through scattered clouds, cool blue ambient light."
- Style fit: golden hour without harsh contrast. The warm key and blue fill suit the Sims mood. As a pure sky with no ground, it does not compete with the scene's own lawn.
- Use it for IBL and the background, and keep a DirectionalLight for crisp shadows.
- Alternatives:
  - Soft daylight: `kloofendal_48d_partly_cloudy_puresky`, the most downloaded pure sky on Poly Haven (879k). 1K .hdr 1,435,119 B; 2K 5,451,493 B.
  - Warmer sunset: `belfast_sunset_puresky`. 1K 1,190,247 B; 2K 4,563,204 B.

---

## 4. Other candidates checked

| Candidate | Page | Licence on page | Format | Size | Verdict |
|---|---|---|---|---|---|
| **Quaternius Ultimate House Interior Pack** (June 2020, 123 models) | https://quaternius.com/packs/ultimatehomeinterior.html. Its Download button opens a Google Drive folder: https://drive.google.com/drive/folders/1SNK9PwPi8xqqxmpU5xEZeiQjB26C1oX6. Mirror: https://opengameart.org/sites/default/files/ultimate_house_interior_pack_-_june_2020.zip | "CC0" | FBX, OBJ, Blend (no glTF). Flat colours, not textured. | Not stated on the page. The OpenGameArt mirror states 12.8 MB. Each FBX in Drive is 15 to 71 KB. | **Best secondary.** Softer, rounder forms with near-Sims proportions. Has 10 doors, 8 windows, 8 houseplants, curtains, 3 beds, couches, a kitchen with fridge and oven, and a bath with toilet, sink, shower and washing machine. It has **no TV, desk or computer**, so it cannot be the primary. Needs FBX to GLB conversion. A different modelling hand, so share one material pass when mixing it with Kenney. |
| **KayKit Furniture Bits** (Kay Lousberg) | https://kaylousberg.itch.io/furniture-bits (itch purchase flow, "name your own price"). Mirror: https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0 | "Creative Commons Zero v1.0 Universal" | OBJ, FBX, GLTF. One 1024² gradient atlas. | Stated: free tier 3.6 MB | Chunky, bevelled, saturated toy look: charming but more cartoon than Sims. The free tier has beds, couch, armchair, tables, chairs, shelves, rugs, lamps, frames and cacti, but **no kitchen, bathroom, TV or desk**. |
| **Tiny Treats** (Isa Lousberg): Charming Kitchen, Bubbly Bathroom, House Plants, Homely House | https://tinytreats.itch.io/ | "Creative Commons Zero v1.0 Universal" | OBJ, FBX, GLTF. Gradient atlas. | Stated: Kitchen 6.6 MB, Bathroom v1.1 5.4 MB, Plants 17 MB, House 3.1 MB | Pastel and cute. The **living room and bedroom sets are paid ($7.95)**, so a full CC0 set is impossible. The bathroom set lists no toilet or sink. |
| **KayKit Restaurant Bits** | https://kaylousberg.itch.io/restaurant-bits | "Creative Commons Zero v1.0 Universal" | OBJ, FBX, GLTF | Stated: free tier 10 MB | Commercial-kitchen props, not a home kitchen. |
| **Kenney Building Kit** (2024) | https://kenney.nl/assets/building-kit. Zip: https://kenney.nl/media/pages/assets/building-kit/0de7aaa492-1743244741/kenney_building-kit.zip | "Creative Commons CC0" | itch.io: OBJ, FBX, glTF | itch.io states 1.5 MB | Exterior modular walls with integrated doors and windows, in Kenney's newer shared-colour-map look (grey-violet default). It does not match the 2018 furniture. Optional for a house shell only. |
| **Poly Haven models** (for example ArmChair_01) | https://polyhaven.com/models | "CC0" | glTF + 1K JPG | ArmChair_01 at 1K is 769,144 B | Photoreal, so the style clashes. Few household types, and about 0.8 MB per model breaks the budget. |
| **Anker's Assets Low Poly Household Items** | https://ankersassets.itch.io/low-poly-household-item-pack | "Creative Commons Zero v1.0 Universal" | FBX only | Stated: 1.8 MB | 100+ props, FBX only. Style not reviewed. A possible prop filler. |
| **Quin.GS Free Low-Poly Furniture** | https://quin-gs.itch.io/furniture-lowpoly-cc0 | "released under CC0" | One FBX | Stated: 238 kB | 22 props only. |
| **Eclair Assets Furniture Kit GLB Pack** | https://eclair-assets.itch.io/furniture-kit-glb-pack-140-free-cc0-3d-models | CC0 (unofficial repack of Kenney's kit) | GLB | Stated: 2.7 MB | Same models as 3.1. Prefer Kenney's original. Useful only as a size reference. |

Excluded because the licence is not CC0 or is not stated:
- Se1dev "Free Low Poly Furniture Pack 240+": a custom licence that forbids resale as an asset pack.
- Amano007 Low Poly Interiors MegaKit: licence not stated, and the full kit is paid.
- Fancy Fat Frog PolyKit Home: licence in a separate file, and the full pack is paid.
- nappin House Interior Free: no licence, and Unity package only.
- ITHappy Cute Furniture Free: licence not stated on the page.
- reodesuxz Low Poly Furniture Pack: "free for commercial use", which is not CC0.
- Penzilla Ultimate Interior: paid, and 2D only.

---

## 5. three.js notes

- **Kenney materials** are flat colours. Traverse the loaded GLTF and set `roughness` and `metalness` by material name, then warm the palette slightly. A shared material pass is also what lets Quaternius extras sit next to Kenney.
- **Poly Haven ARM** packs AO, roughness and metalness into R, G and B. three.js reads `aoMap` from R, `roughnessMap` from G and `metalnessMap` from B, so one texture feeds all three. `nor_gl` is the OpenGL normal convention that three.js expects. Set `colorSpace = SRGBColorSpace` on diffuse maps only.
- **Optional payload cuts:**
  - KTX2 (Basis) compression of the textures with gltf-transform.
  - Downscaling the lawn maps to 512 px.
  - Loading the 1K HDRI for `scene.environment` and using a gradient sky shader for the background.

## 6. Still to verify after download (not checkable from the pages)

- That the Kenney Furniture Kit zip contains GLBs (third-party evidence only), and what scale its models use.
- Whether Kenney's "Doorway" pieces include a wall section.
- The Nature Kit's formats.
- The per-map sizes inside the ambientCG grass zip.
