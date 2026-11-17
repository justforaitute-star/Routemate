import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../../utils/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-16 md:bottom-4 left-1/2 -translate-x-1/2 z-[1100] clear-glass-btn-amber px-3 py-1.5 rounded-full flex items-center gap-2 text-[11px] font-bold whitespace-nowrap shadow-lg"
    >
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>Offline Mode — Cached route data active</span>
    </div>
  );
};
