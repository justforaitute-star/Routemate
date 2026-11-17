import React from 'react';
import { useApp } from '../../context/AppContext';
import { LiveBusMap } from '../map/LiveBusMap';
import { PaletteSelector } from '../common/PaletteSelector';
import { Avatar } from '../common/Avatar';
import { haversineDistance } from '../../utils/proximity';
import { calculateETAMinutes, formatETADisplay } from '../../utils/eta';
import { useMediaQuery } from '../../utils/useMediaQuery';
import {
  Bus,
  MapPin,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
  Bell,
  Gauge,
} from 'lucide-react';

interface StudentViewProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export const StudentView: React.FC<StudentViewProps> = ({ activeTab, onTabChange }) => {
  const {
    students,
    routes,
    buses,
    activeTrip,
    activeLocation,
    boardingRecords,
    isBusLocationStale,
    notifications,
    markNotificationRead,
  } = useApp();

  const isWideScreen = useMediaQuery('(min-width: 768px)');

  const student = students.find((s) => s.id === 'student-1') || students[0];
  const assignedBus = buses.find((b) => b.id === student?.busId);
  const assignedRoute = routes.find((r) => r.id === student?.routeId);

  const isMorning = activeTrip?.tripType !== 'afternoon';
  const assignedStopId = isMorning ? student?.morningStopId : student?.afternoonStopId;
  const assignedStop = assignedRoute?.stops.find((s) => s.id === assignedStopId) || assignedRoute?.stops[1];

  const boardingRecord = boardingRecords.find(
    (r) => r.tripId === activeTrip?.id && r.studentId === student?.id
  );
  const isBoarded = boardingRecord?.status === 'boarded';

  let distanceMeters = 0;
  let etaMinutes = 0;
  let proximityStage: 'far' | 'early_warning' | 'approaching' | 'nearby' | 'arrived' = 'far';

  if (activeLocation && assignedStop) {
    distanceMeters = haversineDistance(
      activeLocation.latitude,
      activeLocation.longitude,
      assignedStop.latitude,
      assignedStop.longitude
    );
    etaMinutes = calculateETAMinutes(distanceMeters, activeLocation.speed || 25);

    if (distanceMeters <= 80) proximityStage = 'arrived';
    else if (distanceMeters <= 500) proximityStage = 'nearby';
    else if (distanceMeters <= 1000) proximityStage = 'approaching';
    else if (distanceMeters <= 2000) proximityStage = 'early_warning';
  }

  // --- SUBVIEW: ALERTS ---
  const renderAlerts = () => (
    <div className="space-y-2.5 animate-in fade-in duration-200">
      <div>
        <h2 className="text-sm font-extrabold text-[#304C64] tracking-tight">Bus Alerts</h2>
        <p className="text-[11px] text-slate-500">Live updates for {student?.fullName}</p>
      </div>

      {notifications.length === 0 ? (
        <div className="clear-glass-card rounded-2xl p-6 text-center">
          <Bell className="w-6 h-6 text-slate-400 mx-auto mb-1.5" />
          <p className="text-xs font-bold text-[#304C64]">No alerts right now</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <button
              key={n.id}
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

  // --- SUBVIEW: PROFILE ---
  const renderProfile = () => (
    <div className="space-y-2.5 animate-in fade-in duration-200">
      <div>
        <h2 className="text-sm font-extrabold text-[#304C64] tracking-tight">Student Transit Pass</h2>
        <p className="text-[11px] text-slate-500">Oakridge Community Academy ID</p>
      </div>

      <div className="clear-glass-card rounded-2xl p-3.5 space-y-3">
        <div className="flex items-center gap-3">
          <Avatar src={student?.avatarUrl} name={student?.fullName || 'Student'} className="w-11 h-11" />
          <div className="min-w-0">
            <h3 className="text-sm font-black text-[#304C64] truncate">{student?.fullName}</h3>
            <p className="text-[11px] text-slate-500 truncate">
              {student?.grade} · ID: {student?.studentIdCode}
            </p>
          </div>
        </div>

        <div className="pt-2.5 border-t border-white/45 grid grid-cols-2 gap-2 text-xs">
          <div className="p-2.5 rounded-xl bg-white/25 border border-white/60">
            <span className="text-[10px] text-slate-500 font-bold block">Assigned Bus</span>
            <p className="font-extrabold text-[#304C64] mt-0.5">{assignedBus?.busNumber}</p>
          </div>
          <div className="p-2.5 rounded-xl bg-white/25 border border-white/60">
            <span className="text-[10px] text-slate-500 font-bold block">Pickup Time</span>
            <p className="font-extrabold text-[#304C64] mt-0.5">{assignedStop?.scheduledTime}</p>
          </div>
        </div>
      </div>

      <div className="clear-glass-card rounded-2xl p-3">
        <PaletteSelector />
      </div>

      <div className="clear-glass-card rounded-2xl p-3 flex items-start gap-2.5">
        <ShieldCheck className="w-4 h-4 text-[var(--primary)] shrink-0 mt-0.5" />
        <div className="text-[11px] space-y-0.5 min-w-0">
          <p className="font-bold text-[#304C64]">Bus Rider Rules</p>
          <p className="leading-snug text-slate-600">
            Stay 5 steps back from the curb while waiting. Always wait until the bus makes a full stop before boarding.
          </p>
        </div>
      </div>
    </div>
  );

  // --- SUBVIEW: HOME ---
  const renderHomeContent = () => (
    <div className="space-y-2.5 animate-in fade-in duration-200">
      <div className="clear-glass-card rounded-2xl p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <span className="font-bold text-slate-600 truncate">
              {isBoarded
                ? 'On Bus to School'
                : proximityStage === 'arrived'
                ? 'Bus At Stop'
                : proximityStage === 'nearby'
                ? 'Bus Nearby'
                : 'Bus En Route'}
            </span>
          </div>
          <span className="font-extrabold text-[var(--primary)] whitespace-nowrap shrink-0">
            {assignedBus?.busNumber || 'Bus 14'}
          </span>
        </div>

        <div className="text-center py-1">
          {isBoarded ? (
            <div className="space-y-1">
              <CheckCircle2 className="w-7 h-7 text-emerald-600 mx-auto" />
              <h2 className="text-base font-black text-[#304C64]">Safely on board</h2>
              <p className="text-[11px] text-slate-500">Heading to Oakridge Academy</p>
            </div>
          ) : proximityStage === 'arrived' ? (
            <div className="space-y-1">
              <Bus className="w-7 h-7 mx-auto" style={{ color: 'var(--accent-amber, #E2480C)' }} />
              <h2 className="text-lg font-black text-[var(--accent-amber,#E2480C)]">Your bus is here!</h2>
              <p className="text-[11px] text-[#304C64] font-semibold">Board safely at {assignedStop?.name}</p>
            </div>
          ) : (
            <div>
              <span className="text-[10px] font-bold text-slate-500">Arrival Countdown</span>
              <div className="text-2xl font-black tracking-tight my-0.5 tabular-nums text-[var(--primary)]">
                {formatETADisplay(etaMinutes)}
              </div>
              <p className="text-[11px] text-slate-600 font-medium">
                {distanceMeters > 1000
                  ? `${(distanceMeters / 1000).toFixed(1)} km away`
                  : `${distanceMeters}m away`}
              </p>
            </div>
          )}
        </div>

        <div className="pt-2 border-t border-white/45 flex items-center justify-between gap-2 text-[11px] text-slate-600">
          <div className="flex items-center gap-1 min-w-0">
            <MapPin className="w-3 h-3 shrink-0" style={{ color: 'var(--primary)' }} />
            <span className="truncate text-[#304C64] font-medium">{assignedStop?.name}</span>
          </div>
          <span className="font-bold text-[#304C64] whitespace-nowrap shrink-0">
            {assignedStop?.scheduledTime}
          </span>
        </div>
      </div>

      {/* Compact Transit Pass Summary on Home */}
      <div className="clear-glass-card rounded-2xl p-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <Avatar src={student?.avatarUrl} name={student?.fullName || 'Student'} className="w-8 h-8" />
          <div className="min-w-0">
            <p className="text-xs font-extrabold text-[#304C64] truncate">{student?.fullName}</p>
            <p className="text-[10px] text-slate-500 truncate">
              {student?.grade} · {student?.studentIdCode}
            </p>
          </div>
        </div>
        <button
          onClick={() => onTabChange('profile')}
          className="clear-glass-btn px-2.5 py-1 rounded-full text-[11px] font-bold text-[var(--primary)] whitespace-nowrap shrink-0"
        >
          View ID
        </button>
      </div>

      <div className="clear-glass-card rounded-2xl p-3 flex items-start gap-2.5">
        <ShieldCheck className="w-4 h-4 text-[#26788E] shrink-0 mt-0.5" />
        <div className="text-[11px] text-slate-600 space-y-0.5 min-w-0">
          <p className="font-bold text-[#304C64]">Stop Safety Reminder</p>
          <p className="leading-snug">
            Wait on the sidewalk until the bus comes to a complete stop and doors open.
          </p>
        </div>
      </div>
    </div>
  );

  // =========================================================================
  // RESPONSIVE SPLIT VIEW (Tablet & Desktop >= 768px)
  // =========================================================================
  if (isWideScreen) {
    return (
      <div className="flex flex-1 h-full w-full overflow-hidden">
        {/* Left: Live Map */}
        <section className="flex-1 h-full flex flex-col relative overflow-hidden p-3 pr-1.5">
          <div className="relative flex-1 w-full h-full rounded-2xl overflow-hidden">
            <LiveBusMap
              bus={assignedBus}
              location={activeLocation}
              route={assignedRoute}
              highlightStopId={assignedStop?.id}
              assignedStudent={student}
              isStale={isBusLocationStale}
              className="w-full h-full"
            />

            <div className="absolute top-2.5 left-2.5 right-12 z-[1000] clear-glass-card px-3 py-1.5 rounded-xl flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="w-2 h-2 rounded-full bg-[var(--accent-amber,#E2480C)] shrink-0" />
                <span className="font-extrabold text-[#304C64] whitespace-nowrap">{assignedBus?.busNumber}</span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-600 font-medium truncate">{assignedRoute?.name}</span>
              </div>
              <div className="flex items-center gap-2.5 shrink-0 whitespace-nowrap">
                <span className="flex items-center gap-1 text-[11px] font-bold text-[#304C64] tabular-nums">
                  <Gauge className="w-3 h-3" style={{ color: 'var(--primary)' }} />
                  {Math.round(activeLocation?.speed || 25)} km/h
                </span>
                <span className="font-extrabold text-[var(--accent-amber,#E2480C)] text-[11px] tabular-nums">
                  {formatETADisplay(etaMinutes)}
                </span>
              </div>
            </div>

            <div className="absolute bottom-7 left-2.5 right-2.5 z-20 clear-glass-card px-3 py-2 rounded-xl flex items-center justify-between gap-2 text-[11px]">
              <div className="flex items-center gap-1.5 min-w-0">
                <MapPin className="w-3.5 h-3.5 text-[var(--primary)] shrink-0" />
                <span className="font-bold text-[#304C64] truncate">{assignedStop?.name}</span>
              </div>
              <span className="font-extrabold text-[var(--accent-amber,#E2480C)] whitespace-nowrap shrink-0">
                {distanceMeters > 1000 ? `${(distanceMeters / 1000).toFixed(1)} km` : `${distanceMeters}m`} away
              </span>
            </div>
          </div>
        </section>

        {/* Right: Student Details */}
        <section className="w-[380px] lg:w-[420px] shrink-0 h-full overflow-y-auto p-3 pl-1.5 space-y-3">
          <div className="clear-glass-card p-1 rounded-full grid grid-cols-3 gap-1">
            {[
              { id: 'home', label: 'Home' },
              { id: 'alerts', label: 'Alerts' },
              { id: 'profile', label: 'Profile' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`py-1.5 px-2.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                  activeTab === tab.id || (tab.id === 'home' && activeTab === 'map')
                    ? 'clear-glass-btn-primary'
                    : 'text-[#304C64]/75 hover:bg-white/30'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'alerts'
            ? renderAlerts()
            : activeTab === 'profile'
            ? renderProfile()
            : renderHomeContent()}
        </section>
      </div>
    );
  }

  // =========================================================================
  // MOBILE VIEW (< 768px)
  // =========================================================================
  if (activeTab === 'alerts') {
    return <div className="p-3 pb-4">{renderAlerts()}</div>;
  }

  if (activeTab === 'profile') {
    return <div className="p-3 pb-4">{renderProfile()}</div>;
  }

  if (activeTab === 'map') {
    return (
      <div className="relative h-full min-h-[400px] w-full overflow-hidden p-2">
        <div className="relative w-full h-full rounded-2xl overflow-hidden">
          <LiveBusMap
            bus={assignedBus}
            location={activeLocation}
            route={assignedRoute}
            highlightStopId={assignedStop?.id}
            assignedStudent={student}
            isStale={isBusLocationStale}
            className="h-full w-full"
          />

          <div className="absolute top-2.5 left-2.5 right-12 z-[1000] clear-glass-card px-3 py-1.5 rounded-xl flex items-center justify-between gap-2 text-xs">
            <span className="font-extrabold text-[#304C64] whitespace-nowrap">{assignedBus?.busNumber}</span>
            <span className="font-extrabold text-[var(--accent-amber,#E2480C)] whitespace-nowrap">
              {formatETADisplay(etaMinutes)}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-2.5 pb-4 animate-in fade-in duration-200">
      <div className="relative">
        <LiveBusMap
          bus={assignedBus}
          location={activeLocation}
          route={assignedRoute}
          highlightStopId={assignedStop?.id}
          assignedStudent={student}
          isStale={isBusLocationStale}
          className="h-48 w-full"
        />
        <button
          onClick={() => onTabChange('map')}
          className="absolute bottom-7 right-2.5 z-20 px-2.5 py-1 rounded-full clear-glass-btn text-[11px] font-bold text-[#304C64] flex items-center gap-1 whitespace-nowrap"
        >
          <span>Expand</span>
          <ExternalLink className="w-3 h-3" style={{ color: 'var(--primary)' }} />
        </button>
      </div>

      {renderHomeContent()}
    </div>
  );
};
