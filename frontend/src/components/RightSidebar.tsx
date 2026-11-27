import React, { useState } from 'react';
import {
  RotateCcw,
  BookmarkPlus,
  Sparkles,
  CheckSquare,
  Info,
  Download,
  Sliders,
} from 'lucide-react';
import type { ColorSettings, ImageRecord, PresetItem } from '../types';
import { formatBytes } from '../utils/format';

interface RightSidebarProps {
  presets: PresetItem[];
  settings: ColorSettings;
  onChangeSettings: (next: ColorSettings) => void;
  onSelectPreset: (preset: PresetItem) => void;
  onReset: () => void;
  onSavePreset: (name: string, description: string) => Promise<void>;
  onApplyAll: () => void;
  onApplySelected: () => void;
  onGoExport: () => void;
  imageCount: number;
  selectedCount: number;
  isProcessing: boolean;
  activeImage: ImageRecord | null;
  inDrawer?: boolean;
}

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  onChange: (val: number) => void;
}

const SliderRow: React.FC<SliderRowProps> = ({ label, value, min, max, unit = '', onChange }) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between text-xs">
      <span className="text-[#544c50] font-medium">{label}</span>
      <span className="font-mono-sci text-[11px] font-semibold text-[#1f1a1d] bg-[#f4eae3] px-1.5 py-0.2 rounded border border-[#d9cdc6] tabular-nums">
        {value > 0 && min < 0 ? `+${value}` : value}
        {unit}
      </span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={1}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="studio-slider"
    />
  </div>
);

export const RightSidebar: React.FC<RightSidebarProps> = ({
  presets,
  settings,
  onChangeSettings,
  onSelectPreset,
  onReset,
  onSavePreset,
  onApplyAll,
  onApplySelected,
  onGoExport,
  imageCount,
  selectedCount,
  isProcessing,
  activeImage,
  inDrawer = false,
}) => {
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [presetDesc, setPresetDesc] = useState('');
  const [saving, setSaving] = useState(false);

  const updateField = <K extends keyof ColorSettings>(key: K, value: ColorSettings[K]) => {
    onChangeSettings({ ...settings, [key]: value });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!presetName.trim()) return;
    setSaving(true);
    try {
      await onSavePreset(presetName.trim(), presetDesc.trim());
      setPresetName('');
      setPresetDesc('');
      setShowSaveForm(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <aside
      className={
        inDrawer
          ? 'w-full h-full bg-[#fdf6f2] flex flex-col overflow-hidden'
          : 'hidden lg:flex w-84 shrink-0 bg-[#fdf6f2]/90 border-l-2 border-[#cfc4bd] flex-col overflow-hidden'
      }
    >
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
        <section className="sketch-card p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="font-marker text-sm text-[#1f1a1d]">
              <span className="hl-yellow">Color Presets</span>
            </h3>
            <button
              type="button"
              onClick={() => setShowSaveForm((v) => !v)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#3f7de6] hover:underline"
            >
              <BookmarkPlus className="w-3.5 h-3.5" />
              Save Preset
            </button>
          </div>

          {showSaveForm && (
            <form
              onSubmit={handleSave}
              className="p-2.5 rounded-xl bg-[#fdf6f2] border-[1.6px] border-[#1f1a1d] space-y-2"
            >
              <input
                type="text"
                placeholder="Preset name (e.g. Lab Pink 40x)"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-[#fffcf9] border border-[#cfc4bd] text-sm text-[#1f1a1d] focus:outline-none focus:border-[#1f1a1d]"
                required
              />
              <input
                type="text"
                placeholder="Optional note"
                value={presetDesc}
                onChange={(e) => setPresetDesc(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-[#fffcf9] border border-[#cfc4bd] text-sm text-[#1f1a1d] focus:outline-none focus:border-[#1f1a1d]"
              />
              <div className="flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowSaveForm(false)}
                  className="px-2.5 py-1 rounded-lg text-xs text-[#544c50] hover:text-[#1f1a1d]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !presetName.trim()}
                  className="sketch-btn-primary px-3 py-1 text-xs font-semibold disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-2 gap-1.5">
            {presets.map((p) => {
              const active = settings.presetId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onSelectPreset(p)}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-left text-[13px] transition border-[1.5px] ${
                    active
                      ? 'bg-[#e3dcf7] border-[#1f1a1d] text-[#1f1a1d] font-semibold shadow-[1.5px_2px_0_#1f1a1d]'
                      : 'bg-[#fffcf9] border-[#cfc4bd] text-[#544c50] hover:border-[#1f1a1d] hover:text-[#1f1a1d]'
                  }`}
                  title={p.description}
                >
                  <span
                    className="w-3.5 h-3.5 rounded-full shrink-0 border-[1.5px] border-[#1f1a1d]"
                    style={{ backgroundColor: p.swatch }}
                  />
                  <span className="truncate">{p.name}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="sketch-card p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-marker text-sm text-[#1f1a1d] flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-[#e5483e]" />
              <span className="hl-pink">Illumination Color</span>
            </span>
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#544c50] hover:text-[#e5483e] transition"
              title="Reset all adjustments to Neutral"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          </div>

          <div className="flex items-center gap-2.5">
            <label className="relative w-10 h-10 rounded-xl overflow-hidden border-2 border-[#1f1a1d] shadow-[1.5px_2px_0_#1f1a1d] cursor-pointer shrink-0">
              <input
                type="color"
                value={settings.midtoneColor}
                onChange={(e) =>
                  onChangeSettings({
                    ...settings,
                    presetId: 'custom-color',
                    midtoneColor: e.target.value.toUpperCase(),
                  })
                }
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <span
                className="block w-full h-full"
                style={{ backgroundColor: settings.midtoneColor }}
              />
            </label>
            <div className="flex-1">
              <div className="text-xs text-[#544c50] mb-0.5">Midtone / Field Color</div>
              <input
                type="text"
                value={settings.midtoneColor}
                onChange={(e) => {
                  const v = e.target.value.toUpperCase();
                  if (/^#[0-9A-F]{0,6}$/.test(v)) {
                    onChangeSettings({ ...settings, presetId: 'custom-color', midtoneColor: v });
                  }
                }}
                className="w-full px-2.5 py-1 rounded-lg bg-[#fdf6f2] border-[1.5px] border-[#cfc4bd] text-xs font-mono-sci text-[#1f1a1d] focus:outline-none focus:border-[#1f1a1d]"
              />
            </div>
          </div>

          <SliderRow
            label="Color Intensity"
            value={settings.colorIntensity}
            min={0}
            max={100}
            unit="%"
            onChange={(v) => updateField('colorIntensity', v)}
          />
        </section>

        <section className="sketch-card p-3 space-y-2.5">
          <div className="font-marker text-sm text-[#1f1a1d]">
            <span className="hl-lav">White Balance &amp; Color</span>
          </div>
          <SliderRow
            label="Temperature"
            value={settings.temperature}
            min={-100}
            max={100}
            onChange={(v) => updateField('temperature', v)}
          />
          <SliderRow
            label="Tint (Green ↔ Pink)"
            value={settings.tint}
            min={-100}
            max={100}
            onChange={(v) => updateField('tint', v)}
          />
          <SliderRow
            label="Hue"
            value={settings.hue}
            min={-180}
            max={180}
            unit="°"
            onChange={(v) => updateField('hue', v)}
          />
          <SliderRow
            label="Saturation"
            value={settings.saturation}
            min={-100}
            max={100}
            onChange={(v) => updateField('saturation', v)}
          />
        </section>

        <section className="sketch-card p-3 space-y-2.5">
          <div className="font-marker text-sm text-[#1f1a1d]">
            <span className="hl-yellow">Tone &amp; Exposure</span>
          </div>
          <SliderRow
            label="Brightness"
            value={settings.brightness}
            min={-100}
            max={100}
            onChange={(v) => updateField('brightness', v)}
          />
          <SliderRow
            label="Contrast"
            value={settings.contrast}
            min={-100}
            max={100}
            onChange={(v) => updateField('contrast', v)}
          />
          <SliderRow
            label="Highlights"
            value={settings.highlights}
            min={-100}
            max={100}
            onChange={(v) => updateField('highlights', v)}
          />
          <SliderRow
            label="Shadows"
            value={settings.shadows}
            min={-100}
            max={100}
            onChange={(v) => updateField('shadows', v)}
          />
        </section>

        {activeImage && (
          <section className="sketch-card p-3 space-y-1.5">
            <div className="font-marker text-sm text-[#1f1a1d] flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-[#3f7de6]" />
              <span className="hl-mint">The Slide</span>
            </div>
            <div className="grid grid-cols-2 gap-y-1 text-xs">
              <span className="text-[#544c50]">File</span>
              <span className="text-[#1f1a1d] font-semibold truncate text-right" title={activeImage.filename}>
                {activeImage.filename}
              </span>
              <span className="text-[#544c50]">Dimensions</span>
              <span className="text-[#1f1a1d] font-mono-sci text-[11px] text-right">
                {activeImage.width} × {activeImage.height}
              </span>
              <span className="text-[#544c50]">Format / Depth</span>
              <span className="text-[#1f1a1d] font-mono-sci text-[11px] text-right">
                {activeImage.format} ({activeImage.bitDepth}-bit)
              </span>
              <span className="text-[#544c50]">File Size</span>
              <span className="text-[#1f1a1d] font-mono-sci text-[11px] text-right">
                {formatBytes(activeImage.sizeBytes)}
              </span>
              <span className="text-[#544c50]">Color Mode</span>
              <span className="text-[#1f1a1d] font-mono-sci text-[11px] text-right">
                {activeImage.colorMode}
              </span>
            </div>
          </section>
        )}
      </div>

      <div className="p-3.5 border-t-2 border-[#cfc4bd] bg-[#fffcf9] space-y-2 shrink-0 safe-pb">
        <button
          type="button"
          disabled={imageCount === 0 || isProcessing}
          onClick={onApplyAll}
          className="sketch-btn-pink w-full py-2.5 px-3 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <Sparkles className="w-4 h-4" />
          Apply &amp; Process All ({imageCount})
        </button>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={selectedCount === 0 || isProcessing}
            onClick={onApplySelected}
            className="sketch-btn py-1.5 px-2.5 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
          >
            <CheckSquare className="w-3.5 h-3.5 text-[#1f1a1d]" />
            Selected ({selectedCount})
          </button>
          <button
            type="button"
            disabled={imageCount === 0}
            onClick={onGoExport}
            className="sketch-btn-primary py-1.5 px-2.5 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
        </div>
      </div>
    </aside>
  );
};
