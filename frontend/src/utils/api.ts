import type {
  BatchJobStatus,
  ColorSettings,
  ExportRequest,
  ExportSummary,
  ImageRecord,
  PresetItem,
} from '../types';
import { browserEngine } from './browserEngine';

let modePromise: Promise<'backend' | 'browser'> | null = null;
let detectedMode: 'backend' | 'browser' = 'browser';

async function detectMode(): Promise<'backend' | 'browser'> {
  if (modePromise) return modePromise;
  modePromise = (async () => {
    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 900);
      const res = await fetch('/api/health', { signal: controller.signal });
      window.clearTimeout(timeout);
      if (res.ok) {
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          detectedMode = 'backend';
          return 'backend';
        }
      }
    } catch {
      // Static hosting (e.g. GitHub Pages) — fall back seamlessly to 100% in-browser engine
    }
    detectedMode = 'browser';
    return 'browser';
  })();
  return modePromise;
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.detail) msg = String(data.detail);
    } catch {
      // ignore parse failure
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: async () => {
    const mode = await detectMode();
    if (mode === 'browser') return browserEngine.health();
    return apiFetch<{ status: string; localOnly: boolean; imageCount: number; defaultExportDir: string }>(
      '/api/health'
    );
  },

  listPresets: async () => {
    const mode = await detectMode();
    if (mode === 'browser') return browserEngine.listPresets();
    return apiFetch<PresetItem[]>('/api/presets');
  },

  createPreset: async (name: string, description: string, settings: ColorSettings) => {
    const mode = await detectMode();
    if (mode === 'browser') return browserEngine.createPreset(name, description, settings);
    return apiFetch<PresetItem>('/api/presets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, settings }),
    });
  },

  deletePreset: async (presetId: string) => {
    const mode = await detectMode();
    if (mode === 'browser') return browserEngine.deletePreset(presetId);
    return apiFetch<{ deleted: boolean }>(`/api/presets/${encodeURIComponent(presetId)}`, {
      method: 'DELETE',
    });
  },

  listImages: async () => {
    const mode = await detectMode();
    if (mode === 'browser') return browserEngine.listImages();
    return apiFetch<ImageRecord[]>('/api/images');
  },

  uploadImages: async (
    files: File[],
    onProgress?: (uploadedCount: number, totalCount: number) => void
  ): Promise<{ uploaded: ImageRecord[]; errors: Array<{ filename: string; error: string }> }> => {
    const mode = await detectMode();
    if (mode === 'browser') return browserEngine.uploadImages(files, onProgress);

    const CHUNK_SIZE = 8;
    const allUploaded: ImageRecord[] = [];
    const allErrors: Array<{ filename: string; error: string }> = [];

    for (let i = 0; i < files.length; i += CHUNK_SIZE) {
      const slice = files.slice(i, i + CHUNK_SIZE);
      const formData = new FormData();
      for (const file of slice) {
        formData.append('files', file, file.name);
      }
      const res = await apiFetch<{
        uploaded: ImageRecord[];
        errors: Array<{ filename: string; error: string }>;
      }>('/api/images/upload', {
        method: 'POST',
        body: formData,
      });
      allUploaded.push(...res.uploaded);
      allErrors.push(...res.errors);
      onProgress?.(Math.min(i + slice.length, files.length), files.length);
    }

    return { uploaded: allUploaded, errors: allErrors };
  },

  deleteImage: async (imageId: string) => {
    const mode = await detectMode();
    if (mode === 'browser') return browserEngine.deleteImage(imageId);
    return apiFetch<{ deleted: boolean }>(`/api/images/${encodeURIComponent(imageId)}`, {
      method: 'DELETE',
    });
  },

  clearImages: async () => {
    const mode = await detectMode();
    if (mode === 'browser') return browserEngine.clearImages();
    return apiFetch<{ cleared: number }>('/api/images', {
      method: 'DELETE',
    });
  },

  thumbUrl: (imageId: string, processed = false, version?: string | null) => {
    if (detectedMode === 'browser') return browserEngine.thumbUrl(imageId, processed);
    return `/api/images/${encodeURIComponent(imageId)}/thumb?processed=${processed ? 'true' : 'false'}${
      version ? `&v=${encodeURIComponent(version)}` : ''
    }`;
  },

  previewUrl: (imageId: string, processed = false, version?: string | null) => {
    if (detectedMode === 'browser') return browserEngine.previewUrl(imageId, processed);
    return `/api/images/${encodeURIComponent(imageId)}/preview?processed=${processed ? 'true' : 'false'}${
      version ? `&v=${encodeURIComponent(version)}` : ''
    }`;
  },

  startBatch: async (
    imageIds: string[],
    settings: ColorSettings,
    presetName: string,
    forceReprocess = false
  ) => {
    const mode = await detectMode();
    if (mode === 'browser') return browserEngine.startBatch(imageIds, settings, presetName, forceReprocess);
    return apiFetch<BatchJobStatus>('/api/batch/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageIds, settings, presetName, forceReprocess }),
    });
  },

  listJobs: async () => {
    const mode = await detectMode();
    if (mode === 'browser') return browserEngine.listJobs();
    return apiFetch<BatchJobStatus[]>('/api/batch/jobs');
  },

  getJob: async (jobId: string) => {
    const mode = await detectMode();
    if (mode === 'browser') return browserEngine.getJob(jobId);
    return apiFetch<BatchJobStatus>(`/api/batch/jobs/${encodeURIComponent(jobId)}`);
  },

  cancelJob: async (jobId: string) => {
    const mode = await detectMode();
    if (mode === 'browser') return browserEngine.cancelJob(jobId);
    return apiFetch<{ cancelled: boolean }>(`/api/batch/jobs/${encodeURIComponent(jobId)}/cancel`, {
      method: 'POST',
    });
  },

  exportImages: async (req: ExportRequest) => {
    const mode = await detectMode();
    if (mode === 'browser') return browserEngine.exportImages(req);
    return apiFetch<ExportSummary>('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
  },
};
