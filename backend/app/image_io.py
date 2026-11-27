"""
High-Integrity Scientific Image I/O Module.

- Preserves exact spatial dimensions (never resizes on export).
- Preserves 16-bit depth for TIFF via tifffile + imagecodecs.
- Lossless PNG export with alpha and ICC profile preservation.
- High-quality JPEG export (default quality=100, 4:4:4 subsampling, ICC preserved).
- Multipage PDF export via ReportLab with lossless embedded PNG streams,
  preserving aspect ratio and reporting effective DPI vs page size.
"""

from __future__ import annotations

import io
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import tifffile
from PIL import Image, ImageOps
from reportlab.lib.pagesizes import A4, LETTER, landscape, portrait
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas as pdf_canvas


SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".webp"}


@dataclass
class ImageMetadata:
    width: int
    height: int
    bit_depth: int
    channels: int
    has_alpha: bool
    format_name: str
    color_mode: str
    icc_profile: Optional[bytes] = None
    dpi: Tuple[float, float] = (300.0, 300.0)


def _normalize_tiff_array(arr: np.ndarray) -> np.ndarray:
    """Ensure TIFF array is (H, W) or (H, W, C) with C in {3, 4}."""
    if arr.ndim == 2:
        return arr
    if arr.ndim == 3:
        # Handle planar (C, H, W) vs interleaved (H, W, C)
        if arr.shape[0] in (1, 3, 4) and arr.shape[2] not in (1, 3, 4):
            arr = np.moveaxis(arr, 0, -1)
        if arr.shape[2] == 1:
            return arr[:, :, 0]
        if arr.shape[2] > 4:
            return arr[:, :, :3]
        return arr
    # If multi-page/stack, take first frame cleanly
    while arr.ndim > 3:
        arr = arr[0]
    return _normalize_tiff_array(arr)


def load_image(path: Path) -> Tuple[np.ndarray, ImageMetadata]:
    """Load an image preserving full bit depth (8-bit or 16-bit) and alpha."""
    ext = path.suffix.lower()

    if ext in (".tif", ".tiff"):
        with tifffile.TiffFile(str(path)) as tif:
            arr = tif.asarray()
            arr = _normalize_tiff_array(arr)
            icc = None
            dpi = (300.0, 300.0)
            try:
                page = tif.pages[0]
                if "ICCProfile" in page.tags:
                    icc = bytes(page.tags["ICCProfile"].value)
                xres = page.tags.get("XResolution")
                yres = page.tags.get("YResolution")
                if xres and yres:
                    xr = xres.value[0] / max(xres.value[1], 1) if isinstance(xres.value, tuple) else float(xres.value)
                    yr = yres.value[0] / max(yres.value[1], 1) if isinstance(yres.value, tuple) else float(yres.value)
                    if xr > 10 and yr > 10:
                        dpi = (xr, yr)
            except Exception:
                pass

        if arr.dtype == np.uint16:
            bit_depth = 16
        elif arr.dtype == np.uint8:
            bit_depth = 8
        elif np.issubdtype(arr.dtype, np.floating):
            arr = np.rint(np.clip(arr, 0.0, 1.0) * 65535.0).astype(np.uint16)
            bit_depth = 16
        else:
            arr = np.clip(arr, 0, 65535).astype(np.uint16)
            bit_depth = 16

        h, w = arr.shape[:2]
        channels = 1 if arr.ndim == 2 else arr.shape[2]
        has_alpha = channels == 4
        mode = {1: "L", 3: "RGB", 4: "RGBA"}.get(channels, "RGB")
        if bit_depth == 16:
            mode = f"{mode};16"

        return arr, ImageMetadata(
            width=w,
            height=h,
            bit_depth=bit_depth,
            channels=channels,
            has_alpha=has_alpha,
            format_name="TIFF",
            color_mode=mode,
            icc_profile=icc,
            dpi=dpi,
        )

    # Standard formats via Pillow (PNG, JPEG, WebP)
    with Image.open(path) as img:
        img = ImageOps.exif_transpose(img)
        fmt = (img.format or ext.lstrip(".").upper()).upper()
        if fmt == "JPG":
            fmt = "JPEG"
        icc = img.info.get("icc_profile")
        raw_dpi = img.info.get("dpi")
        dpi = (float(raw_dpi[0]), float(raw_dpi[1])) if raw_dpi and len(raw_dpi) == 2 and raw_dpi[0] > 10 else (300.0, 300.0)

        # Preserve 16-bit grayscale PNG if present
        if img.mode in ("I;16", "I;16B", "I;16L", "I"):
            arr16 = np.array(img, dtype=np.uint16)
            h, w = arr16.shape[:2]
            return arr16, ImageMetadata(
                width=w,
                height=h,
                bit_depth=16,
                channels=1,
                has_alpha=False,
                format_name=fmt,
                color_mode="L;16",
                icc_profile=icc,
                dpi=dpi,
            )

        has_alpha = img.mode in ("RGBA", "LA") or ("transparency" in img.info)
        if has_alpha:
            converted = img.convert("RGBA")
        elif img.mode == "L":
            converted = img
        else:
            converted = img.convert("RGB")

        arr = np.array(converted, dtype=np.uint8)
        h, w = arr.shape[:2]
        channels = 1 if arr.ndim == 2 else arr.shape[2]
        return arr, ImageMetadata(
            width=w,
            height=h,
            bit_depth=8,
            channels=channels,
            has_alpha=channels == 4,
            format_name=fmt,
            color_mode=converted.mode,
            icc_profile=icc,
            dpi=dpi,
        )


def array_to_uint8(arr: np.ndarray) -> np.ndarray:
    """Convert uint16 or uint8 array cleanly to uint8 for 8-bit preview/display."""
    if arr.dtype == np.uint8:
        return arr
    if arr.dtype == np.uint16:
        return np.rint(arr.astype(np.float32) * (255.0 / 65535.0)).astype(np.uint8)
    return np.clip(arr, 0, 255).astype(np.uint8)


def array_to_uint16(arr: np.ndarray) -> np.ndarray:
    """Convert uint8 or uint16 array cleanly to uint16."""
    if arr.dtype == np.uint16:
        return arr
    if arr.dtype == np.uint8:
        return (arr.astype(np.uint16) * np.uint16(257))
    return np.clip(arr, 0, 65535).astype(np.uint16)


def array_to_pil(arr: np.ndarray) -> Image.Image:
    u8 = array_to_uint8(arr)
    if u8.ndim == 2:
        return Image.fromarray(u8, mode="L")
    if u8.shape[2] == 4:
        return Image.fromarray(u8, mode="RGBA")
    return Image.fromarray(u8[:, :, :3], mode="RGB")


def generate_preview(arr: np.ndarray, max_dim: int, dest_path: Path) -> Tuple[int, int]:
    """Generate a lightweight WebP/PNG preview for UI gallery or workspace."""
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    pil_img = array_to_pil(arr)
    w, h = pil_img.size
    if max(w, h) > max_dim:
        scale = max_dim / float(max(w, h))
        new_size = (max(1, int(round(w * scale))), max(1, int(round(h * scale))))
        pil_img = pil_img.resize(new_size, Image.Resampling.LANCZOS)
    if dest_path.suffix.lower() == ".png":
        pil_img.save(dest_path, format="PNG", compress_level=4)
    else:
        if pil_img.mode == "RGBA":
            pil_img.save(dest_path, format="WEBP", quality=90, lossless=False)
        else:
            pil_img.convert("RGB").save(dest_path, format="JPEG", quality=92, subsampling=0)
    return pil_img.size


def save_image(
    arr: np.ndarray,
    dest_path: Path,
    fmt: str,
    meta: ImageMetadata,
    jpeg_quality: int = 100,
    tiff_bit_depth: str = "preserve",
    tiff_compression: str = "lzw",
) -> Path:
    """
    Save full-resolution image without resizing or unnecessary degradation.
    """
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    fmt_upper = fmt.upper()

    if fmt_upper == "TIFF":
        if tiff_bit_depth == "16":
            out_arr = array_to_uint16(arr)
        elif tiff_bit_depth == "8":
            out_arr = array_to_uint8(arr)
        else:
            out_arr = arr  # preserve exact bit depth (8 or 16)

        comp_map = {"lzw": "lzw", "deflate": "zlib", "none": None}
        comp = comp_map.get(tiff_compression.lower(), "lzw")
        photometric = "minisblack" if out_arr.ndim == 2 else "rgb"
        extra_kwargs: Dict = {
            "photometric": photometric,
            "resolution": (meta.dpi[0], meta.dpi[1]),
            "resolutionunit": "INCH",
        }
        if comp is not None:
            extra_kwargs["compression"] = comp
        if out_arr.ndim == 3 and out_arr.shape[2] == 4:
            extra_kwargs["extrasamples"] = ["unassalpha"]

        tifffile.imwrite(str(dest_path), out_arr, **extra_kwargs)
        return dest_path

    if fmt_upper == "PNG":
        # If 16-bit grayscale, Pillow can save I;16 directly
        if arr.dtype == np.uint16 and arr.ndim == 2:
            pil_img = Image.fromarray(arr, mode="I;16")
        else:
            pil_img = array_to_pil(arr)
        save_kwargs: Dict = {"format": "PNG", "compress_level": 6, "dpi": meta.dpi}
        if meta.icc_profile:
            save_kwargs["icc_profile"] = meta.icc_profile
        pil_img.save(dest_path, **save_kwargs)
        return dest_path

    if fmt_upper in ("JPEG", "JPG"):
        pil_img = array_to_pil(arr)
        if pil_img.mode == "RGBA":
            bg = Image.new("RGB", pil_img.size, (255, 255, 255))
            bg.paste(pil_img, mask=pil_img.split()[3])
            pil_img = bg
        elif pil_img.mode != "RGB":
            pil_img = pil_img.convert("RGB")
        save_kwargs = {
            "format": "JPEG",
            "quality": int(max(1, min(100, jpeg_quality))),
            "subsampling": 0 if jpeg_quality >= 90 else 2,
            "optimize": True,
            "dpi": meta.dpi,
        }
        if meta.icc_profile:
            save_kwargs["icc_profile"] = meta.icc_profile
        pil_img.save(dest_path, **save_kwargs)
        return dest_path

    raise ValueError(f"Unsupported export format: {fmt}")


def build_multipage_pdf(
    entries: List[Tuple[str, np.ndarray, ImageMetadata]],
    dest_path: Path,
    orientation: str = "auto",
    page_size: str = "A4",
) -> List[str]:
    """
    Compile multiple images into a high-quality multipage PDF without downscaling.
    Returns informational notes explaining page dimensions & effective DPI.
    """
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    c = pdf_canvas.Canvas(str(dest_path))
    notes: List[str] = []
    min_eff_dpi = float("inf")
    constrained_count = 0

    for filename, arr, meta in entries:
        pil_img = array_to_pil(arr)
        if pil_img.mode == "RGBA":
            bg = Image.new("RGB", pil_img.size, (255, 255, 255))
            bg.paste(pil_img, mask=pil_img.split()[3])
            pil_img = bg
        elif pil_img.mode != "RGB":
            pil_img = pil_img.convert("RGB")

        img_w, img_h = pil_img.size

        # Embed lossless PNG bytes directly so ReportLab does NOT apply lossy JPEG compression
        png_buf = io.BytesIO()
        pil_img.save(png_buf, format="PNG", compress_level=4)
        png_buf.seek(0)
        reader = ImageReader(png_buf)

        if page_size == "Original" or orientation == "fit-image":
            # 1:1 native pixel-to-point mapping at source DPI (default 300 DPI)
            dpi_x = meta.dpi[0] if meta.dpi[0] >= 72 else 300.0
            dpi_y = meta.dpi[1] if meta.dpi[1] >= 72 else 300.0
            pw = img_w * 72.0 / dpi_x
            ph = img_h * 72.0 / dpi_y
            c.setPageSize((pw, ph))
            c.drawImage(reader, 0, 0, width=pw, height=ph, preserveAspectRatio=True)
            eff_dpi = dpi_x
        else:
            base = LETTER if page_size == "Letter" else A4
            if orientation == "landscape":
                pw, ph = landscape(base)
            elif orientation == "portrait":
                pw, ph = portrait(base)
            else:
                pw, ph = landscape(base) if img_w > img_h else portrait(base)

            c.setPageSize((pw, ph))
            margin = 24.0  # ~8.5mm clean scientific margin
            avail_w = pw - 2 * margin
            avail_h = ph - 2 * margin
            scale = min(avail_w / img_w, avail_h / img_h)
            draw_w = img_w * scale
            draw_h = img_h * scale
            x = (pw - draw_w) / 2.0
            y = (ph - draw_h) / 2.0
            c.drawImage(reader, x, y, width=draw_w, height=draw_h, preserveAspectRatio=True)
            eff_dpi = img_w / (draw_w / 72.0)
            constrained_count += 1

        min_eff_dpi = min(min_eff_dpi, eff_dpi)
        c.showPage()

    c.save()

    notes.append(
        "All images were embedded into the PDF as lossless PNG streams at full pixel dimensions (no raster downsampling)."
    )
    if constrained_count > 0:
        notes.append(
            f"Fixed {page_size} page dimensions scale the physical print area; effective print resolution is "
            f"~{int(round(min_eff_dpi))} DPI (minimum across pages). Choose 'Original' page size to match native pixel dimensions."
        )
    else:
        notes.append(
            f"Each PDF page matches the image's native aspect ratio and DPI (~{int(round(min_eff_dpi))} DPI) with zero clipping."
        )
    return notes


def build_zip_archive(files: List[Tuple[Path, str]], dest_path: Path) -> Path:
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(dest_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=4) as zf:
        for src, arcname in files:
            zf.write(src, arcname=arcname)
    return dest_path
