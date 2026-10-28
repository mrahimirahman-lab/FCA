"""Synthetic, local-only checks; no CubiCasa images redistributed in the repository."""
import io
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from PIL import Image
from datasets import Image as DatasetImage, load_dataset

import prepare


class CubiCasaTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="fca-cubicasa-test-")
        self.root = Path(self.temp.name)
        self.source = self.root/"source"
        self.source.mkdir()
        self.sample("A", (100, 80), [
            ("Bedroom", "10,10 30,10 30,30 10,30"),
            ("Bedroom", "50,10 70,10 70,30 50,30"),
            ("Kitchen", "10,40 40,40 40,70 10,70"),
            ("Outdoor", "70,40 90,40 90,70 70,70"),
            ("Undefined", "45,40 55,40 55,55 45,55")])
        self.sample("B", (120, 90), [
            ("Bath Shower", "10,10 40,10 40,40 10,40"),
            ("LivingRoom", "50,10 100,10 100,70 50,70")])
        self.sample("C", (140, 100), [
            ("Kitchen", "10,10 70,10 70,50 41,50 41,90 40.8,90 40.8,50 10,50")])

    def tearDown(self):
        self.temp.cleanup()

    def sample(self, name, size, rooms):
        folder = self.source/name
        folder.mkdir()
        Image.new("RGB", size, "white").save(folder/"F1_scaled.png")
        (folder/"F2_scaled.png").write_bytes((folder/"F1_scaled.png").read_bytes())
        groups = ''.join(f'<g class="Space {label}" id="r{i}"><polygon points="{p}"/></g>' for i,(label,p) in enumerate(rooms))
        # Deliberately different root dimensions: source coordinates already are PNG pixels.
        (folder/"model.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg" width="999" height="888" viewBox="0 0 999 888">'+groups+'</svg>')

    def audit(self, name="audit"):
        folder = self.root/name
        return folder, prepare.audit(self.source, folder)

    def review(self, audit, approved=("A", "B")):
        path = self.root/"review.json"
        path.write_text(json.dumps({"schema_version":1,"manifest_sha256":prepare.sha((audit/"manifest-cubicasa.json").read_bytes()),"approved_ids":list(approved)}))
        return path

    def test_pixels_not_svg_viewbox_classes_duplicates_and_quality_flags(self):
        folder, manifest = self.audit()
        self.assertEqual(len(manifest["samples"]), 3)
        a,b,c = manifest["samples"]
        self.assertEqual(a["rooms"][0]["bbox_2d"], [100,125,300,375])
        self.assertEqual(a["class_counts"]["BILIK TIDUR"], 2)
        self.assertEqual(len(a["excluded"]), 2)
        self.assertTrue(all(s["ignored_F2"] for s in manifest["samples"]))
        self.assertTrue(a["eligible"])
        self.assertTrue(b["eligible"])
        self.assertFalse(c["eligible"])
        self.assertEqual(c["rooms"][0]["bbox_pixels"][3], 90)
        self.assertEqual(c["rooms"][0]["warnings"][0]["code"], "subpixel_tail")
        self.assertFalse(list(folder.glob("*.parquet")))
        self.assertIn("CC BY-NC", (folder/"LESEN.txt").read_text())

    def test_affine_transforms_apply_to_room_vertices(self):
        matrix = prepare.multiply(prepare.transform("translate(10,20) scale(2)"), prepare.transform("translate(1,1)"))
        self.assertEqual(prepare.points("0,0 10,0 10,10", matrix), [[12,22],[32,22],[32,42]])
        rotated = prepare.points("0,0 10,0 10,10", prepare.transform("rotate(90,0,0)"))
        self.assertAlmostEqual(rotated[2][0], -10)
        self.assertAlmostEqual(rotated[2][1], 10)
        with self.assertRaises(ValueError): prepare.transform("matrix(1,0,garbage,1,0,0)")
        with self.assertRaises(ValueError): prepare.geometry([[0,0],[101,0],[101,20]], 100, 80)

    def test_bootstrap_hashes_match_local_helpers(self):
        root = Path(__file__).parent
        text = (root/"start.ps1").read_text()
        for name in ["prepare.py", "review.html"]:
            self.assertIn("'"+name+"' = '"+prepare.sha((root/name).read_bytes())+"'", text)

    def test_reviewed_export_embeds_images_and_preserves_same_type_instances(self):
        audit, _ = self.audit()
        review = self.review(audit)
        train, val = self.root/"train.txt", self.root/"val.txt"
        train.write_text("/A/\n");val.write_text("B/\n")
        output = self.root/"out"
        report = prepare.export(audit, review, train, val, output)
        self.assertEqual(report["splits"]["train"], {"images":1,"rows":3,"sample_ids":["A"]})
        self.assertEqual(report["splits"]["validation"]["images"], 1)
        hashes = []
        for filename in ["CubiCasa-latihan.parquet", "CubiCasa-validasi.parquet"]:
            ds = load_dataset("parquet",data_files=str(output/filename),split="train")
            decoded = ds.cast_column("image", DatasetImage(decode=False))
            hashes.append({prepare.pixel_hash(prepare.rgb_image(row["image"]["bytes"])) for row in decoded})
            self.assertTrue(all(row["image"]["path"] is None for row in decoded))
            answers = [json.loads(row["conversations"][1]["value"]) for row in ds]
            self.assertTrue(all(set(r)=={"label","bbox_2d"} for a in answers for r in a))
            if "latihan" in filename:
                bedrooms = [a for a in answers if len(a)==2 and all(r["label"]=="BILIK TIDUR" for r in a)]
                self.assertEqual(len(bedrooms), 1)
                self.assertNotEqual(bedrooms[0][0]["bbox_2d"], bedrooms[0][1]["bbox_2d"])
        self.assertFalse(hashes[0] & hashes[1])

    def test_rejects_overlapping_splits_stale_reviews_and_flagged_samples(self):
        audit, _ = self.audit()
        train, val = self.root/"train.txt", self.root/"val.txt"
        train.write_text("A\n");val.write_text("A\nB\n")
        review = self.review(audit)
        with self.assertRaisesRegex(ValueError, "overlap"):
            prepare.export(audit, review, train, val, self.root/"no-output")
        val.write_text("B\n")
        review = self.review(audit, ("A", "C"))
        with self.assertRaisesRegex(ValueError, "flagged"):
            prepare.export(audit, review, train, val, self.root/"no-output")
        review.write_text('{"schema_version":1,"manifest_sha256":"stale","approved_ids":["A","B"]}')
        with self.assertRaisesRegex(ValueError, "match"):
            prepare.export(audit, review, train, val, self.root/"no-output")
        self.assertFalse((self.root/"no-output").exists())

    def test_changed_pixels_and_outside_paths_are_rejected(self):
        audit, manifest = self.audit()
        review = self.review(audit)
        train, val = self.root/"train.txt", self.root/"val.txt"
        train.write_text("A");val.write_text("B")
        file = audit/manifest["samples"][0]["file"]
        image = Image.open(file).convert("RGB");image.putpixel((0,0),(1,2,3));image.save(file)
        with self.assertRaisesRegex(ValueError, "pixels"):
            prepare.export(audit, review, train, val, self.root/"no-output")
        for path in ["../escape", "C:/escape"]:
            with self.assertRaises(ValueError): prepare.relative(path)
        with self.assertRaises(ValueError):
            prepare.parse_svg(b'<!DOCTYPE svg><svg/>',100,100)

    def test_zip_and_directory_audit_have_same_coordinate_contract(self):
        _, original = self.audit()
        archive = self.root/"samples.zip"
        with zipfile.ZipFile(archive,"w") as zip_file:
            for file in self.source.rglob("*"):
                if file.is_file():zip_file.write(file,str(file.relative_to(self.source)))
        zipped = prepare.audit(archive,self.root/"zip-audit")
        self.assertEqual(original,zipped)
        bad = self.root/"bad.zip"
        with zipfile.ZipFile(bad,"w") as zip_file:zip_file.writestr("../model.svg","bad")
        with self.assertRaisesRegex(ValueError,"Unsafe"):
            prepare.audit(bad,self.root/"bad-audit")


if __name__ == "__main__":
    unittest.main()
