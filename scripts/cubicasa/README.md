# CubiCasa5K → reviewed Qwen3-VL room-type grounding

This CPU-only tool audits real `F1_scaled.png`/`model.svg` pairs and can export visually reviewed, explicitly split samples to Unsloth ShareGPT-with-images Parquet. It does not download or train a model or change FCA/Ollama. Real images, SVGs and generated datasets stay local; repository tests contain synthetic fixtures only.

## Coordinate and label contract

The [official CubiCasa5K loader](https://github.com/CubiCasa/CubiCasa5k/blob/master/floortrans/loaders/svg_loader.py) passes `F1_scaled.png` pixel dimensions to its SVG parser. SVG vertex coordinates are used directly in that PNG frame. **Do not scale vertices by the SVG root width/height or viewBox** when those differ from the PNG. Ancestor and polygon affine transforms are applied; unsupported syntax, CSS transforms, clipping and nested viewports are rejected. No SVG scripts, external images or other active markup are rendered by the review page: it generates overlays from numeric polygons.

Output coordinates are `[left, top, right, bottom]`, normalized to 0–1000 using the actual PNG dimensions. Full polygons, source UUIDs, raw pixel bounds, SVG metadata and source hashes remain in the audit. Bounds outside the image are rejected, not clamped. The source image is never geometrically resized/cropped by this converter; transparency is flattened onto white for RGB inputs.

SVG `Space` classes describe **semantic room types**, not necessarily the text printed on the plan. The initial mapping includes Bedroom → BILIK TIDUR, Kitchen → DAPUR, LivingRoom → RUANG TAMU, Bath → BILIK AIR, Entry → RUANG MASUK, Closet → RUANG ALMARI, Utility → RUANG UTILITI, Storage → STOR and DraughtLobby → LOBI PENAMPAN. Subclass text and original IDs are retained. Outdoor, Undefined, UserDefined and other unmapped classes are logged as excluded, not silently renamed into rooms. Doors, windows and furniture are not `Space` training targets.

Same-type instances remain separate. A category task asks for **all rooms of that type**, followed by a multi-type task covering exactly the supported classes. No bedroom numbers, entrance order, asset codes, material classifications or real-world measurements are invented. There are no fabricated negative targets based only on missing semantic classes. The training contract is a JSON list of `label`/`bbox_2d` objects.

This task differs from the earlier FCA task of reading actual names such as BILIK 1. Directly scoring BILIK TIDUR against a BILIK 1 reference would give a label mismatch; a deliberate type/name mapping and separate benchmark are needed before judging transfer or integrating the result with FCA.

## Audit first

Keep `prepare.py` and `review.html` together. Use the existing Unsloth Python with Pillow; `datasets` is only imported for export:

```powershell
& 'C:\pinokio\api\unsloth.git\env\Scripts\python.exe' prepare.py audit 'C:\path\CubiCasa-sampel.zip' 'C:\path\CubiCasa-review-new'
```

Input may be an extracted dataset directory or a ZIP; selected files are read without unpacking the whole ZIP. The default audit limit is 20 paired samples, adjustable with `--limit 100` (maximum 200 per review batch). Selection is sorted, not a claim of random sampling. On a full dataset, review a batch with samples from both supplied train and validation lists. Keep the original category/sample directory paths for reliable split matching; do not rename all samples to generic `sample-01` folders.

The audit produces `manifest-cubicasa.json`, normalized RGB PNGs, `LESEN.txt` and the standalone offline `BUKA-SEMAKAN-CUBICASA.html`. **It does not create training Parquet yet.** Inspect polygon and bbox overlays in the HTML, then export `semakan-cubicasa.json` for eligible samples whose alignment you have reviewed. The bootstrap `start.ps1 -ReleaseRef <full-commit-sha>` can prompt for a ZIP (or use `-Folder` for an extracted directory), hash-check the generic helper/template and open this local review.

The numeric quality check flags extreme polygon tails with less than one pixel of cross-sectional width at 5%, 10% and 15% inside an extreme. It is a **bbox-target quality heuristic**, not a proof of corrupt source annotations or a wall-segmentation metric. It never trims/simplifies those polygons automatically. A flagged image is excluded from export until the reference is repaired and re-audited. Images with more than 24 supported rooms are also held for a separate context-length review. F2 is ignored rather than counted as an independent image: the official input pair uses F1, and variants of one drawing must not cross splits.

## Export only reviewed drawings with explicit splits

```powershell
& 'C:\pinokio\api\unsloth.git\env\Scripts\python.exe' prepare.py export `
  'C:\path\CubiCasa-review-new' 'C:\path\semakan-cubicasa.json' `
  'C:\path\train.txt' 'C:\path\val.txt' 'C:\path\CubiCasa-export-new' `
  --test-list 'C:\path\test.txt'
```

Use the dataset's original split files when available. Lines identify sample directories relative to the audited source root (leading/trailing `/` are supported). Exact paths must match audit IDs. If the sample ZIP has lost category paths, it cannot be matched to the original splits by guessing numeric folder names. Custom lists can be used for a clearly documented pilot, but are not an official benchmark; export metadata records supplied list provenance rather than claiming independently verified original membership.

Train/validation/test lists must be disjoint, even for unselected IDs. Approved IDs must occur in one supplied list; both training and validation need at least one independent approved drawing. Exact duplicate pixels across approved images, stale review fingerprints, changed PNGs and invalid/flagged geometry are rejected **before output is written**. Test-list input is optional; no test file is created when it contains no approved images. Never put all three review samples into training and treat their variants as evaluation.

Exports are `CubiCasa-latihan.parquet`, `CubiCasa-validasi.parquet`, optional `CubiCasa-ujian.parquet`, `manifest-eksport.json` and the license notice. Images are embedded, training rows shuffled deterministically, and each drawing stays in one split. Source and output directories are preserved; existing output directories are refused. Manifest counts distinguish **independent images** from **tasks**. These files do not start training, install packages or download weights.

Three uploaded samples are enough to verify conversion, **not** to establish better generalization. After review, obtain a larger, separately split set for an initial Qwen3-VL-2B experiment. Keep old FCA/MANTIN data and scores separate until label semantics and reference versions are aligned. Reference rectangles around L-shaped rooms inherently include non-room regions; exact contour evaluation requires polygon metrics.

## License and validation

The dataset [license](https://github.com/CubiCasa/CubiCasa5k/blob/master/LICENSE) is **CC BY-NC 4.0** (Attribution-NonCommercial), copyright 2019. Source project: https://github.com/CubiCasa/CubiCasa5k; paper: https://arxiv.org/abs/1904.01920. Preserve attribution and consider the noncommercial terms before production/commercial reuse. Exported data is not relabeled as unrestricted or published with this helper.

```sh
HF_HUB_OFFLINE=1 HF_DATASETS_OFFLINE=1 python -m unittest discover -s scripts/cubicasa -p 'test_*.py'
```

Tests cover PNG-coordinate semantics despite mismatched SVG viewBox sizes, affine transforms, duplicate room types, excluded classes, thin-tail preservation/quarantine, reviewed Parquet round trips, split overlap rejection, image/reference fingerprints, directory/ZIP parity and unsafe-input rejection. Tests do not measure a trained model's accuracy.

## Local batch when original split files have not been supplied

Once the conversion has been checked on representative source samples, the explicit `batch` command offers an alternative using **source annotations and automated quality screening**. It is not the same as individually confirming every drawing in the manual review UI. The selection/export manifests record this distinction; no file is described as having full human approval.

```powershell
& 'C:\pinokio\api\unsloth.git\env\Scripts\python.exe' prepare.py batch 'C:\path\cubicasa5k-full' 'C:\path\CubiCasa-batch-new'
```

The bootstrap equivalent is `start.ps1 -ReleaseRef <full-commit-sha> -Folder -Batch`. Choose the **full dataset root**, not the three-sample ZIP. It audits a seeded random batch of up to 200 candidate pairs, excludes quality-flagged images and repeated exact RGB/SVG hashes, and selects 100 full drawings for training, 20 for validation and 20 for testing. Both candidate order and split selection use seed 3407. F1/F2 and room tasks from the same drawing are not independently split. Exact hashes cannot guarantee removal of all near-duplicate plans.

This is a **custom split**, not CubiCasa5K's official benchmark partition. If original split files become available, use the explicit reviewed `export` workflow instead. Candidate SVG/PNG source hashes, automatic selection provenance, custom split files and selected IDs are retained. Fewer than 140 eligible unique drawings causes the batch to stop with the audit preserved and **no training Parquet**; it does not silently relax quality checks or turn the three review samples into a full training set.

The output has `audit/`, `dataset/CubiCasa-latihan.parquet`, `dataset/CubiCasa-validasi.parquet`, `dataset/CubiCasa-ujian.parquet`, `dataset/CubiCasa-config.yaml`, custom split/selection metadata and Malay instructions. Row counts depend on the room types present, so 100 training drawings are not 100 rows. Check the generated export manifest and image/target overlays before training. If an alignment defect is found, stop and identify the sample before training, rather than repeatedly fitting an incorrect reference.

The initial Qwen3-VL-2B profile starts from the original base, QLoRA 4-bit, frozen vision tower, image size 768, context 4096, response-only loss, rank 8/alpha 16, LR 2e-5, microbatch 1 and accumulation 4. Optimizer steps are `min(200, ceil(training_rows / 4))`, with evaluation halfway and at the end; the cap can yield a partial epoch. This is an initial resource-conscious experiment, not a claim of accuracy or guaranteed VRAM fit. Select training/validation separately in Unsloth, load the generated YAML **after** dataset selection, and reserve the test Parquet for later evaluation. The script never presses Start Training or downloads weights.

## Compare the exported test drawings after training

`evaluate.py` creates a separate offline comparison page from the original batch folder. It reads `dataset/manifest-eksport.json` and `audit/manifest-cubicasa.json`, requires their SHA-256 relationship to match, checks that train/validation/test IDs are disjoint, and revalidates each test image's decoded RGB hash, canvas, room geometry and labels. It exports **only** the test drawings. Existing training data and adapters are unchanged.

```powershell
& 'C:\pinokio\api\unsloth.git\env\Scripts\python.exe' evaluate.py `
  'C:\path\CubiCasa-batch-...' 'C:\path\CubiCasa-ujian-new'
```

Keep `evaluate.py`, `prepare.py`, `score.js` and `evaluator.html` together. The pinned, hash-checked `start-evaluation.ps1 -ReleaseRef <commit>` prompts for the original **export manifest**, then builds and opens this pack in a new Downloads folder. It does not use the full source dataset, load model weights, send prompts, invoke an API or start training.

The user opens a new Unsloth comparison chat per image, downloads the clean PNG from the page, attaches it to both models, copies the exact all-supported-types training prompt, uses identical generation settings, and pastes the two responses. The page's generation fields record the settings; they do not control Unsloth. A confirmation checkbox prevents inadvertently scoring before confirming the inputs. Switching the page selector does **not** change Unsloth's attached image. Repeated identical predictions across different images trigger a warning.

The page calculates a maximum-sum-IoU, one-to-one assignment within each normalized label, with unmatched references scoring zero. Detection precision/recall at IoU ≥ 0.5 use a **separate maximum-cardinality assignment at that threshold**; these assignments can differ. The polynomial Hungarian implementation avoids exponential duplicate-label matching. Extras lower precision. Both the equal-image mean and pooled-reference mean are reported explicitly. These are bounding-box metrics, not polygon IoU, mAP, or building measurements.

Only drawings with **two valid responses** contribute to paired summaries. A malformed/truncated response is not silently converted into an empty prediction or a zero. `[]` is a legitimate explicit no-room prediction and scores accordingly. Reports state completion counts and missing IDs; unfinished tests must not be presented as a full benchmark. Operator notes can record generation failures before rerunning both models with a common token budget. Corrected inputs invalidate their previous score. The browser attempts local draft persistence; export JSON after each session as a portable backup. Import requires the exact benchmark/reference fingerprints and recomputes scores from predictions rather than trusting stored metrics. No requests leave the offline page.

Reference geometry comes from source annotations and recorded review provenance. The custom partition is not the official CubiCasa benchmark; sample 10170 has already been examined during development. Do not keep adjusting training against individual test outcomes and then describe the same set as an untouched blind test. Holdout accuracy is not implied by training loss or by creating this comparison pack. Generated data/results and user drawings must stay out of the public repository.

Additional checks:

```sh
node --test scripts/cubicasa/test_score.mjs
HF_HUB_OFFLINE=1 HF_DATASETS_OFFLINE=1 python -m unittest discover -s scripts/cubicasa -p 'test_*.py'
```

Browser integration (Playwright/Chromium and Python/Pillow required; synthetic drawings only):

```sh
CUBICASA_TEST_PYTHON=python3 node --test scripts/cubicasa/test_evaluator.mjs
```

If comparison appears to do nothing, errors and success messages now appear directly below the compare button, with the offending input focused. Both answer fields must contain complete JSON, and the input confirmation must be ticked **after** the last answer/settings edit. Empty BASE/tuned fields and malformed JSON are identified by panel name. A new `start-repair.ps1 -ReleaseRef <commit>` prompts for an existing generated `BUKA-UJIAN-CUBICASA.html`, hash-checks the repair/template/scorer, and updates the UI in place with an exact original-file backup. The embedded payload and benchmark fingerprint remain unchanged. Refresh the **original browser tab** afterwards; do not open the backup as the working page. Keeping the same file location avoids deliberately changing the browser's storage location. Exported result JSON remains compatible. Browser storage availability itself is still controlled by the browser.


### Preserve malformed model outputs as failures

The page offers **Rekod jawapan gagal** when at least one nonempty response fails the strict JSON/box contract (including zero-area boxes). Paste **both original responses**, confirm the same inputs/settings and record the failure. Neither output is edited, truncated to valid items, clamped or replaced by `[]`. The invalid side has `metrics: null`; the valid counterpart's metrics remain inspectable. Failed-pair records are separate from paired-valid scores and cannot be counted as valid completed comparisons. All raw responses are preserved in the export.

Reports now distinguish `attempted_images`/`all_images_attempted` from `completed_images`/`complete` (both sides valid). They include per-model output-validity/failure rates, `failures`, and `unattempted_ids`. Paired IoU/precision/recall summaries continue to use the **same subset with two valid outputs**, so report these conditional scores **together with failure rates and sample counts**; they are not full-set accuracy when failures exist. A valid explicit `[]` remains a scored empty prediction, not an output-format failure. Blank text fields do not count as model attempts. The next-unfinished action skips already recorded failure cases. Import recomputes failure status from the original response; older valid-only reports remain compatible. Editing a response invalidates its prior success/failure record until explicitly saved again.
