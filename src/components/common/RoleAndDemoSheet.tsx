import React from 'react';
import { useApp } from '../../context/AppContext';
import { UserRole } from '../../types';
import {
  Users,
  GraduationCap,
  Bus,
  Shield,
  Play,
  Pause,
  RotateCcw,
  FastForward,
  X,
  Check,
} from 'lucide-react';
import { PaletteSelector } from './PaletteSelector';
import { PWAInstallButton } from '../pwa/PWAInstallButton';

interface RoleAndDemoSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RoleAndDemoSheet: React.FC<RoleAndDemoSheetProps> = ({ isOpen, onClose }) => {
  const {
    currentRole,
    setCurrentRole,
    isSimulationRunning,
    toggleSimulation,
    advanceSimulationStep,
    resetDemoData,
  } = useApp();

  if (!isOpen) return null;

  const roles: { role: UserRole; title: string; subtitle: string; icon: any }[] = [
    {
      role: 'guardian',
      title: 'Parent / Guardian',
      subtitle: 'Live bus ETA, alerts & child pickup',
      icon: Users,
    },
    {
      role: 'student',
      title: 'Student',
      subtitle: 'Bus arrival countdown & transit pass',
      icon: GraduationCap,
    },
    {
      role: 'driver',
      title: 'Bus Driver',
      subtitle: 'Route navigation, boarding & incidents',
      icon: Bus,
    },
    {
      role: 'admin',
      title: 'Administrator',
      subtitle: 'Fleet overview, roster & geofence rules',
      icon: Shield,
    },
  ];

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
            <h3 className="font-extrabold text-[#304C64] text-sm">Account & Preferences</h3>
            <p className="text-[11px] text-slate-500">Switch view role or customize theme</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close sheet"
            className="w-7 h-7 rounded-full clear-glass-btn flex items-center justify-center text-[#304C64]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Roles List */}
        <div className="space-y-1.5">
          <p className="text-[11px] font-bold text-slate-500">Select View Role</p>
          {roles.map((r) => {
            const Icon = r.icon;
            const isSelected = currentRole === r.role;
            return (
              <button
                key={r.role}
                onClick={() => {
                  setCurrentRole(r.role);
                  onClose();
                }}
                className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all ${
                  isSelected ? 'clear-glass-btn-primary' : 'clear-glass-btn'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      isSelected
                        ? 'bg-white/25 text-white border border-white/50'
                        : 'bg-white/40 text-[#304C64] border border-white/60'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h4 className={`text-xs font-bold leading-tight ${isSelected ? 'text-white' : 'text-[#304C64]'}`}>
                      {r.title}
                    </h4>
                    <p className={`text-[11px] leading-tight truncate ${isSelected ? 'text-white/85' : 'text-slate-500'}`}>
                      {r.subtitle}
                    </p>
                  </div>
                </div>
                {isSelected && (
                  <div className="w-5 h-5 rounded-full bg-white text-[#26788E] flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Theme Palette Selector */}
        <div className="pt-3 border-t border-white/50">
          <PaletteSelector />
        </div>

        {/* Route Playback Controls */}
        <div className="pt-3 border-t border-white/50 space-y-2">
          <div>
            <span className="text-[11px] font-bold text-slate-500">Live Route Playback</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => advanceSimulationStep()}
              className="clear-glass-btn-primary flex items-center justify-center gap-1 py-2 px-2.5 rounded-xl text-xs font-bold whitespace-nowrap"
            >
              <FastForward className="w-3.5 h-3.5 shrink-0" />
              <span>Next Stop</span>
            </button>

            <button
              onClick={() => toggleSimulation()}
              className={`clear-glass-btn flex items-center justify-center gap-1 py-2 px-2.5 rounded-xl text-xs font-bold whitespace-nowrap ${
                isSimulationRunning ? 'text-[#E2480C]' : 'text-[#304C64]'
              }`}
            >
              {isSimulationRunning ? <Pause className="w-3.5 h-3.5 shrink-0" /> : <Play className="w-3.5 h-3.5 shrink-0" />}
              <span>{isSimulationRunning ? 'Pause' : 'Auto-Run'}</span>
            </button>

            <button
              onClick={() => {
                resetDemoData();
                onClose();
              }}
              className="clear-glass-btn flex items-center justify-center gap-1 py-2 px-2.5 rounded-xl text-[#304C64] text-xs font-bold whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Android & Mobile App Install */}
        <PWAInstallButton variant="card" />
      </div>
    </div>
  );
};
