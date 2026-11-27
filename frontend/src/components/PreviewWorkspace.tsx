import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Scan,
  Columns2,
  SplitSquareHorizontal,
  Image as ImageIcon,
  Download,
  Sparkles,
} from 'lucide-react';
import type { ColorSettings, ImageRecord } from '../types';
import { api } from '../utils/api';
import { applyColorSettingsToImageData } from '../utils/colorEngine';
import { LiveThumbnail } from './LiveThumbnail';

interface PreviewWorkspaceProps {
  images: ImageRecord[];
  activeImageId: string | null;
  settings: ColorSettings;
  onSelectActive: (id: string) => void;
  onExportSingle: (id: string) => void;
  onProcessSingle: (id: string) => void;
}

type CompareMode = 'slider' | 'side-by-side' | 'processed' | 'original';

export const PreviewWorkspace: React.FC<PreviewWorkspaceProps> = ({
  images,
  activeImageId,
  settings,
  onSelectActive,
  onExportSingle,
  onProcessSingle,
}) => {
  const activeIndex = images.findIndex((i) => i.id === activeImageId);
  const activeImage = activeIndex >= 0 ? images[activeIndex] : images[0] || null;

  const [mode, setMode] = useState<CompareMode>('slider');
  const [sliderPos, setSliderPos] = useState<number>(50);
  const [zoom, setZoom] = useState<number>(1);
  const [fitMode, setFitMode] = useState<'fit' | 'actual'>('fit');
  const [draggingSlider, setDraggingSlider] = useState(false);

  const [origDataUrl, setOrigDataUrl] = useState<string | null>(null);
  const [processedImageData, setProcessedImageData] = useState<ImageData | null>(null);
  const [sourceImageData, setSourceImageData] = useState<ImageData | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const compareContainerRef = useRef<HTMLDivElement | null>(null);
  const workCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const processedCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!activeImage) {
      setOrigDataUrl(null);
      setProcessedImageData(null);
      setSourceImageData(null);
      return;
    }

    let cancelled = false;
    setLoadingPreview(true);
    setSourceImageData(null);
    setProcessedImageData(null);

    const url = api.previewUrl(activeImage.id, false, activeImage.uploadedAt);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      const canvas = workCanvasRef.current || document.createElement('canvas');
      workCanvasRef.current = canvas;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      setSourceImageData(imgData);
      setOrigDataUrl(url);
      setLoadingPreview(false);
    };
    img.onerror = () => {
      if (!cancelled) setLoadingPreview(false);
    };
    img.src = url;

    return () => {
      cancelled = true;
    };
  }, [activeImage?.id, activeImage?.uploadedAt]);

  useEffect(() => {
    if (!sourceImageData) {
      setProcessedImageData(null);
      return;
    }
    const rafId = requestAnimationFrame(() => {
      const processed = applyColorSettingsToImageData(sourceImageData, settings);
      setProcessedImageData(processed);
    });
    return () => cancelAnimationFrame(rafId);
  }, [sourceImageData, settings]);

  useEffect(() => {
    const canvas = processedCanvasRef.current;
    if (!canvas || !processedImageData) return;
    if (canvas.width !== processedImageData.width) canvas.width = processedImageData.width;
    if (canvas.height !== processedImageData.height) canvas.height = processedImageData.height;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.putImageData(processedImageData, 0, 0);
  }, [processedImageData, mode]);

  useEffect(() => {
    if (!draggingSlider) return;
    const handleMove = (e: PointerEvent) => {
      const rect = compareContainerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setSliderPos(Math.max(0, Math.min(100, pct)));
    };
    const handleUp = () => setDraggingSlider(false);
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [draggingSlider]);

  if (!activeImage) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8 text-[#544c50] gap-3">
        <div className="w-14 h-14 rounded-2xl bg-[#fde384] border-2 border-[#1f1a1d] shadow-[2px_3px_0_#1f1a1d] flex items-center justify-center">
          <ImageIcon className="w-7 h-7 text-[#1f1a1d]" />
        </div>
        <p className="font-marker text-lg text-[#1f1a1d]">No slide selected for preview</p>
        <p className="text-sm max-w-sm">
          Upload microscope photographs first, then select any slide to inspect before-and-after
          color transformations at up to 100% pixel zoom.
        </p>
      </div>
    );
  }

  const goPrev = () => {
    if (images.length < 2) return;
    const prevIdx = (activeIndex - 1 + images.length) % images.length;
    onSelectActive(images[prevIdx].id);
  };

  const goNext = () => {
    if (images.length < 2) return;
    const nextIdx = (activeIndex + 1) % images.length;
    onSelectActive(images[nextIdx].id);
  };

  const handleZoomIn = () => {
    setFitMode('actual');
    setZoom((z) => Math.min(4, +(z * 1.25).toFixed(2)));
  };

  const handleZoomOut = () => {
    setFitMode('actual');
    setZoom((z) => Math.max(0.25, +(z / 1.25).toFixed(2)));
  };

  const handleFit = () => {
    setFitMode('fit');
    setZoom(1);
  };

  const handle100 = () => {
    setFitMode('actual');
    setZoom(1);
  };

  const imgStyle: React.CSSProperties =
    fitMode === 'fit'
      ? { maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto' }
      : {
          width: `${Math.round(activeImage.width * zoom)}px`,
          height: `${Math.round(activeImage.height * zoom)}px`,
          maxWidth: 'none',
          maxHeight: 'none',
        };

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-2.5 bg-[#fffcf9] border-b-2 border-[#cfc4bd] flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1 bg-[#f5ece6] p-1 rounded-full border-[1.5px] border-[#cfc4bd]">
          {(
            [
              { id: 'slider', label: 'Before / After', icon: <SplitSquareHorizontal className="w-3.5 h-3.5" /> },
              { id: 'side-by-side', label: 'Side by Side', icon: <Columns2 className="w-3.5 h-3.5" /> },
              { id: 'processed', label: 'Processed', icon: <Sparkles className="w-3.5 h-3.5" /> },
              { id: 'original', label: 'Original', icon: <ImageIcon className="w-3.5 h-3.5" /> },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setMode(tab.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition ${
                mode === tab.id
                  ? 'bg-[#fde384] text-[#1f1a1d] border border-[#1f1a1d] shadow-[1px_1.5px_0_#1f1a1d]'
                  : 'text-[#544c50] hover:text-[#1f1a1d] border border-transparent'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <button onClick={handleZoomOut} className="sketch-btn p-1.5" title="Zoom Out">
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono-sci text-xs font-semibold text-[#1f1a1d] w-12 text-center">
            {fitMode === 'fit' ? 'FIT' : `${Math.round(zoom * 100)}%`}
          </span>
          <button onClick={handleZoomIn} className="sketch-btn p-1.5" title="Zoom In">
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleFit}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border-[1.5px] transition ${
              fitMode === 'fit'
                ? 'bg-[#e3dcf7] text-[#1f1a1d] border-[#1f1a1d]'
                : 'bg-[#fffcf9] text-[#544c50] border-[#cfc4bd]'
            }`}
          >
            <Maximize2 className="w-3 h-3" />
            Fit
          </button>
          <button
            onClick={handle100}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border-[1.5px] transition ${
              fitMode === 'actual' && zoom === 1
                ? 'bg-[#e3dcf7] text-[#1f1a1d] border-[#1f1a1d]'
                : 'bg-[#fffcf9] text-[#544c50] border-[#cfc4bd]'
            }`}
          >
            <Scan className="w-3 h-3" />
            100%
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <button
              onClick={goPrev}
              disabled={images.length < 2}
              className="sketch-btn p-1.5 disabled:opacity-40"
              title="Previous slide"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono-sci text-xs text-[#544c50] px-1">
              {activeIndex + 1} / {images.length}
            </span>
            <button
              onClick={goNext}
              disabled={images.length < 2}
              className="sketch-btn p-1.5 disabled:opacity-40"
              title="Next slide"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <button
            onClick={() => onProcessSingle(activeImage.id)}
            className="sketch-btn-pink inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Process Slide
          </button>
          <button
            onClick={() => onExportSingle(activeImage.id)}
            className="sketch-btn-primary inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
        </div>
      </div>

      <div className="px-4 py-1.5 bg-[#fdf6f2] border-b border-[#cfc4bd] flex flex-wrap items-center justify-between gap-2 text-xs font-mono-sci text-[#544c50]">
        <span className="text-[#1f1a1d] font-semibold truncate max-w-xs" title={activeImage.filename}>
          {activeImage.filename}
        </span>
        <div className="flex items-center gap-4">
          <span>
            Original: <strong className="text-[#1f1a1d]">{activeImage.width} × {activeImage.height}px</strong>
          </span>
          <span>
            Processed:{' '}
            <strong className="text-[#256c5f]">
              {activeImage.processedWidth || activeImage.width} ×{' '}
              {activeImage.processedHeight || activeImage.height}px
            </strong>
          </span>
          <span>
            {activeImage.format} · {activeImage.bitDepth}-bit
            {activeImage.hasAlpha ? ' · Alpha' : ''}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-auto checkerboard-bg p-4 flex items-center justify-center relative">
        {loadingPreview && (
          <div className="absolute inset-0 bg-[#fdf6f2]/70 backdrop-blur-[1px] flex items-center justify-center z-20 font-marker text-sm text-[#1f1a1d]">
            Loading slide preview...
          </div>
        )}

        {mode === 'slider' && origDataUrl && (
          <div
            ref={compareContainerRef}
            className="relative inline-block rounded-2xl overflow-hidden border-2 border-[#1f1a1d] shadow-[4px_5px_0_rgba(31,26,29,0.2)] select-none bg-black"
            style={fitMode === 'fit' ? { maxWidth: '100%', maxHeight: '100%' } : undefined}
          >
            <canvas
              ref={processedCanvasRef}
              aria-label="Processed preview"
              style={imgStyle}
              className="block"
            />
            <div
              className="absolute inset-0 overflow-hidden"
              style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
            >
              <img
                src={origDataUrl}
                alt="Original preview"
                draggable={false}
                style={imgStyle}
                className="block w-full h-full object-contain"
              />
            </div>

            <span className="absolute top-3 left-3 px-2.5 py-0.5 rounded-full bg-[#fffcf9] text-xs font-semibold text-[#1f1a1d] border-[1.5px] border-[#1f1a1d] pointer-events-none">
              BEFORE (Original)
            </span>
            <span className="absolute top-3 right-3 px-2.5 py-0.5 rounded-full bg-[#f8d2e0] text-xs font-semibold text-[#1f1a1d] border-[1.5px] border-[#1f1a1d] pointer-events-none">
              AFTER (Live Preview)
            </span>

            <div
              onPointerDown={() => setDraggingSlider(true)}
              className="absolute top-0 bottom-0 w-0.5 bg-[#fde384] cursor-ew-resize z-10 shadow-[0_0_8px_rgba(31,26,29,0.7)]"
              style={{ left: `${sliderPos}%` }}
            >
              <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-9 h-9 rounded-full bg-[#fde384] border-2 border-[#1f1a1d] flex items-center justify-center text-[#1f1a1d] shadow-[2px_2px_0_#1f1a1d]">
                <SplitSquareHorizontal className="w-4 h-4" />
              </div>
            </div>
          </div>
        )}

        {mode === 'side-by-side' && origDataUrl && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full h-full items-center">
            <div className="flex flex-col items-center gap-2 max-h-full">
              <span className="font-marker text-xs px-2.5 py-0.5 rounded-full bg-[#fffcf9] border border-[#1f1a1d]">
                BEFORE (Original)
              </span>
              <div className="rounded-2xl overflow-hidden border-2 border-[#1f1a1d] shadow-[3px_4px_0_rgba(31,26,29,0.18)] max-h-[calc(100%-28px)] overflow-auto">
                <img src={origDataUrl} alt="Original" style={imgStyle} className="block" />
              </div>
            </div>
            <div className="flex flex-col items-center gap-2 max-h-full">
              <span className="font-marker text-xs px-2.5 py-0.5 rounded-full bg-[#f8d2e0] border border-[#1f1a1d]">
                AFTER (Color Adjusted)
              </span>
              <div className="rounded-2xl overflow-hidden border-2 border-[#1f1a1d] shadow-[3px_4px_0_rgba(31,26,29,0.18)] max-h-[calc(100%-28px)] overflow-auto">
                <canvas
                  ref={processedCanvasRef}
                  aria-label="Processed"
                  style={imgStyle}
                  className="block"
                />
              </div>
            </div>
          </div>
        )}

        {mode === 'processed' && origDataUrl && (
          <div className="rounded-2xl overflow-hidden border-2 border-[#1f1a1d] shadow-[4px_5px_0_rgba(31,26,29,0.2)]">
            <canvas
              ref={processedCanvasRef}
              aria-label="Processed"
              style={imgStyle}
              className="block"
            />
          </div>
        )}

        {mode === 'original' && origDataUrl && (
          <div className="rounded-2xl overflow-hidden border-2 border-[#1f1a1d] shadow-[4px_5px_0_rgba(31,26,29,0.2)]">
            <img src={origDataUrl} alt="Original" style={imgStyle} className="block" />
          </div>
        )}
      </div>

      {images.length > 1 && (
        <div className="h-22 shrink-0 bg-[#fffcf9] border-t-2 border-[#cfc4bd] px-3 py-2 flex items-center gap-2 overflow-x-auto">
          {images.map((img) => {
            const isCurr = img.id === activeImage.id;
            return (
              <button
                key={img.id}
                onClick={() => onSelectActive(img.id)}
                className={`relative h-15 w-20 shrink-0 rounded-xl overflow-hidden border-2 transition ${
                  isCurr
                    ? 'border-[#1f1a1d] shadow-[2px_2px_0_#1f1a1d] scale-[1.03]'
                    : 'border-[#cfc4bd] opacity-80 hover:opacity-100 hover:border-[#1f1a1d]'
                }`}
                title={img.filename}
              >
                <LiveThumbnail
                  imageId={img.id}
                  version={img.uploadedAt}
                  alt={img.filename}
                  settings={settings}
                  livePreview={true}
                  className="w-full h-full object-cover"
                />
                {img.status === 'processed' && (
                  <span className="absolute bottom-1 right-1 w-2.5 h-2.5 rounded-full bg-[#3f9a8a] border border-white shadow" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
