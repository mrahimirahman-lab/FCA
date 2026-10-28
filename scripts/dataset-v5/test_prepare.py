"""Preparation checks use synthetic images; no actual floor plans are published."""
import copy
import hashlib
import importlib.util
import json
import tempfile
import unittest
from collections import Counter
from pathlib import Path

from datasets import Image as DatasetImage, load_dataset
from PIL import Image
import yaml

import prepare


class V5Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Reuse V4's synthetic source fixtures and run its real producer. This
        # verifies compatibility with the on-disk V4 contract, not a guessed one.
        spec = importlib.util.spec_from_file_location(
            "v4_fixtures", Path(__file__).parents[1] / "dataset-v4" / "test_prepare.py")
        fixture_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(fixture_module)
        cls.fixture = fixture_module.PreparationTests()
        cls.fixture.setUp()
        result = cls.fixture.run_builder()
        if result.returncode:
            raise RuntimeError(result.stderr)
        cls.source = cls.fixture.root / "out"
        cls.temp = tempfile.TemporaryDirectory(prefix="fca-v5-test-")
        cls.output = Path(cls.temp.name) / "v5"
        prepare.build(cls.source, cls.output)
        cls.original = json.loads((cls.source / "manifest-V4.json").read_text())
        cls.manifest = json.loads((cls.output / "manifest-V5.json").read_text())

    @classmethod
    def tearDownClass(cls):
        cls.fixture.tearDown()
        cls.temp.cleanup()

    def test_preserves_exact_evaluation_prompts_targets_and_original_case_ids(self):
        original = {c["id"]: c for c in self.original["cases"]}
        prepared = {c["id"]: c for c in self.manifest["cases"]}
        for key, case in original.items():
            self.assertEqual(case, prepared[key])
        self.assertEqual([c for c in self.manifest["cases"] if c["split"] == "evaluation"],
                         [c for c in self.original["cases"] if c["split"] == "evaluation"])
        self.assertEqual(sum(c["id"].startswith("MANTIN-") for c in self.manifest["cases"]), 8)
        self.assertFalse(self.manifest["training_executed"])

    def test_padding_transforms_coordinates_and_preserves_all_source_pixels(self):
        self.assertEqual(prepare.translated_box([100, 100, 900, 900], (100, 200),
                                               (20, 10, 5, 30)), [240, 125, 880, 792])
        originals = {c["id"]: c for c in self.original["cases"]}
        for name, meta in self.manifest["images"].items():
            source = Image.open(self.source / self.original["images"][meta["source_image_id"]]["file"]).convert("RGB")
            image = Image.open(self.output / meta["file"]).convert("RGB")
            left, top, right, bottom = meta["padding_pixels_ltrb"]
            self.assertEqual(image.size, (source.width + left + right, source.height + top + bottom))
            self.assertEqual(image.crop((left, top, left + source.width, top + source.height)).tobytes(),
                             source.tobytes())
            self.assertEqual(prepare.image_hash(image), meta["sha256"])
            if meta["variant"] != "original":
                self.assertEqual(image.getpixel((0, 0)), (255, 255, 255))
                case = next(c for c in self.manifest["cases"] if c["id"] == name + "-7")
                old = originals[meta["source_image_id"] + "-7"]
                for reference, actual in zip(old["expected"], case["expected"]):
                    b = reference["bbox_2d"]
                    expected = [round((b[0] / 1000 * source.width + left) / image.width * 1000),
                                round((b[1] / 1000 * source.height + top) / image.height * 1000),
                                round((b[2] / 1000 * source.width + left) / image.width * 1000),
                                round((b[3] / 1000 * source.height + top) / image.height * 1000)]
                    self.assertEqual(actual["bbox_2d"], expected)

    def test_task_mix_embedded_images_and_grouped_split(self):
        counts = Counter(c["kind"] for c in self.manifest["cases"] if c["split"] == "train")
        self.assertEqual(counts, {"single": 54, "multi": 9, "absent": 9, "pair": 18})
        train_hashes = set()
        eval_hashes = set()
        for split, filename, count, hashes in [
            ("train", "V5-latihan-90.parquet", 90, train_hashes),
            ("evaluation", "V5-penilaian-8.parquet", 8, eval_hashes)]:
            ds = load_dataset("parquet", data_files=str(self.output / filename), split="train")
            self.assertEqual(len(ds), count)
            for row in ds.cast_column("image", DatasetImage(decode=False)):
                self.assertTrue(row["image"]["bytes"])
                self.assertIsNone(row["image"]["path"])
                import io
                hashes.add(prepare.image_hash(Image.open(io.BytesIO(row["image"]["bytes"]))))
                expected = json.loads(row["conversations"][1]["value"])
                for room in expected:
                    self.assertEqual(set(room), {"label", "bbox_2d"})
                    prepare.validate_box(room["bbox_2d"])
        self.assertEqual(len(train_hashes), 9)
        self.assertEqual(len(eval_hashes), 1)
        self.assertFalse(train_hashes & eval_hashes)
        for case in self.manifest["cases"]:
            if case["kind"] == "pair":
                self.assertEqual(len(case["expected"]), 2)
                self.assertEqual(len({tuple(r["bbox_2d"]) for r in case["expected"]}), 2)

    def test_profile_response_only_small_batch_and_consistent_eval_interval(self):
        profile = yaml.safe_load((self.output / "FCA-V5-config.yaml").read_text())
        training = profile["training"]
        self.assertEqual(training["max_steps"], 90)
        self.assertEqual(training["eval_steps"] * training["max_steps"], training["save_steps"])
        self.assertEqual(training["batch_size"], 1)
        self.assertEqual(training["num_epochs"], 1)
        self.assertTrue(training["train_on_completions"])
        self.assertFalse(profile["lora"]["finetune_vision_layers"])

    def test_bootstrap_download_hashes_match_reviewed_helpers(self):
        root = Path(__file__).parent
        bootstrap = (root / "start.ps1").read_text()
        for filename in ["prepare.py", "evaluator.html", "review.html"]:
            digest = hashlib.sha256((root / filename).read_bytes()).hexdigest()
            self.assertIn("'" + filename + "' = '" + digest + "'", bootstrap)
        self.assertIn("$ReleaseRef/scripts/dataset-v5", bootstrap)

    def patch_file(self, edits, filename="corrections.json"):
        path = Path(self.temp.name) / filename
        patch = {"schema_version": 1, "units": "relative_0_1000",
                 "source_manifest_sha256": hashlib.sha256((self.source / "manifest-V4.json").read_bytes()).hexdigest(),
                 "edits": edits}
        path.write_text(json.dumps(patch))
        return path

    def edit(self, name, index, after):
        source = prepare.read_sources(self.source)[name]
        room = source["rooms"][index]
        return {"image_id": name, "image_sha256": source["sha256"],
                "room_index": index, "label": room["label"],
                "before": room["bbox_2d"], "after": after, "reviewed": True}

    def test_corrections_update_single_multi_pair_and_margin_without_modifying_inputs(self):
        edits = [self.edit("JKR70-D", 4, [530, 70, 710, 230]),
                 self.edit("JKR70-D", 5, [740, 70, 970, 230])]
        patch = self.patch_file(edits)
        before = (self.source / "manifest-V4.json").read_bytes()
        output = Path(self.temp.name) / "corrected"
        prepare.build(self.source, output, patch)
        m = json.loads((output / "manifest-V5.json").read_text())
        self.assertEqual((self.source / "manifest-V4.json").read_bytes(), before)
        self.assertEqual(m["reference_status"], "partially_user_corrected_from_V4")
        self.assertTrue(m["evaluation"]["unchanged_from_V4"])
        self.assertEqual(m["corrections"]["affected_images"], ["JKR70-D"])
        for name, meta in m["images"].items():
            if meta["source_image_id"] != "JKR70-D":
                continue
            for case in [c for c in m["cases"] if c["image_id"] == name]:
                for target in case["expected"]:
                    edit = next((e for e in edits if e["label"] == target["label"]), None)
                    if edit:
                        expected = edit["after"] if meta["variant"] == "original" else prepare.translated_box(
                            edit["after"], (374, 632), meta["padding_pixels_ltrb"])
                        self.assertEqual(target["bbox_2d"], expected)
            self.assertNotEqual(meta["reference_sha256"], self.manifest["images"][name]["reference_sha256"])
        ds = load_dataset("parquet", data_files=str(output / "V5-latihan-90.parquet"), split="train")
        answers = [json.loads(row["conversations"][1]["value"]) for row in ds]
        self.assertTrue(any(answer == [{"label": "TANDAS", "bbox_2d": edits[0]["after"]}] for answer in answers))
        self.assertEqual((output / "pembetulan-digunakan.json").read_bytes(), patch.read_bytes())

    def test_rejects_stale_unreviewed_duplicate_or_wrong_correction_before_writing(self):
        good = self.edit("JKR70-D", 4, [530, 70, 710, 230])
        bads = []
        for field, value in [("reviewed", False), ("before", [0, 0, 1, 1]),
                             ("label", "OTHER"), ("image_sha256", "wrong"),
                             ("room_index", True), ("after", [0, 0, 1001, 10])]:
            bad = copy.deepcopy(good)
            bad[field] = value
            bads.append([bad])
        bads.append([good, good])
        for edits in bads:
            patch = self.patch_file(edits)
            output = Path(self.temp.name) / "must-not-exist"
            with self.assertRaises(ValueError):
                prepare.build(self.source, output, patch)
            self.assertFalse(output.exists())
        patch = self.patch_file([good])
        value = json.loads(patch.read_text())
        value["source_manifest_sha256"] = "wrong"
        patch.write_text(json.dumps(value))
        with self.assertRaisesRegex(ValueError, "manifest"):
            prepare.apply_corrections(prepare.read_sources(self.source), self.source, patch)

    def test_same_name_kitchen_correction_updates_query_and_marks_changed_eval_reference(self):
        patch = self.patch_file([self.edit("MANTIN", 3, [100, 800, 300, 950])], "mantin-correction.json")
        output = Path(self.temp.name) / "mantin-corrected"
        prepare.build(self.source, output, patch)
        m = json.loads((output / "manifest-V5.json").read_text())
        self.assertFalse(m["evaluation"]["unchanged_from_V4"])
        case = next(c for c in m["cases"] if c["id"] == "MANTIN-4")
        self.assertIn("bawah-kiri", case["prompt"])
        self.assertEqual(case["expected"][0]["bbox_2d"], [100, 800, 300, 950])
        self.assertIn("skor lama tidak boleh dibandingkan terus", (output / "BACA-DAHULU.txt").read_text())

    def test_refuses_overwrite_and_invalid_bounds(self):
        before = (self.output / "manifest-V5.json").read_bytes()
        with self.assertRaisesRegex(ValueError, "sudah wujud"):
            prepare.build(self.source, self.output)
        self.assertEqual(before, (self.output / "manifest-V5.json").read_bytes())
        for box in [[0, 0, 1001, 100], [0, 0, 0, 1], [False, 0, 10, 10],
                    [0, float("nan"), 10, 10], [0, 0, float("inf"), 10]]:
            with self.assertRaises(ValueError):
                prepare.validate_box(box)

    def test_rejects_changed_pixels_or_split_and_mismatched_single_reference(self):
        # Copy only the tiny synthetic source; no real image data in test code.
        import shutil
        copy_folder = Path(self.temp.name) / "changed"
        shutil.copytree(self.source, copy_folder)
        source_manifest = copy.deepcopy(self.original)
        source_manifest["images"]["MANTIN"]["split"] = "train"
        (copy_folder / "manifest-V4.json").write_text(json.dumps(source_manifest))
        with self.assertRaisesRegex(ValueError, "Pemisahan"):
            prepare.read_sources(copy_folder)
        source_manifest = copy.deepcopy(self.original)
        case = next(c for c in source_manifest["cases"] if c["kind"] == "single")
        case["expected"][0]["bbox_2d"][0] += 1
        (copy_folder / "manifest-V4.json").write_text(json.dumps(source_manifest))
        with self.assertRaisesRegex(ValueError, "single"):
            prepare.read_sources(copy_folder)
        (copy_folder / "manifest-V4.json").write_text(json.dumps(self.original))
        meta = self.original["images"]["MANTIN"]
        image = Image.open(copy_folder / meta["file"]).convert("RGB")
        image.putpixel((0, 0), (1, 2, 3))
        image.save(copy_folder / meta["file"])
        with self.assertRaisesRegex(ValueError, "Imej berubah"):
            prepare.read_sources(copy_folder)


if __name__ == "__main__":
    unittest.main()
