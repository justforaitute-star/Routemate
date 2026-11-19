import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { LiveBusMap } from '../map/LiveBusMap';
import { haversineDistance } from '../../utils/proximity';
import { PaletteSelector } from '../common/PaletteSelector';
import { Avatar } from '../common/Avatar';
import { useMediaQuery } from '../../utils/useMediaQuery';
import {
  Play,
  Pause,
  Square,
  Volume2,
  VolumeX,
  AlertTriangle,
  Navigation,
  Users,
  Gauge,
  Radio,
  History,
  Bus,
  CheckCircle2,
  X,
  Sparkles,
} from 'lucide-react';
import { CoDriverPanel } from './CoDriverPanel';

interface DriverViewProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export const DriverView: React.FC<DriverViewProps> = ({ activeTab, onTabChange }) => {
  const {
    activeTrip,
    activeBus,
    activeLocation,
    routes,
    students,
    trips,
    incidents,
    boardingRecords,
    isBusLocationStale,
    startTrip,
    pauseTrip,
    resumeTrip,
    endTrip,
    markBoarding,
    reportIncident,
    voiceGuidanceEnabled,
    setVoiceGuidanceEnabled,
    currentUser,
  } = useApp();

  const isWideScreen = useMediaQuery('(min-width: 768px)');

  const [selectedIncidentType, setSelectedIncidentType] = useState<string>('traffic');
  const [incidentMessage, setIncidentMessage] = useState<string>('School traffic slowdown along main corridor');
  const [delayMinutes, setDelayMinutes] = useState<number>(10);
  const [showIncidentModal, setShowIncidentModal] = useState<boolean>(false);
  const [isCoDriverHandsFree, setIsCoDriverHandsFree] = useState<boolean>(false);

  const currentRoute = routes.find((r) => r.id === activeTrip?.routeId) || routes[0];
  const stops = currentRoute?.stops || [];
  const currentStopIndex = activeTrip?.currentStopIndex ?? 0;
  const nextStop = stops.find((s) => s.sequenceOrder > currentStopIndex) || stops[stops.length - 1];

  let distanceToNextStop = 0;
  if (activeLocation && nextStop) {
    distanceToNextStop = haversineDistance(
      activeLocation.latitude,
      activeLocation.longitude,
      nextStop.latitude,
      nextStop.longitude
    );
  }

  const studentsAtNextStop = students.filter(
    (s) =>
      s.routeId === currentRoute?.id &&
      ((activeTrip?.tripType === 'morning' && s.morningStopId === nextStop?.id) ||
        (activeTrip?.tripType === 'afternoon' && s.afternoonStopId === nextStop?.id) ||
        nextStop?.assignedStudentIds.includes(s.id))
  );

  const isTripActive = activeTrip?.status === 'active';
  const isTripPaused = activeTrip?.status === 'paused';

  const handleIncidentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTrip || !activeBus) return;

    await reportIncident({
      tripId: activeTrip.id,
      busId: activeBus.id,
      driverId: activeTrip.driverId,
      driverName: activeTrip.driverName,
      type: selectedIncidentType,
      message: incidentMessage,
      severity: selectedIncidentType === 'emergency' ? 'high' : 'medium',
      delayMinutes,
    });

    setShowIncidentModal(false);
  };

  const renderRoleBanner = () => (
    <div className="clear-glass-card rounded-2xl px-3.5 py-2.5 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-8 h-8 rounded-xl clear-glass-btn-primary flex items-center justify-center shrink-0">
          <Bus className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <h2 className="text-xs font-extrabold text-[#304C64] tracking-tight truncate">
            Driver Cockpit
          </h2>
          <p className="text-[10px] font-medium text-slate-500 truncate">
            {currentUser.name} · {activeBus?.busNumber || 'Bus 14'}
          </p>
        </div>
      </div>
      <span className="text-[11px] font-extrabold text-emerald-700 whitespace-nowrap shrink-0">
        {isTripActive ? 'Live GPS' : isTripPaused ? 'Paused' : 'Standby'}
      </span>
    </div>
  );

  // --- SUBVIEW: STOPS ROSTER ---
  const renderStopsRoster = () => (
    <div className="space-y-2.5 animate-in fade-in duration-200">
      <div>
        <h2 className="text-sm font-extrabold text-[#304C64] tracking-tight">Stops & Check-In</h2>
        <p className="text-[11px] text-slate-500 truncate">{currentRoute?.name}</p>
      </div>

      <div className="space-y-2">
        {stops.map((stop) => {
          const isPast = stop.sequenceOrder < currentStopIndex;
          const isCurrent = stop.sequenceOrder === currentStopIndex;

          const stopStudents = students.filter(
            (s) =>
              s.routeId === currentRoute?.id &&
              ((activeTrip?.tripType === 'morning' && s.morningStopId === stop.id) ||
                (activeTrip?.tripType === 'afternoon' && s.afternoonStopId === stop.id) ||
                stop.assignedStudentIds.includes(s.id))
          );

          return (
            <div
              key={stop.id}
              className={`clear-glass-card rounded-2xl p-3 transition-all ${
                isPast ? 'opacity-70' : isCurrent ? 'ring-1 ring-[var(--primary)]' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 ${
                      isPast
                        ? 'bg-emerald-500/20 text-emerald-800 border border-emerald-500/40'
                        : isCurrent
                        ? 'clear-glass-btn-primary'
                        : 'clear-glass-btn text-[#304C64]'
                    }`}
                  >
                    {stop.sequenceOrder}
                  </span>
                  <div className="min-w-0">
                    <h4 className="font-bold text-[#304C64] text-xs leading-tight truncate">{stop.name}</h4>
                    <p className="text-[10px] text-slate-500 truncate mt-0.5">{stop.address}</p>
                  </div>
                </div>
                <span className="text-[11px] font-bold text-[#304C64] shrink-0 whitespace-nowrap">
                  {stop.scheduledTime}
                </span>
              </div>

              {stopStudents.length > 0 && (
                <div className="mt-2 pt-2 border-t border-white/45 space-y-1.5">
                  {stopStudents.map((st) => {
                    const record = boardingRecords.find(
                      (r) => r.tripId === activeTrip?.id && r.studentId === st.id
                    );
                    const status = record?.status || 'pending';

                    return (
                      <div
                        key={st.id}
                        className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-white/25 border border-white/60"
                      >
                        <div className="min-w-0">
                          <span className="font-bold text-xs text-[#304C64] truncate block">{st.fullName}</span>
                          <span className="text-[10px] text-slate-500">{st.grade}</span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() =>
                              markBoarding(activeTrip?.id || 'trip-101', st.id, stop.id, 'boarded')
                            }
                            className={`clear-glass-btn-emerald px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap ${
                              status === 'boarded' ? 'active' : ''
                            }`}
                          >
                            Board
                          </button>
                          <button
                            onClick={() =>
                              markBoarding(activeTrip?.id || 'trip-101', st.id, stop.id, 'absent')
                            }
                            className={`clear-glass-btn-rose px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap ${
                              status === 'absent' ? 'active' : ''
                            }`}
                          >
                            Absent
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  // --- SUBVIEW: TRIP & INCIDENT HISTORY ---
  const renderHistory = () => (
    <div className="space-y-2.5 animate-in fade-in duration-200">
      <div>
        <h2 className="text-sm font-extrabold text-[#304C64] tracking-tight">Trip Log & Incidents</h2>
        <p className="text-[11px] text-slate-500">Recent journeys and reported delays</p>
      </div>

      <div className="space-y-2">
        {trips.map((t) => (
          <div key={t.id} className="clear-glass-card rounded-2xl p-3 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg clear-glass-btn flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-[#304C64] truncate">
                  {t.tripType === 'morning' ? 'Morning Pickup' : 'Afternoon Drop-off'}
                </p>
                <p className="text-[10px] text-slate-500 truncate">
                  Driver: {t.driverName} · {t.status}
                </p>
              </div>
            </div>
            <span className="text-[10px] font-bold text-[var(--primary)] whitespace-nowrap shrink-0">
              {t.delayMinutes > 0 ? `+${t.delayMinutes}m delay` : 'On Time'}
            </span>
          </div>
        ))}
      </div>

      <div className="space-y-1.5 pt-1">
        <h3 className="text-[11px] font-bold text-slate-500">Reported Incidents ({incidents.length})</h3>
        {incidents.length === 0 ? (
          <div className="clear-glass-card rounded-2xl p-4 text-center text-[11px] text-slate-500">
            <History className="w-5 h-5 mx-auto mb-1 text-slate-400" />
            No delays or incidents reported today.
          </div>
        ) : (
          incidents.map((inc) => (
            <div key={inc.id} className="clear-glass-card rounded-2xl p-3 text-xs space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-[#E2480C] capitalize">{inc.type.replace('_', ' ')}</span>
                <span className="text-[10px] text-slate-500 whitespace-nowrap">
                  {new Date(inc.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="text-[11px] text-slate-600">{inc.message}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );

  // --- SUBVIEW: DRIVER PROFILE ---
  const renderProfile = () => (
    <div className="space-y-2.5 animate-in fade-in duration-200">
      <div>
        <h2 className="text-sm font-extrabold text-[#304C64] tracking-tight">Driver Profile</h2>
        <p className="text-[11px] text-slate-500">Vehicle assignment & audio settings</p>
      </div>

      <div className="clear-glass-card rounded-2xl p-3 flex items-center gap-2.5">
        <Avatar src={currentUser.avatarUrl} name={currentUser.name} className="w-10 h-10" />
        <div className="min-w-0 flex-1">
          <h3 className="font-extrabold text-[#304C64] text-xs truncate">{currentUser.name}</h3>
          <p className="text-[11px] text-slate-500 truncate">{currentUser.email}</p>
          <p className="text-[10px] font-bold text-[var(--primary)] mt-0.5">
            {activeBus?.busNumber} · {activeBus?.plateNumber}
          </p>
        </div>
      </div>

      <div className="clear-glass-card rounded-2xl p-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-bold text-[#304C64]">Hands-Free Voice Guidance</p>
          <p className="text-[10px] text-slate-500">Speak stop arrival & trip updates</p>
        </div>
        <button
          onClick={() => setVoiceGuidanceEnabled(!voiceGuidanceEnabled)}
          className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap shrink-0 ${
            voiceGuidanceEnabled ? 'clear-glass-btn-primary' : 'clear-glass-btn'
          }`}
        >
          {voiceGuidanceEnabled ? 'Enabled' : 'Muted'}
        </button>
      </div>

      <div className="clear-glass-card rounded-2xl p-3">
        <PaletteSelector />
      </div>
    </div>
  );

  // --- SUBVIEW: COCKPIT CONTROLS ---
  const renderCockpitControls = () => (
    <div className="space-y-2.5 animate-in fade-in duration-200">
      {/* Hands-Free Multilingual AI Co-Driver */}
      <CoDriverPanel
        compact={!isWideScreen}
        onHandsFreeChange={setIsCoDriverHandsFree}
      />

      {/* Driver Status & Controls Card */}
      <div className="clear-glass-card rounded-2xl p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <span className="text-[11px] font-bold text-slate-600 truncate">
              {isTripActive ? 'Trip In Progress' : isTripPaused ? 'Trip Paused' : 'Ready For Departure'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setVoiceGuidanceEnabled(!voiceGuidanceEnabled)}
              aria-label="Toggle Voice Guidance"
              className={`w-7 h-7 rounded-full flex items-center justify-center ${
                voiceGuidanceEnabled ? 'clear-glass-btn-primary' : 'clear-glass-btn text-slate-400'
              }`}
            >
              {voiceGuidanceEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            </button>

            <span className="text-[11px] font-extrabold text-[var(--primary)] whitespace-nowrap">
              {activeBus?.busNumber || 'Bus 14'}
            </span>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-black text-[#304C64] tracking-tight truncate">
            {currentRoute?.name || 'North Ridge Morning Run'}
          </h2>
          <p className="text-[11px] text-slate-600 mt-0.5">
            GPS Signal:{' '}
            <strong className="font-bold text-[var(--primary)]">
              ±{activeLocation?.accuracy || 6}m accuracy
            </strong>
          </p>
        </div>

        {/* Clear Glass Start / Pause / End Buttons */}
        <div className="pt-1">
          {!isTripActive && !isTripPaused ? (
            <button
              onClick={() => startTrip(activeBus?.id || 'bus-1', currentRoute.id, 'driver-1', 'morning')}
              className="clear-glass-btn-primary w-full flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl font-bold text-xs whitespace-nowrap"
            >
              <Play className="w-3.5 h-3.5 fill-current shrink-0" />
              <span>Start Trip & Share GPS</span>
            </button>
          ) : isTripActive ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => pauseTrip(activeTrip.id)}
                className="clear-glass-btn-amber flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl font-bold text-xs whitespace-nowrap"
              >
                <Pause className="w-3.5 h-3.5 fill-current shrink-0" />
                <span>Pause GPS</span>
              </button>
              <button
                onClick={() => endTrip(activeTrip.id)}
                className="clear-glass-btn-navy flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl font-bold text-xs whitespace-nowrap"
              >
                <Square className="w-3.5 h-3.5 fill-current shrink-0" />
                <span>End Trip</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => resumeTrip(activeTrip.id)}
                className="clear-glass-btn-primary flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl font-bold text-xs whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5 fill-current shrink-0" />
                <span>Resume</span>
              </button>
              <button
                onClick={() => endTrip(activeTrip.id)}
                className="clear-glass-btn-navy flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl font-bold text-xs whitespace-nowrap"
              >
                <Square className="w-3.5 h-3.5 fill-current shrink-0" />
                <span>End</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Next Stop Card */}
      <div className="clear-glass-card rounded-2xl p-3.5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span
            className="text-[11px] font-bold flex items-center gap-1 min-w-0 truncate"
            style={{ color: 'var(--primary)' }}
          >
            <Navigation className="w-3 h-3 shrink-0" />
            <span>Next Stop (#{nextStop?.sequenceOrder || 1})</span>
          </span>
          <span className="text-[11px] font-extrabold text-[#304C64] whitespace-nowrap shrink-0">
            {nextStop?.scheduledTime}
          </span>
        </div>

        <div>
          <h3 className="text-sm font-black text-[#304C64] leading-snug">{nextStop?.name}</h3>
          <p className="text-[11px] text-slate-600 mt-0.5 truncate">{nextStop?.address}</p>
        </div>

        <div className="pt-2 border-t border-white/45 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1 text-slate-700 font-semibold min-w-0 truncate">
            <Users className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--primary)' }} />
            <span className="truncate">{studentsAtNextStop.length} students waiting</span>
          </div>

          <span className="font-extrabold text-xs whitespace-nowrap shrink-0 tabular-nums" style={{ color: 'var(--primary)' }}>
            {distanceToNextStop > 1000 ? `${(distanceToNextStop / 1000).toFixed(1)} km` : `${distanceToNextStop}m`}
          </span>
        </div>
      </div>

      {/* Report Delay Clear Glass Button */}
      <button
        onClick={() => setShowIncidentModal(true)}
        className="clear-glass-btn-rose w-full flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl font-bold text-xs whitespace-nowrap"
      >
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        <span>Report Delay or Traffic Incident</span>
      </button>
    </div>
  );

  // --- INCIDENT MODAL ---
  const renderIncidentModal = () =>
    showIncidentModal && (
      <div
        className="fixed inset-0 z-[1150] bg-slate-900/30 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) setShowIncidentModal(false);
        }}
      >
        <div className="liquid-glass-elevated rounded-t-3xl sm:rounded-3xl w-full max-w-md p-4 shadow-2xl space-y-3 max-h-[85vh] overflow-y-auto">
          <div className="flex items-center justify-between pb-2 border-b border-white/50">
            <h3 className="font-extrabold text-sm text-[#304C64]">Report Traffic Delay</h3>
            <button
              onClick={() => setShowIncidentModal(false)}
              aria-label="Close delay modal"
              className="w-7 h-7 rounded-full clear-glass-btn flex items-center justify-center text-[#304C64]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <form onSubmit={handleIncidentSubmit} className="space-y-3 text-xs">
            <div>
              <label className="block font-bold text-[#304C64] mb-1 text-[11px]">Delay Reason</label>
              <select
                value={selectedIncidentType}
                onChange={(e) => setSelectedIncidentType(e.target.value)}
                className="clear-glass-input w-full p-2 rounded-xl text-xs font-semibold"
              >
                <option value="traffic">Heavy Traffic Slowdown</option>
                <option value="weather">Severe Weather Condition</option>
                <option value="breakdown">Mechanical / Vehicle Issue</option>
                <option value="emergency">Emergency Stoppage</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-[#304C64] mb-1 text-[11px]">Estimated Delay (Minutes)</label>
              <input
                type="number"
                min="1"
                max="60"
                value={delayMinutes}
                onChange={(e) => setDelayMinutes(parseInt(e.target.value, 10) || 1)}
                className="clear-glass-input w-full p-2 rounded-xl text-xs"
              />
            </div>

            <div>
              <label className="block font-bold text-[#304C64] mb-1 text-[11px]">Broadcast Message</label>
              <textarea
                rows={2}
                value={incidentMessage}
                onChange={(e) => setIncidentMessage(e.target.value)}
                className="clear-glass-input w-full p-2 rounded-xl text-xs"
              />
            </div>

            <button
              type="submit"
              className="clear-glass-btn-amber w-full py-2.5 rounded-xl font-bold text-xs"
            >
              Broadcast Alert to Parents & Dispatch
            </button>
          </form>
        </div>
      </div>
    );

  // =========================================================================
  // RESPONSIVE SPLIT VIEW (Tablet & Desktop >= 768px)
  // =========================================================================
  if (isWideScreen) {
    return (
      <div data-testid="role-section-driver" className="flex flex-1 h-full w-full overflow-hidden">
        {/* Left: Cockpit Map */}
        <section className="flex-1 h-full flex flex-col relative overflow-hidden p-3 pr-1.5">
          <div className="relative flex-1 w-full h-full rounded-2xl overflow-hidden">
            <LiveBusMap
              bus={activeBus}
              location={activeLocation}
              route={currentRoute}
              highlightStopId={nextStop?.id}
              isStale={isBusLocationStale}
              className="h-full w-full"
            />

            <div className="absolute top-2.5 left-2.5 right-12 z-[1000] clear-glass-card px-3 py-1.5 rounded-xl flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <span className="font-extrabold text-[#304C64] whitespace-nowrap">{activeBus?.busNumber}</span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-600 font-medium truncate">{currentRoute?.name}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0 whitespace-nowrap">
                {isCoDriverHandsFree && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-[10px] font-extrabold text-emerald-900">
                    <Sparkles className="w-2.5 h-2.5" />
                    Co-Driver Live
                  </span>
                )}
                <span className="flex items-center gap-1 text-[11px] font-bold text-[#304C64] tabular-nums">
                  <Gauge className="w-3 h-3" style={{ color: 'var(--primary)' }} />
                  {Math.round(activeLocation?.speed || 25)} km/h
                </span>
              </div>
            </div>

            <div className="absolute bottom-7 left-2.5 right-2.5 z-20 clear-glass-card px-3 py-2 rounded-xl flex items-center justify-between gap-2 text-[11px]">
              <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                <Radio className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="font-bold text-[#304C64]">
                  {isTripActive ? 'GPS Broadcast Active' : isTripPaused ? 'GPS Paused' : 'Standby'}
                </span>
              </div>
              <span className="font-bold truncate" style={{ color: 'var(--primary)' }}>
                Next: {nextStop?.name} ({distanceToNextStop > 1000 ? `${(distanceToNextStop / 1000).toFixed(1)} km` : `${distanceToNextStop}m`})
              </span>
            </div>
          </div>
        </section>

        {/* Right: Driver Cockpit Controls & Roster */}
        <section className="w-[380px] lg:w-[420px] shrink-0 h-full overflow-y-auto p-3 pl-1.5 space-y-3">
          {renderRoleBanner()}

          {activeTab === 'stops'
            ? renderStopsRoster()
            : activeTab === 'alerts' || activeTab === 'history'
            ? renderHistory()
            : activeTab === 'profile'
            ? renderProfile()
            : renderCockpitControls()}
        </section>

        {renderIncidentModal()}
      </div>
    );
  }

  // =========================================================================
  // MOBILE VIEW (< 768px)
  // =========================================================================
  if (activeTab === 'stops') {
    return (
      <div data-testid="role-section-driver" className="p-3 space-y-2.5 pb-4">
        {renderRoleBanner()}
        {renderStopsRoster()}
      </div>
    );
  }

  if (activeTab === 'alerts' || activeTab === 'history') {
    return (
      <div data-testid="role-section-driver" className="p-3 space-y-2.5 pb-4">
        {renderRoleBanner()}
        {renderHistory()}
      </div>
    );
  }

  if (activeTab === 'profile') {
    return (
      <div data-testid="role-section-driver" className="p-3 space-y-2.5 pb-4">
        {renderRoleBanner()}
        {renderProfile()}
      </div>
    );
  }

  return (
    <div data-testid="role-section-driver" className="p-3 space-y-2.5 pb-4 animate-in fade-in duration-200">
      {renderRoleBanner()}

      <LiveBusMap
        bus={activeBus}
        location={activeLocation}
        route={currentRoute}
        highlightStopId={nextStop?.id}
        isStale={isBusLocationStale}
        className="h-44 w-full"
      />

      {renderCockpitControls()}
      {renderIncidentModal()}
    </div>
  );
};
