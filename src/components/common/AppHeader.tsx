import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Bus, Bell, ChevronDown } from 'lucide-react';
import { RoleAndDemoSheet } from './RoleAndDemoSheet';
import { PWAInstallButton } from '../pwa/PWAInstallButton';

interface AppHeaderProps {
  onNotificationClick?: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({ onNotificationClick }) => {
  const {
    currentUser,
    currentRole,
    notifications,
  } = useApp();

  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const roleLabels: Record<string, string> = {
    guardian: 'Parent',
    student: 'Student',
    driver: 'Driver',
    admin: 'Admin',
  };

  return (
    <>
      <header className="sticky top-0 z-[1050] clear-glass-card border-x-0 border-t-0 rounded-none px-3.5 py-2 shrink-0">
        <div className="flex items-center justify-between gap-2">
          {/* Left: App Logo & Single-Line Greeting */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white clear-glass-btn-primary shrink-0">
              <Bus className="w-4 h-4 stroke-[2.2]" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-slate-500 leading-none truncate">
                {greeting}
              </p>
              <h1 className="text-xs sm:text-sm font-extrabold text-[#304C64] tracking-tight leading-tight truncate mt-0.5">
                {currentUser.name}
              </h1>
            </div>
          </div>

          {/* Right: Install Pill, Account / Role Switcher & Notification Bell */}
          <div className="flex items-center gap-1.5 shrink-0">
            <PWAInstallButton variant="header" />
            <button
              onClick={() => setIsSheetOpen(true)}
              aria-label="Account and Preferences"
              className="clear-glass-btn flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-bold text-[#304C64] whitespace-nowrap"
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: 'var(--primary)' }}
              />
              <span>{roleLabels[currentRole] || 'Account'}</span>
              <ChevronDown className="w-3 h-3 text-slate-500 shrink-0" />
            </button>

            <button
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
