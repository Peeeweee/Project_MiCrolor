/**
 * Real-Time Client-Side Preview Color Engine.
 *
 * Implements the EXACT mathematical formula of `backend/app/color_engine.py`
 * on downscaled preview ImageData so slider interactions respond at 60fps
 * with zero lag while full-resolution exports always execute on the local
 * 16-bit-capable Python NumPy engine.
 */

import type { ColorSettings } from '../types';

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function hexToRgb01(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return [1, 1, 1];
  return [
    parseInt(clean.slice(0, 2), 16) / 255,
    parseInt(clean.slice(2, 4), 16) / 255,
    parseInt(clean.slice(4, 6), 16) / 255,
  ];
}

export function isNeutralSettings(s: ColorSettings): boolean {
  return (
    s.temperature === 0 &&
    s.tint === 0 &&
    s.hue === 0 &&
    s.saturation === 0 &&
    s.brightness === 0 &&
    s.contrast === 0 &&
    s.highlights === 0 &&
    s.shadows === 0 &&
    s.colorIntensity === 0
  );
}

export function applyColorSettingsToImageData(
  source: ImageData,
  settings: ColorSettings
): ImageData {
  const out = new ImageData(new Uint8ClampedArray(source.data), source.width, source.height);
  if (isNeutralSettings(settings)) {
    return out;
  }

  const data = out.data;
  const len = data.length;

  // Precompute White Balance gains
  const hasWB = settings.temperature !== 0 || settings.tint !== 0;
  let rGain = 1;
  let gGain = 1;
  let bGain = 1;
  if (hasWB) {
    const t = settings.temperature / 100;
    const ti = settings.tint / 100;
    const rg = 1 + 0.14 * t + 0.06 * ti;
    const gg = 1 - 0.12 * ti;
    const bg = 1 - 0.14 * t + 0.05 * ti;
    const lumGain = 0.2126 * rg + 0.7152 * gg + 0.0722 * bg;
    rGain = rg / lumGain;
    gGain = gg / lumGain;
    bGain = bg / lumGain;
  }

  // Precompute Brightness & Contrast
  const hasBright = settings.brightness !== 0;
  const bAmt = settings.brightness / 100;
  const gamma = hasBright ? Math.pow(2, -bAmt * 0.65) : 1;
  const bOffset = bAmt * 0.06;

  const hasContrast = settings.contrast !== 0;
  const cAmt = settings.contrast / 100;
  const cFactor = cAmt >= 0 ? 1 + cAmt * 0.75 : 1 + cAmt * 0.65;

  const hasHL = settings.highlights !== 0;
  const hlScale = (settings.highlights / 100) * 0.25;
  const hasSH = settings.shadows !== 0;
  const shScale = (settings.shadows / 100) * 0.25;

  // Precompute Hue rotation matrix
  const hasHue = settings.hue !== 0;
  let m00 = 1, m01 = 0, m02 = 0;
  let m10 = 0, m11 = 1, m12 = 0;
  let m20 = 0, m21 = 0, m22 = 1;
  if (hasHue) {
    const rad = (settings.hue * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);
    const oneThird = 1 / 3;
    const sqrtThird = Math.sqrt(oneThird);

    m00 = cosA + (1 - cosA) * oneThird;
    m01 = oneThird * (1 - cosA) - sqrtThird * sinA;
    m02 = oneThird * (1 - cosA) + sqrtThird * sinA;

    m10 = oneThird * (1 - cosA) + sqrtThird * sinA;
    m11 = cosA + oneThird * (1 - cosA);
    m12 = oneThird * (1 - cosA) - sqrtThird * sinA;

    m20 = oneThird * (1 - cosA) - sqrtThird * sinA;
    m21 = oneThird * (1 - cosA) + sqrtThird * sinA;
    m22 = cosA + oneThird * (1 - cosA);
  }

  const hasSat = settings.saturation !== 0;
  const satFactor = 1 + settings.saturation / 100;

  // Precompute Optical Illumination Tint
  const hasTintColor = settings.colorIntensity > 0;
  const [tr, tg, tb] = hexToRgb01(settings.midtoneColor);
  const tMax = Math.max(tr, tg, tb, 1e-5);
  const fr = tr / tMax;
  const fg = tg / tMax;
  const fb = tb / tMax;
  const intensity = settings.colorIntensity / 100;
  const targetLum = 0.2126 * tr + 0.7152 * tg + 0.0722 * tb;
  const usePastelHarm = targetLum > 0.72;

  for (let i = 0; i < len; i += 4) {
    let r = data[i] / 255;
    let g = data[i + 1] / 255;
    let b = data[i + 2] / 255;

    if (hasWB) {
      r = clamp01(r * rGain);
      g = clamp01(g * gGain);
      b = clamp01(b * bGain);
    }

    if (hasBright) {
      r = clamp01(Math.pow(r, gamma) + bOffset);
      g = clamp01(Math.pow(g, gamma) + bOffset);
      b = clamp01(Math.pow(b, gamma) + bOffset);
    }

    if (hasContrast) {
      r = clamp01((r - 0.5) * cFactor + 0.5);
      g = clamp01((g - 0.5) * cFactor + 0.5);
      b = clamp01((b - 0.5) * cFactor + 0.5);
    }

    if (hasHL || hasSH) {
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      let delta = 0;
      if (hasHL) delta += smoothstep(0.45, 0.98, lum) * hlScale;
      if (hasSH) delta += smoothstep(0.55, 0.02, lum) * shScale;
      r = clamp01(r + delta);
      g = clamp01(g + delta);
      b = clamp01(b + delta);
    }

    if (hasHue) {
      const nr = clamp01(r * m00 + g * m01 + b * m02);
      const ng = clamp01(r * m10 + g * m11 + b * m12);
      const nb = clamp01(r * m20 + g * m21 + b * m22);
      r = nr;
      g = ng;
      b = nb;
    }

    if (hasSat) {
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = clamp01(lum + (r - lum) * satFactor);
      g = clamp01(lum + (g - lum) * satFactor);
      b = clamp01(lum + (b - lum) * satFactor);
    }

    if (hasTintColor) {
      const cMax = r > g ? (r > b ? r : b) : g > b ? g : b;
      const cMin = r < g ? (r < b ? r : b) : g < b ? g : b;
      const sat = cMax > 1e-5 ? (cMax - cMin) / cMax : 0;
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

      const wNeutral = Math.pow(clamp01(1 - sat * 2.2), 1.5);
      const wTone = smoothstep(0.04, 0.32, lum);
      const a = intensity * (0.18 + 0.82 * wNeutral) * wTone;
      const invA = 1 - a;

      r = r * (invA + a * fr);
      g = g * (invA + a * fg);
      b = b * (invA + a * fb);

      if (usePastelHarm) {
        const ha = intensity * 0.18 * wNeutral * smoothstep(0.55, 0.98, lum);
        const invHa = 1 - ha;
        r = r * invHa + tr * ha;
        g = g * invHa + tg * ha;
        b = b * invHa + tb * ha;
      }

      r = clamp01(r);
      g = clamp01(g);
      b = clamp01(b);
    }

    data[i] = Math.round(r * 255);
    data[i + 1] = Math.round(g * 255);
    data[i + 2] = Math.round(b * 255);
    // Preserve exact alpha channel data[i + 3]
  }

  return out;
}
