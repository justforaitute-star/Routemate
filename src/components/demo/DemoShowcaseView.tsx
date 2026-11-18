import React, { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { LiveBusMap } from '../map/LiveBusMap';
import { Avatar } from '../common/Avatar';
import { PaletteSelector } from '../common/PaletteSelector';
import { PWAInstallButton } from '../pwa/PWAInstallButton';
import { DemoTabId } from '../common/AppDock';
import { requestPushPermission } from '../../utils/pushNotifications';
import {
  MapPin,
  Clock,
  QrCode,
  Check,
  UserX,
  LogOut,
  Bell,
  Send,
  Bus as BusIcon,
  Phone,
  RotateCcw,
  ChevronRight,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';

interface DemoShowcaseViewProps {
  activeTab: DemoTabId;
  onTabChange: (tab: DemoTabId) => void;
}

export const DemoShowcaseView: React.FC<DemoShowcaseViewProps> = ({ activeTab, onTabChange }) => {
  const {
    school,
    buses,
    routes,
    students,
    trips,
    locations,
    boardingRecords,
    notifications,
    activeTrip,
    activeBus,
    activeLocation,
    selectedChildId,
    setSelectedChildId,
    markBoarding,
    markNotificationRead,
    reportIncident,
    resetDemoData,
  } = useApp();

  const [noticeType, setNoticeType] = useState<'delay' | 'traffic' | 'route_change'>('delay');
  const [noticeMessage, setNoticeMessage] = useState('');
  const [noticeDelay, setNoticeDelay] = useState<number>(10);
  const [isSendingNotice, setIsSendingNotice] = useState(false);
  const [noticeSentFeedback, setNoticeSentFeedback] = useState(false);
  const [pushStatus, setPushStatus] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );

  const activeRoute = useMemo(
    () => routes.find((r) => r.id === activeTrip?.routeId) || routes[0],
    [routes, activeTrip]
  );

  const familyStudents = useMemo(() => {
    const mine = students.filter((s) => s.guardianId === 'parent-1');
    return mine.length > 0 ? mine : students.slice(0, 2);
  }, [students]);

  const selectedStudent = useMemo(
    () =>
      familyStudents.find((s) => s.id === selectedChildId) ||
      familyStudents[0] ||
      students[0],
    [familyStudents, selectedChildId, students]
  );

  const assignedStop = useMemo(
    () => activeRoute?.stops.find((st) => st.id === selectedStudent?.morningStopId),
    [activeRoute, selectedStudent]
  );

  const routeStudents = useMemo(
    () =>
      students.filter((s) => !activeRoute || s.routeId === activeRoute.id),
    [students, activeRoute]
  );

  const getBoardingStatus = (studentId: string) => {
    if (!activeTrip) return 'pending';
    const rec = boardingRecords.find(
      (r) => r.tripId === activeTrip.id && r.studentId === studentId
    );
    return rec?.status || 'pending';
  };

  const selectedStudentStatus = selectedStudent
    ? getBoardingStatus(selectedStudent.id)
    : 'pending';

  const statusLabel: Record<string, string> = {
    boarded: 'On Board',
    dropped_off: 'Arrived at Campus',
    absent: 'Excused Absent',
    pending: 'Scheduled',
  };

  const handleEnablePush = async () => {
    const result = await requestPushPermission();
    setPushStatus(result);
  };

  const handleSendNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTrip || !activeBus || !noticeMessage.trim()) return;
    setIsSendingNotice(true);
    try {
      await reportIncident({
        tripId: activeTrip.id,
        busId: activeBus.id,
        driverId: activeTrip.driverId || 'driver-1',
        driverName: activeTrip.driverName || 'Marcus Vance',
        type: noticeType,
        message: noticeMessage.trim(),
        severity: noticeType === 'delay' ? 'medium' : 'low',
        delayMinutes: noticeType === 'delay' || noticeType === 'traffic' ? noticeDelay : 0,
      });
      setNoticeMessage('');
      setNoticeSentFeedback(true);
      setTimeout(() => setNoticeSentFeedback(false), 3000);
    } finally {
      setIsSendingNotice(false);
    }
  };

  // =========================================================
  // TAB 1: OVERVIEW (Unified Map + Schedule + Family Pass + Quick Check-In)
  // =========================================================
  if (activeTab === 'overview') {
    const scheduleStatus =
      activeTrip && activeTrip.delayMinutes > 0
        ? `+${activeTrip.delayMinutes} min schedule adjustment`
        : 'Operating on schedule';

    const boardedCount = routeStudents.filter((s) => getBoardingStatus(s.id) === 'boarded').length;

    return (
      <div className="flex-1 flex flex-col md:flex-row gap-3 p-3 min-h-0 md:overflow-hidden">
        {/* Interactive Google Map Corridor Canvas */}
        <div className="relative h-[250px] sm:h-[300px] md:h-full md:flex-1 shrink-0 rounded-2xl overflow-hidden shadow-sm">
          <LiveBusMap
            bus={activeBus}
            location={activeLocation}
            route={activeRoute}
            highlightStopId={selectedStudent?.morningStopId}
            assignedStudent={selectedStudent}
            className="w-full h-full"
            showControls
            isInteractive
          />

          {/* Compact Top-Left Clear Glass Corridor Summary (leaves Google Maps bottom attribution clear) */}
          <div className="pointer-events-none absolute top-2.5 left-2.5 right-12 z-10 flex items-start">
            <div className="clear-glass-card rounded-2xl px-3 py-2 max-w-xs shadow-md">
              <p className="text-xs font-extrabold text-[#304C64] truncate">
                {activeBus?.busNumber || 'Bus 14'} · {activeRoute?.name || 'Route 14A'}
              </p>
              <p className="text-[11px] font-medium text-slate-600 truncate">
                {activeTrip?.driverName || 'Marcus Vance'} · {activeRoute?.stops.length || 4} Scheduled Stops
              </p>
            </div>
          </div>
        </div>

        {/* Right Showcase Column */}
        <div className="w-full md:w-[390px] lg:w-[420px] shrink-0 md:overflow-y-auto space-y-3 pb-2 md:pr-0.5">
          {/* 1. Active Route & Schedule */}
          <section className="clear-glass-card rounded-2xl p-3.5 space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-sm font-extrabold text-[#304C64] truncate">
                  {activeRoute?.name || 'Oakridge Route 14A'}
                </h2>
                <p className="text-[11px] text-slate-600 font-medium mt-0.5">
                  {activeBus?.busNumber || 'Bus 14'} · {activeBus?.model || 'Blue Bird Vision EV'} · {activeTrip?.driverName || 'Marcus Vance'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onTabChange('roster')}
                className="clear-glass-btn px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-[#26788E] whitespace-nowrap shrink-0 flex items-center gap-1"
              >
                <span>Roster</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/50 text-[11px] font-semibold">
              <span className="flex items-center gap-1.5 text-[#304C64]">
                <Clock className="w-3.5 h-3.5 text-[#26788E]" />
                07:35 AM – 08:15 AM
              </span>
              <span
                className={
                  activeTrip && activeTrip.delayMinutes > 0
                    ? 'text-[#E2480C]'
                    : 'text-[#059669]'
                }
              >
                {scheduleStatus}
              </span>
            </div>
          </section>

          {/* 2. Family & Digital Student Pass */}
          {selectedStudent && (
            <section className="clear-glass-card rounded-2xl p-3.5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                  Family & Digital Pass
                </h2>
                <div className="flex items-center gap-1.5">
                  {familyStudents.map((child) => {
                    const isSelected = child.id === selectedStudent.id;
                    return (
                      <button
                        key={child.id}
                        type="button"
                        onClick={() => setSelectedChildId(child.id)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all whitespace-nowrap ${
                          isSelected ? 'clear-glass-btn-primary' : 'clear-glass-btn'
                        }`}
                      >
                        {child.fullName.split(' ')[0]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar
                    src={selectedStudent.avatarUrl}
                    name={selectedStudent.fullName}
                    className="w-10 h-10"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold text-[#304C64] truncate">
                      {selectedStudent.fullName}
                    </p>
                    <p className="text-[11px] text-slate-600 font-medium truncate">
                      {selectedStudent.grade} · {assignedStop?.name || 'Grove Park & Polk'} · {assignedStop?.scheduledTime || '07:46 AM'}
                    </p>
                  </div>
                </div>
                <span className="text-[11px] font-extrabold text-[#26788E] whitespace-nowrap shrink-0">
                  {statusLabel[selectedStudentStatus]}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-white/40 border border-white/75">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-lg clear-glass-btn-navy flex items-center justify-center shrink-0">
                    <QrCode className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold text-[#304C64] truncate">
                      Pass {selectedStudent.studentIdCode}
                    </p>
                    <p className="text-[11px] text-slate-600 truncate">
                      Verified · {activeBus?.busNumber || 'Bus 14'} · Morning Corridor
                    </p>
                  </div>
                </div>
                <ShieldCheck className="w-4 h-4 text-[#059669] shrink-0" />
              </div>
            </section>
          )}

          {/* 3. Quick Student Check-In */}
          <section className="clear-glass-card rounded-2xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                Quick Check-In · {boardedCount}/{routeStudents.length} On Board
              </h2>
              <button
                type="button"
                onClick={() => onTabChange('roster')}
                className="text-[11px] font-bold text-[#26788E] hover:underline whitespace-nowrap"
              >
                All Stops
              </button>
            </div>

            <div className="space-y-2">
              {routeStudents.slice(0, 3).map((student) => {
                const stStatus = getBoardingStatus(student.id);
                return (
                  <div
                    key={student.id}
                    className="flex items-center justify-between gap-2 p-2 rounded-xl bg-white/35 border border-white/65"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar
                        src={student.avatarUrl}
                        name={student.fullName}
                        className="w-8 h-8"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[#304C64] truncate">
                          {student.fullName}
                        </p>
                        <p className="text-[10px] text-slate-500 truncate">
                          {student.grade} · {statusLabel[stStatus]}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          activeTrip &&
                          markBoarding(activeTrip.id, student.id, student.morningStopId, 'boarded')
                        }
                        aria-label={`Board ${student.fullName}`}
                        className={`min-h-[36px] px-2.5 rounded-lg text-[11px] font-bold flex items-center gap-1 ${
                          stStatus === 'boarded'
                            ? 'clear-glass-btn-emerald active'
                            : 'clear-glass-btn-emerald'
                        }`}
                      >
                        <Check className="w-3 h-3" />
                        <span>Board</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          activeTrip &&
                          markBoarding(
                            activeTrip.id,
                            student.id,
                            student.morningStopId,
                            'dropped_off'
                          )
                        }
                        aria-label={`Drop off ${student.fullName}`}
                        className={`min-h-[36px] px-2 rounded-lg text-[11px] font-bold flex items-center gap-1 ${
                          stStatus === 'dropped_off'
                            ? 'clear-glass-btn-primary'
                            : 'clear-glass-btn'
                        }`}
                      >
                        <LogOut className="w-3 h-3" />
                        <span>Drop</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 4. District Summary */}
          <section className="clear-glass-card rounded-2xl p-3.5">
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                District Summary
              </h2>
              <button
                type="button"
                onClick={() => onTabChange('fleet')}
                className="text-[11px] font-bold text-[#26788E] hover:underline whitespace-nowrap"
              >
                Fleet & Theme
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded-xl bg-white/35 border border-white/60">
                <p className="text-base font-extrabold text-[#304C64]">{buses.length}</p>
                <p className="text-[10px] font-semibold text-slate-500">Vehicles</p>
              </div>
              <div className="p-2 rounded-xl bg-white/35 border border-white/60">
                <p className="text-base font-extrabold text-[#304C64]">{students.length}</p>
                <p className="text-[10px] font-semibold text-slate-500">Students</p>
              </div>
              <div className="p-2 rounded-xl bg-white/35 border border-white/60">
                <p className="text-base font-extrabold text-[#059669]">99.4%</p>
                <p className="text-[10px] font-semibold text-slate-500">On-Time</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  // =========================================================
  // TAB 2: ROSTER (Chronological Stops + Interactive Student Boarding)
  // =========================================================
  if (activeTab === 'roster') {
    return (
      <div className="flex-1 overflow-y-auto p-3 sm:p-4">
        <div className="max-w-3xl mx-auto space-y-3 pb-4">
          <div className="clear-glass-card rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-extrabold text-[#304C64]">
                {activeRoute?.name || 'Route 14A'} · Stop & Student Roster
              </h2>
              <p className="text-xs text-slate-600 font-medium">
                {activeBus?.busNumber || 'Bus 14'} · Driver {activeTrip?.driverName || 'Marcus Vance'} · {routeStudents.length} assigned students
              </p>
            </div>
            <button
              type="button"
              onClick={() => onTabChange('overview')}
              className="clear-glass-btn px-3 py-2 rounded-xl text-xs font-bold text-[#304C64] self-start sm:self-auto"
            >
              Back to Overview
            </button>
          </div>

          {activeRoute?.stops.map((stop) => {
            const stopStudents = routeStudents.filter((s) => s.morningStopId === stop.id);
            const isSchoolCampus = stop.sequenceOrder === activeRoute.stops.length;

            return (
              <section key={stop.id} className="clear-glass-card rounded-2xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold text-white shrink-0 ${
                        isSchoolCampus ? 'bg-[#059669]' : 'bg-[#26788E]'
                      }`}
                    >
                      {stop.sequenceOrder}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-extrabold text-[#304C64] truncate">
                        {stop.name}
                      </h3>
                      <p className="text-xs text-slate-600 flex items-center gap-1 truncate">
                        <MapPin className="w-3 h-3 shrink-0 text-slate-400" />
                        <span className="truncate">{stop.address}</span>
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-[#26788E] whitespace-nowrap shrink-0">
                    {stop.scheduledTime}
                  </span>
                </div>

                {stopStudents.length > 0 ? (
                  <div className="space-y-2 pt-2 border-t border-white/50">
                    {stopStudents.map((student) => {
                      const stStatus = getBoardingStatus(student.id);
                      return (
                        <div
                          key={student.id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-2.5 rounded-xl bg-white/40 border border-white/70"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Avatar
                              src={student.avatarUrl}
                              name={student.fullName}
                              className="w-9 h-9"
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-extrabold text-[#304C64] truncate">
                                {student.fullName}
                              </p>
                              <p className="text-[11px] text-slate-600 truncate">
                                {student.grade} · {student.studentIdCode} · Parent: {student.guardianName}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                activeTrip &&
                                markBoarding(activeTrip.id, student.id, stop.id, 'boarded')
                              }
                              className={`min-h-[40px] px-3 rounded-xl text-xs font-bold flex items-center gap-1 ${
                                stStatus === 'boarded'
                                  ? 'clear-glass-btn-emerald active'
                                  : 'clear-glass-btn-emerald'
                              }`}
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Board</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                activeTrip &&
                                markBoarding(activeTrip.id, student.id, stop.id, 'dropped_off')
                              }
                              className={`min-h-[40px] px-3 rounded-xl text-xs font-bold flex items-center gap-1 ${
                                stStatus === 'dropped_off'
                                  ? 'clear-glass-btn-primary'
                                  : 'clear-glass-btn'
                              }`}
                            >
                              <LogOut className="w-3.5 h-3.5" />
                              <span>Drop Off</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                activeTrip &&
                                markBoarding(activeTrip.id, student.id, stop.id, 'absent')
                              }
                              className={`min-h-[40px] px-3 rounded-xl text-xs font-bold flex items-center gap-1 ${
                                stStatus === 'absent'
                                  ? 'clear-glass-btn-rose active'
                                  : 'clear-glass-btn-rose'
                              }`}
                            >
                              <UserX className="w-3.5 h-3.5" />
                              <span>Absent</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 pt-2 border-t border-white/50">
                    {isSchoolCampus
                      ? 'Final campus drop-off & morning arrival verification'
                      : 'Scheduled corridor timing waypoint'}
                  </p>
                )}
              </section>
            );
          })}
        </div>
      </div>
    );
  }

  // =========================================================
  // TAB 3: ALERTS (Notifications Feed + Broadcast Route Notice)
  // =========================================================
  if (activeTab === 'alerts') {
    const unreadCount = notifications.filter((n) => !n.isRead).length;

    return (
      <div className="flex-1 overflow-y-auto p-3 sm:p-4">
        <div className="max-w-3xl mx-auto space-y-3 pb-4">
          {/* Header + Push Notification Preference */}
          <div className="clear-glass-card rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-extrabold text-[#304C64]">
                Family & Campus Alerts
              </h2>
              <p className="text-xs text-slate-600">
                {notifications.length} updates · {unreadCount} unread
              </p>
            </div>

            <button
              type="button"
              onClick={handleEnablePush}
              className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 self-start sm:self-auto ${
                pushStatus === 'granted' ? 'clear-glass-btn-emerald active' : 'clear-glass-btn'
              }`}
            >
              <Bell className="w-3.5 h-3.5" />
              <span>
                {pushStatus === 'granted' ? 'Browser Alerts Active' : 'Enable Browser Alerts'}
              </span>
            </button>
          </div>

          {/* Broadcast Route Notice Card */}
          <form onSubmit={handleSendNotice} className="clear-glass-card rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                Broadcast Route Notice
              </h3>
              {noticeSentFeedback && (
                <span className="text-xs font-bold text-[#059669] flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Sent to families
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'delay', label: 'Schedule Delay' },
                { id: 'traffic', label: 'Traffic Advisory' },
                { id: 'route_change', label: 'Detour Update' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setNoticeType(opt.id as any)}
                  className={`min-h-[38px] px-2 py-1.5 rounded-xl text-xs font-bold ${
                    noticeType === opt.id ? 'clear-glass-btn-amber' : 'clear-glass-btn'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={noticeMessage}
                onChange={(e) => setNoticeMessage(e.target.value)}
                placeholder="Write a brief message for families and school dispatch..."
                className="clear-glass-input flex-1 rounded-xl px-3 py-2.5 text-xs font-medium"
              />
              {(noticeType === 'delay' || noticeType === 'traffic') && (
                <select
                  aria-label="Estimated delay minutes"
                  value={noticeDelay}
                  onChange={(e) => setNoticeDelay(Number(e.target.value))}
                  className="clear-glass-input rounded-xl px-3 py-2.5 text-xs font-bold"
                >
                  <option value={5}>+5 min</option>
                  <option value={10}>+10 min</option>
                  <option value={15}>+15 min</option>
                </select>
              )}
              <button
                type="submit"
                disabled={isSendingNotice || !noticeMessage.trim()}
                className="clear-glass-btn-primary min-h-[40px] px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send Notice</span>
              </button>
            </div>
          </form>

          {/* Notifications List */}
          <div className="space-y-2">
            {notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  if (!n.isRead) void markNotificationRead(n.id);
                }}
                className={`w-full text-left clear-glass-card rounded-2xl p-3.5 transition-all hover:bg-white/45 ${
                  !n.isRead ? 'border-l-4 border-l-[#E2480C]' : 'opacity-85'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-extrabold text-[#304C64]">{n.title}</p>
                  <span className="text-[11px] font-semibold text-slate-500 whitespace-nowrap shrink-0">
                    {new Date(n.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {!n.isRead ? ' · New' : ''}
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">{n.message}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================
  // TAB 4: FLEET (School Fleet, Contacts, Palette & Reset Demo)
  // =========================================================
  return (
    <div className="flex-1 overflow-y-auto p-3 sm:p-4">
      <div className="max-w-3xl mx-auto space-y-3 pb-4">
        <div className="clear-glass-card rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-extrabold text-[#304C64]">
              {school?.name || 'Oakridge Community Academy'} · Fleet & Settings
            </h2>
            <p className="text-xs text-slate-600">
              {school?.city || 'San Francisco, CA'} · {buses.length} active district vehicles
            </p>
          </div>
          <button
            type="button"
            onClick={() => void resetDemoData()}
            className="clear-glass-btn min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-bold text-[#304C64] flex items-center gap-1.5 self-start sm:self-auto"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Demo Data</span>
          </button>
        </div>

        {/* Fleet Cards */}
        <section className="clear-glass-card rounded-2xl p-4 space-y-2.5">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
            District Vehicles
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {buses.map((bus) => {
              const busRoute = routes.find((r) => r.assignedBusId === bus.id);
              return (
                <div
                  key={bus.id}
                  className="p-3 rounded-xl bg-white/40 border border-white/70 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-lg clear-glass-btn-primary flex items-center justify-center shrink-0">
                        <BusIcon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-extrabold text-[#304C64] truncate">
                          {bus.busNumber}
                        </p>
                        <p className="text-[10px] text-slate-500 truncate">{bus.plateNumber}</p>
                      </div>
                    </div>
                  </div>
                  <p className="text-[11px] font-semibold text-slate-700 truncate">{bus.model}</p>
                  <p className="text-[10px] text-slate-500 truncate">
                    {busRoute ? `${busRoute.code} · ${busRoute.name}` : 'Reserve Unit'} · {bus.capacity} seats
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* School Dispatch Contacts */}
        {school && (
          <section className="clear-glass-card rounded-2xl p-4 space-y-2">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
              Dispatch Contacts
            </h3>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-[#304C64]">
              <span className="flex items-center gap-1.5 font-semibold">
                <Phone className="w-3.5 h-3.5 text-[#26788E]" />
                Main Office: {school.contactPhone}
              </span>
              <span className="flex items-center gap-1.5 font-semibold text-[#E2480C]">
                <Phone className="w-3.5 h-3.5" />
                Dispatch Priority: {school.emergencyPhone}
              </span>
            </div>
          </section>
        )}

        {/* Palette Customization & Install */}
        <section className="clear-glass-card rounded-2xl p-4 space-y-4">
          <PaletteSelector />
          <PWAInstallButton variant="card" />
        </section>
      </div>
    </div>
  );
};
