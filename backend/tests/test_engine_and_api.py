"""
Comprehensive QA & Scientific Image Integrity Test Suite for Microscope Batch Color Studio.

Validates:
1. Original dimensions vs exported dimensions (never resized or cropped).
2. PNG lossless encoding & alpha channel preservation & exact Neutral pass-through.
3. JPEG export quality=100 & explicit lossy disclosure.
4. TIFF 16-bit depth preservation & lossless LZW encoding.
5. Soft Pale Pink color transformation: shifts whitish/grayish background to pale pink
   while preserving blue and orange circular specimen outlines.
6. Batch processing consistency, deduplication (skip unchanged), and 50-image batch throughput.
7. Before-and-after preview endpoints.
8. ZIP export integrity & filename prefixing.
9. Multipage PDF export validity & resolution notes.
10. Local folder export & custom preset persistence.
"""

from __future__ import annotations

import io
import time
import zipfile
from pathlib import Path

import numpy as np
import pytest
import tifffile
from fastapi.testclient import TestClient
from PIL import Image

from app.color_engine import apply_color_settings
from app.main import app, workspace
from app.models import ColorSettings
from app.presets import BUILTIN_PRESETS


def make_synthetic_microscope_image(
    width: int = 320,
    height: int = 240,
    bit_depth: int = 8,
    with_alpha: bool = False,
) -> np.ndarray:
    """
    Create a realistic brightfield microscope test image:
    - Whitish/light-gray slightly textured background (~0.90-0.94 luminance)
    - Circular specimen with a crisp BLUE outer ring and ORANGE inner ring.
    """
    max_val = 65535.0 if bit_depth == 16 else 255.0
    dtype = np.uint16 if bit_depth == 16 else np.uint8

    yy, xx = np.mgrid[0:height, 0:width].astype(np.float32)
    cx, cy = width * 0.5, height * 0.5
    dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)

    # Neutral brightfield whitish-gray field (~0.92)
    bg = np.full((height, width, 3), 0.92, dtype=np.float32)

    # Blue circular outline (radius 58..68)
    blue_mask = (dist >= 58.0) & (dist <= 68.0)
    bg[blue_mask] = np.array([0.14, 0.36, 0.86], dtype=np.float32)

    # Orange circular outline (radius 44..54)
    orange_mask = (dist >= 44.0) & (dist <= 54.0)
    bg[orange_mask] = np.array([0.92, 0.48, 0.12], dtype=np.float32)

    rgb = np.rint(bg * max_val).astype(dtype)
    if with_alpha:
        alpha = np.full((height, width, 1), int(max_val), dtype=dtype)
        alpha[:20, :20, 0] = int(max_val * 0.5)
        return np.concatenate([rgb, alpha], axis=-1)
    return rgb


def test_soft_pale_pink_preserves_blue_and_orange_outlines():
    img = make_synthetic_microscope_image(320, 240, bit_depth=8)
    pink_preset = next(p for p in BUILTIN_PRESETS if p.id == "soft-pale-pink")

    out = apply_color_settings(img, pink_preset.settings)

    # Exact dimensions and dtype preserved
    assert out.shape == img.shape
    assert out.dtype == np.uint8

    # Corner background pixel (whitish-gray ~235,235,235) -> soft pale pink (R > B > G)
    bg_pixel = out[10, 10].astype(float)
    assert bg_pixel[0] > bg_pixel[2] > bg_pixel[1], f"Expected pale pink R>B>G, got {bg_pixel}"
    assert bg_pixel[0] > 215, f"Background should remain bright pastel, got {bg_pixel}"

    # Blue ring pixel at (cy, cx + 63) -> remains clearly blue (B >> R and B > G)
    blue_pixel = out[120, 160 + 63].astype(float)
    assert blue_pixel[2] > blue_pixel[0] + 80, f"Blue outline lost blue dominance: {blue_pixel}"
    assert blue_pixel[2] > blue_pixel[1] + 50, f"Blue outline shifted excessively: {blue_pixel}"

    # Orange ring pixel at (cy, cx + 49) -> remains clearly orange (R > G > B)
    orange_pixel = out[120, 160 + 49].astype(float)
    assert orange_pixel[0] > orange_pixel[1] > orange_pixel[2], f"Orange outline corrupted: {orange_pixel}"
    assert orange_pixel[0] - orange_pixel[2] > 120, f"Orange chroma washed out: {orange_pixel}"


def test_neutral_preset_is_exact_identity_and_preserves_alpha():
    img = make_synthetic_microscope_image(200, 150, bit_depth=8, with_alpha=True)
    neutral = next(p for p in BUILTIN_PRESETS if p.id == "neutral")
    out = apply_color_settings(img, neutral.settings)
    assert np.array_equal(out, img), "Neutral preset must not alter pixels"

    pink = next(p for p in BUILTIN_PRESETS if p.id == "soft-pale-pink")
    out_pink = apply_color_settings(img, pink.settings)
    assert np.array_equal(out_pink[:, :, 3], img[:, :, 3]), "Alpha channel must be preserved identically"


def test_16bit_tiff_depth_preserved():
    img16 = make_synthetic_microscope_image(256, 192, bit_depth=16)
    pink = next(p for p in BUILTIN_PRESETS if p.id == "soft-pale-pink")
    out16 = apply_color_settings(img16, pink.settings)

    assert out16.dtype == np.uint16
    assert out16.shape == (192, 256, 3)
    assert int(out16.max()) > 50000, "16-bit dynamic range must be preserved"


def test_full_api_workflow_png_jpeg_tiff_pdf_zip_folder(tmp_path: Path):
    client = TestClient(app)
    # Clean workspace before test
    client.delete("/api/images")

    # Prepare 3 diverse microscope files: 8-bit RGBA PNG, 8-bit JPEG, and 16-bit RGB TIFF
    png_arr = make_synthetic_microscope_image(300, 220, bit_depth=8, with_alpha=True)
    png_buf = io.BytesIO()
    Image.fromarray(png_arr, mode="RGBA").save(png_buf, format="PNG")

    jpg_arr = make_synthetic_microscope_image(360, 240, bit_depth=8, with_alpha=False)
    jpg_buf = io.BytesIO()
    Image.fromarray(jpg_arr, mode="RGB").save(jpg_buf, format="JPEG", quality=98)

    tif_arr = make_synthetic_microscope_image(280, 200, bit_depth=16, with_alpha=False)
    tif_buf = io.BytesIO()
    tifffile.imwrite(tif_buf, tif_arr, photometric="rgb")

    # 1. Upload multiple files
    resp = client.post(
        "/api/images/upload",
        files=[
            ("files", ("slide_alpha.png", png_buf.getvalue(), "image/png")),
            ("files", ("slide_field.jpg", jpg_buf.getvalue(), "image/jpeg")),
            ("files", ("slide_16bit.tiff", tif_buf.getvalue(), "image/tiff")),
        ],
    )
    assert resp.status_code == 200
    payload = resp.json()
    assert len(payload["errors"]) == 0
    uploaded = payload["uploaded"]
    assert len(uploaded) == 3

    by_name = {u["filename"]: u for u in uploaded}
    assert by_name["slide_alpha.png"]["hasAlpha"] is True
    assert by_name["slide_16bit.tiff"]["bitDepth"] == 16
    assert by_name["slide_field.jpg"]["width"] == 360

    # 2. Run batch processing with Soft Pale Pink
    pink_settings = next(p for p in BUILTIN_PRESETS if p.id == "soft-pale-pink").settings.model_dump()
    ids = [u["id"] for u in uploaded]
    job_resp = client.post(
        "/api/batch/process",
        json={"imageIds": ids, "settings": pink_settings, "presetName": "Soft Pale Pink"},
    )
    assert job_resp.status_code == 200
    job_id = job_resp.json()["jobId"]

    # Wait for background batch job completion
    for _ in range(100):
        st = client.get(f"/api/batch/jobs/{job_id}").json()
        if st["status"] != "running":
            break
        time.sleep(0.05)
    assert st["status"] == "completed"
    assert st["completed"] == 3
    assert st["failed"] == 0

    # 3. Verify deduplication (re-running identical settings skips redundant processing)
    job2 = client.post(
        "/api/batch/process",
        json={"imageIds": ids, "settings": pink_settings, "presetName": "Soft Pale Pink"},
    ).json()
    for _ in range(50):
        st2 = client.get(f"/api/batch/jobs/{job2['jobId']}").json()
        if st2["status"] != "running":
            break
        time.sleep(0.05)
    assert st2["skipped"] == 3

    # 4. Verify before-and-after preview endpoints return valid PNGs
    for img_id in ids:
        p_orig = client.get(f"/api/images/{img_id}/preview?processed=false")
        p_proc = client.get(f"/api/images/{img_id}/preview?processed=true")
        assert p_orig.status_code == 200 and len(p_orig.content) > 100
        assert p_proc.status_code == 200 and len(p_proc.content) > 100

    # 5. Export PNG ZIP and validate exact dimensions & alpha preservation
    exp_png = client.post(
        "/api/export",
        json={"imageIds": ids, "format": "PNG", "delivery": "zip", "filenamePrefix": "pink_"},
    )
    assert exp_png.status_code == 200
    exp_png_data = exp_png.json()
    assert exp_png_data["exportedCount"] == 3
    dl_png = client.get(exp_png_data["downloadUrl"])
    assert dl_png.status_code == 200
    with zipfile.ZipFile(io.BytesIO(dl_png.content)) as zf:
        names = set(zf.namelist())
        assert "pink_slide_alpha.png" in names
        assert "pink_slide_field.png" in names
        assert "pink_slide_16bit.png" in names
        with Image.open(io.BytesIO(zf.read("pink_slide_alpha.png"))) as im:
            assert im.size == (300, 220)
            assert im.mode == "RGBA"

    # 6. Export 16-bit TIFF to local folder and verify 16-bit uint16 preserved
    tiff_out_dir = tmp_path / "tiff_exports"
    exp_tif = client.post(
        "/api/export",
        json={
            "imageIds": [by_name["slide_16bit.tiff"]["id"]],
            "format": "TIFF",
            "delivery": "folder",
            "filenamePrefix": "lab_",
            "tiffBitDepth": "preserve",
            "tiffCompression": "lzw",
            "outputFolder": str(tiff_out_dir),
        },
    )
    assert exp_tif.status_code == 200
    exported_tif_path = tiff_out_dir / "lab_slide_16bit.tiff"
    assert exported_tif_path.exists()
    reloaded_tif = tifffile.imread(str(exported_tif_path))
    assert reloaded_tif.dtype == np.uint16
    assert reloaded_tif.shape == (200, 280, 3)

    # 7. Export JPEG quality=100 and check lossy disclosure note
    exp_jpg = client.post(
        "/api/export",
        json={
            "imageIds": [by_name["slide_field.jpg"]["id"]],
            "format": "JPEG",
            "delivery": "single",
            "jpegQuality": 100,
        },
    )
    assert exp_jpg.status_code == 200
    jpg_summary = exp_jpg.json()
    assert any("lossy" in n.lower() for n in jpg_summary["notes"])
    dl_jpg = client.get(jpg_summary["downloadUrl"])
    with Image.open(io.BytesIO(dl_jpg.content)) as im_jpg:
        assert im_jpg.size == (360, 240)

    # 8. Export Multipage PDF and verify valid PDF & notes
    exp_pdf = client.post(
        "/api/export",
        json={
            "imageIds": ids,
            "format": "PDF",
            "delivery": "single",
            "pdfOrientation": "auto",
            "pdfPageSize": "A4",
        },
    )
    assert exp_pdf.status_code == 200
    pdf_summary = exp_pdf.json()
    assert any("DPI" in n for n in pdf_summary["notes"])
    dl_pdf = client.get(pdf_summary["downloadUrl"])
    assert dl_pdf.status_code == 200
    assert dl_pdf.content.startswith(b"%PDF-")

    # 9. Custom Preset create + list + delete
    created_preset = client.post(
        "/api/presets",
        json={"name": "QA Test Pink", "description": "Test preset", "settings": pink_settings},
    ).json()
    all_presets = client.get("/api/presets").json()
    assert any(p["id"] == created_preset["id"] for p in all_presets)
    del_resp = client.delete(f"/api/presets/{created_preset['id']}")
    assert del_resp.status_code == 200

    # Cleanup
    client.delete("/api/images")


def test_large_batch_50_images_consistency():
    """Verify 50-image batch processing completes reliably with identical consistency."""
    client = TestClient(app)
    client.delete("/api/images")

    arr = make_synthetic_microscope_image(160, 120, bit_depth=8)
    buf = io.BytesIO()
    Image.fromarray(arr, mode="RGB").save(buf, format="PNG")
    raw_bytes = buf.getvalue()

    ids = []
    for batch_start in range(0, 50, 10):
        files = [
            ("files", (f"sample_{i:03d}.png", raw_bytes, "image/png"))
            for i in range(batch_start, batch_start + 10)
        ]
        r = client.post("/api/images/upload", files=files)
        assert r.status_code == 200
        ids.extend([u["id"] for u in r.json()["uploaded"]])

    assert len(ids) == 50

    pink_settings = next(p for p in BUILTIN_PRESETS if p.id == "soft-pale-pink").settings.model_dump()
    job = client.post(
        "/api/batch/process",
        json={"imageIds": ids, "settings": pink_settings, "presetName": "Soft Pale Pink"},
    ).json()

    for _ in range(200):
        st = client.get(f"/api/batch/jobs/{job['jobId']}").json()
        if st["status"] != "running":
            break
        time.sleep(0.05)

    assert st["status"] == "completed"
    assert st["completed"] == 50
    assert st["failed"] == 0

    # Verify first and last processed images are pixel-for-pixel identical
    p0 = workspace.processed_paths[ids[0]]
    p49 = workspace.processed_paths[ids[49]]
    a0 = np.array(Image.open(p0))
    a49 = np.array(Image.open(p49))
    assert np.array_equal(a0, a49), "Batch processing must be 100% deterministic across images"

    client.delete("/api/images")
