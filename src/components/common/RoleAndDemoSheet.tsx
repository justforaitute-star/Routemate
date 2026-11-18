import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useApp } from '../../context/AppContext';
import { UserRole } from '../../types';
import {
  Users,
  GraduationCap,
  Bus,
  Shield,
  RotateCcw,
  X,
  Check,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { PaletteSelector } from './PaletteSelector';
import { PWAInstallButton } from '../pwa/PWAInstallButton';

interface RoleAndDemoSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

const DEMO_SHARE_URL = 'https://routemate-two.vercel.app/';

export const RoleAndDemoSheet: React.FC<RoleAndDemoSheetProps> = ({ isOpen, onClose }) => {
  const { currentRole, setCurrentRole, resetDemoData } = useApp();
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    if (!isOpen) return;

    QRCode.toDataURL(DEMO_SHARE_URL, {
      width: 240,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#1e3547',
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        // Ignore generation failure
      });

    return () => {
      active = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const accounts: { role: UserRole; label: string; name: string; icon: any }[] = [
    { role: 'guardian', label: 'Parent', name: 'Sarah Jenkins', icon: Users },
    { role: 'student', label: 'Student', name: 'Leo Jenkins', icon: GraduationCap },
    { role: 'driver', label: 'Driver', name: 'Marcus Vance', icon: Bus },
    { role: 'admin', label: 'Admin', name: 'Elena Rostova', icon: Shield },
  ];

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(DEMO_SHARE_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback ignored if clipboard unavailable
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1150] flex items-end sm:items-center justify-center bg-slate-900/30 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        data-testid="account-switching-sheet"
        className="w-full max-w-md liquid-glass-elevated rounded-t-3xl sm:rounded-3xl p-4 shadow-2xl max-h-[88vh] overflow-y-auto space-y-4"
      >
        <div className="w-10 h-1 bg-white/70 rounded-full mx-auto sm:hidden" />

        <div className="flex items-center justify-between pb-2.5 border-b border-white/50">
          <div>
            <h3 className="font-extrabold text-[#304C64] text-sm">Account &amp; Preferences</h3>
            <p className="text-[11px] text-slate-500">
              Switch demo account, scan live link, or customize theme
            </p>
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

        {/* Account Switching Grid */}
        <div className="space-y-1.5">
          <p className="text-[11px] font-bold text-slate-500">Switch Account</p>
          <div className="grid grid-cols-2 gap-2">
            {accounts.map((acc) => {
              const Icon = acc.icon;
              const isSelected = currentRole === acc.role;
              return (
                <button
                  key={acc.role}
                  type="button"
                  onClick={() => {
                    setCurrentRole(acc.role);
                    onClose();
                  }}
                  className={`flex items-center justify-between gap-2 p-2.5 rounded-xl text-left transition-all ${
                    isSelected ? 'clear-glass-btn-primary' : 'clear-glass-btn'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                        isSelected
                          ? 'bg-white/25 text-white border border-white/50'
                          : 'bg-white/45 text-[#304C64] border border-white/60'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p
                        className={`text-[11px] font-extrabold leading-tight truncate ${
                          isSelected ? 'text-white' : 'text-[#304C64]'
                        }`}
                      >
                        {acc.label}
                      </p>
                      <p
                        className={`text-[10px] leading-tight truncate ${
                          isSelected ? 'text-white/85' : 'text-slate-500'
                        }`}
                      >
                        {acc.name}
                      </p>
                    </div>
                  </div>
                  {isSelected && (
                    <span className="w-4 h-4 rounded-full bg-white text-[#26788E] flex items-center justify-center shrink-0">
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Scannable Demo URL QR Code */}
        <div className="pt-3 border-t border-white/50">
          <div
            data-testid="demo-qr-card"
            className="flex items-center gap-3.5 p-3 rounded-2xl bg-white/45 border border-white/80 shadow-xs"
          >
            <div className="w-24 h-24 rounded-xl bg-white p-1.5 border border-slate-200/70 shadow-xs shrink-0 flex items-center justify-center">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="QR code leading to https://routemate-two.vercel.app/"
                  data-testid="demo-qr-image"
                  className="w-full h-full object-contain rounded-md"
                />
              ) : (
                <div className="w-full h-full rounded-md bg-slate-100 animate-pulse" />
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="text-xs font-extrabold text-[#304C64]">Scan to Open RouteMate</p>
              <p className="text-[11px] text-slate-600 leading-snug">
                Scan with your phone or tablet camera to launch the live demo.
              </p>
              <a
                href={DEMO_SHARE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-bold text-[#26788E] hover:underline break-all"
              >
                <span>{DEMO_SHARE_URL}</span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
              <div>
                <button
                  type="button"
                  onClick={() => void handleCopyUrl()}
                  className="clear-glass-btn inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold text-[#304C64]"
                >
                  {copied ? (
                    <>
                      <Check className="w-3 h-3 text-[#059669]" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy Link</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Theme Palette Selector */}
        <div className="pt-3 border-t border-white/50">
          <PaletteSelector />
        </div>

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
