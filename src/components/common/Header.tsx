import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { UserRole } from '../../types';
import {
  Bus,
  Shield,
  GraduationCap,
  Users,
  Radio,
  Play,
  Pause,
  RotateCcw,
  Bell,
  Wifi,
  WifiOff,
  Navigation,
  Info,
  CheckCircle2,
  Clock,
  Sparkles,
  Smartphone,
} from 'lucide-react';
import { requestPushPermission } from '../../utils/pushNotifications';

export const Header: React.FC = () => {
  const {
    school,
    currentRole,
    setCurrentRole,
    currentUser,
    networkStatus,
    isDemoMode,
    setIsDemoMode,
    isRealGpsActive,
    setIsRealGpsActive,
    notifications,
    markNotificationRead,
    isSimulationRunning,
    toggleSimulation,
    advanceSimulationStep,
    resetDemoData,
    activeTrip,
  } = useApp();

  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [pushStatus, setPushStatus] = useState<string>('idle');

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleEnablePush = async () => {
    const res = await requestPushPermission();
    setPushStatus(res);
  };

  const roles: { role: UserRole; label: string; icon: any }[] = [
    { role: 'guardian', label: 'Parent / Guardian', icon: Users },
    { role: 'student', label: 'Student', icon: GraduationCap },
    { role: 'driver', label: 'Bus Driver', icon: Bus },
    { role: 'admin', label: 'School Admin', icon: Shield },
  ];

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Logo & School Branding */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-600 to-teal-500 flex items-center justify-center text-white shadow-md shadow-teal-500/20">
              <Bus className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-slate-900 tracking-tight text-lg">RouteMate</span>
                <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200">
                  LIVE
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium truncate max-w-[180px] sm:max-w-xs">
                {school?.name || 'Oakridge Academy'}
              </p>
            </div>
          </div>

          {/* Role Switcher Pills */}
          <nav aria-label="Role switcher" className="hidden md:flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/60">
            {roles.map((r) => {
              const Icon = r.icon;
              const isActive = currentRole === r.role;
              return (
                <button
                  key={r.role}
                  onClick={() => setCurrentRole(r.role)}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-white text-slate-900 shadow-xs border border-slate-200/70'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-teal-600' : 'text-slate-400'}`} />
                  <span>{r.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Right Action Tools: Simulation Control, GPS, Notifications & User */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Demo Simulation Controls */}
            {isDemoMode && (
              <div className="hidden lg:flex items-center gap-1.5 bg-slate-100/80 px-2 py-1 rounded-xl border border-slate-200 text-xs">
                <span className="text-[11px] font-semibold text-slate-500 px-1">Sim:</span>
                <button
                  onClick={toggleSimulation}
                  title={isSimulationRunning ? 'Pause Movement' : 'Auto Move Bus'}
                  aria-label={isSimulationRunning ? 'Pause Movement' : 'Auto Move Bus'}
                  className={`p-1.5 rounded-lg flex items-center gap-1 text-[11px] font-semibold transition-colors ${
                    isSimulationRunning
                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-teal-50 hover:text-teal-700'
                  }`}
                >
                  {isSimulationRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{isSimulationRunning ? 'Running' : 'Drive'}</span>
                </button>

                <button
                  onClick={advanceSimulationStep}
                  title="Step 1 Stop Ahead"
                  aria-label="Step 1 Stop Ahead"
                  className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-[11px] font-semibold"
                >
                  Step
                </button>

                <button
                  onClick={resetDemoData}
                  title="Reset Demo State"
                  aria-label="Reset Demo State"
                  className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-slate-800"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Network SSE Status Indicator */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${
                networkStatus === 'connected'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border-rose-200'
              }`}
              title={networkStatus === 'connected' ? 'Connected to live transport stream' : 'Connection lost - retrying'}
            >
              {networkStatus === 'connected' ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="hidden xl:inline text-[11px] font-semibold">Live SSE</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5" />
                  <span className="hidden xl:inline text-[11px] font-semibold">Offline</span>
                </>
              )}
            </div>

            {/* Notification Bell Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowNotifMenu(!showNotifMenu)}
                title="Notifications"
                aria-label="Notifications"
                className="relative p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-teal-600 text-white text-[10px] font-bold flex items-center justify-center animate-bounce">
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Notification Menu Card */}
              {showNotifMenu && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-slate-200 p-4 z-50">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-sm text-slate-900">Transportation Alerts</h4>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800">
                        {unreadCount} new
                      </span>
                    </div>
                    <button
                      onClick={handleEnablePush}
                      className="text-[11px] font-semibold text-teal-600 hover:text-teal-700 flex items-center gap-1"
                    >
                      <Smartphone className="w-3 h-3" />
                      Push {pushStatus === 'granted' ? 'Active' : 'Alerts'}
                    </button>
                  </div>

                  <div className="mt-3 max-h-72 overflow-y-auto space-y-2.5">
                    {notifications.length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-6">No notifications yet</p>
                    ) : (
                      notifications.slice(0, 10).map((n) => (
                        <div
                          key={n.id}
                          onClick={() => markNotificationRead(n.id)}
                          className={`p-3 rounded-xl border text-xs cursor-pointer transition-colors ${
                            !n.isRead
                              ? 'bg-teal-50/50 border-teal-200/70'
                              : 'bg-white border-slate-100 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-bold text-slate-900">{n.title}</span>
                            <span className="text-[10px] text-slate-400 whitespace-nowrap">
                              {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-slate-600 mt-1 leading-relaxed">{n.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* User Profile Avatar */}
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
              {currentUser.avatarUrl ? (
                <img
                  src={currentUser.avatarUrl}
                  alt={currentUser.name}
                  className="w-8 h-8 rounded-full object-cover border border-slate-200"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-slate-800 text-white font-bold text-xs flex items-center justify-center">
                  {currentUser.name[0]}
                </div>
              )}
              <div className="hidden lg:block text-left">
                <p className="text-xs font-bold text-slate-900 leading-tight">{currentUser.name}</p>
                <p className="text-[10px] text-slate-500 capitalize">{currentRole}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Role Switcher */}
        <div className="flex md:hidden overflow-x-auto py-2 gap-1 border-t border-slate-100">
          {roles.map((r) => {
            const Icon = r.icon;
            const isActive = currentRole === r.role;
            return (
              <button
                key={r.role}
                onClick={() => setCurrentRole(r.role)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-teal-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{r.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
