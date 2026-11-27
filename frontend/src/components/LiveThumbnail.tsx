import React, { useEffect, useRef, useState } from 'react';
import type { ColorSettings } from '../types';
import { api } from '../utils/api';
import { applyColorSettingsToImageData, isNeutralSettings } from '../utils/colorEngine';

// Bounded in-memory cache of compact 200px thumbnail ImageData (~160KB each, ultra-fast)
const thumbCache = new Map<string, ImageData>();
const MAX_CACHE_ENTRIES = 250;
const MAX_THUMB_RENDER_DIM = 200;

function putCache(key: string, data: ImageData) {
  if (thumbCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = thumbCache.keys().next().value;
    if (oldest) thumbCache.delete(oldest);
  }
  thumbCache.set(key, data);
}

interface LiveThumbnailProps {
  imageId: string;
  version?: string | null;
  alt: string;
  settings: ColorSettings;
  livePreview: boolean;
  className?: string;
}

export const LiveThumbnail: React.FC<LiveThumbnailProps> = ({
  imageId,
  version,
  alt,
  settings,
  livePreview,
  className = 'w-full h-full object-cover',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [baseData, setBaseData] = useState<ImageData | null>(null);

  const cacheKey = `${imageId}:${version || ''}`;
  const origUrl = api.thumbUrl(imageId, false, version);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        setIsVisible(Boolean(entries[0]?.isIntersecting));
      },
      { rootMargin: '140px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    const cached = thumbCache.get(cacheKey);
    if (cached) {
      setBaseData(cached);
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      const scale = Math.min(1, MAX_THUMB_RENDER_DIM / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const off = document.createElement('canvas');
      off.width = w;
      off.height = h;
      const ctx = off.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h);
      putCache(cacheKey, data);
      setBaseData(data);
    };
    img.src = origUrl;

    return () => {
      cancelled = true;
    };
  }, [isVisible, cacheKey, origUrl]);

  // Debounced, viewport-aware render so rapid slider drags & large batches stay lag-free
  useEffect(() => {
    if (!isVisible || !baseData) return;
    const timer = window.setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      if (canvas.width !== baseData.width) canvas.width = baseData.width;
      if (canvas.height !== baseData.height) canvas.height = baseData.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      if (!livePreview || isNeutralSettings(settings)) {
        ctx.putImageData(baseData, 0, 0);
      } else {
        const processed = applyColorSettingsToImageData(baseData, settings);
        ctx.putImageData(processed, 0, 0);
      }
    }, 35);

    return () => window.clearTimeout(timer);
  }, [isVisible, baseData, settings, livePreview]);

  return (
    <div ref={containerRef} className="w-full h-full relative">
      {baseData ? (
        <canvas ref={canvasRef} aria-label={alt} className={className} />
      ) : (
        <img src={origUrl} alt={alt} loading="lazy" className={className} />
      )}
    </div>
  );
};
