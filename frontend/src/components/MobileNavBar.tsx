import React from 'react';
import {
  LayoutGrid,
  SplitSquareHorizontal,
  SlidersHorizontal,
  UploadCloud,
  Download,
} from 'lucide-react';
import type { NavSection } from '../types';

interface MobileNavBarProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  onOpenColorDrawer: () => void;
  imageCount: number;
  processedCount: number;
}

export const MobileNavBar: React.FC<MobileNavBarProps> = ({
  activeSection,
  onSelectSection,
  onOpenColorDrawer,
  imageCount,
  processedCount,
}) => {
  const items: Array<{
    key: string;
    label: string;
    icon: React.ReactNode;
    active: boolean;
    badge?: number;
    onClick: () => void;
  }> = [
    {
      key: 'upload',
      label: 'Upload',
      icon: <UploadCloud className="w-4 h-4" />,
      active: activeSection === 'upload',
      onClick: () => onSelectSection('upload'),
    },
    {
      key: 'library',
      label: 'Library',
      icon: <LayoutGrid className="w-4 h-4" />,
      active: activeSection === 'library',
      badge: imageCount > 0 ? imageCount : undefined,
      onClick: () => onSelectSection('library'),
    },
    {
      key: 'color',
      label: 'Colors',
      icon: <SlidersHorizontal className="w-4 h-4" />,
      active: false,
      onClick: onOpenColorDrawer,
    },
    {
      key: 'preview',
      label: 'Compare',
      icon: <SplitSquareHorizontal className="w-4 h-4" />,
      active: activeSection === 'preview',
      onClick: () => onSelectSection('preview'),
    },
    {
      key: 'export',
      label: 'Export',
      icon: <Download className="w-4 h-4" />,
      active: activeSection === 'export',
      badge: processedCount > 0 ? processedCount : undefined,
      onClick: () => onSelectSection('export'),
    },
  ];

  return (
    <nav className="lg:hidden shrink-0 bg-[#fffcf9]/95 backdrop-blur-md border-t-2 border-[#cfc4bd] px-2 pt-1.5 safe-pb select-none z-30">
      <div className="grid grid-cols-5 gap-1">
        {items.map((item) => {
          const isColorBtn = item.key === 'color';
          return (
            <button
              key={item.key}
              type="button"
              onClick={item.onClick}
              className={`relative flex flex-col items-center justify-center py-1.5 px-1 rounded-xl text-[11px] font-semibold transition active:scale-95 ${
                isColorBtn
                  ? 'bg-[#f8d2e0] text-[#1f1a1d] border-[1.6px] border-[#1f1a1d] shadow-[1.5px_2px_0_#1f1a1d]'
                  : item.active
                  ? 'bg-[#fde384] text-[#1f1a1d] border-[1.5px] border-[#1f1a1d]'
                  : 'text-[#544c50] hover:bg-[#f4eae3]'
              }`}
            >
              {item.icon}
              <span className="mt-0.5 leading-none">{item.label}</span>
              {item.badge !== undefined && (
                <span className="absolute top-0.5 right-1.5 font-mono-sci text-[9px] px-1 rounded-full bg-[#1f1a1d] text-white leading-tight">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
