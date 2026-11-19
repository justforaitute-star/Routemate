import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { LiveBusMap } from '../map/LiveBusMap';
import { RouteEtaCard } from '../demo/RouteEtaCard';
import { haversineDistance } from '../../utils/proximity';
import { calculateETAMinutes, formatETADisplay } from '../../utils/eta';
import {
  Bell,
  CheckCircle2,
  Clock,
  MapPin,
  Phone,
  Shield,
  ExternalLink,
  Gauge,
  Radio,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { requestPushPermission } from '../../utils/pushNotifications';
import { PaletteSelector } from '../common/PaletteSelector';
import { Avatar } from '../common/Avatar';
import { useMediaQuery } from '../../utils/useMediaQuery';

interface GuardianViewProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export const GuardianView: React.FC<GuardianViewProps> = ({ activeTab, onTabChange }) => {
  const {
    students,
    routes,
    buses,
    trips,
    locations,
    activeTrip,
    activeBus,
    activeLocation,
    boardingRecords,
    notifications,
    markNotificationRead,
    isBusLocationStale,
    selectedChildId,
    setSelectedChildId,
    school,
  } = useApp();

  const isWideScreen = useMediaQuery('(min-width: 768px)');
  const [pushStatus, setPushStatus] = useState<string>('idle');
  const [selectedRouteId, setSelectedRouteId] = useState<string>(
    () => activeTrip?.routeId || routes[0]?.id || 'route-1'
  );
  const [selectedEtaStopId, setSelectedEtaStopId] = useState<string | undefined>(undefined);
  const [resolvedPolylines, setResolvedPolylines] = useState<Record<string, [number, number][]>>({});

  const myChildren = students.filter((s) => s.guardianId === 'parent-1');
  const activeChild = myChildren.find((c) => c.id === selectedChildId) || myChildren[0] || students[0];

  useEffect(() => {
    if (routes.length > 0 && !routes.some((r) => r.id === selectedRouteId)) {
      setSelectedRouteId(activeChild?.routeId || activeTrip?.routeId || routes[0].id);
    }
  }, [routes, selectedRouteId, activeChild?.routeId, activeTrip?.routeId]);

  const handleResolvedRoutePolyline = useCallback(
    (routeId: string, waypoints: [number, number][]) => {
      setResolvedPolylines((prev) => ({ ...prev, [routeId]: waypoints }));
    },
    []
  );

  const previewRoute = useMemo(() => {
    const base =
      routes.find((r) => r.id === selectedRouteId) ||
      routes.find((r) => r.id === activeChild?.routeId) ||
      routes[0];
    if (!base) return undefined;
    const apiWaypoints = resolvedPolylines[base.id];
    return apiWaypoints && apiWaypoints.length > 1
      ? { ...base, waypoints: apiWaypoints }
      : base;
  }, [routes, selectedRouteId, activeChild?.routeId, resolvedPolylines]);

  const previewBus = useMemo(() => {
    if (!previewRoute) return activeBus;
    return buses.find((b) => b.id === previewRoute.assignedBusId) || activeBus;
  }, [previewRoute, buses, activeBus]);

  const previewLocation = useMemo(() => {
    if (!previewBus) return activeLocation;
    return locations[previewBus.id] || activeLocation;
  }, [previewBus, locations, activeLocation]);

  const previewTrip = useMemo(() => {
    if (!previewRoute) return activeTrip;
    return trips.find((t) => t.routeId === previewRoute.id) || activeTrip;
  }, [previewRoute, trips, activeTrip]);

  const assignedBus = buses.find((b) => b.id === activeChild?.busId);
  const assignedRoute = routes.find((r) => r.id === activeChild?.routeId);

  const isMorning = activeTrip?.tripType !== 'afternoon';
  const assignedStopId = isMorning ? activeChild?.morningStopId : activeChild?.afternoonStopId;
  const assignedStop = assignedRoute?.stops.find((s) => s.id === assignedStopId) || assignedRoute?.stops[1];

  const boardingRecord = boardingRecords.find(
    (r) => r.tripId === activeTrip?.id && r.studentId === activeChild?.id
  );
  const isBoarded = boardingRecord?.status === 'boarded';
  const isDroppedOff = boardingRecord?.status === 'dropped_off';

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

  const handleEnablePush = async () => {
    const res = await requestPushPermission();
    setPushStatus(res);
  };

  const renderRoleBanner = () => (
    <div className="clear-glass-card rounded-2xl px-3.5 py-2.5 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-8 h-8 rounded-xl clear-glass-btn-primary flex items-center justify-center shrink-0">
          <Users className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <h2 className="text-xs font-extrabold text-[#304C64] tracking-tight truncate">
            Parent Portal
          </h2>
          <p className="text-[10px] font-medium text-slate-500 truncate">
            Family Tracking · {activeChild?.fullName}
          </p>
        </div>
      </div>
      <span className="text-[11px] font-extrabold text-[var(--primary)] whitespace-nowrap shrink-0">
        {assignedBus?.busNumber || 'Bus 14'}
      </span>
    </div>
  );

  // --- SUBVIEW: ALERTS ---
  const renderNotifications = () => (
    <div className="space-y-2.5 animate-in fade-in duration-200">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-extrabold text-[#304C64] tracking-tight">Parent Alerts &amp; Updates</h2>
          <p className="text-[11px] text-slate-500">Live arrival &amp; safety notifications</p>
        </div>
        <button
          type="button"
          onClick={handleEnablePush}
          className="clear-glass-btn px-3 py-1.5 rounded-full text-[11px] font-bold text-[var(--primary)] whitespace-nowrap shrink-0"
        >
          {pushStatus === 'granted' ? 'Push Active' : 'Enable Push'}
        </button>
      </div>

      {notifications.length === 0 ? (
        <div className="clear-glass-card rounded-2xl p-6 text-center">
          <Bell className="w-6 h-6 text-slate-400 mx-auto mb-1.5" />
          <p className="text-xs font-bold text-[#304C64]">No alerts yet</p>
          <p className="text-[11px] text-slate-500 mt-0.5">You will receive alerts when the bus approaches</p>
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
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      !n.isRead ? 'bg-[var(--accent-amber,#E2480C)]' : 'bg-slate-400'
                    }`}
                  />
                  <h4 className="font-bold text-[#304C64] text-xs truncate">{n.title}</h4>
                </div>
                <span className="text-[10px] text-slate-500 font-medium shrink-0 whitespace-nowrap">
                  {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="text-[11px] text-slate-600 mt-1 pl-3 leading-snug">{n.message}</p>
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
        <h2 className="text-sm font-extrabold text-[#304C64] tracking-tight">Parent Account</h2>
        <p className="text-[11px] text-slate-500">Preferences &amp; linked students</p>
      </div>

      {/* Parent ID Card */}
      <div className="clear-glass-card rounded-2xl p-3 flex items-center gap-2.5">
        <Avatar name="Sarah Jenkins" className="w-10 h-10" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-extrabold text-[#304C64] text-xs">Sarah Jenkins</h3>
            <span className="text-[10px] font-bold text-[var(--primary)]">Verified Guardian</span>
          </div>
          <p className="text-[11px] text-slate-500 truncate">sarah.j@example.com · +1 (555) 987-6543</p>
          <p className="text-[10px] text-slate-500 truncate">{school?.name || 'Oakridge Academy'}</p>
        </div>
      </div>

      {/* Linked Children List */}
      <div className="clear-glass-card rounded-2xl p-3 space-y-2">
        <h4 className="text-[11px] font-bold text-slate-500">Linked Students</h4>
        {myChildren.map((c) => {
          const isSelected = c.id === activeChild?.id;
          const childBus = buses.find((b) => b.id === c.busId);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setSelectedChildId(c.id);
                setSelectedRouteId(c.routeId);
              }}
              className={`w-full p-2.5 rounded-xl flex items-center justify-between gap-2 transition-all text-left ${
                isSelected ? 'clear-glass-btn-primary' : 'clear-glass-btn'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Avatar src={c.avatarUrl} name={c.fullName} className="w-7 h-7" />
                <div className="min-w-0">
                  <p className={`font-bold text-xs truncate ${isSelected ? 'text-white' : 'text-[#304C64]'}`}>
                    {c.fullName}
                  </p>
                  <p className={`text-[10px] truncate ${isSelected ? 'text-white/85' : 'text-slate-500'}`}>
                    {c.grade} · {childBus?.busNumber || 'Bus 14'}
                  </p>
                </div>
              </div>
              <span className={`text-[11px] font-bold shrink-0 ${isSelected ? 'text-white' : 'text-[var(--primary)]'}`}>
                {isSelected ? 'Active' : 'Select'}
              </span>
            </button>
          );
        })}
      </div>

      {/* Palette Selector */}
      <div className="clear-glass-card rounded-2xl p-3">
        <PaletteSelector />
      </div>

      {/* School Dispatch Contacts */}
      <div className="clear-glass-card rounded-2xl p-3 space-y-1.5">
        <h4 className="text-[11px] font-bold text-slate-500">Transportation Office</h4>
        <a
          href={`tel:${school?.contactPhone || '5552345678'}`}
          className="clear-glass-btn flex items-center justify-between gap-2 p-2.5 rounded-xl text-xs font-bold text-[#304C64]"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Phone className="w-3.5 h-3.5 text-[var(--primary)] shrink-0" />
            <span className="truncate">Dispatch Office</span>
          </div>
          <span className="text-[11px] text-[var(--primary)] whitespace-nowrap shrink-0">
            {school?.contactPhone || '+1 (555) 234-5678'}
          </span>
        </a>

        <a
          href={`tel:${school?.emergencyPhone || '5559110022'}`}
          className="clear-glass-btn-rose flex items-center justify-between gap-2 p-2.5 rounded-xl text-xs font-bold"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Shield className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Emergency Line</span>
          </div>
          <span className="text-[11px] whitespace-nowrap shrink-0">
            {school?.emergencyPhone || '+1 (555) 911-0022'}
          </span>
        </a>
      </div>
    </div>
  );

  // --- SUBVIEW: ROUTES ETA ---
  const renderRoutesEta = () => (
    <div className="space-y-2.5 animate-in fade-in duration-200">
      <RouteEtaCard
        routes={routes}
        selectedRoute={previewRoute}
        selectedBus={previewBus}
        selectedLocation={previewLocation}
        activeTrip={previewTrip}
        selectedStopId={selectedEtaStopId}
        onSelectRoute={setSelectedRouteId}
        onSelectStop={setSelectedEtaStopId}
        onResolvedRoutePolyline={handleResolvedRoutePolyline}
      />
    </div>
  );

  // --- SUBVIEW: HOME TRACKING CARDS ---
  const renderHomeCards = () => (
    <div className="space-y-2.5 animate-in fade-in duration-200">
      {/* Multi-Child Clear Glass Selector */}
      {myChildren.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {myChildren.map((child) => {
            const isSelected = child.id === activeChild?.id;
            return (
              <button
                key={child.id}
                type="button"
                data-testid={`parent-child-${child.id}`}
                onClick={() => {
                  setSelectedChildId(child.id);
                  setSelectedRouteId(child.routeId);
                  setSelectedEtaStopId(undefined);
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-bold transition-all shrink-0 whitespace-nowrap ${
                  isSelected ? 'clear-glass-btn-primary' : 'clear-glass-btn'
                }`}
              >
                <Avatar src={child.avatarUrl} name={child.fullName} className="w-4 h-4" />
                <span>{child.fullName}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Bus Status Card */}
      <div className="clear-glass-card rounded-2xl p-3.5 space-y-2">
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <span className="font-bold text-slate-600 truncate">
              {isDroppedOff
                ? 'Drop-off Completed'
                : isBoarded
                ? 'On Bus to School'
                : proximityStage === 'arrived'
                ? 'Bus At Stop'
                : proximityStage === 'nearby'
                ? 'Bus Nearby'
                : 'Bus On The Way'}
            </span>
          </div>
          <span className="font-extrabold text-[var(--primary)] shrink-0 whitespace-nowrap">
            {assignedBus?.busNumber || 'Bus 14'}
          </span>
        </div>

        <div>
          <h2 className="text-sm font-black text-[#304C64] tracking-tight leading-snug">
            {isDroppedOff
              ? `${activeChild?.fullName} has been safely dropped off`
              : isBoarded
              ? `${activeChild?.fullName} is on the bus`
              : proximityStage === 'arrived'
              ? 'Your school bus has arrived!'
              : proximityStage === 'nearby'
              ? 'Bus is nearby — head to stop'
              : proximityStage === 'approaching'
              ? 'Bus is approximately 1 km away'
              : 'Your school bus is on the way'}
          </h2>
          <p className="text-[11px] text-slate-600 mt-0.5 truncate">
            Stop: <strong className="text-[#304C64]">{assignedStop?.name}</strong>
          </p>
        </div>

        <div className="pt-2 border-t border-white/45 flex items-center justify-between gap-2 text-[11px]">
          {isBoarded ? (
            <div className="flex items-center gap-1 text-emerald-700 font-bold min-w-0 truncate">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">
                Boarded {new Date(boardingRecord?.timestamp || '').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-slate-600 font-medium min-w-0 truncate">
              <Clock className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--primary)' }} />
              <span className="truncate">Scheduled {assignedStop?.scheduledTime}</span>
            </div>
          )}

          <span className="text-[#304C64] font-bold whitespace-nowrap shrink-0 tabular-nums">
            {distanceMeters > 1000 ? `${(distanceMeters / 1000).toFixed(1)} km` : `${distanceMeters}m`} away
          </span>
        </div>
      </div>

      {/* Child Stop Arrival Progress Card */}
      <div className="clear-glass-card rounded-2xl p-3.5 space-y-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[10px] font-bold text-slate-500">Child Stop ETA</span>
            <div className="text-2xl font-black text-[#304C64] tracking-tight leading-tight tabular-nums">
              {isBoarded ? 'En Route' : formatETADisplay(etaMinutes)}
            </div>
            <p className="text-[11px] text-slate-600 font-medium">
              {isBoarded
                ? 'Arriving at campus approx 08:10 AM'
                : etaMinutes <= 0
                ? 'Bus is at your pickup stop'
                : `Arriving in approx ${etaMinutes} min`}
            </p>
          </div>

          <div className="text-right shrink-0">
            <span className="text-[10px] text-slate-500 font-bold">Speed</span>
            <div className="text-sm font-extrabold text-[#304C64] tabular-nums whitespace-nowrap">
              {Math.round(activeLocation?.speed || 25)} km/h
            </div>
          </div>
        </div>

        {/* 4-stage Progress Indicator */}
        <div className="pt-2 border-t border-white/45 grid grid-cols-4 gap-1.5">
          {[
            { id: 'early_warning', label: 'On Route' },
            { id: 'approaching', label: '1 km' },
            { id: 'nearby', label: '500m' },
            { id: 'arrived', label: 'At Stop' },
          ].map((st, idx) => {
            const isPastOrCurrent =
              proximityStage === 'arrived' ||
              (proximityStage === 'nearby' && idx <= 2) ||
              (proximityStage === 'approaching' && idx <= 1) ||
              (proximityStage === 'early_warning' && idx === 0);

            return (
              <div key={st.id} className="text-center">
                <div
                  className={`h-1 rounded-full mb-1 transition-all ${!isPastOrCurrent ? 'bg-white/45' : ''}`}
                  style={{
                    background: isPastOrCurrent
                      ? idx === 3
                        ? 'var(--accent-amber, #E2480C)'
                        : 'linear-gradient(90deg, var(--primary) 0%, var(--accent-amber, #E2480C) 100%)'
                      : undefined,
                  }}
                />
                <span
                  className={`text-[10px] font-bold whitespace-nowrap ${
                    !isPastOrCurrent ? 'text-slate-400' : ''
                  }`}
                  style={{
                    color: isPastOrCurrent
                      ? idx === 3
                        ? 'var(--accent-amber, #E2480C)'
                        : 'var(--primary)'
                      : undefined,
                  }}
                >
                  {st.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Assigned Stop & Last Update */}
        <div className="pt-2 border-t border-white/45 flex items-center justify-between gap-2 text-[11px] text-slate-600">
          <div className="flex items-center gap-1 min-w-0">
            <MapPin className="w-3 h-3 shrink-0" style={{ color: 'var(--primary)' }} />
            <span className="truncate font-medium text-[#304C64]">{assignedStop?.name}</span>
          </div>
          <span className="text-[10px] text-slate-500 whitespace-nowrap shrink-0">
            Updated {activeLocation ? new Date(activeLocation.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'now'}
          </span>
        </div>
      </div>

      {/* Dynamic Google Maps Routes API ETA Card */}
      <RouteEtaCard
        routes={routes}
        selectedRoute={previewRoute}
        selectedBus={previewBus}
        selectedLocation={previewLocation}
        activeTrip={previewTrip}
        selectedStopId={selectedEtaStopId}
        onSelectRoute={setSelectedRouteId}
        onSelectStop={setSelectedEtaStopId}
        onResolvedRoutePolyline={handleResolvedRoutePolyline}
      />

      {/* Safety Guideline Card */}
      <div className="clear-glass-card rounded-2xl p-3 flex items-start gap-2.5">
        <ShieldCheck className="w-4 h-4 text-[#26788E] shrink-0 mt-0.5" />
        <div className="text-[11px] text-slate-600 space-y-0.5 min-w-0">
          <p className="font-bold text-[#304C64]">Student Safety Protocol</p>
          <p className="leading-snug">
            Alerts trigger at 1 km and 500m. Please arrive at the pickup stop 5 minutes early.
          </p>
        </div>
      </div>
    </div>
  );

  const mapBus = activeTab === 'routes' ? previewBus : assignedBus;
  const mapLocation = activeTab === 'routes' ? previewLocation : activeLocation;
  const mapRoute = previewRoute || assignedRoute;
  const mapStopId = selectedEtaStopId || assignedStop?.id;

  // =========================================================================
  // RESPONSIVE SPLIT VIEW (Tablet & Desktop >= 768px)
  // =========================================================================
  if (isWideScreen) {
    return (
      <div data-testid="role-section-guardian" className="flex flex-1 h-full w-full overflow-hidden">
        {/* Left: Interactive Map & Telemetry */}
        <section className="flex-1 h-full flex flex-col relative overflow-hidden p-3 pr-1.5">
          <div className="relative flex-1 w-full h-full rounded-2xl overflow-hidden">
            <LiveBusMap
              bus={mapBus}
              location={mapLocation}
              route={mapRoute}
              highlightStopId={mapStopId}
              assignedStudent={activeChild}
              isStale={isBusLocationStale}
              className="h-full w-full"
            />

            {/* Top HUD with right-12 clearance for map controls */}
            <div className="absolute top-2.5 left-2.5 right-12 z-[1000] clear-glass-card px-3 py-1.5 rounded-xl flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="w-2 h-2 rounded-full bg-[var(--accent-amber,#E2480C)] shrink-0" />
                <span className="font-extrabold text-[#304C64] whitespace-nowrap">{mapBus?.busNumber}</span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-600 font-medium truncate">{mapRoute?.name}</span>
              </div>
              <div className="flex items-center gap-2.5 shrink-0 whitespace-nowrap">
                <span className="flex items-center gap-1 text-[11px] font-bold text-[#304C64] tabular-nums">
                  <Gauge className="w-3 h-3" style={{ color: 'var(--primary)' }} />
                  {Math.round(mapLocation?.speed || 25)} km/h
                </span>
                <span className="font-extrabold text-[var(--accent-amber,#E2480C)] text-[11px] tabular-nums">
                  {formatETADisplay(etaMinutes)}
                </span>
              </div>
            </div>

            {/* Bottom Telemetry Bar */}
            <div className="absolute bottom-7 left-2.5 right-2.5 z-20 clear-glass-card px-3 py-2 rounded-xl flex items-center justify-between gap-2 text-[11px]">
              <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                <Radio className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="font-bold text-[#304C64]">GPS Live</span>
                <span className="text-slate-500">±{mapLocation?.accuracy || 6}m</span>
              </div>
              <span className="text-slate-600 truncate min-w-0">
                Stop: <strong className="text-[#304C64]">{assignedStop?.name}</strong>
              </span>
            </div>
          </div>
        </section>

        {/* Right: Parent Master-Detail Panel */}
        <section className="w-[380px] lg:w-[420px] shrink-0 h-full overflow-y-auto p-3 pl-1.5 space-y-3">
          {renderRoleBanner()}

          {activeTab === 'routes'
            ? renderRoutesEta()
            : activeTab === 'alerts'
            ? renderNotifications()
            : activeTab === 'profile'
            ? renderProfile()
            : renderHomeCards()}
        </section>
      </div>
    );
  }

  // =========================================================================
  // MOBILE VIEW (< 768px)
  // =========================================================================
  if (activeTab === 'routes') {
    return (
      <div data-testid="role-section-guardian" className="p-3 space-y-2.5 pb-4">
        {renderRoleBanner()}
        {renderRoutesEta()}
      </div>
    );
  }

  if (activeTab === 'alerts') {
    return (
      <div data-testid="role-section-guardian" className="p-3 space-y-2.5 pb-4">
        {renderRoleBanner()}
        {renderNotifications()}
      </div>
    );
  }

  if (activeTab === 'profile') {
    return (
      <div data-testid="role-section-guardian" className="p-3 space-y-2.5 pb-4">
        {renderRoleBanner()}
        {renderProfile()}
      </div>
    );
  }

  if (activeTab === 'map') {
    return (
      <div data-testid="role-section-guardian" className="relative h-full min-h-[400px] w-full overflow-hidden p-2">
        <div className="relative w-full h-full rounded-2xl overflow-hidden">
          <LiveBusMap
            bus={mapBus}
            location={mapLocation}
            route={mapRoute}
            highlightStopId={mapStopId}
            assignedStudent={activeChild}
            isStale={isBusLocationStale}
            className="h-full w-full"
          />

          <div className="absolute top-2.5 left-2.5 right-12 z-[1000] clear-glass-card px-3 py-1.5 rounded-xl flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-extrabold text-[#304C64] whitespace-nowrap">{mapBus?.busNumber}</span>
              <span className="text-slate-400">·</span>
              <span className="text-slate-600 font-medium truncate">{assignedStop?.name}</span>
            </div>
            <span className="font-extrabold text-[var(--accent-amber,#E2480C)] text-[11px] whitespace-nowrap shrink-0">
              {formatETADisplay(etaMinutes)}
            </span>
          </div>

          <div className="absolute bottom-7 left-2.5 right-2.5 z-20 clear-glass-card p-3 rounded-2xl space-y-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xl font-black text-[#304C64] tracking-tight tabular-nums">
                {formatETADisplay(etaMinutes)}
              </span>
              <span className="text-[11px] text-[var(--primary)] font-bold whitespace-nowrap">
                {distanceMeters > 1000 ? `${(distanceMeters / 1000).toFixed(1)} km` : `${distanceMeters}m`} away
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
              <span className="truncate">Stop: <strong className="text-[#304C64]">{assignedStop?.name}</strong></span>
              <span className="whitespace-nowrap shrink-0">{Math.round(mapLocation?.speed || 25)} km/h</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="role-section-guardian" className="p-3 space-y-2.5 pb-4 animate-in fade-in duration-200">
      {renderRoleBanner()}

      <div className="relative">
        <LiveBusMap
          bus={mapBus}
          location={mapLocation}
          route={mapRoute}
          highlightStopId={mapStopId}
          assignedStudent={activeChild}
          isStale={isBusLocationStale}
          className="h-52 w-full"
        />
        <button
          type="button"
          onClick={() => onTabChange('map')}
          className="absolute bottom-7 right-2.5 z-20 px-2.5 py-1 rounded-full clear-glass-btn text-[11px] font-bold text-[#304C64] flex items-center gap-1 whitespace-nowrap"
        >
          <span>Expand</span>
          <ExternalLink className="w-3 h-3" style={{ color: 'var(--primary)' }} />
        </button>
      </div>

      {renderHomeCards()}
    </div>
  );
};
