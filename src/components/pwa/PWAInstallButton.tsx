import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Smartphone, Share, MoreVertical, CheckCircle2, X } from 'lucide-react';
import { usePWAInstall } from '../../utils/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'header' | 'card';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'header' }) => {
  const { isInstallable, isInstalled, isAndroid, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  // Never show when already launched as an installed standalone Android/iOS app
  if (isInstalled) {
    return null;
  }

  const handleAction = async () => {
    if (isInstallable) {
      await install();
    } else {
      setShowGuide(true);
    }
  };

  // Header variant: compact clear-glass pill shown on mobile/Android/iOS or when browser prompt is ready
  if (variant === 'header') {
    if (!isInstallable && !isAndroid && !isIOS) {
      return null;
    }

    return (
      <>
        <button
          onClick={handleAction}
          aria-label="Install RouteMate App"
          className="clear-glass-btn-primary flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap shrink-0"
        >
          <Download className="w-3 h-3 shrink-0" />
          <span>Install</span>
        </button>

        {showGuide && renderGuideModal()}
      </>
    );
  }

  function renderGuideModal() {
    if (typeof document === 'undefined') return null;

    return createPortal(
      <div
        className="fixed inset-0 z-[1200] flex items-end sm:items-center justify-center bg-slate-900/35 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in"
        onClick={(e) => {
          if (e.target === e.currentTarget) setShowGuide(false);
        }}
      >
        <div className="w-full max-w-sm liquid-glass-elevated rounded-t-3xl sm:rounded-3xl p-4 shadow-2xl space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-white/50">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl clear-glass-btn-primary flex items-center justify-center shrink-0">
                <Smartphone className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-extrabold text-[#304C64] text-sm">
                  {isIOS ? 'Install on iPhone / iPad' : 'Install RouteMate on Android'}
                </h3>
                <p className="text-[11px] text-slate-500">Full-screen standalone app & offline cache</p>
              </div>
            </div>
            <button
              onClick={() => setShowGuide(false)}
              aria-label="Close install guide"
              className="w-7 h-7 rounded-full clear-glass-btn flex items-center justify-center text-[#304C64]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {isIOS ? (
            <ol className="space-y-2 text-xs text-[#304C64]">
              <li className="flex items-start gap-2 p-2.5 rounded-xl bg-white/30 border border-white/60">
                <Share className="w-4 h-4 text-[var(--primary)] shrink-0 mt-0.5" />
                <span>
                  1. Tap the <strong>Share</strong> button in Safari&apos;s toolbar.
                </span>
              </li>
              <li className="flex items-start gap-2 p-2.5 rounded-xl bg-white/30 border border-white/60">
                <CheckCircle2 className="w-4 h-4 text-[var(--primary)] shrink-0 mt-0.5" />
                <span>
                  2. Scroll down and select <strong>Add to Home Screen</strong>.
                </span>
              </li>
            </ol>
          ) : (
            <ol className="space-y-2 text-xs text-[#304C64]">
              <li className="flex items-start gap-2 p-2.5 rounded-xl bg-white/30 border border-white/60">
                <MoreVertical className="w-4 h-4 text-[var(--primary)] shrink-0 mt-0.5" />
                <span>
                  1. Open this link in <strong>Chrome for Android</strong> and tap the <strong>⋮ Menu</strong> button.
                </span>
              </li>
              <li className="flex items-start gap-2 p-2.5 rounded-xl bg-white/30 border border-white/60">
                <Download className="w-4 h-4 text-[var(--primary)] shrink-0 mt-0.5" />
                <span>
                  2. Tap <strong>Install app</strong> or <strong>Add to Home screen</strong> to add RouteMate to your Android launcher.
                </span>
              </li>
            </ol>
          )}

          <button
            onClick={() => setShowGuide(false)}
            className="clear-glass-btn-primary w-full py-2 rounded-xl text-xs font-bold"
          >
            Got it
          </button>
        </div>
      </div>,
      document.body
    );
  }

  // Card variant: always shown inside Account & Preferences sheet when not yet installed
  return (
    <>
      <div className="pt-3 border-t border-white/50 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold text-slate-500">Android & Mobile App</span>
          <span className="text-[10px] font-bold text-[var(--primary)]">
            {isInstallable ? 'Ready to install' : 'Standalone App'}
          </span>
        </div>

        <button
          onClick={handleAction}
          className="clear-glass-btn-primary w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-xs font-bold"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Smartphone className="w-4 h-4 shrink-0" />
            <span className="truncate">
              {isInstallable
                ? 'Install RouteMate App'
                : isIOS
                ? 'Add to iPhone Home Screen'
                : 'Install Android App'}
            </span>
          </div>
          <Download className="w-3.5 h-3.5 shrink-0" />
        </button>
      </div>

      {showGuide && renderGuideModal()}
    </>
  );
};
