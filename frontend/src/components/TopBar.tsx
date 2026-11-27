import React from 'react';
import { Microscope, ShieldCheck, Loader2, XCircle, CheckCircle2, Sparkles, SlidersHorizontal } from 'lucide-react';
import type { BatchJobStatus } from '../types';
import { formatBytes } from '../utils/format';

interface TopBarProps {
  imageCount: number;
  selectedCount: number;
  processedCount: number;
  totalBytes: number;
  activeJob: BatchJobStatus | null;
  onCancelJob: (jobId: string) => void;
  onQuickProcessAll: () => void;
  onOpenColorDrawer?: () => void;
  activePresetName: string;
}

export const TopBar: React.FC<TopBarProps> = ({
  imageCount,
  selectedCount,
  processedCount,
  totalBytes,
  activeJob,
  onCancelJob,
  onQuickProcessAll,
  onOpenColorDrawer,
  activePresetName,
}) => {
  const isRunning = activeJob?.status === 'running';
  const progressPct =
    activeJob && activeJob.total > 0
      ? Math.round(((activeJob.completed + activeJob.failed) / activeJob.total) * 100)
      : 0;

  return (
    <header className="min-h-14 sm:h-16 shrink-0 bg-[#fffcf9]/95 backdrop-blur-sm border-b-2 border-[#cfc4bd] px-3 sm:px-5 py-1.5 safe-pt flex items-center justify-between gap-2 sm:gap-4 select-none">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-full bg-[#fde384] border-2 border-[#1f1a1d] shadow-[2px_2px_0_#1f1a1d] flex items-center justify-center text-[#1f1a1d] shrink-0 -rotate-3">
          <Microscope className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="font-marker text-2xl tracking-tight text-[#1f1a1d] leading-none flex items-baseline">
              <span className="hl-yellow inline-block -rotate-2 text-[26px]">Mi</span>
              <span className="hl-pink inline-block rotate-1 text-[26px]">C</span>
              <span>rolor</span>
              <span className="text-[#e5483e] inline-block rotate-6 ml-0.5 text-[24px]">!</span>
            </h1>
            <span className="hidden md:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#e6f6f1] text-[#256c5f] border-[1.5px] border-[#3f9a8a]">
              <ShieldCheck className="w-3.5 h-3.5" />
              Local-Only Lab
            </span>
          </div>
          <p className="text-xs text-[#544c50] truncate mt-0.5">
            Active preset:{' '}
            <span className="px-1.5 py-0.2 rounded bg-[#e3dcf7] text-[#1f1a1d] font-semibold">
              {activePresetName}
            </span>
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {isRunning && activeJob ? (
          <div className="flex items-center gap-3 bg-[#fffcf9] border-2 border-[#1f1a1d] shadow-[2px_2px_0_#1f1a1d] rounded-2xl px-3.5 py-1.5">
            <Loader2 className="w-4 h-4 text-[#e5483e] animate-spin shrink-0" />
            <div className="w-44">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-[#1f1a1d] font-semibold truncate max-w-[110px]">
                  {activeJob.currentFilename || 'Processing...'}
                </span>
                <span className="font-mono-sci text-[11px] text-[#1f1a1d] font-semibold">
                  {activeJob.completed + activeJob.failed}/{activeJob.total} ({progressPct}%)
                </span>
              </div>
              <div className="h-2 bg-[#f1e7e1] border border-[#1f1a1d] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#f8d2e0] transition-all duration-200"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
            <button
              onClick={() => onCancelJob(activeJob.jobId)}
              className="text-xs text-[#e5483e] hover:underline font-semibold flex items-center gap-1 px-1.5 py-0.5"
              title="Cancel batch processing"
            >
              <XCircle className="w-3.5 h-3.5" />
              Cancel
            </button>
          </div>
        ) : (
          <div className="hidden lg:flex items-center gap-3 text-sm text-[#544c50] bg-[#fffcf9] border-[1.6px] border-[#cfc4bd] rounded-full px-4 py-1">
            <span>
              <strong className="text-[#1f1a1d] font-mono-sci text-xs">{imageCount}</strong> slides
            </span>
            <span className="text-[#cfc4bd]">•</span>
            <span>
              <strong className="text-[#1f1a1d] font-mono-sci text-xs">{selectedCount}</strong>{' '}
              selected
            </span>
            <span className="text-[#cfc4bd]">•</span>
            <span className="inline-flex items-center gap-1 text-[#256c5f]">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <strong className="font-mono-sci text-xs">{processedCount}</strong> processed
            </span>
            <span className="text-[#cfc4bd]">•</span>
            <span className="font-mono-sci text-xs">{formatBytes(totalBytes)}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {onOpenColorDrawer && (
          <button
            type="button"
            onClick={onOpenColorDrawer}
            className="lg:hidden sketch-btn-pink inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold"
            title="Open color presets & sliders"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Colors</span>
          </button>
        )}
        <button
          disabled={imageCount === 0 || isRunning}
          onClick={onQuickProcessAll}
          className="sketch-btn-primary inline-flex items-center gap-1.5 px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-semibold disabled:opacity-45 disabled:cursor-not-allowed"
        >
          <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span className="hidden sm:inline">
            Process {selectedCount > 0 ? `Selected (${selectedCount})` : `All (${imageCount})`}
          </span>
          <span className="sm:hidden">
            Run ({selectedCount > 0 ? selectedCount : imageCount})
          </span>
        </button>
      </div>
    </header>
  );
};
