# Third-party assets

All models, textures and HDRIs below are **CC0 (public domain)**: no attribution
required, commercial use allowed.

## Models — [Poly Haven](https://polyhaven.com) (1k resolution, in `/public/models`)

| Folder | Asset |
|---|---|
| `Sofa_01/` | Sofa 01 |
| `coffee_table_round_01/` | Coffee Table Round 01 |
| `outdoor_table_chair_set_01/` | Outdoor Table Chair Set 01 |
| `potted_plant_04/` | Potted Plant 04 |

## Car — [Kenney](https://kenney.nl) Car Kit 3.1 (CC0, in `/public/models/car`)

`car.glb` + `Textures/colormap.png`. Shown with the scene's own muted paint and
glass materials in place of the kit's palette colours.

## Sky HDRI — [Poly Haven](https://polyhaven.com) (in `/public/hdri`)

| File | Asset | Use |
|---|---|---|
| `sky_1k.hdr` | Kloofendal 48d Partly Cloudy (Pure Sky), 1k | Daytime image-based lighting and reflections |

## PBR texture sets (1K JPG, in `/public/textures`)

Each set is `<name>_color / _normal / _rough (/ _ao)`. Colour maps were
resized, mildly desaturated and brightness-normalised so the scene can tint
them from the catalog colours.

| Set | Source | Asset |
|---|---|---|
| `grass_*` | [ambientCG](https://ambientcg.com) | Grass001 |
| `paving_*` | ambientCG | PavingStones128 |
| `moss_*` | ambientCG | Moss002 (hedges, tree canopies) |
| `brick_yellow_*` | Poly Haven | Brown Brick 02 |
| `brick_red_*` | Poly Haven | Red Brick 03 |
| `brick_mixed_*` | Poly Haven | Brick Wall 001 |
| `brick_grey_*` | Poly Haven | Brown Brick 02 (desaturated, for painted brick) |
| `slate_*` | Poly Haven | Roof Slates 02 |
| `clay_*` | Poly Haven | Clay Roof Tiles 03 |
| `tile_grey_*` | Poly Haven | Roof Tiles 14 |
| `planks_*` | Poly Haven | Brown Planks 09 |
| `plaster_*` | Poly Haven | White Plaster Rough 01 |
| `bark_*` | Poly Haven | Bark Brown 02 |

## Texture transcoder — [Basis Universal](https://github.com/BinomialLLC/basis_universal) (Apache 2.0, in `/public/basis`)

`basis_transcoder.js/.wasm`, as shipped with three.js, decode the `.ktx2` texture files at load time.
