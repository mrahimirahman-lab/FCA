# Qwen3-VL V5: local augmentation experiment

This CPU-only helper reads an existing V4 output folder (`manifest-V4.json` and its four PNGs). It writes a **new folder**, preserves all inputs, does not download/load/train a model and does not change the FCA application. Real images and annotations stay on the user's computer.

V4's user-reported multi-room IoU was 39.6% on training unit JKR70-D and 31.3% on development holdout MANTIN, with localization problems for adjacent TANDAS/BILIK 3 and an omitted second kitchen. These results do not establish generalization. V5 is an experiment while independent plans are being obtained, not an automatic fix for those problems.

## What changes

- Original V4 single, multi and absent-target tasks are retained. Two paired-room tasks are added per training image: TANDAS + BILIK 3, and BILIK 1 + BILIK 2.
- Each of the three training images has its original canvas and two asymmetric white-margin variants. Full original pixels remain intact; boxes are translated and normalized mathematically. There is no crop, rotation, mirror, stretching or invented room label. This variation tests sensitivity to canvas position; it does not prove that walls are being traced.
- 90 training tasks use **nine derived images from only three original images, all one drawing**. This does not add independent buildings or examples of two kitchens. CubiCasa data is not included.
- All eight MANTIN tasks, prompts, targets, image pixels and original case IDs are unchanged. Because MANTIN has already been inspected repeatedly, it is a **reused development holdout**, not a new blind test. A fresh independent test set is still needed.
- Reference geometry remains the V4 **visual-transfer draft**, not surveyed measurements or corrected polygons. Inspect green overlays before training. Padding preserves any reference errors.
- Original and augmented images remain in their parent's split. Canonical pixel hashes, source groups, dimensions and source references are checked. Changed source pixels, invalid bounds, unsafe paths, duplicates and changed splits are rejected rather than guessed or clamped.

## Run on Windows

Keep `prepare.py` and `evaluator.html` together. Use Unsloth Studio's existing Python (`datasets` and `Pillow`):

```powershell
& 'C:\pinokio\api\unsloth.git\env\Scripts\python.exe' prepare.py 'C:\path\FCA-V4-folder' 'C:\path\FCA-V5-new-folder'
```

The source folder is the **generated V4 folder**, not an Unsloth model checkpoint or a V3 Parquet. The output directory must not exist. V4's source Parquet files are not needed again.

`start.ps1 -ReleaseRef <full-commit-sha>` is the Windows bootstrap. It prompts for that V4 folder, downloads only the generic helper/template from the pinned GitHub revision, checks their fixed SHA-256 hashes and runs the existing Unsloth Python. It uploads no inputs, installs no packages and writes the generated files to a new timestamped Downloads folder. The source V4 folder and trained adapters are preserved. The bootstrap itself should also be pinned and hash-checked when delivered.

| Output | Purpose |
|---|---|
| `V5-latihan-90.parquet` | 54 single, 9 multi, 9 absent and 18 paired-room tasks, shuffled deterministically |
| `V5-penilaian-8.parquet` | Original eight MANTIN evaluation tasks |
| `FCA-V5-config.yaml` | Initial 8 GB GPU trial settings: 90 steps (one epoch at batch/accumulation 1), LR 3e-5, rank 8/alpha 16, frozen vision tower, response-only loss |
| `manifest-V5.json` | Cases, source lineage, pixel hashes, exact margin transforms and limitations |
| `BUKA-UJIAN-V5.html` | Offline overlay/IoU comparison, including warnings for repeated predictions across images in the same viewer session |

In Unsloth select the **original** `unsloth/Qwen3-VL-2B-Instruct`, QLoRA 4-bit and Train As = Language model. Start a new run named FCA-V5 rather than resuming V4, so both experiments use the same base. Upload training and evaluation separately, then load the YAML. Check image preview, 90 training rows, eight evaluation rows, context 4096, image size 768, batch 1, accumulation 1, 90 steps, LR 0.00003, Eval Steps **0.5** (45/90), rank 8/alpha 16, vision layers off and assistant-completions-only on. A small batch does not guarantee VRAM fit. Keep the V4 adapter and results for comparison.

There is no automatic early stopping in this short single-epoch trial. Evaluate the resulting coordinates, not training loss alone. The helper does not launch training on the user's PC.

Open a **new chat comparison for every image** and attach its PNG. Changing the HTML selector does not replace the image attached in Unsloth. Use identical prompts and generation settings for BASE/V4/V5 comparisons. Single-object responses are accepted by the viewer as one-element lists, but training outputs are consistently lists. Extra/missing boxes and duplicate labels use the same one-to-one matching as V4. Nonrectangular rooms are evaluated with their full bounding rectangle, not polygon IoU.

The output contract is still `label`/`bbox_2d` in 0–1000 coordinates, not the FCA server's pixel-coordinate contract. Model deployment/export is a separate step after validation.

## Verification

```sh
HF_HUB_OFFLINE=1 HF_DATASETS_OFFLINE=1 python -m unittest discover -s scripts/dataset-v5 -p 'test_*.py'
```

Tests create synthetic images through V4's producer. They verify round-trip compatibility, unchanged development tasks, geometry transforms/pixel preservation, pair targets, embedded Parquet images, split isolation, rejection paths and profile settings. They do **not** measure model accuracy or perform GPU training.

## Repair reference boxes before training

The green evaluator overlays are the **training reference**, not a model prediction. User inspection found incomplete TANDAS/BILIK 3 references. Adding training steps or padding does not repair those labels. Do not use the earlier generated V5 Parquet for further training until affected references have been reviewed and regenerated. Earlier per-room IoU against incorrect references is provisional.

Open the standalone `review.html` locally in Edge/Chrome. Select the original V4 manifest and the original PNG files. The editor checks dimensions and canonical RGB pixel hashes, stays offline, supports zoom and pixel-coordinate entry or drawing a replacement rectangle, and requires confirmation of each changed box. Unchanged boxes retain draft status. Confirmed deltas are downloaded as `pembetulan-ruang-V5.json`; source files and the earlier Parquet are not modified by the editor.

Regenerate into a **new output folder** using:

```powershell
& 'C:\pinokio\api\unsloth.git\env\Scripts\python.exe' prepare.py 'C:\path\FCA-V4-folder' 'C:\path\FCA-V5-R1-new-folder' --corrections 'C:\path\pembetulan-ruang-V5.json'
```

The Windows bootstrap also supports `-UseCorrections` (choose an existing patch) or `-ReviewReferences` (open the editor, then choose the exported patch before generating). Canceling the correction picker stops this workflow; it does not silently generate the uncorrected dataset.

Patches must match the source manifest hash, image hash, room index, label and original box. Unreviewed, stale, duplicate, invalid or no-op changes are rejected before output is written. Corrections update single, multi, paired-room and margin targets together. Same-name kitchen queries retain their identity and update coarse positional qualifiers when necessary. Splits never change. Applied patches and per-image reference fingerprints are saved with the new dataset and exported evaluation reports.

If MANTIN is untouched its evaluation targets remain unchanged. If its reference changes, do not compare newly computed scores directly with old 31.3%/34.7% scores: rescore the saved V4/BASE predictions against the corrected reference first. This applies to JKR70 references too. Partially corrected data must not be described as fully verified geometry. A new reference version does not mean a new independent evaluation drawing.
