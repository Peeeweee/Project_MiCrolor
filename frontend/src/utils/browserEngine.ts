/**
 * 100% In-Browser Local Processing Engine for MiCrolor (GitHub Pages / Static Mode).
 *
 * Keeps all images strictly on the user's device with zero server uploads.
 * Memory-aware: stores lightweight 320px/1400px Blob URLs for browsing, and
 * decodes/encodes full-resolution originals one at a time while yielding to
 * the browser event loop so the UI stays responsive on desktop and mobile.
 */

import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import type {
  BatchJobStatus,
  ColorSettings,
  ExportRequest,
  ExportSummary,
  ImageRecord,
  PresetItem,
} from '../types';
import { applyColorSettingsToImageData, isNeutralSettings } from './colorEngine';

const CUSTOM_PRESETS_KEY = 'microlor_custom_presets_v1';

const BUILTIN_PRESETS: PresetItem[] = [
  {
    id: 'reference-rose-pink',
    name: 'Reference Rose Pink',
    description:
      'Calibrated directly to your reference slide: dusty rose-pink field with vivid preserved blue & orange cell outlines.',
    swatch: '#F0B2C8',
    isCustom: false,
    settings: {
      presetId: 'reference-rose-pink',
      temperature: 16,
      tint: 60,
      hue: 0,
      saturation: 28,
      brightness: 28,
      contrast: 42,
      highlights: 36,
      shadows: -22,
      midtoneColor: '#F0B2C8',
      colorIntensity: 82,
    },
  },
  {
    id: 'soft-pale-pink',
    name: 'Soft Pale Pink',
    description:
      'Default subtle pink microscope illumination preserving blue & orange specimen outlines.',
    swatch: '#F4CEDB',
    isCustom: false,
    settings: {
      presetId: 'soft-pale-pink',
      temperature: 4,
      tint: 14,
      hue: 0,
      saturation: 0,
      brightness: 2,
      contrast: 2,
      highlights: 0,
      shadows: 0,
      midtoneColor: '#F4CEDB',
      colorIntensity: 72,
    },
  },
  {
    id: 'light-rose',
    name: 'Light Rose',
    description:
      'Gentle rose tint with slightly deeper pastel warmth for high-contrast brightfield fields.',
    swatch: '#F0BCCD',
    isCustom: false,
    settings: {
      presetId: 'light-rose',
      temperature: 8,
      tint: 20,
      hue: 0,
      saturation: 4,
      brightness: 0,
      contrast: 4,
      highlights: -2,
      shadows: 2,
      midtoneColor: '#F0BCCD',
      colorIntensity: 78,
    },
  },
  {
    id: 'warm-pink',
    name: 'Warm Pink',
    description: 'Soft blush-peach illumination for warm histological presentation.',
    swatch: '#F5C9CE',
    isCustom: false,
    settings: {
      presetId: 'warm-pink',
      temperature: 18,
      tint: 12,
      hue: 0,
      saturation: 2,
      brightness: 2,
      contrast: 3,
      highlights: 0,
      shadows: 0,
      midtoneColor: '#F5C9CE',
      colorIntensity: 74,
    },
  },
  {
    id: 'lavender',
    name: 'Lavender',
    description: 'Cool lilac-lavender field background with clean chromatic separation.',
    swatch: '#DFD4F2',
    isCustom: false,
    settings: {
      presetId: 'lavender',
      temperature: -14,
      tint: 16,
      hue: 0,
      saturation: 0,
      brightness: 2,
      contrast: 2,
      highlights: 0,
      shadows: 0,
      midtoneColor: '#DFD4F2',
      colorIntensity: 70,
    },
  },
  {
    id: 'soft-blue',
    name: 'Soft Blue',
    description: 'Subtle pale cyan-blue brightfield cast for cool optical balance.',
    swatch: '#D4E7F5',
    isCustom: false,
    settings: {
      presetId: 'soft-blue',
      temperature: -18,
      tint: -4,
      hue: 0,
      saturation: 0,
      brightness: 2,
      contrast: 3,
      highlights: 0,
      shadows: 0,
      midtoneColor: '#D4E7F5',
      colorIntensity: 68,
    },
  },
  {
    id: 'warm-beige',
    name: 'Warm Beige',
    description: 'Natural ivory-parchment tungsten microscope lamp tone.',
    swatch: '#EFE3D0',
    isCustom: false,
    settings: {
      presetId: 'warm-beige',
      temperature: 16,
      tint: -2,
      hue: 0,
      saturation: -2,
      brightness: 2,
      contrast: 2,
      highlights: 0,
      shadows: 0,
      midtoneColor: '#EFE3D0',
      colorIntensity: 68,
    },
  },
  {
    id: 'neutral',
    name: 'Neutral',
    description: 'Zero color shift — preserves original pixel values untouched.',
    swatch: '#E6E7EB',
    isCustom: false,
    settings: {
      presetId: 'neutral',
      temperature: 0,
      tint: 0,
      hue: 0,
      saturation: 0,
      brightness: 0,
      contrast: 0,
      highlights: 0,
      shadows: 0,
      midtoneColor: '#FFFFFF',
      colorIntensity: 0,
    },
  },
  {
    id: 'custom-color',
    name: 'Custom Color',
    description: 'Customizable color tint — pick any target hue with the color picker.',
    swatch: '#E8D2E8',
    isCustom: false,
    settings: {
      presetId: 'custom-color',
      temperature: 0,
      tint: 6,
      hue: 0,
      saturation: 0,
      brightness: 0,
      contrast: 0,
      highlights: 0,
      shadows: 0,
      midtoneColor: '#E8D2E8',
      colorIntensity: 65,
    },
  },
];

interface StoredSlide {
  record: ImageRecord;
  file: File;
  thumbOrigUrl: string;
  previewOrigUrl: string;
  thumbProcUrl?: string;
  previewProcUrl?: string;
  processedBlob?: Blob;
}

const slides = new Map<string, StoredSlide>();
const jobs = new Map<string, BatchJobStatus>();
const jobOrder: string[] = [];
const cancelFlags = new Map<string, boolean>();
const exportUrls: string[] = [];

function uid(len = 10): string {
  return Math.random().toString(36).slice(2, 2 + len);
}

function hashSettings(s: ColorSettings): string {
  return JSON.stringify([
    s.temperature,
    s.tint,
    s.hue,
    s.saturation,
    s.brightness,
    s.contrast,
    s.highlights,
    s.shadows,
    s.midtoneColor.toUpperCase(),
    s.colorIntensity,
  ]);
}

function safeStem(filename: string): string {
  const dot = filename.lastIndexOf('.');
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  return stem.replace(/[^a-zA-Z0-9._ -]/g, '_').trim() || 'slide';
}

function detectFormat(filename: string, mime: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.png') || mime === 'image/png') return 'PNG';
  if (lower.endsWith('.webp') || mime === 'image/webp') return 'WEBP';
  if (lower.endsWith('.tif') || lower.endsWith('.tiff') || mime === 'image/tiff') return 'TIFF';
  return 'JPEG';
}

function loadBitmap(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Browser could not decode this image format (TIFF requires local Python mode).'));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Failed to encode image'))),
      mime,
      quality
    );
  });
}

async function makeScaledUrl(img: HTMLImageElement, maxDim: number, mime: string): Promise<string> {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await canvasToBlob(canvas, mime, mime === 'image/jpeg' ? 0.92 : undefined);
  return URL.createObjectURL(blob);
}

/** Encode an 8-bit RGB baseline lossless uncompressed TIFF directly in browser memory. */
function encodeUncompressedTiff(imageData: ImageData): Blob {
  const { width, height, data } = imageData;
  const pixelBytes = width * height * 3;
  const headerSize = 8;
  const numEntries = 11;
  const ifdSize = 2 + numEntries * 12 + 4;
  const bpsOffset = headerSize + ifdSize; // 6 bytes for [8, 8, 8]
  const pixelOffset = bpsOffset + 6;
  const totalSize = pixelOffset + pixelBytes;

  const buf = new ArrayBuffer(totalSize);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  // Little-endian TIFF header ("II", 42, IFD offset = 8)
  view.setUint8(0, 0x49);
  view.setUint8(1, 0x49);
  view.setUint16(2, 42, true);
  view.setUint32(4, headerSize, true);

  let pos = headerSize;
  view.setUint16(pos, numEntries, true);
  pos += 2;

  const writeTag = (tag: number, type: number, count: number, value: number) => {
    view.setUint16(pos, tag, true);
    view.setUint16(pos + 2, type, true);
    view.setUint32(pos + 4, count, true);
    if (type === 3 && count === 1) {
      view.setUint16(pos + 8, value, true);
      view.setUint16(pos + 10, 0, true);
    } else {
      view.setUint32(pos + 8, value, true);
    }
    pos += 12;
  };

  writeTag(256, 4, 1, width); // ImageWidth
  writeTag(257, 4, 1, height); // ImageLength
  writeTag(258, 3, 3, bpsOffset); // BitsPerSample (8, 8, 8)
  writeTag(259, 3, 1, 1); // Compression = None (lossless)
  writeTag(262, 3, 1, 2); // PhotometricInterpretation = RGB
  writeTag(273, 4, 1, pixelOffset); // StripOffsets
  writeTag(277, 3, 1, 3); // SamplesPerPixel = 3
  writeTag(278, 4, 1, height); // RowsPerStrip
  writeTag(279, 4, 1, pixelBytes); // StripByteCounts
  writeTag(284, 3, 1, 1); // PlanarConfiguration = Chunky
  writeTag(296, 3, 1, 2); // ResolutionUnit = Inch

  view.setUint32(pos, 0, true); // Next IFD = 0
  view.setUint16(bpsOffset, 8, true);
  view.setUint16(bpsOffset + 2, 8, true);
  view.setUint16(bpsOffset + 4, 8, true);

  let dst = pixelOffset;
  for (let i = 0; i < data.length; i += 4) {
    bytes[dst++] = data[i];
    bytes[dst++] = data[i + 1];
    bytes[dst++] = data[i + 2];
  }

  return new Blob([buf], { type: 'image/tiff' });
}

async function processSlideFullRes(
  slide: StoredSlide,
  settings: ColorSettings
): Promise<{ canvas: HTMLCanvasElement; imageData: ImageData }> {
  const img = await loadBitmap(slide.file);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D unavailable');
  ctx.drawImage(img, 0, 0);
  const srcData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const processed = isNeutralSettings(settings)
    ? srcData
    : applyColorSettingsToImageData(srcData, settings);
  ctx.putImageData(processed, 0, 0);
  return { canvas, imageData: processed };
}

function loadCustomPresets(): PresetItem[] {
  try {
    const raw = localStorage.getItem(CUSTOM_PRESETS_KEY);
    return raw ? (JSON.parse(raw) as PresetItem[]) : [];
  } catch {
    return [];
  }
}

function saveCustomPresets(items: PresetItem[]) {
  try {
    localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(items));
  } catch {
    // ignore quota issues
  }
}

export const browserEngine = {
  health: async () => ({
    status: 'ok',
    localOnly: true,
    imageCount: slides.size,
    defaultExportDir: 'Browser Downloads (use local npm run dev for direct folder paths)',
  }),

  listPresets: async (): Promise<PresetItem[]> => [...BUILTIN_PRESETS, ...loadCustomPresets()],

  createPreset: async (
    name: string,
    description: string,
    settings: ColorSettings
  ): Promise<PresetItem> => {
    const id = `custom-${uid(8)}`;
    const item: PresetItem = {
      id,
      name: name.trim(),
      description: description.trim() || 'Custom microscope color preset',
      swatch: settings.midtoneColor,
      isCustom: true,
      settings: { ...settings, presetId: id },
    };
    const customs = loadCustomPresets();
    customs.push(item);
    saveCustomPresets(customs);
    return item;
  },

  deletePreset: async (presetId: string) => {
    const customs = loadCustomPresets().filter((p) => p.id !== presetId);
    saveCustomPresets(customs);
    return { deleted: true };
  },

  listImages: async (): Promise<ImageRecord[]> => Array.from(slides.values()).map((s) => ({ ...s.record })),

  uploadImages: async (
    files: File[],
    onProgress?: (done: number, total: number) => void
  ): Promise<{ uploaded: ImageRecord[]; errors: Array<{ filename: string; error: string }> }> => {
    const uploaded: ImageRecord[] = [];
    const errors: Array<{ filename: string; error: string }> = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const img = await loadBitmap(file);
        const id = uid(12);
        const fmt = detectFormat(file.name, file.type);
        const thumbOrigUrl = await makeScaledUrl(img, 320, 'image/jpeg');
        const previewOrigUrl = await makeScaledUrl(img, 1400, 'image/png');
        const rec: ImageRecord = {
          id,
          filename: file.name,
          format: fmt,
          width: img.naturalWidth,
          height: img.naturalHeight,
          sizeBytes: file.size,
          bitDepth: 8,
          channels: fmt === 'PNG' ? 4 : 3,
          hasAlpha: fmt === 'PNG',
          colorMode: fmt === 'PNG' ? 'RGBA' : 'RGB',
          status: 'uploaded',
          uploadedAt: new Date().toISOString(),
        };
        slides.set(id, { record: rec, file, thumbOrigUrl, previewOrigUrl });
        uploaded.push(rec);
      } catch (err) {
        errors.push({
          filename: file.name,
          error: err instanceof Error ? err.message : 'Failed to decode image',
        });
      }
      onProgress?.(i + 1, files.length);
      await new Promise((r) => setTimeout(r, 0));
    }

    return { uploaded, errors };
  },

  deleteImage: async (imageId: string) => {
    const s = slides.get(imageId);
    if (s) {
      URL.revokeObjectURL(s.thumbOrigUrl);
      URL.revokeObjectURL(s.previewOrigUrl);
      if (s.thumbProcUrl) URL.revokeObjectURL(s.thumbProcUrl);
      if (s.previewProcUrl) URL.revokeObjectURL(s.previewProcUrl);
      slides.delete(imageId);
    }
    return { deleted: true };
  },

  clearImages: async () => {
    const count = slides.size;
    for (const id of Array.from(slides.keys())) {
      await browserEngine.deleteImage(id);
    }
    return { cleared: count };
  },

  thumbUrl: (imageId: string, processed = false): string => {
    const s = slides.get(imageId);
    if (!s) return '';
    return processed && s.thumbProcUrl ? s.thumbProcUrl : s.thumbOrigUrl;
  },

  previewUrl: (imageId: string, processed = false): string => {
    const s = slides.get(imageId);
    if (!s) return '';
    return processed && s.previewProcUrl ? s.previewProcUrl : s.previewOrigUrl;
  },

  startBatch: async (
    imageIds: string[],
    settings: ColorSettings,
    presetName: string,
    forceReprocess = false
  ): Promise<BatchJobStatus> => {
    const validIds = imageIds.filter((id) => slides.has(id));
    if (validIds.length === 0) throw new Error('No valid slides selected.');

    const settingsHash = hashSettings(settings);
    const jobId = uid(10);
    const job: BatchJobStatus = {
      jobId,
      status: 'running',
      total: validIds.length,
      completed: 0,
      failed: 0,
      skipped: 0,
      currentFilename: slides.get(validIds[0])?.record.filename || null,
      startedAt: new Date().toISOString(),
      presetName,
      settings: { ...settings },
      errors: {},
    };
    jobs.set(jobId, job);
    jobOrder.unshift(jobId);
    cancelFlags.set(jobId, false);

    for (const id of validIds) {
      const s = slides.get(id);
      if (s && (forceReprocess || s.record.settingsHash !== settingsHash || s.record.status !== 'processed')) {
        s.record.status = 'queued';
        s.record.errorMessage = null;
      }
    }

    // Process asynchronously one slide at a time so UI remains smooth
    (async () => {
      for (const id of validIds) {
        if (cancelFlags.get(jobId)) {
          job.status = 'cancelled';
          break;
        }
        const s = slides.get(id);
        if (!s) continue;
        job.currentFilename = s.record.filename;

        if (!forceReprocess && s.record.status === 'processed' && s.record.settingsHash === settingsHash && s.processedBlob) {
          job.completed += 1;
          job.skipped += 1;
          continue;
        }

        s.record.status = 'processing';
        await new Promise((r) => setTimeout(r, 0));

        try {
          const { canvas } = await processSlideFullRes(s, settings);
          const pngBlob = await canvasToBlob(canvas, 'image/png');
          s.processedBlob = pngBlob;

          if (s.thumbProcUrl) URL.revokeObjectURL(s.thumbProcUrl);
          if (s.previewProcUrl) URL.revokeObjectURL(s.previewProcUrl);
          const procImg = await loadBitmap(pngBlob);
          s.thumbProcUrl = await makeScaledUrl(procImg, 320, 'image/jpeg');
          s.previewProcUrl = await makeScaledUrl(procImg, 1400, 'image/png');

          s.record.status = 'processed';
          s.record.settingsHash = settingsHash;
          s.record.appliedSettings = { ...settings };
          s.record.processedWidth = canvas.width;
          s.record.processedHeight = canvas.height;
          s.record.processedAt = new Date().toISOString();
          job.completed += 1;
        } catch (err) {
          s.record.status = 'error';
          s.record.errorMessage = err instanceof Error ? err.message : 'Processing failed';
          job.failed += 1;
          job.errors[id] = s.record.errorMessage;
        }
      }

      if (job.status === 'running') {
        job.status = job.failed > 0 && job.completed === 0 ? 'failed' : 'completed';
      }
      job.currentFilename = null;
      job.finishedAt = new Date().toISOString();
    })();

    return { ...job };
  },

  listJobs: async (): Promise<BatchJobStatus[]> =>
    jobOrder.map((id) => jobs.get(id)!).filter(Boolean).map((j) => ({ ...j })),

  getJob: async (jobId: string): Promise<BatchJobStatus> => {
    const j = jobs.get(jobId);
    if (!j) throw new Error('Job not found');
    return { ...j };
  },

  cancelJob: async (jobId: string) => {
    cancelFlags.set(jobId, true);
    return { cancelled: true };
  },

  exportImages: async (req: ExportRequest): Promise<ExportSummary> => {
    const selected = req.imageIds.map((id) => slides.get(id)).filter(Boolean) as StoredSlide[];
    if (selected.length === 0) throw new Error('No slides selected for export.');

    const prefix = req.filenamePrefix.trim();
    const fmt = req.format;
    const notes: string[] = [];

    if (req.delivery === 'folder') {
      notes.push(
        'Browser mode downloads via your browser Downloads folder (run locally with `npm run dev` to write directly to custom filesystem paths).'
      );
    }

    if (fmt === 'JPEG') {
      notes.push(
        `JPEG export uses quality=${req.jpegQuality}. Note: JPEG is inherently a lossy format; use PNG or TIFF for lossless archival output.`
      );
    } else if (fmt === 'PNG') {
      notes.push('PNG export uses lossless compression preserving original dimensions and alpha.');
    } else if (fmt === 'TIFF') {
      notes.push(
        'In-browser TIFF export outputs lossless uncompressed 8-bit RGB TIFF. (Run locally with `npm run dev` for 16-bit LZW TIFF support.)'
      );
    }

    // Revoke previous export object URLs to keep memory clean
    while (exportUrls.length > 5) {
      const old = exportUrls.shift();
      if (old) URL.revokeObjectURL(old);
    }

    const activeSettings = req.settings;

    const renderSlide = async (s: StoredSlide) => {
      const useSettings = activeSettings || s.record.appliedSettings;
      if (useSettings) {
        const res = await processSlideFullRes(s, useSettings);
        s.record.status = 'processed';
        s.record.settingsHash = hashSettings(useSettings);
        s.record.appliedSettings = { ...useSettings };
        s.record.processedWidth = res.canvas.width;
        s.record.processedHeight = res.canvas.height;
        s.record.processedAt = new Date().toISOString();
        return res;
      }
      const img = await loadBitmap(s.file);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0);
      return { canvas, imageData: ctx.getImageData(0, 0, canvas.width, canvas.height) };
    };

    if (fmt === 'PDF') {
      let pdf: jsPDF | null = null;
      for (let i = 0; i < selected.length; i++) {
        const s = selected[i];
        const { canvas } = await renderSlide(s);
        const w = canvas.width;
        const h = canvas.height;
        const pngDataUrl = canvas.toDataURL('image/png');

        let orient: 'p' | 'l' = w > h ? 'l' : 'p';
        if (req.pdfOrientation === 'portrait') orient = 'p';
        if (req.pdfOrientation === 'landscape') orient = 'l';

        if (req.pdfPageSize === 'Original' || req.pdfOrientation === 'fit-image') {
          const pw = (w * 72) / 300;
          const ph = (h * 72) / 300;
          if (!pdf) {
            pdf = new jsPDF({ orientation: pw > ph ? 'l' : 'p', unit: 'pt', format: [pw, ph] });
          } else {
            pdf.addPage([pw, ph], pw > ph ? 'l' : 'p');
          }
          pdf.addImage(pngDataUrl, 'PNG', 0, 0, pw, ph);
        } else {
          const fmtName = req.pdfPageSize === 'Letter' ? 'letter' : 'a4';
          if (!pdf) {
            pdf = new jsPDF({ orientation: orient, unit: 'pt', format: fmtName });
          } else {
            pdf.addPage(fmtName, orient);
          }
          const pw = pdf.internal.pageSize.getWidth();
          const ph = pdf.internal.pageSize.getHeight();
          const margin = 24;
          const scale = Math.min((pw - 2 * margin) / w, (ph - 2 * margin) / h);
          const dw = w * scale;
          const dh = h * scale;
          pdf.addImage(pngDataUrl, 'PNG', (pw - dw) / 2, (ph - dh) / 2, dw, dh);
        }
        await new Promise((r) => setTimeout(r, 0));
      }

      const pdfBlob = pdf!.output('blob');
      const pdfName = `${prefix}microlor_batch.pdf`;
      const url = URL.createObjectURL(pdfBlob);
      exportUrls.push(url);
      notes.push('Slides were embedded into the PDF as lossless PNG streams at full pixel dimensions.');
      return {
        exportId: uid(8),
        format: 'PDF',
        delivery: 'single',
        exportedCount: selected.length,
        totalBytes: pdfBlob.size,
        files: [pdfName],
        notes,
        downloadUrl: url,
      };
    }

    const extMap: Record<string, string> = { PNG: '.png', JPEG: '.jpg', TIFF: '.tiff' };
    const produced: Array<{ name: string; blob: Blob }> = [];
    const usedNames = new Map<string, number>();

    for (const s of selected) {
      const { canvas, imageData } = await renderSlide(s);
      let blob: Blob;
      if (fmt === 'PNG') {
        blob = await canvasToBlob(canvas, 'image/png');
      } else if (fmt === 'JPEG') {
        blob = await canvasToBlob(canvas, 'image/jpeg', Math.max(0.01, Math.min(1, req.jpegQuality / 100)));
      } else {
        blob = encodeUncompressedTiff(imageData);
      }

      const base = `${prefix}${safeStem(s.record.filename)}`;
      const c = usedNames.get(base) || 0;
      usedNames.set(base, c + 1);
      const finalName = `${c > 0 ? `${base}_${c + 1}` : base}${extMap[fmt]}`;
      produced.push({ name: finalName, blob });
      await new Promise((r) => setTimeout(r, 0));
    }

    if (produced.length === 1) {
      const url = URL.createObjectURL(produced[0].blob);
      exportUrls.push(url);
      return {
        exportId: uid(8),
        format: fmt,
        delivery: 'single',
        exportedCount: 1,
        totalBytes: produced[0].blob.size,
        files: [produced[0].name],
        notes,
        downloadUrl: url,
      };
    }

    const zip = new JSZip();
    for (const item of produced) {
      zip.file(item.name, item.blob);
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    exportUrls.push(url);

    return {
      exportId: uid(8),
      format: fmt,
      delivery: 'zip',
      exportedCount: produced.length,
      totalBytes: zipBlob.size,
      files: produced.map((p) => p.name),
      notes,
      downloadUrl: url,
    };
  },
};
