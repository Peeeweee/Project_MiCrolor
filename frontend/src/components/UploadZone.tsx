import React, { useRef, useState } from 'react';
import { UploadCloud, FolderOpen, FileImage, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';

interface UploadZoneProps {
  onUploadFiles: (files: File[]) => Promise<void>;
  uploading: boolean;
  uploadProgress: { done: number; total: number } | null;
  uploadErrors: Array<{ filename: string; error: string }>;
  compact?: boolean;
}

export const UploadZone: React.FC<UploadZoneProps> = ({
  onUploadFiles,
  uploading,
  uploadProgress,
  uploadErrors,
  compact = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    await onUploadFiles(files);
    if (inputRef.current) inputRef.current.value = '';
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    await handleFiles(e.dataTransfer.files);
  };

  if (compact) {
    return (
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={`rounded-2xl border-2 border-dashed px-4 py-3 flex items-center justify-between gap-4 transition ${
          isDragging
            ? 'border-[#1f1a1d] bg-[#fde384]/40'
            : 'border-[#bdb0a8] bg-[#fffcf9] hover:border-[#1f1a1d]'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          {uploading ? (
            <Loader2 className="w-5 h-5 text-[#e5483e] animate-spin shrink-0" />
          ) : (
            <UploadCloud className="w-5 h-5 text-[#1f1a1d] shrink-0" />
          )}
          <div className="min-w-0">
            <div className="text-sm font-semibold text-[#1f1a1d]">
              {uploading && uploadProgress
                ? `Importing microscope batch (${uploadProgress.done}/${uploadProgress.total})...`
                : 'Drop more microscope photos here'}
            </div>
            <div className="text-xs text-[#544c50]">
              Supports JPG, JPEG, PNG, TIFF (8/16-bit), WebP · Processed 100% locally
            </div>
          </div>
        </div>
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="sketch-btn shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-semibold disabled:opacity-50"
        >
          <FolderOpen className="w-4 h-4" />
          Browse Files
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.tif,.tiff,.webp,image/*"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-6 space-y-6">
      <div className="space-y-1.5">
        <h2 className="font-marker text-2xl text-[#1f1a1d]">
          <span className="hl-yellow">Bring your microscope slides</span>
        </h2>
        <p className="text-base text-[#544c50]">
          Load 1 to 200+ microscope photos into your local studio. Your original files stay
          untouched and never leave your computer.
        </p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => !uploading && inputRef.current?.click()}
        className={`rounded-3xl border-2 border-dashed p-12 text-center cursor-pointer transition flex flex-col items-center justify-center gap-4 ${
          isDragging
            ? 'border-[#1f1a1d] bg-[#fde384]/45 scale-[1.005]'
            : 'border-[#1f1a1d]/60 bg-[#fffcf9] hover:border-[#1f1a1d] hover:bg-[#fff9ef] shadow-[3px_4px_0_rgba(31,26,29,0.1)]'
        }`}
      >
        <div className="w-16 h-16 rounded-2xl bg-[#f8d2e0] border-2 border-[#1f1a1d] shadow-[2px_3px_0_#1f1a1d] flex items-center justify-center text-[#1f1a1d] -rotate-2">
          {uploading ? (
            <Loader2 className="w-8 h-8 animate-spin" />
          ) : (
            <UploadCloud className="w-8 h-8" />
          )}
        </div>

        <div className="space-y-1">
          <p className="font-marker text-lg text-[#1f1a1d]">
            {uploading && uploadProgress
              ? `Importing ${uploadProgress.done} of ${uploadProgress.total} slides...`
              : 'Drop JPG, PNG, TIFF, or WebP photos here'}
          </p>
          <p className="text-sm text-[#544c50]">
            or click to browse · lightweight thumbnails are generated automatically
          </p>
        </div>

        {uploading && uploadProgress && (
          <div className="w-72 h-2.5 bg-[#f2e8e2] border border-[#1f1a1d] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#f8d2e0] transition-all duration-200"
              style={{
                width: `${Math.round((uploadProgress.done / Math.max(uploadProgress.total, 1)) * 100)}%`,
              }}
            />
          </div>
        )}

        <button
          type="button"
          disabled={uploading}
          onClick={(e) => {
            e.stopPropagation();
            inputRef.current?.click();
          }}
          className="sketch-btn-primary mt-1 inline-flex items-center gap-2 px-5 py-2.5 text-base font-semibold disabled:opacity-50"
        >
          <FolderOpen className="w-4 h-4" />
          Browse Microscope Files
        </button>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.tif,.tiff,.webp,image/*"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="sketch-card p-4">
          <div className="flex items-center gap-2 font-marker text-sm text-[#1f1a1d] mb-1">
            <FileImage className="w-4 h-4 text-[#e5483e]" />
            Supported Formats
          </div>
          <p className="text-sm text-[#544c50]">
            PNG (lossless + alpha), TIFF (8-bit &amp; 16-bit), JPEG / JPG, and WebP.
          </p>
        </div>
        <div className="sketch-card p-4">
          <div className="flex items-center gap-2 font-marker text-sm text-[#1f1a1d] mb-1">
            <CheckCircle2 className="w-4 h-4 text-[#256c5f]" />
            Non-Destructive
          </div>
          <p className="text-sm text-[#544c50]">
            Originals stay unchanged. Full-res images are processed only on your local machine.
          </p>
        </div>
        <div className="sketch-card p-4">
          <div className="flex items-center gap-2 font-marker text-sm text-[#1f1a1d] mb-1">
            <UploadCloud className="w-4 h-4 text-[#3f7de6]" />
            Large-Batch Ready
          </div>
          <p className="text-sm text-[#544c50]">
            Chunked uploads and background workers keep the UI responsive for 50–200+ slides.
          </p>
        </div>
      </div>

      {uploadErrors.length > 0 && (
        <div className="p-4 rounded-2xl bg-[#fff0ef] border-2 border-[#e5483e] space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#b82d24]">
            <AlertTriangle className="w-4 h-4" />
            Some files could not be imported ({uploadErrors.length})
          </div>
          <ul className="text-xs text-[#7c2620] space-y-1 max-h-32 overflow-y-auto font-mono-sci">
            {uploadErrors.map((err, idx) => (
              <li key={idx}>
                {err.filename}: {err.error}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
