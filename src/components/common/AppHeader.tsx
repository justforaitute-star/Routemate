import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Bus, Bell, ChevronDown, Users, GraduationCap, Shield } from 'lucide-react';
import { RoleAndDemoSheet } from './RoleAndDemoSheet';
import { PWAInstallButton } from '../pwa/PWAInstallButton';
import { UserRole } from '../../types';

interface AppHeaderProps {
  onNotificationClick?: () => void;
}

const ROLE_SWITCH_OPTIONS: { role: UserRole; label: string; icon: any }[] = [
  { role: 'guardian', label: 'Parent', icon: Users },
  { role: 'driver', label: 'Driver', icon: Bus },
  { role: 'student', label: 'Student', icon: GraduationCap },
  { role: 'admin', label: 'Admin', icon: Shield },
];

export const AppHeader: React.FC<AppHeaderProps> = ({ onNotificationClick }) => {
  const { school, notifications, currentUser, currentRole, setCurrentRole } = useApp();
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const roleLabels: Record<string, string> = {
    guardian: 'Parent',
    student: 'Student',
    driver: 'Driver',
    admin: 'Admin',
  };

  return (
    <>
      <header className="sticky top-0 z-[1050] clear-glass-card border-x-0 border-t-0 rounded-none px-3.5 py-2 shrink-0 space-y-1.5 md:space-y-0">
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
                {school?.name || 'Oakridge Community Academy'} · {currentUser.name}
              </p>
            </div>
          </div>

          {/* Center (Desktop & Tablet): Direct Section Switcher (Parent / Driver / Student / Admin) */}
          <nav
            aria-label="Portal Sections"
            className="hidden md:grid grid-cols-4 gap-1 p-1 rounded-full bg-white/35 border border-white/65 shadow-2xs shrink-0"
          >
            {ROLE_SWITCH_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const isSelected = currentRole === opt.role;
              return (
                <button
                  key={opt.role}
                  type="button"
                  onClick={() => setCurrentRole(opt.role)}
                  data-testid={`header-role-${opt.role}`}
                  aria-current={isSelected ? 'page' : undefined}
                  className={`flex items-center justify-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                    isSelected
                      ? 'clear-glass-btn-primary shadow-xs'
                      : 'text-[#304C64]/80 hover:text-[#304C64] hover:bg-white/40'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Right: Install Action, Account Switcher Sheet & Alerts */}
          <div className="flex items-center gap-1.5 shrink-0">
            <PWAInstallButton variant="header" />
            <button
              type="button"
              onClick={() => setIsSheetOpen(true)}
              data-testid="open-account-sheet"
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

        {/* Mobile Compact Section Switcher */}
        <nav
          aria-label="Mobile Portal Sections"
          className="grid md:hidden grid-cols-4 gap-1 p-0.5 rounded-full bg-white/35 border border-white/65"
        >
          {ROLE_SWITCH_OPTIONS.map((opt) => {
            const isSelected = currentRole === opt.role;
            return (
              <button
                key={opt.role}
                type="button"
                onClick={() => setCurrentRole(opt.role)}
                data-testid={`mobile-role-${opt.role}`}
                aria-current={isSelected ? 'page' : undefined}
                className={`py-1 px-2 rounded-full text-[11px] font-bold transition-all whitespace-nowrap ${
                  isSelected
                    ? 'clear-glass-btn-primary'
                    : 'text-[#304C64]/80 hover:bg-white/35'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </nav>
      </header>

      <RoleAndDemoSheet isOpen={isSheetOpen} onClose={() => setIsSheetOpen(false)} />
    </>
  );
};
