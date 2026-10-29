# Reviewed room detection and numbering sequence

This tool binds a **private reference supplied as compressed JSON data** to the user's clean PNG/JPEG and creates an offline geometry-review page. It does not infer an authoritative room count from an SVG class vocabulary. User drawing images, sequence labels, room polygons and encoded private reference payloads must remain outside the public repository. Only generic tooling and synthetic fixtures are committed here.

The reference contains scope units, the already reviewed room-name/zone/sequence list, **approximate draft polygons**, main-entrance point drafts and each unit's first outdoor region. The outdoor starting point is explicit because a reviewer may define different starting regions for different units. It is not replaced with one universal angular sort. Excluded units can remain visible on the full drawing but must be explicitly outside the training query scope later; do not silently treat visible, unlabeled units as having no rooms.

## Build the local review

`start.ps1 -ReleaseRef <pinned commit> -ReferenceData <base64 gzip JSON data>` prompts for a **clean original image** and downloads two generic, SHA-256-checked helper files. The supplied reference is parsed as data, never evaluated as code, and has a bounded decompressed size. The private payload is passed locally and is not uploaded with the GitHub download requests. The source image is converted to lossless RGB PNG (transparency flattened on white) without geometric resizing, cropping, rotation or drawn annotations. The source file is preserved.

```sh
python scripts/room-sequence/prepare.py /path/to/clean.png /path/to/new-review --reference-b64 "$PRIVATE_REFERENCE_DATA"
```

The generated folder contains `pelan-bersih.png`, `rujukan-draf.json`, `BUKA-SEMAKAN-URUTAN.html` and Malay instructions. **There is no Parquet, model load, training run or claim of reviewed geometry at this stage.** The starting shapes are expressly approximate estimates. The initial template image/frame is for draft placement only; the actual selected image's pixel dimensions and decoded RGB hash bind all later review records.

In the page:

1. Verify the frame's two designated building corners. If image margins/composition differ, mark the two matching corners and apply the frame. The affine transform repositions the draft; all geometry confirmations are invalidated. It is not a CAD fit or a perspective correction.
2. Confirm that the input is the clean drawing without answer labels/arrows. Colored reference drawings must not become training inputs that expose their answers.
3. Select each room, drag the polygon's blue vertices or edit its pixel-coordinate list, then confirm. A room L uses its complete floor contour and its bounding rectangle, not a text-label box. Same-name rooms remain separate instances. Room names/sequence/unit/zone come from the reference and cannot accidentally be renumbered during geometry edits.
4. Check all main entrances independently. Doors are not additional rooms.
5. Save a draft to resume later, or export the complete review only after every room/entrance and both image/frame confirmations are complete. Typed but unapplied polygon/frame edits cannot be silently confirmed.

Draft import requires the same image/reference fingerprints. The UI exports `semakan-ruang-urutan.json` with reviewed polygons, derived 0–1000 boxes, the exact sequence/name/unit/zone list, counts and entrance pixels. `validate_review` independently checks the image hash, reference hash, counts, sequence, geometry, scope and confirmations before a later dataset exporter may consume the file. Zero-area, self-intersecting, duplicate-vertex or out-of-image polygons and boxes collapsed at 0–1000 resolution are rejected rather than clamped. Validity checks do **not** establish that the polygon matches actual walls; that remains the explicit human review. Pairwise polygon overlap and wall connectivity are not automatically certified.

Outdoor regions are defined by the reviewer; blank paper is not enough to infer asset-space boundaries. A location description for an outdoor region is not represented as printed room-name OCR. Final registered asset codes are distinct from the model's ordinal room sequence. FCA can allocate final codes after reviewing the ordered room list; this tool does not change its existing allocation or registration data.

All units/crops/tasks derived from one drawing remain **one independent source**. Do not spread them across train/validation/test and describe them as independent examples. This review is a prerequisite to generating faithful supervision, not evidence that one drawing will teach general room recognition or numbering. No fabricated model reasoning/chain-of-thought annotations are produced.

## Synthetic validation

```sh
python -m unittest discover -s scripts/room-sequence -p 'test_*.py'
SEQUENCE_TEST_PYTHON=python3 node --test scripts/room-sequence/test_review.mjs
```

Tests cover sequence/outdoor-start integrity, bounded private data decoding, clean-image pixel preservation, simple-polygon geometry rejection, independent exported-review validation, source/reference fingerprints, required approvals, dirty-coordinate handling, vertex dragging, frame-induced invalidation, draft restore, mobile layout and no external page requests. Synthetic fixtures contain no user plan labels or geometry. Browser tests require Playwright and Chromium and allow interpreter/browser path overrides.
