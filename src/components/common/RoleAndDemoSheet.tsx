import React from 'react';
import { useApp } from '../../context/AppContext';
import { RotateCcw, X } from 'lucide-react';
import { PaletteSelector } from './PaletteSelector';
import { PWAInstallButton } from '../pwa/PWAInstallButton';

interface RoleAndDemoSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RoleAndDemoSheet: React.FC<RoleAndDemoSheetProps> = ({ isOpen, onClose }) => {
  const { resetDemoData } = useApp();

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[1150] flex items-end sm:items-center justify-center bg-slate-900/30 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md liquid-glass-elevated rounded-t-3xl sm:rounded-3xl p-4 shadow-2xl max-h-[85vh] overflow-y-auto space-y-4">
        <div className="w-10 h-1 bg-white/70 rounded-full mx-auto sm:hidden" />

        <div className="flex items-center justify-between pb-2.5 border-b border-white/50">
          <div>
            <h3 className="font-extrabold text-[#304C64] text-sm">Customize & Demo Controls</h3>
            <p className="text-[11px] text-slate-500">Appearance theme, app install & demo state</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sheet"
            className="w-8 h-8 rounded-full clear-glass-btn flex items-center justify-center text-[#304C64]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Theme Palette Selector */}
        <PaletteSelector />

        {/* Reset Demo Data */}
        <div className="pt-3 border-t border-white/50">
          <button
            type="button"
            onClick={() => {
              void resetDemoData();
              onClose();
            }}
            className="clear-glass-btn w-full flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-[#304C64] text-xs font-bold whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5 shrink-0" />
            <span>Reset Demo Data</span>
          </button>
        </div>

        {/* Android & Mobile App Install */}
        <PWAInstallButton variant="card" />
      </div>
    </div>
  );
};
