"""Prepare an augmentation ablation from a local, previously generated V4 folder.

No GPU, model download, training or FCA server changes. Private inputs stay local.
"""
import argparse
import base64
import hashlib
import io
import json
import math
import random
from collections import Counter
from pathlib import Path

from PIL import Image


def image_hash(image):
    rgb = image.convert("RGB")
    prefix = f"{rgb.width}x{rgb.height}:".encode()
    return hashlib.sha256(prefix + rgb.tobytes()).hexdigest()


def validate_box(box):
    if (not isinstance(box, list) or len(box) != 4
            or any(isinstance(v, bool) or not isinstance(v, (int, float))
                   or not math.isfinite(v) for v in box)
            or not 0 <= box[0] < box[2] <= 1000
            or not 0 <= box[1] < box[3] <= 1000):
        raise ValueError("Kotak rujukan mesti empat nombor relatif 0–1000 yang sah.")


def translated_box(box, size, padding):
    """Map normalized bounds through a pixel-exact canvas translation, no crop."""
    validate_box(box)
    w, h = size
    left, top, right, bottom = padding
    nw, nh = w + left + right, h + top + bottom
    result = [round((box[0] * w / 1000 + left) * 1000 / nw),
              round((box[1] * h / 1000 + top) * 1000 / nh),
              round((box[2] * w / 1000 + left) * 1000 / nw),
              round((box[3] * h / 1000 + top) * 1000 / nh)]
    validate_box(result)
    return result


def padded(image, padding):
    left, top, right, bottom = padding
    result = Image.new("RGB", (image.width + left + right,
                               image.height + top + bottom), "white")
    result.paste(image.convert("RGB"), (left, top))
    return result


def read_sources(folder):
    manifest = json.loads((folder / "manifest-V4.json").read_text(encoding="utf-8"))
    if manifest.get("version") != 4 or manifest.get("units") != "relative_0_1000":
        raise ValueError("Pilih folder V4 asal dengan manifest-V4.json yang sah.")
    names = {"JKR70-D", "JKR70-C", "JKR70-B", "MANTIN"}
    if set(manifest["images"]) != names:
        raise ValueError("V4 mesti mempunyai tiga unit JKR70 dan satu imej MANTIN.")
    sources = {}
    seen = set()
    for name in sorted(names):
        meta = manifest["images"][name]
        split = "evaluation" if name == "MANTIN" else "train"
        group = "mantin_drawing" if name == "MANTIN" else "jkr70_same_drawing"
        if meta["split"] != split or meta["source_group"] != group:
            raise ValueError("Pemisahan sumber V4 tidak sepadan dengan rujukan.")
        file = (folder / meta["file"]).resolve()
        if not file.is_relative_to(folder.resolve()):
            raise ValueError("Laluan imej mesti di dalam folder V4.")
        with Image.open(file) as opened:
            image = opened.convert("RGB")
        digest = image_hash(image)
        if image.size != (meta["width"], meta["height"]) or digest != meta["sha256"]:
            raise ValueError("Imej berubah daripada manifest: " + name)
        if digest in seen:
            raise ValueError("Piksel imej sumber berulang; pemisahan tidak selamat.")
        seen.add(digest)
        cases = [c for c in manifest["cases"] if c["image_id"] == name]
        multis = [c for c in cases if c["kind"] == "multi"]
        if (len(cases) != 8 or len(multis) != 1
                or Counter(c["kind"] for c in cases) != {"single": 6, "multi": 1, "absent": 1}
                or any(c["split"] != split for c in cases)
                or [c["id"] for c in cases] != [name + "-" + str(n) for n in range(1, 9)]):
            raise ValueError("Setiap imej V4 mesti mempunyai enam single, satu multi, satu absent.")
        rooms = multis[0]["expected"]
        expected_names = Counter(["RUANG TAMU", "BILIK 1", "BILIK 2", "DAPUR",
                                  "DAPUR" if name == "MANTIN" else "TANDAS",
                                  "TANDAS" if name == "MANTIN" else "BILIK 3"])
        if Counter(r["label"] for r in rooms) != expected_names:
            raise ValueError("Enam ruang rujukan tidak sepadan: " + name)
        for case in cases:
            expected_length = {"single": 1, "multi": 6, "absent": 0}[case["kind"]]
            if len(case["expected"]) != expected_length:
                raise ValueError("Bilangan jawapan rujukan tidak sepadan dengan jenis tugasan.")
            for room in case["expected"]:
                if set(room) != {"label", "bbox_2d"}:
                    raise ValueError("Kontrak jawapan V4 berubah.")
                validate_box(room["bbox_2d"])
                if room not in rooms:
                    raise ValueError("Kotak single tidak sepadan dengan rujukan multi.")
        sources[name] = {"image": image, "split": split, "source_group": group,
                         "cases": cases, "rooms": rooms, "sha256": digest}
    # Retain exact evaluation tasks, including both same-name kitchens.
    return sources


def adjusted_prompt(case):
    """Same-name single-room positional qualifiers must follow the new canvas."""
    if case["kind"] != "single" or " yang terletak di bahagian " not in case["prompt"]:
        return case["prompt"]
    raise ValueError("Varian latihan tidak menjangka label berulang dengan qualifier kedudukan.")


def build(source, output):
    from datasets import Dataset, Features, Image as DatasetImage, Value

    sources = read_sources(source)
    if output.exists():
        raise ValueError("Folder output sudah wujud. Pilih nama baharu supaya fail lama dikekalkan.")
    output.mkdir(parents=True)
    images, cases, rows = {}, [], {"train": [], "evaluation": []}
    for name, item in sources.items():
        image = item["image"]
        variants = [("original", (0, 0, 0, 0))]
        if item["split"] == "train":
            # Different origins and canvas sizes, keeping the complete original plan.
            variants += [
                ("margin-kiri", (round(image.width * .20), round(image.height * .05),
                                 round(image.width * .05), round(image.height * .15))),
                ("margin-kanan", (round(image.width * .05), round(image.height * .15),
                                  round(image.width * .20), round(image.height * .05)))
            ]
        for variant, padding in variants:
            image_id = name if variant == "original" else name + "-" + variant
            rendered = image if variant == "original" else padded(image, padding)
            stream = io.BytesIO()
            rendered.save(stream, format="PNG")
            payload = stream.getvalue()
            filename = image_id + ".png"
            (output / filename).write_bytes(payload)
            images[image_id] = {"file": filename, "width": rendered.width,
                               "height": rendered.height, "sha256": image_hash(rendered),
                               "source_image_id": name, "source_sha256": item["sha256"],
                               "source_group": item["source_group"], "split": item["split"],
                               "variant": variant, "padding_pixels_ltrb": list(padding)}

            def target(room):
                return {"label": room["label"], "bbox_2d": (
                    list(room["bbox_2d"]) if variant == "original" else
                    translated_box(room["bbox_2d"], image.size, padding))}

            variant_cases = []
            for old in item["cases"]:
                expected = [target(r) for r in old["expected"]]
                prompt = old["prompt"] if variant == "original" else adjusted_prompt(old)
                variant_cases.append({"kind": old["kind"], "title": old["title"],
                                      "prompt": prompt, "expected": expected})
            if item["split"] == "train":
                for labels in [("TANDAS", "BILIK 3"), ("BILIK 1", "BILIK 2")]:
                    prompt = ("Cari dua ruang berlabel " + " dan ".join(labels)
                              + ". Jejaki lantai setiap ruang mengikut muka dalam dinding. "
                              "Setiap ruang mesti mempunyai kotak sendiri; jangan gabungkan "
                              "dua ruang atau tandakan kotak tulisan sahaja. "
                              "Gunakan koordinat relatif 0–1000 bagi keseluruhan imej: "
                              "x=0 kiri, x=1000 kanan, y=0 atas, y=1000 bawah. "
                              "bbox_2d ialah [kiri,atas,kanan,bawah]. "
                              "Pulangkan senarai JSON sahaja. Setiap objek mempunyai label "
                              "dan bbox_2d. Tamat selepas JSON.")
                    variant_cases.append({"kind": "pair", "title": " + ".join(labels),
                                          "prompt": prompt,
                                          "expected": [target(r) for r in item["rooms"]
                                                       if r["label"] in labels]})
            for n, case in enumerate(variant_cases, 1):
                # Preserve original case IDs (1–8) for comparisons with V4 reports.
                case.update(id=image_id + "-" + str(n), image_id=image_id,
                            split=item["split"])
                cases.append(case)
                rows[item["split"]].append({
                    "image": {"bytes": payload, "path": None},
                    "conversations": [
                        {"from": "human", "value": "<image>\n" + case["prompt"]},
                        {"from": "gpt", "value": json.dumps(case["expected"],
                                                             ensure_ascii=False, separators=(",", ":"))}
                    ]})
    train_hashes = {i["sha256"] for i in images.values() if i["split"] == "train"}
    eval_hashes = {i["sha256"] for i in images.values() if i["split"] == "evaluation"}
    if train_hashes & eval_hashes or len(train_hashes) != 9 or len(eval_hashes) != 1:
        raise ValueError("Piksel latihan/penilaian berulang.")
    assert len(rows["train"]) == 90 and len(rows["evaluation"]) == 8
    random.Random(3407).shuffle(rows["train"])
    features = Features({"image": DatasetImage(), "conversations": [
        {"from": Value("string"), "value": Value("string")}]})
    for split, filename in [("train", "V5-latihan-90.parquet"),
                            ("evaluation", "V5-penilaian-8.parquet")]:
        Dataset.from_list(rows[split], features=features).to_parquet(str(output / filename))
    manifest = {"version": 5, "units": "relative_0_1000", "training_executed": False,
                "source_manifest_sha256": hashlib.sha256((source / "manifest-V4.json").read_bytes()).hexdigest(),
                "reference_status": "draft_visual_alignment_unchanged_from_V4",
                "evaluation_status": "reused_development_holdout_not_a_new_blind_test",
                "train": {"rows": 90, "original_images": 3, "derived_images": 9,
                          "source_groups": 1, "tasks": {"single": 54, "multi": 9, "absent": 9, "pair": 18}},
                "evaluation": {"rows": 8, "original_images": 1, "derived_images": 1,
                               "source_groups": 1, "unchanged_from_V4": True},
                "images": images, "cases": cases}
    (output / "manifest-V5.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    display_images = {}
    for key, meta in images.items():
        display_images[key] = {**meta, "url": "data:image/png;base64," + base64.b64encode(
            (output / meta["file"]).read_bytes()).decode()}
    display = {"images": display_images, "cases": cases}
    template = Path(__file__).with_name("evaluator.html").read_text(encoding="utf-8")
    (output / "BUKA-UJIAN-V5.html").write_text(template.replace("__PAYLOAD__", json.dumps(
        display, ensure_ascii=False).replace("<", "\\u003c")), encoding="utf-8")
    (output / "FCA-V5-config.yaml").write_text(PROFILE, encoding="utf-8")
    (output / "BACA-DAHULU.txt").write_text(INSTRUCTIONS, encoding="utf-8")
    print("SIAP: " + str(output))
    print("90 tugasan, 9 varian daripada 3 imej JKR70 asal (satu drawing).")
    print("8 tugasan MANTIN tidak berubah. Tiada model dilatih oleh skrip ini.")


PROFILE = """training:
  max_seq_length: 4096
  vision_image_size: 768
  num_epochs: 1
  learning_rate: 0.00003
  batch_size: 1
  gradient_accumulation_steps: 1
  warmup_steps: 3
  max_steps: 90
  save_steps: 45
  eval_steps: 0.5
  early_stopping_patience: 0
  weight_decay: 0.01
  random_seed: 3407
  packing: false
  train_on_completions: true
  gradient_checkpointing: unsloth
  lr_scheduler_type: linear
lora:
  lora_r: 8
  lora_alpha: 16
  lora_dropout: 0.0
  target_modules: [q_proj, k_proj, v_proj, o_proj, gate_proj, up_proj, down_proj]
  finetune_vision_layers: false
  finetune_language_layers: true
  finetune_attention_modules: true
  finetune_mlp_modules: true
logging:
  enable_wandb: false
  enable_tensorboard: false
  log_frequency: 1
"""

INSTRUCTIONS = """FCA V5 — PERBANDINGAN AUGMENTASI, BUKAN DATA BANGUNAN BAHARU
1. Data ini berasal daripada tiga imej JKR70 V4 yang sama (satu drawing). 90 tugasan bukan 90 pelan bebas. Rujukan koordinat draf tidak diperbetulkan secara automatik. Tiada data CubiCasa dimasukkan.
2. Buka BUKA-UJIAN-V5.html sebelum latihan. Semak kotak hijau, terutama TANDAS, BILIK 3 dan RUANG TAMU. Varian margin mengekalkan semua piksel asal dan memindahkan kotak secara matematik; ia tidak memperbaiki rujukan asal yang salah.
3. Pilih model ASAL unsloth/Qwen3-VL-2B-Instruct dan QLoRA. Train As = Language model. Model vision dan dataset imej dikesan berasingan. Mulakan run baharu FCA-V5; jangan resume adapter V4 supaya perbandingan bermula daripada asas yang sama.
4. Dataset latihan: V5-latihan-90.parquet (90 baris). Evaluation Dataset: V5-penilaian-8.parquet (8 baris, MANTIN sama seperti V4). Pastikan gambar dipaparkan dalam Preview dan format sharegpt_with_images dikesan.
5. Selepas memilih model/dataset, Configuration > Load YAML > FCA-V5-config.yaml. Semak Max Steps 90, batch 1, gradient accumulation 1, LR 0.00003, Image Size 768, Context 4096, Rank 8, Alpha 16, Vision layers OFF, Assistant completions only ON. Eval Steps 0.5 = setiap 45 langkah daripada 90. Ini cadangan percubaan, bukan jaminan VRAM atau peningkatan ketepatan.
6. Start Training dilakukan dalam Unsloth pada komputer anda. Skrip penjana tidak melatih atau memuat turun model. Simpan V4 sebagai perbandingan.
7. Selepas latihan, mulakan chat perbandingan baharu bagi setiap imej. Memilih sampel dalam HTML TIDAK menukar imej dalam chat Unsloth. Lampirkan fail PNG yang dinyatakan, salin prompt yang sama, dan gunakan tetapan penjanaan yang sama.
8. Uji MANTIN semua ruang dengan prompt yang tidak berubah. Bandingkan dengan V4 31.3% dan BASE 34.7% daripada ujian pengguna terdahulu. Kemudian uji JKR70-D dan JKR70-C menggunakan imej yang betul. Dataset HTML mengekalkan ID kes asal 1–8; pasangan ruang ialah 9–10 pada imej latihan.
9. MANTIN telah digunakan berulang kali untuk membangunkan kaedah ini: ia holdout pembangunan, bukan ujian buta baharu. Pelan bebas baharu masih diperlukan untuk mengukur generalisasi. Jangan anggap penurunan loss sebagai bukti sempadan tepat. Jangan export/integrasi FCA berdasarkan loss sahaja.
"""


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Folder V4 yang mengandungi manifest dan PNG")
    parser.add_argument("output", type=Path, help="Folder baharu; fail lama tidak ditindih")
    args = parser.parse_args()
    try:
        build(args.source, args.output)
    except (ValueError, KeyError, OSError) as error:
        parser.exit(1, str(error) + "\n")
