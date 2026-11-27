import type {
  BatchJobStatus,
  ColorSettings,
  ExportRequest,
  ExportSummary,
  ImageRecord,
  PresetItem,
} from '../types';

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
  health: () =>
    apiFetch<{ status: string; localOnly: boolean; imageCount: number; defaultExportDir: string }>(
      '/api/health'
    ),

  listPresets: () => apiFetch<PresetItem[]>('/api/presets'),

  createPreset: (name: string, description: string, settings: ColorSettings) =>
    apiFetch<PresetItem>('/api/presets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, settings }),
    }),

  deletePreset: (presetId: string) =>
    apiFetch<{ deleted: boolean }>(`/api/presets/${encodeURIComponent(presetId)}`, {
      method: 'DELETE',
    }),

  listImages: () => apiFetch<ImageRecord[]>('/api/images'),

  uploadImages: async (
    files: File[],
    onProgress?: (uploadedCount: number, totalCount: number) => void
  ): Promise<{ uploaded: ImageRecord[]; errors: Array<{ filename: string; error: string }> }> => {
    // Chunk uploads (8 files per request) so 50-200 large images never freeze or hit body limits
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

  deleteImage: (imageId: string) =>
    apiFetch<{ deleted: boolean }>(`/api/images/${encodeURIComponent(imageId)}`, {
      method: 'DELETE',
    }),

  clearImages: () =>
    apiFetch<{ cleared: number }>('/api/images', {
      method: 'DELETE',
    }),

  thumbUrl: (imageId: string, processed = false, version?: string | null) =>
    `/api/images/${encodeURIComponent(imageId)}/thumb?processed=${processed ? 'true' : 'false'}${
      version ? `&v=${encodeURIComponent(version)}` : ''
    }`,

  previewUrl: (imageId: string, processed = false, version?: string | null) =>
    `/api/images/${encodeURIComponent(imageId)}/preview?processed=${processed ? 'true' : 'false'}${
      version ? `&v=${encodeURIComponent(version)}` : ''
    }`,

  startBatch: (
    imageIds: string[],
    settings: ColorSettings,
    presetName: string,
    forceReprocess = false
  ) =>
    apiFetch<BatchJobStatus>('/api/batch/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageIds, settings, presetName, forceReprocess }),
    }),

  listJobs: () => apiFetch<BatchJobStatus[]>('/api/batch/jobs'),

  getJob: (jobId: string) => apiFetch<BatchJobStatus>(`/api/batch/jobs/${encodeURIComponent(jobId)}`),

  cancelJob: (jobId: string) =>
    apiFetch<{ cancelled: boolean }>(`/api/batch/jobs/${encodeURIComponent(jobId)}/cancel`, {
      method: 'POST',
    }),

  exportImages: (req: ExportRequest) =>
    apiFetch<ExportSummary>('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    }),
};
