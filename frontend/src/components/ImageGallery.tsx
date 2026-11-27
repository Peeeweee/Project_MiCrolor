import React, { useState } from 'react';
import {
  CheckSquare,
  Square,
  Trash2,
  Eye,
  RotateCw,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  X,
  Sparkles,
} from 'lucide-react';
import type { ColorSettings, ImageRecord } from '../types';
import { formatBytes } from '../utils/format';
import { UploadZone } from './UploadZone';
import { LiveThumbnail } from './LiveThumbnail';

interface ImageGalleryProps {
  images: ImageRecord[];
  settings: ColorSettings;
  selectedIds: Set<string>;
  activeImageId: string | null;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onInspectImage: (id: string) => void;
  onRemoveImage: (id: string) => void;
  onClearAll: () => void;
  onRetryImage: (id: string) => void;
  onUploadFiles: (files: File[]) => Promise<void>;
  uploading: boolean;
  uploadProgress: { done: number; total: number } | null;
  uploadErrors: Array<{ filename: string; error: string }>;
}

export const ImageGallery: React.FC<ImageGalleryProps> = ({
  images,
  settings,
  selectedIds,
  activeImageId,
  onToggleSelect,
  onSelectAll,
  onDeselectAll,
  onInspectImage,
  onRemoveImage,
  onClearAll,
  onRetryImage,
  onUploadFiles,
  uploading,
  uploadProgress,
  uploadErrors,
}) => {
  const [livePreview, setLivePreview] = useState(true);
  const totalBytes = images.reduce((acc, img) => acc + img.sizeBytes, 0);
  const processedCount = images.filter((i) => i.status === 'processed').length;
  const failedCount = images.filter((i) => i.status === 'error').length;

  const renderStatusBadge = (img: ImageRecord) => {
    switch (img.status) {
      case 'processed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#e6f6f1] text-[#256c5f] border border-[#3f9a8a]">
            <CheckCircle2 className="w-3 h-3" />
            Processed
          </span>
        );
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#fde384] text-[#1f1a1d] border border-[#1f1a1d]">
            <Loader2 className="w-3 h-3 animate-spin" />
            Processing
          </span>
        );
      case 'queued':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#e3dcf7] text-[#1f1a1d] border border-[#1f1a1d]/40">
            <Clock className="w-3 h-3" />
            Queued
          </span>
        );
      case 'error':
        return (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#fff0ef] text-[#b82d24] border border-[#e5483e]"
            title={img.errorMessage || 'Processing failed'}
          >
            <AlertCircle className="w-3 h-3" />
            Error
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#f4eae3] text-[#544c50] border border-[#cfc4bd]">
            Original
          </span>
        );
    }
  };

  if (images.length === 0) {
    return (
      <UploadZone
        onUploadFiles={onUploadFiles}
        uploading={uploading}
        uploadProgress={uploadProgress}
        uploadErrors={uploadErrors}
      />
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 sm:px-5 py-2.5 sm:py-3 border-b-2 border-[#cfc4bd] bg-[#fffcf9]/80 flex flex-wrap items-center justify-between gap-2 sm:gap-3 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onSelectAll}
            className="sketch-btn inline-flex items-center gap-1.5 px-3 py-1 text-sm font-semibold"
          >
            <CheckSquare className="w-3.5 h-3.5 text-[#1f1a1d]" />
            Select All ({images.length})
          </button>
          <button
            onClick={onDeselectAll}
            disabled={selectedIds.size === 0}
            className="sketch-btn inline-flex items-center gap-1.5 px-3 py-1 text-sm font-medium disabled:opacity-40"
          >
            <Square className="w-3.5 h-3.5" />
            Deselect All
          </button>
          <span className="text-xs text-[#544c50] ml-1 font-mono-sci">
            {selectedIds.size} selected · {processedCount} ready
            {failedCount > 0 ? ` · ${failedCount} failed` : ''} · {formatBytes(totalBytes)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLivePreview((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold border-[1.6px] transition ${
              livePreview
                ? 'bg-[#f8d2e0] text-[#1f1a1d] border-[#1f1a1d] shadow-[1.5px_2px_0_#1f1a1d]'
                : 'bg-[#fffcf9] text-[#544c50] border-[#cfc4bd] hover:border-[#1f1a1d]'
            }`}
            title="Toggle real-time preset preview across all gallery thumbnails"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {livePreview ? 'Live Preview: ON' : 'Showing Original'}
          </button>

          <button
            onClick={onClearAll}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold bg-[#fff0ef] text-[#b82d24] hover:bg-[#ffe1df] border-[1.5px] border-[#e5483e] transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear Queue
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-3 sm:space-y-4">
        <UploadZone
          compact
          onUploadFiles={onUploadFiles}
          uploading={uploading}
          uploadProgress={uploadProgress}
          uploadErrors={uploadErrors}
        />

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 sm:gap-4">
          {images.map((img) => {
            const isSelected = selectedIds.has(img.id);
            const isActive = activeImageId === img.id;

            return (
              <div
                key={img.id}
                className={`group rounded-2xl overflow-hidden bg-[#fffcf9] transition flex flex-col ${
                  isActive
                    ? 'border-2 border-[#1f1a1d] shadow-[3px_3.5px_0_#1f1a1d]'
                    : isSelected
                    ? 'border-2 border-[#1f1a1d]/80 shadow-[2px_2.5px_0_rgba(31,26,29,0.22)]'
                    : 'border-[1.7px] border-[#cfc4bd] hover:border-[#1f1a1d]'
                }`}
              >
                <div
                  className="relative aspect-[4/3] bg-[#221d20] overflow-hidden cursor-pointer border-b-[1.5px] border-[#cfc4bd]"
                  onClick={() => onInspectImage(img.id)}
                >
                  <LiveThumbnail
                    imageId={img.id}
                    version={img.uploadedAt}
                    alt={img.filename}
                    settings={settings}
                    livePreview={livePreview}
                    className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                  />

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleSelect(img.id);
                    }}
                    className={`absolute top-2 left-2 w-6 h-6 rounded-lg flex items-center justify-center border-[1.6px] transition ${
                      isSelected
                        ? 'bg-[#fde384] border-[#1f1a1d] text-[#1f1a1d] shadow-[1px_1.5px_0_#1f1a1d]'
                        : 'bg-[#fffcf9]/90 border-[#1f1a1d]/60 text-[#544c50] hover:border-[#1f1a1d]'
                    }`}
                    title={isSelected ? 'Deselect image' : 'Select image'}
                  >
                    {isSelected ? (
                      <CheckSquare className="w-3.5 h-3.5" />
                    ) : (
                      <Square className="w-3.5 h-3.5" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveImage(img.id);
                    }}
                    className="absolute top-2 right-2 w-6 h-6 rounded-lg bg-[#fffcf9]/90 hover:bg-[#e5483e] text-[#1f1a1d] hover:text-white border border-[#1f1a1d]/60 flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition"
                    title="Remove image"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>

                  <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full bg-[#fffcf9]/90 text-[10px] font-mono-sci font-semibold text-[#1f1a1d] border border-[#1f1a1d]/40">
                    {img.format} · {img.bitDepth}-bit
                  </div>

                  <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#fde384] text-[11px] font-semibold text-[#1f1a1d] border border-[#1f1a1d]">
                      <Eye className="w-3 h-3" />
                      Inspect
                    </span>
                  </div>
                </div>

                <div className="p-2.5 space-y-1.5">
                  <p
                    className="text-sm font-semibold text-[#1f1a1d] truncate leading-tight"
                    title={img.filename}
                  >
                    {img.filename}
                  </p>
                  <div className="flex items-center justify-between text-[11px] text-[#544c50] font-mono-sci">
                    <span>
                      {img.width}×{img.height}
                    </span>
                    <span>{formatBytes(img.sizeBytes)}</span>
                  </div>
                  <div className="flex items-center justify-between pt-0.5">
                    {renderStatusBadge(img)}
                    {img.status === 'error' && (
                      <button
                        type="button"
                        onClick={() => onRetryImage(img.id)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#e5483e] hover:underline"
                      >
                        <RotateCw className="w-3 h-3" />
                        Retry
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
