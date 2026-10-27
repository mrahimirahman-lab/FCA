# Local preparation for Qwen3-VL V4

This CPU-only helper reads the existing four-row V3 Parquet on the user's computer. It preserves the original file and writes a new output directory. The repository contains code and synthetic tests; actual images, annotations and generated datasets stay local.

Use the Python environment already installed by Unsloth Studio:

```powershell
& 'C:\pinokio\api\unsloth.git\env\Scripts\python.exe' prepare.py 'C:\path\gabungan-4-sampel-V3-DRAF.parquet' 'C:\path\FCA-V4'
```

Keep `prepare.py` and `evaluator.html` together. They use the existing `datasets` and `Pillow` packages; no model is loaded by this helper.

If V3 was created without selecting the old V2 dataset, the four-row combined file will not exist. Pass the three-unit V3 file and the separate one-row Mantin V2 file instead:

```powershell
& 'C:\pinokio\api\unsloth.git\env\Scripts\python.exe' prepare.py 'C:\path\jkr70-3-unit-V3-DRAF.parquet' 'C:\path\FCA-V4' 'C:\path\kuarters-mantin-14-ruang-V2-DRAF.parquet'
```

The files are combined in memory and the same drawing-level training/evaluation split is enforced. Original files are preserved; a three-unit-only input is not silently split into training and evaluation crops from the same drawing.

V4 focuses on interior grounding first. It normalizes validated pixel boxes to Qwen3-VL's native 0–1000 coordinate convention, creates a single JSON-list output format, and removes explanatory boilerplate from assistant targets. Absent-room examples teach an empty `[]` response. Same-name rooms are preserved and their single-target queries are disambiguated by coarse image position.

| File | Contents |
|---|---|
| `V4-latihan-24.parquet` | 18 single-room, 3 multi-room and 3 absent-target tasks from the three JKR70 crops |
| `V4-penilaian-8.parquet` | 6 single-room, 1 multi-room and 1 absent-target task from Mantin |
| `FCA-V4-config.yaml` | Conservative trial profile for an 8 GB GPU: rank 8, alpha 16, LR 5e-5, batch 1, 48 steps, response-only loss, vision tower frozen |
| `BUKA-UJIAN-V4.html` | Offline viewer and bbox comparison for BASE versus V4 |
| `rekod-kawasan-luar-untuk-fasa-seterusnya.json` | All 18 exterior references preserved separately for a later stage |
| `manifest-V4.json` | Source hashes, grouping, all prompts and normalized targets |

The 24 training tasks share just **three images from one drawing**. The eight evaluation tasks share **one image from a different drawing**. Keep each drawing in a single split; task count is not an independent building count. Canonical image hashes detect duplicate pixels even when PNG encoding differs.

Select the original `unsloth/Qwen3-VL-2B-Instruct` and QLoRA 4-bit in a new Unsloth run. A V2/V3 adapter has already seen Mantin, so it cannot provide the intended V4 holdout. Upload training and evaluation files separately, then load the YAML profile through Configuration → Load YAML. Model and dataset choices are intentionally not embedded in that profile. The profile is an initial experiment, not a guarantee of VRAM fit or improved localization.

After training, compare the same image and prompt on the base model and V4. The evaluator uses one-to-one same-label bbox matching, counts missing references as zero IoU, reports extra boxes through precision, and handles absent-target cases separately. A valid JSON object can be wrapped as a one-element list for evaluation; coordinates are never guessed or clamped. Repeated room names are matched for maximum summed IoU within their label group.

Reference geometry remains a reviewed visual transfer, not surveyed measurements. A rectangular bbox around an L-shaped room includes space outside its contour. Evaluation loss and successful JSON generation alone do not establish accurate wall boundaries. More independent annotated plans will be needed to assess generalization.

Output uses `label` and `bbox_2d`, so integration with FCA's earlier pixel/name/confidence contract needs an explicit adapter and separate validation. This tool does not modify FCA's server, the original Parquet, Ollama models or Unsloth installations, and does not start training.

The coordinate convention follows the official [Qwen3-VL grounding notebook](https://github.com/QwenLM/Qwen3-VL/blob/main/cookbooks/2d_grounding.ipynb).

Tests use generated synthetic fixtures only:

```sh
python -m unittest discover -s scripts/dataset-v4 -p 'test_*.py'
```
