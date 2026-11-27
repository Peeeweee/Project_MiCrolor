import React from 'react';
import {
  UploadCloud,
  LayoutGrid,
  SplitSquareHorizontal,
  Palette,
  History,
  Download,
} from 'lucide-react';
import type { NavSection } from '../types';

interface LeftSidebarProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  imageCount: number;
  processedCount: number;
  presetCount: number;
  jobCount: number;
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  activeSection,
  onSelectSection,
  imageCount,
  processedCount,
  presetCount,
  jobCount,
}) => {
  const navItems: Array<{
    id: NavSection;
    label: string;
    icon: React.ReactNode;
    activeBg: string;
    badge?: string | number;
  }> = [
    { id: 'upload', label: 'Upload Slides', icon: <UploadCloud className="w-4 h-4" />, activeBg: 'bg-[#fde384]' },
    {
      id: 'library',
      label: 'Image Library',
      icon: <LayoutGrid className="w-4 h-4" />,
      activeBg: 'bg-[#f8d2e0]',
      badge: imageCount > 0 ? imageCount : undefined,
    },
    { id: 'preview', label: 'Preview & Compare', icon: <SplitSquareHorizontal className="w-4 h-4" />, activeBg: 'bg-[#e3dcf7]' },
    { id: 'presets', label: 'Color Presets', icon: <Palette className="w-4 h-4" />, activeBg: 'bg-[#fde384]', badge: presetCount },
    {
      id: 'history',
      label: 'Batch History',
      icon: <History className="w-4 h-4" />,
      activeBg: 'bg-[#e3dcf7]',
      badge: jobCount > 0 ? jobCount : undefined,
    },
    {
      id: 'export',
      label: 'Export Batch',
      icon: <Download className="w-4 h-4" />,
      activeBg: 'bg-[#e6f6f1]',
      badge: processedCount > 0 ? processedCount : undefined,
    },
  ];

  return (
    <aside className="w-56 shrink-0 bg-[#fdf6f2]/80 border-r-2 border-[#cfc4bd] flex flex-col justify-between py-4 px-3 select-none">
      <div className="space-y-1.5">
        <div className="px-2 pb-1.5 font-marker text-xs uppercase tracking-wider text-[#544c50]">
          Lab Steps
        </div>
        {navItems.map((item) => {
          const active = activeSection === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectSection(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-2xl text-[15px] font-medium transition ${
                active
                  ? `${item.activeBg} text-[#1f1a1d] border-[1.8px] border-[#1f1a1d] shadow-[2px_2.5px_0_#1f1a1d]`
                  : 'text-[#544c50] hover:bg-[#fffcf9] hover:text-[#1f1a1d] border-[1.5px] border-transparent hover:border-[#cfc4bd]'
              }`}
            >
              <span className="flex items-center gap-2.5">
                {item.icon}
                {item.label}
              </span>
              {item.badge !== undefined && (
                <span
                  className={`font-mono-sci text-[11px] px-2 py-0.5 rounded-full border ${
                    active
                      ? 'bg-[#fffcf9] text-[#1f1a1d] border-[#1f1a1d]'
                      : 'bg-[#f4eae3] text-[#544c50] border-[#cfc4bd]'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="sketch-card p-3.5 space-y-1.5 bg-[#fffcf9]">
        <div className="font-marker text-sm text-[#1f1a1d]">
          <span className="hl-mint">Lab Integrity</span>
        </div>
        <ul className="text-[13px] text-[#544c50] space-y-0.5 leading-snug">
          <li>✓ Zero AI fill or invention</li>
          <li>✓ Exact original dimensions</li>
          <li>✓ 16-bit TIFF &amp; lossless PNG</li>
          <li>✓ Blue &amp; orange rings intact</li>
        </ul>
      </div>
    </aside>
  );
};
