import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Bus, Bell, SlidersHorizontal } from 'lucide-react';
import { RoleAndDemoSheet } from './RoleAndDemoSheet';
import { PWAInstallButton } from '../pwa/PWAInstallButton';

interface AppHeaderProps {
  onNotificationClick?: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({ onNotificationClick }) => {
  const { school, notifications } = useApp();
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <>
      <header className="sticky top-0 z-[1050] clear-glass-card border-x-0 border-t-0 rounded-none px-3.5 py-2 shrink-0">
        <div className="flex items-center justify-between gap-2">
          {/* Left: App Brand & School Context */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white clear-glass-btn-primary shrink-0">
              <Bus className="w-4 h-4 stroke-[2.2]" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xs sm:text-sm font-extrabold text-[#304C64] tracking-tight leading-tight truncate">
                RouteMate
              </h1>
              <p className="text-[10px] font-semibold text-slate-500 leading-none truncate mt-0.5">
                {school?.name || 'Oakridge Community Academy'}
              </p>
            </div>
          </div>

          {/* Right: Install Action, Customize Sheet & Alerts */}
          <div className="flex items-center gap-1.5 shrink-0">
            <PWAInstallButton variant="header" />
            <button
              type="button"
              onClick={() => setIsSheetOpen(true)}
              aria-label="Customize Demo and Theme"
              className="clear-glass-btn flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-bold text-[#304C64] whitespace-nowrap"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#26788E] shrink-0" />
              <span>Theme</span>
            </button>

            <button
              type="button"
              onClick={onNotificationClick}
              aria-label="Notifications"
              className="clear-glass-btn relative w-8 h-8 rounded-full flex items-center justify-center text-[#304C64] shrink-0"
            >
              <Bell className="w-3.5 h-3.5" />
              {unreadCount > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 min-w-3.5 h-3.5 px-0.5 rounded-full text-white text-[9px] font-extrabold flex items-center justify-center shadow-xs"
                  style={{ backgroundColor: 'var(--accent-amber, #E2480C)' }}
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <RoleAndDemoSheet isOpen={isSheetOpen} onClose={() => setIsSheetOpen(false)} />
    </>
  );
};
