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

## Larger batch after the six-image review

`start-batch.ps1 -ReleaseRef <pinned commit>` runs the CPU-only batch generator. It asks for the saved individual review JSON, finds its exact matching `manifest-elemen.json` among local Downloads audit folders (or prompts for it), asks for the **previous room batch's `dataset/manifest-eksport.json`**, and asks for the full original CubiCasa SVG/PNG source folder. These files/images remain local. It downloads only pinned, SHA-256-checked generic helpers. It does not load model weights or start training.

```sh
python scripts/plan-elements/batch.py /path/to/source /path/to/previous-room-batch \
  /path/to/manifest-elemen.json /path/to/semakan-elemen.json /path/to/new-element-batch
```

The review/manifest/prompt hashes must match; calibration geometry is rechecked. The prior room audit/export hash relationship, all full-drawing split memberships, duplicate source hashes and image counts are validated. Source directory names only identify *candidate* files: both the actual SVG SHA-256 and decoded PNG RGB hash/canvas must match the **previous audit** before source geometry is reused. A changed source or missing image is fatal and cannot silently become a quality exclusion. This allows different directory roots without inferring split membership from a numeric basename.

The batch uses a **subset of the existing train/validation/test split**, preserving every retained image's original assignment. It does not fill a small validation/test set with training images. This is not the official CubiCasa benchmark, and the reused test set is already examined. Geometry failures are logged; drawings must have all three supported classes with 1–32 instances per class and no geometry quality flags. Dense tasks are excluded as complete drawings for this initial pilot, not truncated. This deliberately selects relatively compact three-class drawings; it does not establish performance on complex or class-absent plans. At least **30 train, 5 validation and 5 test drawings** must remain, otherwise the source audit/provenance is retained and **no training Parquet** is produced.

Each retained drawing creates exactly three positive queries, one per element class. `dataset/` contains `Elemen-train.parquet`, `Elemen-validation.parquet`, `Elemen-test.parquet`, `manifest-eksport-elemen.json`, license and an initial `Elemen-config.yaml`. `audit/` provides a class-filtered review with split labels and a disclosure that the batch used automated screening after individually reviewed calibration. Only source images whose hashes match the reviewed calibration are counted as individually reviewed; the entire batch is **not** described as manually approved. `provenans-batch.json` records root mapping and excluded drawings. The six calibration reviews establish a checked conversion sample, not that all additional annotations are perfect.

The initial **FCA-ELEMEN-01** profile starts from the original Qwen3-VL-2B-Instruct, QLoRA, frozen vision layers, context 4096, image size 768, LR 2e-5, rank 8/alpha 16, microbatch 1/accumulation 4 and `ceil(training_rows/4)` optimizer steps, with Eval Steps 0.5. It must be loaded after selecting the new training and validation files. The test file is reserved for later evaluation. This is a resource-conscious trial profile, **not a verified maximum processor length or VRAM-fit guarantee**. Check full target preservation in the user's Unsloth processor/data preview before starting; no training execution or improvement is claimed.

```sh
HF_HUB_OFFLINE=1 HF_DATASETS_OFFLINE=1 python -m unittest discover -s scripts/plan-elements -p 'test_*.py'
ELEMENTS_TEST_PYTHON=python3 node --test scripts/plan-elements/test_review.mjs
```

Additional synthetic checks cover verified source mapping across directory roots, exact split preservation, calibration provenance, full-class task balance, altered source/stale review rejection, dense-drawing exclusions, minimum-data failure without Parquet, profile generation and offline review/download behavior. No user data is included in these tests.

## Evaluate the trained element adapter by class

`start-evaluation.ps1 -ReleaseRef <pinned commit>` asks for `dataset/manifest-eksport-elemen.json` in the generated element batch. It downloads only generic hash-checked helpers, verifies the element audit/export/prompt relationship and split disjointness, checks test PNG RGB hashes/canvases, source duplicate hashes and all target geometry, and produces a new offline `BUKA-UJIAN-ELEMEN.html`. Training/validation examples are not included.

```sh
python scripts/plan-elements/evaluate.py /path/to/element-batch /path/to/new-element-evaluation
```

There are **three queries per test drawing**, with exactly the same one-category prompts exported during training. With 14 test drawings this yields **42 tasks**, not 42 independent drawings. The PNG for a drawing is copied only once. Each query's ID includes its drawing and target class. The page identifies the compared models as the original Qwen3-VL-2B-Instruct and **FCA-ELEMEN-01**, and keeps the existing result validation, matching, output-failure recording and local session/import/export behavior from the room comparison tool. It does not run inference, load weights, send requests to Unsloth or modify the adapter.

Start with the three queries for one drawing, each in a new Unsloth comparison chat with the same clean image, prompt and generation settings for both models. Use the PNG download; do not submit a screenshot containing reference overlays. Copy the page's exact prompt rather than a generic question asking for all classes. An identical image may be reused for the three fresh chats, but changing the page selector never changes Unsloth's attachment. Export results after each session; malformed outputs are recorded without changing/clamping coordinates, and valid empty predictions are still scored as empty.

Results use `plan_elements_paired_test_results`, `case_unit: single_element_class_query`, and explicit **task** counts (`expected_tasks`, `attempted_tasks`, `completed_tasks`) plus `source_drawings` and drawing progress. Per-class summaries show paired-valid task counts, mean box IoU, detection precision/recall and output-failure rates. These summaries are conditional on the same valid-pair subset within each class; they must be read together with failure rates. They are not full-set accuracy if some tasks fail. Test reference fingerprints bind the class-specific geometry and prompt; imports from room benchmarks or another element reference version are rejected. The report is deliberately incompatible with the room report kind, and is not a room-name OCR or CAD-line benchmark.

The element page uses the already-tested Hungarian scoring engine for one-to-one same-label assignments, and reports output failures separately. The UI template has element/task-specific wording and per-class metrics; do not replace it with an older room-evaluator repair template.

```sh
ELEMENTS_TEST_PYTHON=python3 node --test scripts/plan-elements/test_evaluator.mjs
```

Additional checks cover exact test-only class prompts, one clean image shared by three independently identified tasks, changed image/reference rejection, per-class failure accounting, explicit drawing/task counts, export/import and mobile behavior. These tests use synthetic drawings; they do not measure model accuracy.
