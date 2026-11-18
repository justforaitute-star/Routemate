import React from 'react';
import { useApp } from '../../context/AppContext';
import { ColorPalette } from '../../types';
import { Check, Palette } from 'lucide-react';

interface PaletteSelectorProps {
  compact?: boolean;
}

export const palettesConfig: {
  id: ColorPalette;
  name: string;
  subtitle: string;
  previewColors: string[];
  primaryHex: string;
}[] = [
  {
    id: 'turquoise',
    name: 'Turquoise Autumn',
    subtitle: 'Seafoam teal & amber',
    previewColors: ['#304C64', '#26788E', '#A4CCD4', '#E2480C'],
    primaryHex: '#26788E',
  },
  {
    id: 'amber',
    name: 'School Bus Honey',
    subtitle: 'Classic gold & navy',
    previewColors: ['#f59e0b', '#d97706', '#fef3c7', '#0f172a'],
    primaryHex: '#d97706',
  },
  {
    id: 'azure',
    name: 'Electric Azure',
    subtitle: 'Navigation blue & gold',
    previewColors: ['#2563eb', '#3b82f6', '#dbeafe', '#f59e0b'],
    primaryHex: '#2563eb',
  },
  {
    id: 'emerald',
    name: 'Nordic Pine',
    subtitle: 'Safety green & amber',
    previewColors: ['#059669', '#10b981', '#d1fae5', '#d97706'],
    primaryHex: '#059669',
  },
  {
    id: 'coral',
    name: 'Sunset Coral',
    subtitle: 'Warm rose & gold',
    previewColors: ['#e11d48', '#f43f5e', '#ffe4e6', '#f59e0b'],
    primaryHex: '#e11d48',
  },
];

export const PaletteSelector: React.FC<PaletteSelectorProps> = ({ compact = false }) => {
  const { colorPalette, setColorPalette } = useApp();

  if (compact) {
    return (
      <div className="flex items-center gap-1.5 p-1 rounded-full clear-glass-card">
        {palettesConfig.map((p) => {
          const isSelected = colorPalette === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setColorPalette(p.id)}
              title={p.name}
              aria-label={`Select ${p.name} palette`}
              className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                isSelected
                  ? 'ring-2 ring-white scale-110 shadow-xs'
                  : 'hover:scale-105 opacity-80 hover:opacity-100'
              }`}
              style={{ backgroundColor: p.primaryHex }}
            >
              {isSelected && <Check className="w-2.5 h-2.5 text-white stroke-[3]" />}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-bold text-[#304C64]">
        <Palette className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} />
        <span>Theme Palette</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {palettesConfig.map((p) => {
          const isSelected = colorPalette === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setColorPalette(p.id)}
              className={`p-2.5 rounded-xl text-left transition-all relative last:col-span-2 ${
                isSelected
                  ? 'clear-glass-btn-primary'
                  : 'clear-glass-btn'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex -space-x-1">
                  {p.previewColors.map((hex, i) => (
                    <span
                      key={i}
                      className="w-3 h-3 rounded-full border border-white/90 shadow-2xs"
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                </div>
                {isSelected && (
                  <span className="w-3.5 h-3.5 rounded-full bg-white text-[#26788E] flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </span>
                )}
              </div>
              <h5 className={`font-bold text-[11px] leading-tight ${isSelected ? 'text-white' : 'text-[#304C64]'}`}>
                {p.name}
              </h5>
              <p className={`text-[10px] leading-tight mt-0.5 ${isSelected ? 'text-white/85' : 'text-slate-500'}`}>
                {p.subtitle}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
};
