import React from 'react';
import { Palette, Trash2, CheckCircle2, Sparkles } from 'lucide-react';
import type { ColorSettings, PresetItem } from '../types';

interface PresetsPanelProps {
  presets: PresetItem[];
  activeSettings: ColorSettings;
  onSelectPreset: (preset: PresetItem) => void;
  onDeletePreset: (presetId: string) => void;
  onApplyPresetToAll: (preset: PresetItem) => void;
  imageCount: number;
}

export const PresetsPanel: React.FC<PresetsPanelProps> = ({
  presets,
  activeSettings,
  onSelectPreset,
  onDeletePreset,
  onApplyPresetToAll,
  imageCount,
}) => {
  const builtins = presets.filter((p) => !p.isCustom);
  const customs = presets.filter((p) => p.isCustom);

  const renderCard = (p: PresetItem) => {
    const isActive = activeSettings.presetId === p.id;
    return (
      <div
        key={p.id}
        className={`rounded-2xl p-4 bg-[#fffcf9] transition flex flex-col justify-between gap-3 ${
          isActive
            ? 'border-2 border-[#1f1a1d] shadow-[3px_3.5px_0_#1f1a1d]'
            : 'border-[1.7px] border-[#cfc4bd] hover:border-[#1f1a1d]'
        }`}
      >
        <div className="space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div
                className="w-10 h-10 rounded-xl border-2 border-[#1f1a1d] shadow-[1.5px_2px_0_#1f1a1d] shrink-0"
                style={{ backgroundColor: p.swatch }}
              />
              <div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h4 className="font-marker text-base text-[#1f1a1d]">{p.name}</h4>
                  {p.id === 'reference-rose-pink' && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#f8d2e0] text-[#1f1a1d] border border-[#1f1a1d]">
                      Calibrated
                    </span>
                  )}
                  {p.id === 'soft-pale-pink' && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#fde384] text-[#1f1a1d] border border-[#1f1a1d]">
                      Default
                    </span>
                  )}
                </div>
                <p className="text-[11px] font-mono-sci text-[#544c50]">
                  {p.settings.midtoneColor} · Intensity {p.settings.colorIntensity}%
                </p>
              </div>
            </div>
            {p.isCustom && (
              <button
                onClick={() => onDeletePreset(p.id)}
                className="p-1.5 rounded-lg text-[#544c50] hover:text-[#e5483e] hover:bg-[#fff0ef] transition"
                title="Delete custom preset"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
          <p className="text-sm text-[#544c50] leading-snug">{p.description}</p>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() => onSelectPreset(p)}
            className={`flex-1 py-1.5 px-2.5 rounded-xl text-sm font-semibold border-[1.6px] transition flex items-center justify-center gap-1.5 ${
              isActive
                ? 'bg-[#e3dcf7] border-[#1f1a1d] text-[#1f1a1d]'
                : 'bg-[#fffcf9] border-[#cfc4bd] text-[#1f1a1d] hover:border-[#1f1a1d]'
            }`}
          >
            {isActive && <CheckCircle2 className="w-4 h-4" />}
            {isActive ? 'Loaded' : 'Load Preset'}
          </button>
          <button
            disabled={imageCount === 0}
            onClick={() => onApplyPresetToAll(p)}
            className="sketch-btn-primary py-1.5 px-3 text-sm font-semibold disabled:opacity-40 flex items-center gap-1"
            title="Load and process all images with this preset"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Apply All
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div className="space-y-1">
        <h2 className="font-marker text-2xl text-[#1f1a1d] flex items-center gap-2">
          <Palette className="w-5 h-5 text-[#e5483e]" />
          <span className="hl-pink">Microscope Color Presets</span>
        </h2>
        <p className="text-base text-[#544c50]">
          Every preset uses chroma-preserving optical illumination tinting so whitish/grayish
          backgrounds shift cleanly while blue and orange specimen outlines remain intact.
        </p>
      </div>

      <section className="space-y-3">
        <h3 className="font-marker text-sm uppercase tracking-wider text-[#544c50]">
          Built-In Presets ({builtins.length})
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {builtins.map(renderCard)}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="font-marker text-sm uppercase tracking-wider text-[#544c50]">
          Saved Custom Presets ({customs.length})
        </h3>
        {customs.length === 0 ? (
          <div className="p-6 rounded-2xl bg-[#fffcf9] border-2 border-dashed border-[#cfc4bd] text-sm text-[#544c50]">
            No custom presets saved yet. Adjust the sliders in the right panel and click{' '}
            <strong className="text-[#1f1a1d]">Save Preset</strong> to store your own lab profile.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {customs.map(renderCard)}
          </div>
        )}
      </section>
    </div>
  );
};
