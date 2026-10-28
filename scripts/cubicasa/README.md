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
