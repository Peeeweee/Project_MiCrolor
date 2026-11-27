"""
Scientific Microscope Color Transformation Engine.

Operates in full floating-point (float32) precision on NumPy arrays,
supporting both 8-bit (uint8) and 16-bit (uint16) images as well as
alpha channels without resampling, cropping, sharpening, or AI generation.

Key design principle:
- Brightfield microscope backgrounds are high-luminance, low-chroma (near-neutral).
- Specimen outlines (e.g. blue/orange stained or phase-contrast rings) have higher
  chroma and/or darker edges.
- Using multiplicative optical illumination tinting weighted by pixel neutrality
  and tonal protection shifts the whitish/grayish background into a natural
  soft pale pink (or any chosen color) while preserving the original hue,
  contrast, and sharpness of chromatic specimen outlines.
"""

from __future__ import annotations

import hashlib
import json
from typing import Tuple

import numpy as np

from .models import ColorSettings


def compute_settings_hash(settings: ColorSettings) -> str:
    payload = json.dumps(
        {
            "temperature": round(settings.temperature, 3),
            "tint": round(settings.tint, 3),
            "hue": round(settings.hue, 3),
            "saturation": round(settings.saturation, 3),
            "brightness": round(settings.brightness, 3),
            "contrast": round(settings.contrast, 3),
            "highlights": round(settings.highlights, 3),
            "shadows": round(settings.shadows, 3),
            "midtoneColor": settings.midtoneColor.upper(),
            "colorIntensity": round(settings.colorIntensity, 3),
        },
        sort_keys=True,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


def is_identity_settings(settings: ColorSettings) -> bool:
    return (
        settings.temperature == 0.0
        and settings.tint == 0.0
        and settings.hue == 0.0
        and settings.saturation == 0.0
        and settings.brightness == 0.0
        and settings.contrast == 0.0
        and settings.highlights == 0.0
        and settings.shadows == 0.0
        and settings.colorIntensity == 0.0
    )


def _hex_to_rgb01(hex_color: str) -> Tuple[float, float, float]:
    h = hex_color.lstrip("#")
    return (
        int(h[0:2], 16) / 255.0,
        int(h[2:4], 16) / 255.0,
        int(h[4:6], 16) / 255.0,
    )


def _smoothstep(edge0: float, edge1: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def _rotate_hue_rgb(rgb: np.ndarray, degrees: float) -> np.ndarray:
    """Exact luminance-preserving Rodrigues rotation around the (1, 1, 1) neutral axis."""
    rad = np.deg2rad(degrees)
    cos_a = float(np.cos(rad))
    sin_a = float(np.sin(rad))
    one_third = 1.0 / 3.0
    sqrt_third = float(np.sqrt(one_third))

    m00 = cos_a + (1.0 - cos_a) * one_third
    m01 = one_third * (1.0 - cos_a) - sqrt_third * sin_a
    m02 = one_third * (1.0 - cos_a) + sqrt_third * sin_a

    m10 = one_third * (1.0 - cos_a) + sqrt_third * sin_a
    m11 = cos_a + one_third * (1.0 - cos_a)
    m12 = one_third * (1.0 - cos_a) - sqrt_third * sin_a

    m20 = one_third * (1.0 - cos_a) - sqrt_third * sin_a
    m21 = one_third * (1.0 - cos_a) + sqrt_third * sin_a
    m22 = cos_a + one_third * (1.0 - cos_a)

    mat = np.array(
        [[m00, m10, m20], [m01, m11, m21], [m02, m12, m22]],
        dtype=np.float32,
    )
    return np.clip(rgb @ mat, 0.0, 1.0)


def apply_color_settings(image: np.ndarray, settings: ColorSettings) -> np.ndarray:
    """
    Apply non-destructive scientific color transformation to an image array.

    Parameters
    ----------
    image : np.ndarray
        2D (H, W) grayscale or 3D (H, W, 3) RGB or (H, W, 4) RGBA array
        in uint8 or uint16.
    settings : ColorSettings
        Color adjustment parameters.

    Returns
    -------
    np.ndarray
        Processed image with identical spatial dimensions (H, W), preserved
        bit depth (uint8 or uint16), and preserved alpha channel if present.
    """
    orig_dtype = image.dtype
    if orig_dtype == np.uint16:
        max_val = 65535.0
    elif orig_dtype == np.uint8:
        max_val = 255.0
    else:
        # Normalize floating or other integer types cleanly to float32
        max_val = float(np.iinfo(orig_dtype).max) if np.issubdtype(orig_dtype, np.integer) else 1.0

    # If settings are completely neutral, return exact copy (preserving grayscale too)
    if is_identity_settings(settings):
        return image.copy()

    # Separate alpha if present; promote grayscale to RGB for color grading
    alpha = None
    if image.ndim == 2:
        rgb_src = np.stack([image, image, image], axis=-1)
    elif image.shape[2] == 4:
        rgb_src = image[:, :, :3]
        alpha = image[:, :, 3].copy()
    elif image.shape[2] == 1:
        rgb_src = np.repeat(image, 3, axis=-1)
    else:
        rgb_src = image[:, :, :3]

    rgb = rgb_src.astype(np.float32) / np.float32(max_val)

    # 1. White Balance: Temperature & Tint (channel gains with luminance preservation)
    if settings.temperature != 0.0 or settings.tint != 0.0:
        t = np.float32(settings.temperature / 100.0)
        ti = np.float32(settings.tint / 100.0)

        r_gain = np.float32(1.0 + 0.14 * t + 0.06 * ti)
        g_gain = np.float32(1.0 - 0.12 * ti)
        b_gain = np.float32(1.0 - 0.14 * t + 0.05 * ti)

        # Normalize gains to keep neutral luminance steady
        lum_gain = np.float32(0.2126 * r_gain + 0.7152 * g_gain + 0.0722 * b_gain)
        gains = np.array([r_gain / lum_gain, g_gain / lum_gain, b_gain / lum_gain], dtype=np.float32)
        rgb = np.clip(rgb * gains, 0.0, 1.0)

    # 2. Brightness (smooth exposure-like lift/drop)
    if settings.brightness != 0.0:
        b_amt = np.float32(settings.brightness / 100.0)
        # Mild gamma + offset blend avoids harsh highlight clipping
        gamma = np.float32(np.power(2.0, -b_amt * 0.65))
        rgb = np.clip(np.power(np.clip(rgb, 0.0, 1.0), gamma) + b_amt * np.float32(0.06), 0.0, 1.0)

    # 3. Contrast (pivot around 0.5)
    if settings.contrast != 0.0:
        c_amt = np.float32(settings.contrast / 100.0)
        factor = np.float32(1.0 + c_amt * 0.75) if c_amt >= 0 else np.float32(1.0 + c_amt * 0.65)
        rgb = np.clip((rgb - np.float32(0.5)) * factor + np.float32(0.5), 0.0, 1.0)

    # 4. Highlights & Shadows (luminance-masked tonal recovery)
    if settings.highlights != 0.0 or settings.shadows != 0.0:
        lum = (
            np.float32(0.2126) * rgb[:, :, 0]
            + np.float32(0.7152) * rgb[:, :, 1]
            + np.float32(0.0722) * rgb[:, :, 2]
        )
        delta = np.zeros_like(lum)
        if settings.highlights != 0.0:
            h_mask = _smoothstep(0.45, 0.98, lum)
            delta += h_mask * np.float32((settings.highlights / 100.0) * 0.25)
        if settings.shadows != 0.0:
            s_mask = _smoothstep(0.55, 0.02, lum)
            delta += s_mask * np.float32((settings.shadows / 100.0) * 0.25)
        rgb = np.clip(rgb + delta[:, :, None], 0.0, 1.0)

    # 5. Hue rotation
    if settings.hue != 0.0:
        rgb = _rotate_hue_rgb(rgb, settings.hue)

    # 6. Saturation (chroma scaling around Rec.709 luminance)
    if settings.saturation != 0.0:
        lum = (
            np.float32(0.2126) * rgb[:, :, 0]
            + np.float32(0.7152) * rgb[:, :, 1]
            + np.float32(0.0722) * rgb[:, :, 2]
        )[:, :, None]
        sat_factor = np.float32(1.0 + settings.saturation / 100.0)
        rgb = np.clip(lum + (rgb - lum) * sat_factor, 0.0, 1.0)

    # 7. Chroma-Preserving Optical Illumination Color Grading (Midtone Color + Intensity)
    if settings.colorIntensity > 0.0:
        tr, tg, tb = _hex_to_rgb01(settings.midtoneColor)
        t_max = max(tr, tg, tb, 1e-5)
        # Optical filter spectrum normalized so peak channel stays 1.0 (no muddy darkening)
        filt = np.array([tr / t_max, tg / t_max, tb / t_max], dtype=np.float32)

        c_max = np.max(rgb, axis=2)
        c_min = np.min(rgb, axis=2)
        chroma = c_max - c_min
        # HSV-style saturation S in [0, 1]
        sat = np.where(c_max > 1e-5, chroma / np.maximum(c_max, 1e-5), 0.0)

        lum = (
            np.float32(0.2126) * rgb[:, :, 0]
            + np.float32(0.7152) * rgb[:, :, 1]
            + np.float32(0.0722) * rgb[:, :, 2]
        )

        # Neutrality weight: ~1.0 on whitish/grayish background, ~0.0 on saturated blue/orange outlines
        w_neutral = np.power(np.clip(1.0 - sat * np.float32(2.2), 0.0, 1.0), np.float32(1.5))

        # Protect very dark edges so structural outlines remain crisp
        w_tone = _smoothstep(0.04, 0.32, lum)

        intensity = np.float32(settings.colorIntensity / 100.0)
        alpha_map = intensity * (np.float32(0.18) + np.float32(0.82) * w_neutral) * w_tone
        alpha_3 = alpha_map[:, :, None]

        # Multiplicative illumination shift: C_out = C_in * ((1 - a) + a * F)
        rgb = rgb * ((np.float32(1.0) - alpha_3) + alpha_3 * filt[None, None, :])

        # Subtle brightfield highlight lift when target color is very light pastel
        # so pure white backgrounds match the target hue smoothly without looking gray
        target_lum = np.float32(0.2126 * tr + 0.7152 * tg + 0.0722 * tb)
        if target_lum > 0.72:
            pastel_vec = np.array([tr, tg, tb], dtype=np.float32)
            # Only apply tiny midtone-highlight harmonic blend on neutral areas
            harm_alpha = (intensity * np.float32(0.18) * w_neutral * _smoothstep(0.55, 0.98, lum))[:, :, None]
            rgb = rgb * (np.float32(1.0) - harm_alpha) + pastel_vec[None, None, :] * harm_alpha

        rgb = np.clip(rgb, 0.0, 1.0)

    # Convert back to original bit depth cleanly with rounding
    if orig_dtype == np.uint16:
        out_rgb = np.rint(rgb * np.float32(65535.0)).astype(np.uint16)
    elif orig_dtype == np.uint8:
        out_rgb = np.rint(rgb * np.float32(255.0)).astype(np.uint8)
    else:
        out_rgb = np.rint(rgb * np.float32(max_val)).astype(orig_dtype)

    if alpha is not None:
        return np.concatenate([out_rgb, alpha[:, :, None]], axis=-1)
    return out_rgb
