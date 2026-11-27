import React, { useState } from 'react';
import {
  Download,
  FolderOutput,
  FileArchive,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Info,
} from 'lucide-react';
import type {
  ExportDelivery,
  ExportFormat,
  ExportRequest,
  ExportSummary,
  ImageRecord,
} from '../types';
import { formatBytes } from '../utils/format';

interface ExportPanelProps {
  images: ImageRecord[];
  selectedIds: Set<string>;
  activeImageId: string | null;
  defaultExportDir: string;
  onRunExport: (req: ExportRequest) => Promise<ExportSummary>;
}

type ScopeMode = 'processed' | 'selected' | 'all' | 'active';

export const ExportPanel: React.FC<ExportPanelProps> = ({
  images,
  selectedIds,
  activeImageId,
  defaultExportDir,
  onRunExport,
}) => {
  const processedImages = images.filter((i) => i.status === 'processed');
  const [scope, setScope] = useState<ScopeMode>(
    processedImages.length > 0 ? 'processed' : 'all'
  );
  const [format, setFormat] = useState<ExportFormat>('PNG');
  const [delivery, setDelivery] = useState<ExportDelivery>('zip');
  const [filenamePrefix, setFilenamePrefix] = useState('pink_');
  const [jpegQuality, setJpegQuality] = useState(100);
  const [tiffBitDepth, setTiffBitDepth] = useState<'preserve' | '8' | '16'>('preserve');
  const [tiffCompression, setTiffCompression] = useState<'lzw' | 'deflate' | 'none'>('lzw');
  const [pdfOrientation, setPdfOrientation] = useState<
    'auto' | 'portrait' | 'landscape' | 'fit-image'
  >('auto');
  const [pdfPageSize, setPdfPageSize] = useState<'A4' | 'Letter' | 'Original'>('Original');
  const [outputFolder, setOutputFolder] = useState(defaultExportDir);

  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ExportSummary | null>(null);

  const getTargetIds = (): string[] => {
    if (scope === 'processed') return processedImages.map((i) => i.id);
    if (scope === 'selected') return images.filter((i) => selectedIds.has(i.id)).map((i) => i.id);
    if (scope === 'active') return activeImageId ? [activeImageId] : [];
    return images.map((i) => i.id);
  };

  const targetIds = getTargetIds();

  const handleExport = async () => {
    if (targetIds.length === 0) return;
    setExporting(true);
    setError(null);
    setSummary(null);
    try {
      const effectiveDelivery: ExportDelivery =
        format === 'PDF'
          ? delivery === 'folder'
            ? 'folder'
            : 'single'
          : targetIds.length === 1 && delivery === 'zip'
          ? 'single'
          : delivery;

      const res = await onRunExport({
        imageIds: targetIds,
        format,
        delivery: effectiveDelivery,
        filenamePrefix,
        jpegQuality,
        tiffBitDepth,
        tiffCompression,
        pdfOrientation,
        pdfPageSize,
        outputFolder: delivery === 'folder' ? outputFolder : null,
      });
      setSummary(res);

      if (res.downloadUrl) {
        const link = document.createElement('a');
        link.href = res.downloadUrl;
        link.download = '';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="space-y-1">
          <h2 className="font-marker text-2xl text-[#1f1a1d] flex items-center gap-2">
            <Download className="w-5 h-5 text-[#256c5f]" />
            <span className="hl-mint">High-Quality Batch Export</span>
          </h2>
          <p className="text-base text-[#544c50]">
            Export full-resolution microscope slides with your active preset applied, preserving
            exact dimensions, aspect ratio, and bit depth.
          </p>
        </div>

        <section className="sketch-card p-4 space-y-3">
          <h3 className="font-marker text-sm text-[#1f1a1d]">
            <span className="hl-yellow">1. Slides to Export</span>
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {(
              [
                { id: 'processed', label: 'All Processed', count: processedImages.length },
                { id: 'selected', label: 'Selected', count: selectedIds.size },
                { id: 'all', label: 'All Uploaded', count: images.length },
                { id: 'active', label: 'Active Slide', count: activeImageId ? 1 : 0 },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setScope(opt.id)}
                className={`p-3 rounded-2xl text-left border-[1.7px] transition ${
                  scope === opt.id
                    ? 'bg-[#e3dcf7] border-[#1f1a1d] shadow-[2px_2.5px_0_#1f1a1d] text-[#1f1a1d]'
                    : 'bg-[#fdf6f2] border-[#cfc4bd] text-[#544c50] hover:border-[#1f1a1d]'
                }`}
              >
                <div className="text-sm font-semibold">{opt.label}</div>
                <div className="text-xs font-mono-sci text-[#1f1a1d] mt-0.5">
                  {opt.count} {opt.count === 1 ? 'slide' : 'slides'}
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="sketch-card p-4 space-y-4">
          <h3 className="font-marker text-sm text-[#1f1a1d]">
            <span className="hl-pink">2. Output Format &amp; Quality</span>
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {(
              [
                { id: 'PNG', tag: 'Lossless · Alpha' },
                { id: 'TIFF', tag: 'Lossless · 8/16-bit' },
                { id: 'JPEG', tag: 'Lossy · Adjustable' },
                { id: 'PDF', tag: 'Multipage Report' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFormat(f.id)}
                className={`p-3 rounded-2xl text-left border-[1.7px] transition ${
                  format === f.id
                    ? 'bg-[#fde384] border-[#1f1a1d] shadow-[2px_2.5px_0_#1f1a1d] text-[#1f1a1d]'
                    : 'bg-[#fdf6f2] border-[#cfc4bd] text-[#544c50] hover:border-[#1f1a1d]'
                }`}
              >
                <div className="font-marker text-base text-[#1f1a1d]">{f.id}</div>
                <div className="text-xs text-[#544c50] mt-0.5">{f.tag}</div>
              </button>
            ))}
          </div>

          {format === 'PNG' && (
            <div className="p-3 rounded-xl bg-[#e6f6f1] border-[1.5px] border-[#3f9a8a] text-sm text-[#1f4d44] flex items-start gap-2">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                <strong>Lossless PNG:</strong> Preserves exact pixel dimensions, alpha transparency,
                and ICC color profile with zero compression artifacts.
              </span>
            </div>
          )}

          {format === 'JPEG' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[#544c50]">JPEG Quality (4:4:4 chroma at ≥ 90)</span>
                <span className="font-mono-sci text-xs font-semibold text-[#1f1a1d] bg-[#fde384] px-2 py-0.5 rounded-full border border-[#1f1a1d]">
                  {jpegQuality} / 100
                </span>
              </div>
              <input
                type="range"
                min={60}
                max={100}
                value={jpegQuality}
                onChange={(e) => setJpegQuality(Number(e.target.value))}
                className="studio-slider"
              />
              <div className="p-3 rounded-xl bg-[#fff7e0] border-[1.5px] border-[#f39a2e] text-sm text-[#6d4511] flex items-start gap-2">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Even at Quality 100, JPEG is inherently a <strong>lossy</strong> format. For
                  strictly lossless scientific archival output, choose <strong>PNG</strong> or{' '}
                  <strong>TIFF</strong>.
                </span>
              </div>
            </div>
          )}

          {format === 'TIFF' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-[#544c50] mb-1">Bit Depth</label>
                <select
                  value={tiffBitDepth}
                  onChange={(e) => setTiffBitDepth(e.target.value as 'preserve' | '8' | '16')}
                  className="w-full px-3 py-2 rounded-xl bg-[#fdf6f2] border-[1.5px] border-[#cfc4bd] text-sm text-[#1f1a1d]"
                >
                  <option value="preserve">Preserve Original (8-bit or 16-bit)</option>
                  <option value="16">Force 16-bit per channel</option>
                  <option value="8">Convert to 8-bit per channel</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-[#544c50] mb-1">Lossless Compression</label>
                <select
                  value={tiffCompression}
                  onChange={(e) => setTiffCompression(e.target.value as 'lzw' | 'deflate' | 'none')}
                  className="w-full px-3 py-2 rounded-xl bg-[#fdf6f2] border-[1.5px] border-[#cfc4bd] text-sm text-[#1f1a1d]"
                >
                  <option value="lzw">LZW (Lossless, Recommended)</option>
                  <option value="deflate">Deflate / ZIP (Lossless)</option>
                  <option value="none">Uncompressed</option>
                </select>
              </div>
            </div>
          )}

          {format === 'PDF' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-[#544c50] mb-1">Page Size</label>
                  <select
                    value={pdfPageSize}
                    onChange={(e) => setPdfPageSize(e.target.value as 'A4' | 'Letter' | 'Original')}
                    className="w-full px-3 py-2 rounded-xl bg-[#fdf6f2] border-[1.5px] border-[#cfc4bd] text-sm text-[#1f1a1d]"
                  >
                    <option value="Original">Original Image Proportions (Zero Downscale)</option>
                    <option value="A4">A4 (210 × 297 mm)</option>
                    <option value="Letter">US Letter (8.5 × 11 in)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-[#544c50] mb-1">Page Orientation</label>
                  <select
                    value={pdfOrientation}
                    onChange={(e) =>
                      setPdfOrientation(
                        e.target.value as 'auto' | 'portrait' | 'landscape' | 'fit-image'
                      )
                    }
                    className="w-full px-3 py-2 rounded-xl bg-[#fdf6f2] border-[1.5px] border-[#cfc4bd] text-sm text-[#1f1a1d]"
                  >
                    <option value="auto">Auto (Match Each Image)</option>
                    <option value="fit-image">Fit Page to Image</option>
                    <option value="landscape">Landscape</option>
                    <option value="portrait">Portrait</option>
                  </select>
                </div>
              </div>
              <div className="p-3 rounded-xl bg-[#eef4ff] border-[1.5px] border-[#3f7de6] text-sm text-[#1f3b6e] flex items-start gap-2">
                <FileText className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Images are embedded as lossless PNG streams at full pixel resolution. Selecting A4
                  or Letter constrains physical page dimensions (adjusting effective print DPI),
                  whereas <strong>Original</strong> matches each image's native aspect ratio.
                </span>
              </div>
            </div>
          )}
        </section>

        <section className="sketch-card p-4 space-y-4">
          <h3 className="font-marker text-sm text-[#1f1a1d]">
            <span className="hl-lav">3. Filename &amp; Destination</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-[#544c50] mb-1">
                Filename Prefix (original name preserved)
              </label>
              <input
                type="text"
                value={filenamePrefix}
                onChange={(e) => setFilenamePrefix(e.target.value)}
                placeholder="e.g. pink_ or batch1_"
                className="w-full px-3 py-2 rounded-xl bg-[#fdf6f2] border-[1.5px] border-[#cfc4bd] text-xs text-[#1f1a1d] font-mono-sci focus:outline-none focus:border-[#1f1a1d]"
              />
            </div>
            <div>
              <label className="block text-sm text-[#544c50] mb-1">Delivery Method</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDelivery('zip')}
                  className={`py-2 px-2.5 rounded-xl text-sm font-semibold border-[1.6px] flex items-center justify-center gap-1.5 transition ${
                    delivery !== 'folder'
                      ? 'bg-[#f8d2e0] border-[#1f1a1d] text-[#1f1a1d] shadow-[1.5px_2px_0_#1f1a1d]'
                      : 'bg-[#fdf6f2] border-[#cfc4bd] text-[#544c50]'
                  }`}
                >
                  <FileArchive className="w-3.5 h-3.5" />
                  {format === 'PDF' ? 'Download PDF' : 'ZIP / Download'}
                </button>
                <button
                  type="button"
                  onClick={() => setDelivery('folder')}
                  className={`py-2 px-2.5 rounded-xl text-sm font-semibold border-[1.6px] flex items-center justify-center gap-1.5 transition ${
                    delivery === 'folder'
                      ? 'bg-[#f8d2e0] border-[#1f1a1d] text-[#1f1a1d] shadow-[1.5px_2px_0_#1f1a1d]'
                      : 'bg-[#fdf6f2] border-[#cfc4bd] text-[#544c50]'
                  }`}
                >
                  <FolderOutput className="w-3.5 h-3.5" />
                  Local Folder
                </button>
              </div>
            </div>
          </div>

          {delivery === 'folder' && (
            <div>
              <label className="block text-sm text-[#544c50] mb-1">
                Local Output Folder Path (created automatically if missing)
              </label>
              <input
                type="text"
                value={outputFolder}
                onChange={(e) => setOutputFolder(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#fdf6f2] border-[1.5px] border-[#cfc4bd] text-xs text-[#1f1a1d] font-mono-sci focus:outline-none focus:border-[#1f1a1d]"
              />
            </div>
          )}
        </section>

        <button
          type="button"
          disabled={targetIds.length === 0 || exporting}
          onClick={handleExport}
          className="sketch-btn-pink w-full py-3 px-4 text-base font-marker disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {exporting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Exporting {targetIds.length} Full-Resolution Slides...
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              Export {targetIds.length} {targetIds.length === 1 ? 'Slide' : 'Slides'} as {format}
            </>
          )}
        </button>

        {error && (
          <div className="p-4 rounded-2xl bg-[#fff0ef] border-2 border-[#e5483e] text-sm text-[#b82d24] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {summary && (
          <div className="p-4 rounded-2xl bg-[#e6f6f1] border-2 border-[#3f9a8a] space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-marker text-base text-[#1f4d44]">
                <CheckCircle2 className="w-4 h-4" />
                Export Completed ({summary.exportedCount} {summary.exportedCount === 1 ? 'slide' : 'slides'})
              </div>
              <span className="text-xs font-mono-sci font-semibold text-[#1f4d44]">
                {formatBytes(summary.totalBytes)}
              </span>
            </div>

            {summary.outputFolder && (
              <p className="text-xs text-[#1f4d44] font-mono-sci break-all">
                Saved to: {summary.outputFolder}
              </p>
            )}

            {summary.notes.length > 0 && (
              <ul className="text-sm text-[#256c5f] space-y-0.5">
                {summary.notes.map((n, i) => (
                  <li key={i}>• {n}</li>
                ))}
              </ul>
            )}

            {summary.downloadUrl && (
              <a
                href={summary.downloadUrl}
                download
                className="sketch-btn-primary inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-semibold"
              >
                <Download className="w-3.5 h-3.5" />
                Download Again
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
