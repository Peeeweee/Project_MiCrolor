import React from 'react';
import { History, CheckCircle2, XCircle, Loader2, AlertTriangle, RotateCcw } from 'lucide-react';
import type { BatchJobStatus, ColorSettings } from '../types';
import { formatTimestamp } from '../utils/format';

interface BatchHistoryPanelProps {
  jobs: BatchJobStatus[];
  onLoadSettings: (settings: ColorSettings) => void;
}

export const BatchHistoryPanel: React.FC<BatchHistoryPanelProps> = ({ jobs, onLoadSettings }) => {
  return (
    <div className="h-full overflow-y-auto p-6 space-y-5">
      <div className="space-y-1">
        <h2 className="font-marker text-2xl text-[#1f1a1d] flex items-center gap-2">
          <History className="w-5 h-5 text-[#3f7de6]" />
          <span className="hl-lav">Batch Processing History</span>
        </h2>
        <p className="text-base text-[#544c50]">
          Track every batch run, inspect skipped/failed counts, and reload past color settings with
          one click.
        </p>
      </div>

      {jobs.length === 0 ? (
        <div className="p-10 rounded-3xl bg-[#fffcf9] border-2 border-dashed border-[#cfc4bd] text-center space-y-2">
          <History className="w-8 h-8 text-[#8f847d] mx-auto" />
          <p className="font-marker text-lg text-[#1f1a1d]">No batch jobs run yet</p>
          <p className="text-sm text-[#544c50]">
            Select your microscope photographs and click Process to see batch progress and history
            here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => {
            const statusIcon =
              job.status === 'completed' ? (
                <CheckCircle2 className="w-4 h-4 text-[#256c5f]" />
              ) : job.status === 'running' ? (
                <Loader2 className="w-4 h-4 text-[#e5483e] animate-spin" />
              ) : job.status === 'cancelled' ? (
                <AlertTriangle className="w-4 h-4 text-[#f39a2e]" />
              ) : (
                <XCircle className="w-4 h-4 text-[#e5483e]" />
              );

            return (
              <div
                key={job.jobId}
                className="sketch-card p-4 flex flex-wrap items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {statusIcon}
                    <span className="font-marker text-base text-[#1f1a1d]">{job.presetName}</span>
                    <span className="text-xs font-mono-sci px-2 py-0.5 rounded-full bg-[#f4eae3] text-[#544c50] border border-[#cfc4bd]">
                      #{job.jobId}
                    </span>
                    <span className="text-sm text-[#544c50] capitalize">· {job.status}</span>
                  </div>
                  <div className="text-xs text-[#544c50] font-mono-sci flex flex-wrap items-center gap-3">
                    <span>Total: {job.total}</span>
                    <span className="text-[#256c5f] font-semibold">Done: {job.completed}</span>
                    {job.skipped > 0 && <span className="text-[#3f7de6]">Cached: {job.skipped}</span>}
                    {job.failed > 0 && <span className="text-[#e5483e]">Failed: {job.failed}</span>}
                    <span>Started: {formatTimestamp(job.startedAt)}</span>
                    {job.finishedAt && <span>Finished: {formatTimestamp(job.finishedAt)}</span>}
                  </div>
                </div>

                <button
                  onClick={() => onLoadSettings(job.settings)}
                  className="sketch-btn inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-semibold"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reload Settings
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
