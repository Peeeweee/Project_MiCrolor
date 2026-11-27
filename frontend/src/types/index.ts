export interface ColorSettings {
  presetId: string;
  temperature: number;
  tint: number;
  hue: number;
  saturation: number;
  brightness: number;
  contrast: number;
  highlights: number;
  shadows: number;
  midtoneColor: string;
  colorIntensity: number;
}

export interface PresetItem {
  id: string;
  name: string;
  description: string;
  swatch: string;
  isCustom: boolean;
  settings: ColorSettings;
}

export type ImageStatus = 'uploaded' | 'queued' | 'processing' | 'processed' | 'error';

export interface ImageRecord {
  id: string;
  filename: string;
  format: string;
  width: number;
  height: number;
  sizeBytes: number;
  bitDepth: number;
  channels: number;
  hasAlpha: boolean;
  colorMode: string;
  status: ImageStatus;
  errorMessage?: string | null;
  settingsHash?: string | null;
  appliedSettings?: ColorSettings | null;
  processedWidth?: number | null;
  processedHeight?: number | null;
  processedAt?: string | null;
  uploadedAt: string;
}

export interface BatchJobStatus {
  jobId: string;
  status: 'running' | 'completed' | 'cancelled' | 'failed';
  total: number;
  completed: number;
  failed: number;
  skipped: number;
  currentFilename?: string | null;
  startedAt: string;
  finishedAt?: string | null;
  presetName: string;
  settings: ColorSettings;
  errors: Record<string, string>;
}

export type ExportFormat = 'PNG' | 'JPEG' | 'TIFF' | 'PDF';
export type ExportDelivery = 'zip' | 'folder' | 'single';

export interface ExportRequest {
  imageIds: string[];
  format: ExportFormat;
  delivery: ExportDelivery;
  filenamePrefix: string;
  jpegQuality: number;
  tiffBitDepth: 'preserve' | '8' | '16';
  tiffCompression: 'lzw' | 'deflate' | 'none';
  pdfOrientation: 'auto' | 'portrait' | 'landscape' | 'fit-image';
  pdfPageSize: 'A4' | 'Letter' | 'Original';
  outputFolder?: string | null;
  settings?: ColorSettings;
}

export interface ExportSummary {
  exportId?: string | null;
  format: string;
  delivery: string;
  exportedCount: number;
  totalBytes: number;
  outputFolder?: string | null;
  files: string[];
  notes: string[];
  downloadUrl?: string | null;
}

export type NavSection = 'upload' | 'library' | 'preview' | 'presets' | 'history' | 'export';

export const DEFAULT_SOFT_PALE_PINK: ColorSettings = {
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
};

export const NEUTRAL_SETTINGS: ColorSettings = {
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
};
