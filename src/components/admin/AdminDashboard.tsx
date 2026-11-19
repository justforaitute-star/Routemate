import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { LiveBusMap } from '../map/LiveBusMap';
import { PaletteSelector } from '../common/PaletteSelector';
import { Avatar } from '../common/Avatar';
import { useMediaQuery } from '../../utils/useMediaQuery';
import {
  Check,
  Search,
  Gauge,
  Radio,
  Shield,
  Bell,
} from 'lucide-react';
import { NotificationThresholds } from '../../types';

interface AdminDashboardProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ activeTab, onTabChange }) => {
  const {
    school,
    buses,
    routes,
    students,
    trips,
    locations,
    boardingRecords,
    notifications,
    markNotificationRead,
    activeBus,
    activeLocation,
    isBusLocationStale,
    updateThresholds,
  } = useApp();

  const isWideScreen = useMediaQuery('(min-width: 768px)');

  const [thresholds, setThresholds] = useState<NotificationThresholds>(
    school?.thresholds || {
      earlyWarningMeters: 2000,
      approachingMeters: 1000,
      nearbyMeters: 500,
      arrivalMeters: 80,
    }
  );
  const [thresholdSaved, setThresholdSaved] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const handleSaveThresholds = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateThresholds(thresholds);
    setThresholdSaved(true);
    setTimeout(() => setThresholdSaved(false), 2000);
  };

  const activeBusesCount = buses.filter((b) => b.status === 'active').length;
  const totalBoardedCount = boardingRecords.filter((r) => r.status === 'boarded').length;

  const renderRoleBanner = () => (
    <div className="clear-glass-card rounded-2xl px-3.5 py-2.5 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-8 h-8 rounded-xl clear-glass-btn-primary flex items-center justify-center shrink-0">
          <Shield className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <h2 className="text-xs font-extrabold text-[#304C64] tracking-tight truncate">
            Dispatch Console
          </h2>
          <p className="text-[10px] font-medium text-slate-500 truncate">
            Elena Rostova · {buses.length} District Vehicles
          </p>
        </div>
      </div>
      <span className="text-[11px] font-extrabold text-emerald-700 whitespace-nowrap shrink-0">
        {activeBusesCount} Active
      </span>
    </div>
  );

  // --- SUBVIEW: ALERTS ---
  const renderDispatchAlerts = () => (
    <div className="space-y-2.5 animate-in fade-in duration-200">
      <div>
        <h2 className="text-sm font-extrabold text-[#304C64] tracking-tight">District Alert Feed</h2>
        <p className="text-[11px] text-slate-500">Live route incidents &amp; proximity dispatches</p>
      </div>
      {notifications.length === 0 ? (
        <div className="clear-glass-card rounded-2xl p-6 text-center">
          <Bell className="w-6 h-6 text-slate-400 mx-auto mb-1.5" />
          <p className="text-xs font-bold text-[#304C64]">No active alerts</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => markNotificationRead(n.id)}
              className={`w-full text-left p-3 rounded-2xl transition-all text-xs ${
                !n.isRead ? 'clear-glass-card ring-1 ring-[var(--primary)]/25' : 'clear-glass-btn opacity-80'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-[#304C64] truncate">{n.title}</span>
                <span className="text-[10px] text-slate-500 shrink-0 whitespace-nowrap">
                  {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="text-[11px] text-slate-600 mt-1 leading-snug">{n.message}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  // --- SUBVIEW: OVERVIEW ---
  const renderOverview = () => (
    <div className="space-y-2.5 animate-in fade-in duration-200">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-extrabold text-[#304C64] tracking-tight">Fleet Operations</h2>
          <p className="text-[11px] text-slate-500 truncate">Live district transportation dispatch</p>
        </div>
        <div className="flex items-center gap-1 text-[11px] font-bold text-[#26788E] whitespace-nowrap shrink-0">
          <Gauge className="w-3.5 h-3.5" />
          <span>99.4% On-Time</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="clear-glass-card p-3 rounded-2xl">
          <span className="text-[10px] font-bold text-[var(--primary)]">Active Buses</span>
          <div className="text-xl font-black text-[#304C64] mt-0.5 tabular-nums">{activeBusesCount}</div>
          <p className="text-[10px] text-slate-500">Live GPS active</p>
        </div>

        <div className="clear-glass-card p-3 rounded-2xl">
          <span className="text-[10px] font-bold text-emerald-700">Boarded Today</span>
          <div className="text-xl font-black text-[#304C64] mt-0.5 tabular-nums">{totalBoardedCount}</div>
          <p className="text-[10px] text-slate-500">Verified check-ins</p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px]">
          <h3 className="font-bold text-slate-500">Active Fleet Roster</h3>
          <span className="font-bold text-[var(--primary)]">{buses.length} Vehicles</span>
        </div>

        {buses.map((bus) => {
          const trip = trips.find((t) => t.busId === bus.id && (t.status === 'active' || t.status === 'paused'));
          const loc = locations[bus.id];

          return (
            <div
              key={bus.id}
              className="clear-glass-card p-3 rounded-2xl flex items-center justify-between gap-2 text-xs"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl clear-glass-btn flex items-center justify-center font-black text-xs text-[#304C64] shrink-0">
                  {bus.busNumber.replace('Bus ', '')}
                </div>
                <div className="min-w-0">
                  <p className="font-extrabold text-[#304C64] truncate">{bus.busNumber}</p>
                  <p className="text-[10px] text-slate-500 truncate">
                    {trip ? `Driver: ${trip.driverName}` : bus.model}
                  </p>
                </div>
              </div>

              <div className="text-right shrink-0">
                <span
                  className={`text-[10px] font-bold capitalize block ${
                    bus.status === 'active' ? 'text-emerald-700' : 'text-slate-500'
                  }`}
                >
                  {bus.status.replace('_', ' ')}
                </span>
                {trip && (
                  <p className="text-[10px] font-extrabold text-[var(--primary)] tabular-nums">
                    {Math.round(loc?.speed || 25)} km/h
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // --- SUBVIEW: ROSTER ---
  const renderRoster = () => (
    <div className="space-y-2.5 animate-in fade-in duration-200">
      <div>
        <h2 className="text-sm font-extrabold text-[#304C64] tracking-tight">Student Directory</h2>
        <p className="text-[11px] text-slate-500">Authorized students & guardians</p>
      </div>

      <div className="relative">
        <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
        <input
          type="text"
          placeholder="Search student name or ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="clear-glass-input w-full pl-8 pr-3 py-2 text-xs rounded-xl"
        />
      </div>

      <div className="space-y-2">
        {students
          .filter(
            (s) =>
              s.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
              s.studentIdCode.toLowerCase().includes(searchTerm.toLowerCase())
          )
          .map((s) => (
            <div
              key={s.id}
              className="clear-glass-card p-2.5 rounded-2xl flex items-center justify-between gap-2 text-xs"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Avatar src={s.avatarUrl} name={s.fullName} className="w-7 h-7" />
                <div className="min-w-0">
                  <p className="font-bold text-[#304C64] truncate">{s.fullName}</p>
                  <p className="text-[10px] text-slate-500 truncate">
                    {s.grade} · {s.guardianName}
                  </p>
                </div>
              </div>
              <span className="font-mono text-[10px] font-bold text-[var(--primary)] whitespace-nowrap shrink-0">
                {s.studentIdCode}
              </span>
            </div>
          ))}
      </div>
    </div>
  );

  // --- SUBVIEW: SETTINGS ---
  const renderSettings = () => (
    <div className="space-y-2.5 animate-in fade-in duration-200">
      <div>
        <h2 className="text-sm font-extrabold text-[#304C64] tracking-tight">Geofence & Theme</h2>
        <p className="text-[11px] text-slate-500">Arrival alert distances</p>
      </div>

      <form onSubmit={handleSaveThresholds} className="clear-glass-card rounded-2xl p-3.5 space-y-2.5 text-xs">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block font-bold text-[#304C64] mb-1 text-[10px]">Early Warning (m)</label>
            <input
              type="number"
              value={thresholds.earlyWarningMeters}
              onChange={(e) =>
                setThresholds({ ...thresholds, earlyWarningMeters: parseInt(e.target.value, 10) || 2000 })
              }
              className="clear-glass-input w-full px-2.5 py-1.5 rounded-xl text-xs font-bold"
            />
          </div>

          <div>
            <label className="block font-bold text-[#304C64] mb-1 text-[10px]">Approaching (m)</label>
            <input
              type="number"
              value={thresholds.approachingMeters}
              onChange={(e) =>
                setThresholds({ ...thresholds, approachingMeters: parseInt(e.target.value, 10) || 1000 })
              }
              className="clear-glass-input w-full px-2.5 py-1.5 rounded-xl text-xs font-bold"
            />
          </div>

          <div>
            <label className="block font-bold text-[#304C64] mb-1 text-[10px]">Nearby Alert (m)</label>
            <input
              type="number"
              value={thresholds.nearbyMeters}
              onChange={(e) =>
                setThresholds({ ...thresholds, nearbyMeters: parseInt(e.target.value, 10) || 500 })
              }
              className="clear-glass-input w-full px-2.5 py-1.5 rounded-xl text-xs font-bold"
            />
          </div>

          <div>
            <label className="block font-bold text-[#304C64] mb-1 text-[10px]">At-Stop Radius (m)</label>
            <input
              type="number"
              value={thresholds.arrivalMeters}
              onChange={(e) =>
                setThresholds({ ...thresholds, arrivalMeters: parseInt(e.target.value, 10) || 80 })
              }
              className="clear-glass-input w-full px-2.5 py-1.5 rounded-xl text-xs font-bold"
            />
          </div>
        </div>

        <button
          type="submit"
          className="clear-glass-btn-primary w-full py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5"
        >
          {thresholdSaved && <Check className="w-3.5 h-3.5" />}
          <span>{thresholdSaved ? 'Saved Geofence Rules' : 'Save Geofence Rules'}</span>
        </button>
      </form>

      <div className="clear-glass-card rounded-2xl p-3">
        <PaletteSelector />
      </div>
    </div>
  );

  // =========================================================================
  // RESPONSIVE SPLIT VIEW (Tablet & Desktop >= 768px)
  // =========================================================================
  if (isWideScreen) {
    return (
      <div data-testid="role-section-admin" className="flex flex-1 h-full w-full overflow-hidden">
        {/* Left: District Fleet Map */}
        <section className="flex-1 h-full flex flex-col relative overflow-hidden p-3 pr-1.5">
          <div className="relative flex-1 w-full h-full rounded-2xl overflow-hidden">
            <LiveBusMap
              bus={activeBus}
              location={activeLocation}
              route={routes[0]}
              isStale={isBusLocationStale}
              className="w-full h-full"
            />

            <div className="absolute top-2.5 left-2.5 right-12 z-[1000] clear-glass-card px-3 py-1.5 rounded-xl flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <span className="font-extrabold text-[#304C64] truncate">
                  {school?.name || 'Oakridge School District'}
                </span>
              </div>
              <div className="flex items-center gap-1 text-[11px] font-bold text-[var(--primary)] whitespace-nowrap shrink-0">
                <Radio className="w-3 h-3" />
                <span>{activeBusesCount} Online</span>
              </div>
            </div>
          </div>
        </section>

        {/* Right: Operations Console */}
        <section className="w-[380px] lg:w-[420px] shrink-0 h-full overflow-y-auto p-3 pl-1.5 space-y-3">
          {renderRoleBanner()}

          {activeTab === 'roster'
            ? renderRoster()
            : activeTab === 'alerts'
            ? renderDispatchAlerts()
            : activeTab === 'settings'
            ? renderSettings()
            : renderOverview()}
        </section>
      </div>
    );
  }

  // =========================================================================
  // MOBILE VIEW (< 768px)
  // =========================================================================
  if (activeTab === 'fleet') {
    return (
      <div data-testid="role-section-admin" className="relative h-full min-h-[400px] w-full overflow-hidden p-2">
        <div className="relative w-full h-full rounded-2xl overflow-hidden">
          <LiveBusMap
            bus={activeBus}
            location={activeLocation}
            route={routes[0]}
            isStale={isBusLocationStale}
            className="h-full w-full"
          />

          <div className="absolute top-2.5 left-2.5 right-12 z-[1000] clear-glass-card px-3 py-1.5 rounded-xl flex items-center justify-between gap-2 text-xs">
            <span className="font-extrabold text-[#304C64] truncate">District Fleet Map</span>
            <span className="font-bold text-[var(--primary)] whitespace-nowrap shrink-0">
              {activeBusesCount} Active
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (activeTab === 'roster') {
    return (
      <div data-testid="role-section-admin" className="p-3 space-y-2.5 pb-4">
        {renderRoleBanner()}
        {renderRoster()}
      </div>
    );
  }

  if (activeTab === 'alerts') {
    return (
      <div data-testid="role-section-admin" className="p-3 space-y-2.5 pb-4">
        {renderRoleBanner()}
        {renderDispatchAlerts()}
      </div>
    );
  }

  if (activeTab === 'settings') {
    return (
      <div data-testid="role-section-admin" className="p-3 space-y-2.5 pb-4">
        {renderRoleBanner()}
        {renderSettings()}
      </div>
    );
  }

  return (
    <div data-testid="role-section-admin" className="p-3 space-y-2.5 pb-4">
      {renderRoleBanner()}
      {renderOverview()}
    </div>
  );
};
