import React from 'react';
import { useApp } from '../../context/AppContext';
import {
  Home,
  MapPin,
  Bell,
  User,
  Navigation,
  CheckSquare,
  History,
  Activity,
  Sliders,
  Users,
} from 'lucide-react';

interface BottomNavigationProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export const BottomNavigation: React.FC<BottomNavigationProps> = ({ activeTab, onTabChange }) => {
  const { currentRole, notifications } = useApp();

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const getTabs = () => {
    switch (currentRole) {
      case 'driver':
        return [
          { id: 'journey', label: 'Journey', icon: Navigation },
          { id: 'stops', label: 'Stops', icon: CheckSquare },
          { id: 'history', label: 'History', icon: History },
          { id: 'profile', label: 'Profile', icon: User },
        ];
      case 'student':
        return [
          { id: 'home', label: 'Home', icon: Home },
          { id: 'map', label: 'Map', icon: MapPin },
          { id: 'alerts', label: 'Alerts', icon: Bell, badge: unreadCount },
          { id: 'profile', label: 'Profile', icon: User },
        ];
      case 'admin':
        return [
          { id: 'overview', label: 'Overview', icon: Activity },
          { id: 'fleet', label: 'Map', icon: MapPin },
          { id: 'roster', label: 'Roster', icon: Users },
          { id: 'settings', label: 'Settings', icon: Sliders },
        ];
      case 'guardian':
      default:
        return [
          { id: 'home', label: 'Home', icon: Home },
          { id: 'map', label: 'Map', icon: MapPin },
          { id: 'notifications', label: 'Alerts', icon: Bell, badge: unreadCount },
          { id: 'profile', label: 'Profile', icon: User },
        ];
    }
  };

  const tabs = getTabs();

  return (
    <div className="md:hidden shrink-0 z-[1050] px-3 pb-[max(0.625rem,env(safe-area-inset-bottom))] pt-1.5">
      <nav
        aria-label="Mobile Navigation"
        className="clear-glass-card rounded-2xl p-1"
      >
        <div className="grid grid-cols-4 items-center gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`relative flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all whitespace-nowrap ${
                  isActive
                    ? 'clear-glass-btn-primary font-bold'
                    : 'text-[#304C64]/70 hover:text-[#304C64] font-semibold hover:bg-white/25'
                }`}
              >
                <div className="relative">
                  <Icon className={`w-4 h-4 ${isActive ? 'stroke-[2.4]' : 'stroke-[1.9]'}`} />
                  {Boolean(tab.badge && tab.badge > 0) && (
                    <span
                      className="absolute -top-1 -right-2 min-w-3.5 h-3.5 px-0.5 rounded-full text-white text-[8px] font-extrabold flex items-center justify-center shadow-xs"
                      style={{ backgroundColor: 'var(--accent-amber, #E2480C)' }}
                    >
                      {tab.badge! > 9 ? '9+' : tab.badge}
                    </span>
                  )}
                </div>
                <span className="text-[10px] tracking-tight mt-0.5 leading-none">
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
