"""CubiCasa room-polygon audit and reviewed Qwen training export (CPU only)."""
import argparse
import base64
import hashlib
import io
import json
import math
import random
import re
import zipfile
from collections import Counter
from pathlib import Path, PurePosixPath
from xml.etree import ElementTree as ET

from PIL import Image

LABELS = {"Bedroom": "BILIK TIDUR", "Kitchen": "DAPUR", "LivingRoom": "RUANG TAMU",
          "Bath": "BILIK AIR", "Entry": "RUANG MASUK", "Closet": "RUANG ALMARI",
          "Utility": "RUANG UTILITI", "Storage": "STOR", "DraughtLobby": "LOBI PENAMPAN"}
IDENTITY = (1, 0, 0, 1, 0, 0)
NUMBERS = r"[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?"
LICENSE = "CubiCasa5K — CC BY-NC 4.0 (Attribution-NonCommercial). https://creativecommons.org/licenses/by-nc/4.0/"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def packed(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def rgb_image(payload):
    with Image.open(io.BytesIO(payload)) as image:
        image.load()
        if image.mode in ("RGBA", "LA") or "transparency" in image.info:
            rgba = image.convert("RGBA")
            image = Image.alpha_composite(Image.new("RGBA", rgba.size, "white"), rgba)
        return image.convert("RGB")


def pixel_hash(image):
    return sha(f"{image.width}x{image.height}:".encode() + image.tobytes())


def relative(path):
    text = str(path).replace("\\", "/").strip().strip("/")
    p = PurePosixPath(text)
    if not text or ":" in text or ".." in p.parts:
        raise ValueError("Unsafe dataset path: " + str(path))
    return p.as_posix()


class Source:
    def __init__(self, path):
        self.path = path.resolve()
        self.zip = zipfile.ZipFile(path) if path.is_file() else None
        if self.zip:
            self.names = {}
            for entry in self.zip.infolist():
                if entry.is_dir():
                    continue
                name = relative(entry.filename)
                if name in self.names:
                    raise ValueError("Duplicate archive name: " + name)
                self.names[name] = entry
        else:
            self.names = {relative(p.relative_to(self.path)): p for p in self.path.rglob("*") if p.is_file()}

    def close(self):
        if self.zip:
            self.zip.close()

    def read(self, name, limit):
        item = self.names[name]
        if self.zip:
            if item.file_size > limit:
                raise ValueError("Selected file too large: " + name)
            return self.zip.read(item)
        if not item.resolve().is_relative_to(self.path) or item.stat().st_size > limit:
            raise ValueError("Unsafe or oversized selected file: " + name)
        return item.read_bytes()


def multiply(a, b):
    return (a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1],
            a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3],
            a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5])


def transform(text):
    matrix, end = IDENTITY, 0
    for match in re.finditer(r"([A-Za-z]+)\s*\(([^)]*)\)", text or ""):
        if (text[end:match.start()]).strip(" ,\t\r\n"):
            raise ValueError("Unsupported SVG transform syntax")
        name = match[1]
        values = [float(v) for v in re.findall(NUMBERS, match[2])]
        if re.sub(NUMBERS, "", match[2]).strip(" ,\t\r\n") or not all(map(math.isfinite, values)):
            raise ValueError("Invalid SVG transform numbers")
        if name == "matrix" and len(values) == 6:
            current = tuple(values)
        elif name == "translate" and len(values) in (1, 2):
            current = (1, 0, 0, 1, values[0], values[1] if len(values) == 2 else 0)
        elif name == "scale" and len(values) in (1, 2):
            current = (values[0], 0, 0, values[-1], 0, 0)
        elif name == "rotate" and len(values) in (1, 3):
            c, s = math.cos(math.radians(values[0])), math.sin(math.radians(values[0]))
            current = (c, s, -s, c, 0, 0)
            if len(values) == 3:
                x, y = values[1:]
                current = multiply(multiply((1,0,0,1,x,y), current), (1,0,0,1,-x,-y))
        else:
            raise ValueError("Unsupported SVG transform: " + name)
        matrix, end = multiply(matrix, current), match.end()
    if (text or "")[end:].strip(" ,\t\r\n"):
        raise ValueError("Unsupported SVG transform syntax")
    return matrix


def points(text, matrix):
    values = [float(v) for v in re.findall(NUMBERS, text)]
    if len(values) < 6 or len(values) % 2 or re.sub(NUMBERS, "", text).strip(" ,\t\r\n"):
        raise ValueError("Invalid SVG polygon")
    a, b, c, d, e, f = matrix
    result = [[a*x+c*y+e, b*x+d*y+f] for x, y in zip(values[::2], values[1::2])]
    if result[0] == result[-1]:
        result.pop()
    if not all(math.isfinite(v) for p in result for v in p):
        raise ValueError("Nonfinite polygon")
    return result


def cross_section(poly, axis, position):
    intersections = []
    for p, q in zip(poly, poly[1:]+poly[:1]):
        if p[axis] <= position < q[axis] or q[axis] <= position < p[axis]:
            j = 1-axis
            intersections.append(p[j] + (position-p[axis])*(q[j]-p[j])/(q[axis]-p[axis]))
    intersections.sort()
    return sum(intersections[i+1]-intersections[i] for i in range(0, len(intersections)-1, 2))


def geometry(poly, width, height):
    if (not isinstance(poly, list) or len(poly) < 3
            or any(not isinstance(p, list) or len(p) != 2 or any(
                isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v)
                for v in p) for p in poly)):
        raise ValueError("Polygon needs at least three finite numeric points")
    xs, ys = zip(*poly)
    box = [min(xs), min(ys), max(xs), max(ys)]
    if not 0 <= box[0] < box[2] <= width or not 0 <= box[1] < box[3] <= height:
        raise ValueError("Polygon is outside F1_scaled.png; no automatic clamping or rescaling")
    area = abs(sum(p[0]*q[1]-q[0]*p[1] for p, q in zip(poly, poly[1:]+poly[:1])))/2
    if area <= 0:
        raise ValueError("Zero-area polygon")
    normalized = [round(box[0]/width*1000), round(box[1]/height*1000),
                  round(box[2]/width*1000), round(box[3]/height*1000)]
    if normalized[0] >= normalized[2] or normalized[1] >= normalized[3]:
        raise ValueError("Polygon bbox collapses at 0–1000 resolution")
    warnings = []
    for axis in (0, 1):
        low, high = box[axis], box[axis+2]
        length = high-low
        if length <= 30:
            continue
        for side in (0, 1):
            slices = [cross_section(poly, axis, low+t*length if side == 0 else high-t*length)
                      for t in (.05, .10, .15)]
            if all(0 < value < 1 for value in slices):
                warnings.append({"code": "subpixel_tail", "axis": axis, "side": side,
                                 "cross_section_pixels": slices})
    return {"polygon_pixels": poly, "bbox_pixels": box, "bbox_2d": normalized,
            "area_pixels": area, "bbox_fill_fraction": area/((box[2]-box[0])*(box[3]-box[1])),
            "warnings": warnings}


def parse_svg(payload, width, height):
    if b"<!DOCTYPE" in payload.upper() or b"<!ENTITY" in payload.upper():
        raise ValueError("DTD/entity declarations are not supported")
    root = ET.fromstring(payload)
    if root.tag.rsplit("}", 1)[-1] != "svg":
        raise ValueError("Not an SVG document")
    rooms, excluded = [], []
    seen = set()

    def walk(node, parent):
        if "transform" in node.get("style", "").lower() or node.get("clip-path"):
            raise ValueError("CSS transforms/clipping require explicit support")
        matrix = multiply(parent, transform(node.get("transform", "")))
        tokens = node.get("class", "").split()
        if "Space" in tokens:
            index = tokens.index("Space")+1
            if index >= len(tokens):
                raise ValueError("Space has no semantic class")
            base = tokens[index]
            polygons = [c for c in node if c.tag.rsplit("}", 1)[-1] == "polygon"]
            if base not in LABELS:
                excluded.append({"source_id": node.get("id"), "source_class": " ".join(tokens[index:]),
                                 "reason": "outside_or_unsupported_or_undefined"})
            else:
                identifier = node.get("id")
                if not identifier or identifier in seen or len(polygons) != 1:
                    raise ValueError("Supported Space needs one polygon and a unique source id")
                seen.add(identifier)
                polygon = polygons[0]
                room = {"source_id": identifier, "source_class": " ".join(tokens[index:]),
                        "label": LABELS[base]}
                room.update(geometry(points(polygon.get("points", ""), multiply(
                    matrix, transform(polygon.get("transform", "")))), width, height))
                rooms.append(room)
        for child in node:
            if child.tag.rsplit("}", 1)[-1] == "svg":
                raise ValueError("Nested SVG viewports are not supported")
            walk(child, matrix)
    walk(root, IDENTITY)
    return rooms, excluded, {"width": root.get("width"), "height": root.get("height"),
                             "viewBox": root.get("viewBox"), "mapping": "SVG coordinates are PNG pixels, as in the official loader; no viewBox scaling"}


def audit(source_path, output, limit=20, sample_seed=None):
    if output.exists():
        raise ValueError("Output exists; choose a new directory")
    source = Source(source_path)
    try:
        candidates = sorted(n for n in source.names if PurePosixPath(n).name == "model.svg"
                            and str(PurePosixPath(n).parent / "F1_scaled.png") in source.names)
        if not candidates:
            raise ValueError("No paired F1_scaled.png/model.svg found")
        if not 1 <= limit <= 200:
            raise ValueError("Audit limit must be 1–200; review a manageable batch")
        if sample_seed is not None:
            random.Random(sample_seed).shuffle(candidates)
        output.mkdir(parents=True)
        (output/"images").mkdir()
        samples, errors, pixels = [], [], {}
        for path in candidates[:limit]:
            identifier = str(PurePosixPath(path).parent)
            try:
                svg = source.read(path, 4*1024*1024)
                png_path = str(PurePosixPath(path).parent/"F1_scaled.png")
                original = source.read(png_path, 32*1024*1024)
                image = rgb_image(original)
                rooms, excluded, viewport = parse_svg(svg, *image.size)
                if not rooms:
                    raise ValueError("No supported interior rooms")
                digest = pixel_hash(image)
                if digest in pixels:
                    raise ValueError("Duplicate F1 pixels, first sample: " + pixels[digest])
                pixels[digest] = identifier
                filename = "images/" + sha(identifier.encode())[:20] + ".png"
                stream = io.BytesIO(); image.save(stream, format="PNG")
                (output/filename).write_bytes(stream.getvalue())
                samples.append({"id": identifier, "file": filename, "width": image.width, "height": image.height,
                                "image_sha256": digest, "original_png_sha256": sha(original), "svg_sha256": sha(svg),
                                "svg_viewport": viewport, "rooms": rooms, "excluded": excluded,
                                "class_counts": dict(Counter(r["label"] for r in rooms)),
                                "eligible": len(rooms) <= 24 and not any(r["warnings"] for r in rooms),
                                "quality_notes": (["more_than_24_supported_rooms"] if len(rooms) > 24 else []),
                                "ignored_F2": str(PurePosixPath(path).parent/"F2_scaled.png") in source.names})
            except (ValueError, ET.ParseError, OSError, KeyError) as error:
                errors.append({"sample_id": identifier, "error": str(error)})
        manifest = {"schema_version": 1, "dataset": "CubiCasa5K", "units": "relative_0_1000",
                    "label_task": "semantic room types, not OCR room names or asset codes", "license": LICENSE,
                    "source_reference": "https://github.com/CubiCasa/CubiCasa5k", "label_mapping": LABELS,
                    "available_pairs": len(candidates), "selected_pairs": min(limit, len(candidates)),
                    "samples": samples, "errors": errors, "training_executed": False,
                    "status": "audit_only_pending_visual_review_and_explicit_splits"}
        if sample_seed is not None:
            manifest["sampling"] = {"method": "seeded_random_candidate_order", "seed": sample_seed}
        manifest_bytes = json.dumps(manifest, ensure_ascii=False, indent=2).encode()
        (output/"manifest-cubicasa.json").write_bytes(manifest_bytes)
        write_review(output, manifest)
        (output/"LESEN.txt").write_text(LICENSE, encoding="utf-8")
        print(f"Audit: {len(samples)} sampel, {sum(len(s['rooms']) for s in samples)} ruang jenis disokong.")
        print(f"Layak untuk semakan eksport: {sum(s['eligible'] for s in samples)}. Ralat fail: {len(errors)}.")
        print("Belum menjana data latihan; semak HTML dan sediakan senarai train/val berasingan.")
        return manifest
    finally:
        source.close()


def write_review(folder, manifest, assignments=None):
    split_by_id = {identifier: split for split, ids in (assignments or {}).items() for identifier in ids}
    display = {"manifest_sha256": sha((folder/"manifest-cubicasa.json").read_bytes()),
               "batch_mode": assignments is not None,
               "samples": [{**sample, "batch_split": split_by_id.get(sample["id"]),
                            "url": "data:image/png;base64,"+base64.b64encode(
                                (folder/sample["file"]).read_bytes()).decode()} for sample in manifest["samples"]]}
    template = Path(__file__).with_name("review.html").read_text(encoding="utf-8")
    (folder/"BUKA-SEMAKAN-CUBICASA.html").write_text(template.replace("__PAYLOAD__", json.dumps(
        display, ensure_ascii=False).replace("<", "\\u003c")), encoding="utf-8")


NATIVE = "Gunakan koordinat relatif 0–1000 bagi keseluruhan imej. bbox_2d ialah [kiri,atas,kanan,bawah]. Pulangkan senarai JSON sahaja; setiap objek mempunyai label dan bbox_2d. Label ialah jenis ruang, bukan nombor bilik. Kekalkan setiap ruang berasingan walaupun jenisnya sama. Kotak ruang L merangkumi keseluruhan poligon lantainya. Tamat selepas JSON."


def tasks(sample):
    rooms = [{"label": r["label"], "bbox_2d": r["bbox_2d"]} for r in sample["rooms"]]
    for label in sorted(set(r["label"] for r in rooms)):
        yield ("Kenal pasti kawasan lantai bagi semua ruang berjenis " + label + ". Ini tugasan mengenal pasti jenis ruang daripada pelan, bukan menyalin tulisan. " + NATIVE,
               [r for r in rooms if r["label"] == label])
    yield ("Kenal pasti kawasan lantai bagi jenis ruang berikut sahaja: " + ", ".join(LABELS.values()) +
           ". Abaikan kawasan luar, ruang yang jenisnya tidak ditentukan, pintu, tingkap dan perabot sebagai objek berasingan. " + NATIVE, rooms)


def split_ids(path):
    result = set()
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        text = line.strip()
        if text and not text.startswith("#"):
            identifier = relative(text)
            if identifier in result:
                raise ValueError("Duplicate id in split list: " + identifier)
            result.add(identifier)
    return result


def export(audit_folder, review_path, train_path, val_path, output, test_path=None):
    from datasets import Dataset, Features, Image as DatasetImage, Value
    raw = (audit_folder/"manifest-cubicasa.json").read_bytes()
    manifest, review = json.loads(raw), json.loads(review_path.read_text(encoding="utf-8"))
    if (manifest.get("schema_version") != 1 or manifest.get("dataset") != "CubiCasa5K"
            or manifest.get("units") != "relative_0_1000"
            or review.get("schema_version") != 1 or review.get("manifest_sha256") != sha(raw)):
        raise ValueError("Review file does not match this audit")
    approved = review.get("approved_ids")
    if (not isinstance(approved, list) or not approved or any(not isinstance(i, str) for i in approved)
            or len(approved) != len(set(approved))):
        raise ValueError("Review needs unique approved sample ids")
    samples = {s["id"]: s for s in manifest["samples"]}
    if any(i not in samples or not samples[i]["eligible"] or len(samples[i]["rooms"]) > 24 for i in approved):
        raise ValueError("A flagged or unknown sample cannot be exported")
    lists = {"train": split_ids(train_path), "validation": split_ids(val_path),
             "test": split_ids(test_path) if test_path else set()}
    if any(lists[a] & lists[b] for a,b in [("train","validation"),("train","test"),("validation","test")]):
        raise ValueError("Split lists overlap; the same drawing cannot cross splits")
    if any(i not in set.union(*lists.values()) for i in approved):
        raise ValueError("Approved sample missing from supplied split lists; preserve original directory paths")
    assignments = {split: [samples[i] for i in sorted(approved) if i in ids] for split, ids in lists.items()}
    if not assignments["train"] or not assignments["validation"]:
        raise ValueError("Need independent reviewed drawings in both train and validation")
    if output.exists():
        raise ValueError("Export output exists; choose a new directory")
    rows, seen = {s:[] for s in lists}, set()
    for split, selected in assignments.items():
        for sample in selected:
            file = (audit_folder/sample["file"]).resolve()
            if not file.is_relative_to(audit_folder.resolve()):
                raise ValueError("Image path outside audit")
            image = rgb_image(file.read_bytes())
            digest = pixel_hash(image)
            if image.size != (sample["width"], sample["height"]) or digest != sample["image_sha256"] or digest in seen:
                raise ValueError("Changed or duplicate image pixels in reviewed splits")
            seen.add(digest)
            for room in sample["rooms"]:
                if room["label"] != LABELS.get(room["source_class"].split()[0]):
                    raise ValueError("Room label does not match its source semantic class")
                checked = geometry(room["polygon_pixels"], sample["width"], sample["height"])
                if checked["bbox_2d"] != room["bbox_2d"] or checked["warnings"]:
                    raise ValueError("Reviewed geometry changed or has a quality warning")
            for prompt, answer in tasks(sample):
                rows[split].append({"image":{"bytes":file.read_bytes(),"path":None}, "conversations":[
                    {"from":"human","value":"<image>\n"+prompt},
                    {"from":"gpt","value":json.dumps(answer,ensure_ascii=False,separators=(",",":"))}]})
    output.mkdir(parents=True)
    features = Features({"image":DatasetImage(),"conversations":[{"from":Value("string"),"value":Value("string")}]})
    names = {"train":"CubiCasa-latihan.parquet","validation":"CubiCasa-validasi.parquet","test":"CubiCasa-ujian.parquet"}
    for split, data in rows.items():
        if data:
            random.Random(3407).shuffle(data)
            Dataset.from_list(data,features=features).to_parquet(str(output/names[split]))
    result = {"schema_version":1,"dataset":"CubiCasa5K","license":LICENSE,
              "source_manifest_sha256":sha(raw),"review_sha256":sha(review_path.read_bytes()),
              "label_task":manifest["label_task"],"training_executed":False,
              "split_provenance":"user-supplied lists; original split membership not independently verified",
              "review_method":review.get("review_method", "individual_visual_review"),
              "splits":{s:{"images":len(assignments[s]),"rows":len(rows[s]),"sample_ids":[i["id"] for i in assignments[s]]} for s in rows}}
    (output/"manifest-eksport.json").write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8")
    (output/"LESEN.txt").write_text(LICENSE,encoding="utf-8")
    print("Parquet disediakan; tiada model dilatih. Semak manifest-eksport.json untuk bilangan pelan dan tugasan.")
    return result


def batch(source, output, train_count=100, val_count=20, test_count=20, seed=3407, audit_limit=200):
    """Prepare a custom split using source labels and automated quality screening.

    Does not claim individual visual approval of the batch or official split membership.
    """
    counts = {"train": train_count, "validation": val_count, "test": test_count}
    if any(isinstance(n, bool) or not isinstance(n, int) or n < 1 for n in counts.values()):
        raise ValueError("Batch requires positive train, validation and test image counts")
    needed = sum(counts.values())
    if needed > audit_limit:
        raise ValueError("Requested image counts exceed the candidate audit limit")
    if output.exists():
        raise ValueError("Batch output exists; choose a new directory")
    output.mkdir(parents=True)
    audit_folder = output/"audit"
    manifest = audit(source, audit_folder, audit_limit, sample_seed=seed)
    eligible, svg_seen, duplicate_groups = [], set(), []
    for sample in manifest["samples"]:
        if not sample["eligible"]:
            continue
        if sample["svg_sha256"] in svg_seen:
            duplicate_groups.append(sample["id"])
            continue
        svg_seen.add(sample["svg_sha256"])
        eligible.append(sample)
    if len(eligible) < needed:
        raise ValueError(f"Only {len(eligible)} eligible unique drawings; need {needed}. "
                         "No training Parquet written. Inspect the audit or choose the full dataset folder.")
    random.Random(seed).shuffle(eligible)
    chosen, position = {}, 0
    for split, count in counts.items():
        chosen[split] = [s["id"] for s in eligible[position:position+count]]
        position += count
        (output/f"custom-{split}.txt").write_text("\n".join(chosen[split])+"\n", encoding="utf-8")
    selection = {"schema_version":1, "manifest_sha256":sha((audit_folder/"manifest-cubicasa.json").read_bytes()),
                 "approved_ids":[i for split in chosen.values() for i in split],
                 "review_method":"automated_source_annotation_quality_screening_not_individual_visual_review"}
    selection_path = output/"pilihan-batch.json"
    selection_path.write_text(json.dumps(selection,indent=2),encoding="utf-8")
    exported = export(audit_folder, selection_path, output/"custom-train.txt", output/"custom-validation.txt",
                      output/"dataset", output/"custom-test.txt")
    exported.update(split_provenance="custom_seeded_full_drawing_split_not_official_CubiCasa_benchmark",
                    seed=seed, candidate_images=manifest["selected_pairs"],
                    eligible_unique_images=len(eligible), duplicate_svg_groups_excluded=duplicate_groups)
    (output/"dataset"/"manifest-eksport.json").write_text(json.dumps(exported,ensure_ascii=False,indent=2),encoding="utf-8")
    write_review(audit_folder, manifest, chosen)
    steps = min(200, max(1, math.ceil(exported["splits"]["train"]["rows"]/4)))
    profile = f"""training:
  max_seq_length: 4096
  vision_image_size: 768
  num_epochs: 1
  learning_rate: 0.00002
  batch_size: 1
  gradient_accumulation_steps: 4
  warmup_steps: {min(5, max(0, steps-1))}
  max_steps: {steps}
  save_steps: {max(1, math.ceil(steps/2))}
  eval_steps: 0.5
  early_stopping_patience: 0
  weight_decay: 0.01
  random_seed: {seed}
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
    (output/"dataset"/"CubiCasa-config.yaml").write_text(profile,encoding="utf-8")
    instructions = f"""CUBICASA — BATCH PERCUBAAN LOKAL
{train_count} imej latihan, {val_count} imej validasi, {test_count} imej ujian. Bilangan baris/tugasan ada dalam dataset/manifest-eksport.json.
Pembahagian tersendiri seed {seed}; BUKAN pembahagian rasmi CubiCasa5K. Imej penuh kekal dalam satu split. F2 tidak digunakan sebagai sampel bebas. Imej/poligon pendua tepat dan poligon bertanda isu kualiti dikecualikan; ini bukan jaminan bebas pendua visual atau anotasi sempurna.
Pemilihan batch menggunakan anotasi sumber dan semakan kualiti automatik, BUKAN dakwaan semua imej disemak manusia. Buka audit/BUKA-SEMAKAN-CUBICASA.html dan semak beberapa pelan/kelas sebelum latihan. Jika nampak padanan salah, hentikan dan laporkan ID sampel sebelum melatih.
Dalam Unsloth: pilih model ASAL unsloth/Qwen3-VL-2B-Instruct, QLoRA 4-bit, Train As Language model. Run baharu FCA-CUBI-01; simpan adapter V4/V5, jangan resume daripadanya.
Training Dataset: dataset/CubiCasa-latihan.parquet. Evaluation Dataset: dataset/CubiCasa-validasi.parquet. JANGAN masukkan CubiCasa-ujian.parquet ke slot latihan atau validasi.
Selepas memilih model dan dataset, Load YAML dataset/CubiCasa-config.yaml. Semak Preview gambar dan sharegpt_with_images, batch 1, accumulation 4, LR 0.00002, context 4096, image size 768, rank 8/alpha 16, vision layers OFF dan Assistant completions only ON. Max Steps {steps}, Eval Steps 0.5. Jadual percubaan dihadkan 200 langkah optimizer; ia mungkin berhenti sebelum semua data dilalui jika batch besar. Profil tidak menjamin VRAM muat atau ketepatan meningkat.
Label ialah jenis ruang (contoh BILIK TIDUR), bukan nama tercetak BILIK 1 atau nombor aset. Nilai pada tugas/rujukan jenis ruang yang sama. Skor lama MANTIN tidak boleh dibandingkan terus dengan label jenis tanpa pemetaan dan penilaian yang jelas.
Tiada model dimuat turun atau dilatih oleh skrip ini. Latihan hanya bermula apabila anda menekan Start Training. CC BY-NC 4.0: atribusi dan penggunaan bukan komersial.
"""
    (output/"BACA-DAHULU.txt").write_text(instructions,encoding="utf-8")
    print(f"BATCH SIAP: {train_count} train / {val_count} validation / {test_count} test drawings.")
    print("Custom seeded split, not the official benchmark. Review source overlays before training.")
    return exported


if __name__ == "__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    sub=parser.add_subparsers(dest="command",required=True)
    a=sub.add_parser("audit");a.add_argument("source",type=Path);a.add_argument("output",type=Path);a.add_argument("--limit",type=int,default=20);a.add_argument("--sample-seed",type=int)
    e=sub.add_parser("export");e.add_argument("audit_folder",type=Path);e.add_argument("review",type=Path);e.add_argument("train_list",type=Path);e.add_argument("val_list",type=Path);e.add_argument("output",type=Path);e.add_argument("--test-list",type=Path)
    b=sub.add_parser("batch");b.add_argument("source",type=Path);b.add_argument("output",type=Path);b.add_argument("--train-count",type=int,default=100);b.add_argument("--val-count",type=int,default=20);b.add_argument("--test-count",type=int,default=20);b.add_argument("--seed",type=int,default=3407);b.add_argument("--audit-limit",type=int,default=200)
    args=parser.parse_args()
    try:
        if args.command=="audit":audit(args.source,args.output,args.limit,args.sample_seed)
        elif args.command=="batch":batch(args.source,args.output,args.train_count,args.val_count,args.test_count,args.seed,args.audit_limit)
        else:export(args.audit_folder,args.review,args.train_list,args.val_list,args.output,args.test_list)
    except (ValueError,KeyError,OSError,ET.ParseError,zipfile.BadZipFile) as error:
        parser.exit(1,str(error)+"\n")
