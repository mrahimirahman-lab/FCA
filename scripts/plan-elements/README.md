# Qwen plan elements: walls, door openings and window openings

This separate pilot uses **source annotation geometry** from CubiCasa5K. It does not rename room categories into printed room names. It does not change FCA, the previous datasets, adapters or test scores. Actual user SVGs/images, annotations and datasets remain local and must not be committed to the public repository. CubiCasa5K is CC BY-NC 4.0; preserve attribution and its noncommercial terms.

`prompt-ms.txt` supplies a technical reader role and observable checks: shape/continuity, thickness as one cue rather than a rule, openings and door/window symbols, then coordinate validation. Responses contain only the supervised result JSON. The tool **does not fabricate chain-of-thought explanations**, infer line weights from SVG stroke metadata, infer beam/load-bearing functions, or claim that instruction wording alone teaches tracing. More detailed sequential tasks need their own verified annotations.

## Exact geometry contract

- `DINDING` = bounding rectangle of the complete source `Wall` polygon. Some walls span openings, which are separate nested annotations; this is not a binary mask of uninterrupted masonry.
- `PINTU` = bounding rectangle of the source `Door` threshold/opening polygon. **Not the full door leaf/swing arc.** Swing paths are not automatically turned into target geometry.
- `TINGKAP` = bounding rectangle of the source `Window` opening polygon.
- Raw SVG vertices/ancestor transforms are in the actual `F1_scaled.png` pixel frame, following the official loader. Root SVG dimensions/viewBox are not used to rescale them. Outputs use `[left,top,right,bottom]` normalized to 0–1000.
- Source SVG IDs such as `Wall` repeat. Deterministic XML paths distinguish actual instances. Nested window/door annotations are counted once, with their explicit parent wall recorded for audit. Host relationships are **not yet training targets**.
- Column/beam/railing/space annotations are outside this pilot. Some `Column` source nodes have different geometry representations; no universal column extractor is claimed. Raster stroke endpoints, dash patterns, dimension/grid lines and L/T/X wall junctions are not currently annotated by this converter. Those tasks require additional validated geometry or CAD references.

## Review before export

Keep `prepare.py`, `prompt-ms.txt` and `review.html` together. On Windows the pinned, hash-checked `start.ps1 -ReleaseRef <commit>` downloads generic helpers plus `scripts/cubicasa/prepare.py` as `cubi_geometry.py`, asks for the source folder, and audits six source pairs using the existing Unsloth Python. Locally in this repository:

```sh
python scripts/plan-elements/prepare.py audit /path/to/cubicasa-source /path/to/new-element-review --limit 6
```

Input can also be a ZIP, using the same bounded safe source reader as the room converter. This produces `manifest-elemen.json`, normalized RGB PNGs, `ROLE-PROMPT.txt`, `LESEN.txt` and **`BUKA-SEMAKAN-ELEMEN.html`**. It does **not** generate training data or start the GPU. Inspect each class filter and instance alignment, then tick only drawings whose complete supported elements have been checked and save **`semakan-elemen.json`**. Polygons with flagged geometry are held out; no clamping/trimming/guessed repair is applied.

A few source drawings validate the conversion, not generalization. Once the targets are checked, audit more independent drawings and export with deliberate full-drawing splits. Keep the existing 20 CubiCasa test drawing IDs out of training; they have already been examined, so do not describe them as a new blind test. Preserve source directory paths and use matching full IDs; do not guess membership from numeric basenames if paths differ. The previous batch's custom split lists may be reused only when IDs/source identities match. The converter does not automatically match old/new roots or verify claimed official split membership.

```sh
python scripts/plan-elements/prepare.py export /path/to/audit /path/to/semakan-elemen.json \
  /path/to/train.txt /path/to/validation.txt /path/to/new-export --test-list /path/to/test.txt
```

Approved IDs need a matching manifest hash and prompt hash. Both train and validation require independent drawings. Split overlap, repeated exact SVG/RGB hashes, changed image pixels/canvas, or changed label/geometry are rejected before writing. Exact hashes do not detect every near-duplicate source plan. Exports embed the images into ShareGPT `image`/`conversations` Parquet with one positive target-category query per row. One query asks for **all instances of that one category**. Unsupported categories, room names, asset codes, fabricated negative targets and synthetic rationale text are not added.

A category with **more than 32 instances in one image is skipped and logged**, never truncated to the first 32 or falsely labeled absent. This initial whole-image context cap means some dense drawings have no wall task; inspect `skipped_dense_tasks` before training. Dense wall drawings need a separately validated crop/tiling workflow. The cap is only a conservative output-count bound; the actual Qwen processor/token length and GPU fit still need checking on the target machine. No context-length, VRAM-fit or accuracy guarantee is made. This is a preparation workflow, not a complete run-ready training profile.

Outputs are `Elemen-train.parquet`, `Elemen-validation.parquet`, optional `Elemen-test.parquet`, `manifest-eksport-elemen.json` and license. Train a **fresh adapter from the original Qwen3-VL-2B-Instruct**, separately from the room-type adapter, after checking data and resource limits. Evaluate by element class, box IoU, detection precision/recall and output failures; prior room IoU scores are a different task. If the eventual goal is pixel-exact CAD lines, use segmentation/vectorization references and line/polygon metrics in addition to Qwen's box detection.

## Synthetic checks

```sh
HF_HUB_OFFLINE=1 HF_DATASETS_OFFLINE=1 python -m unittest discover -s scripts/plan-elements -p 'test_*.py'
```

Checks cover raw-pixel frames despite differing SVG dimensions, inherited transforms, repeated SVG IDs, direct polygons rather than nested glass duplication, explicit host-wall relations, door opening versus swing-arc extent, invalid source geometry, reviewed embedded Parquet, split/changed-image rejection, dense-task handling and bootstrap hashes. They do not test actual model training.
