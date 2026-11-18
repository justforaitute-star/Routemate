import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import {
  UserProfile,
  UserRole,
  School,
  Bus,
  BusRoute,
  Student,
  Trip,
  BusLocation,
  BoardingRecord,
  NotificationEvent,
  IncidentReport,
  NotificationThresholds,
  ColorPalette,
  DeviceMode,
} from '../types';
import { playApproachingChime, playArrivalChime, playAlertChime, speakDriverGuidance } from '../utils/audioAlerts';
import { showSystemNotification } from '../utils/pushNotifications';
import { isLocationStale } from '../utils/eta';
import { createClientDemoSeed } from '../data/demoSeed';

interface AppContextType {
  school: School | null;
  users: UserProfile[];
  buses: Bus[];
  routes: BusRoute[];
  students: Student[];
  trips: Trip[];
  locations: Record<string, BusLocation>;
  boardingRecords: BoardingRecord[];
  notifications: NotificationEvent[];
  incidents: IncidentReport[];
  currentUser: UserProfile;
  currentRole: UserRole;
  setCurrentRole: (role: UserRole) => void;
  setCurrentUser: (user: UserProfile) => void;
  isDemoMode: boolean;
  setIsDemoMode: (val: boolean) => void;
  isRealGpsActive: boolean;
  setIsRealGpsActive: (val: boolean) => void;
  networkStatus: 'connected' | 'disconnected' | 'reconnecting';
  voiceGuidanceEnabled: boolean;
  setVoiceGuidanceEnabled: (val: boolean) => void;
  selectedChildId: string;
  setSelectedChildId: (id: string) => void;
  activeTrip: Trip | undefined;
  activeBus: Bus | undefined;
  activeLocation: BusLocation | undefined;
  isBusLocationStale: boolean;
  startTrip: (busId: string, routeId: string, driverId: string, tripType?: 'morning' | 'afternoon') => Promise<void>;
  pauseTrip: (tripId: string) => Promise<void>;
  resumeTrip: (tripId: string) => Promise<void>;
  endTrip: (tripId: string) => Promise<void>;
  sendLocationPing: (payload: { busId: string; tripId: string; latitude: number; longitude: number; speed?: number; heading?: number; accuracy?: number; timestamp?: string }) => Promise<void>;
  markBoarding: (tripId: string, studentId: string, stopId: string, status: 'boarded' | 'absent' | 'dropped_off', driverNotes?: string) => Promise<void>;
  reportIncident: (payload: { tripId: string; busId: string; driverId: string; driverName: string; type: any; message: string; severity?: any; delayMinutes?: number }) => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  resetDemoData: () => Promise<void>;
  isSimulationRunning: boolean;
  toggleSimulation: () => void;
  advanceSimulationStep: () => void;
  colorPalette: ColorPalette;
  setColorPalette: (palette: ColorPalette) => void;
  addRouteStop: (routeId: string, stop: any) => Promise<void>;
  addBus: (bus: any) => Promise<void>;
  addStudent: (student: any) => Promise<void>;
  deviceMode: DeviceMode;
  setDeviceMode: (mode: DeviceMode) => void;
  updateThresholds: (thresholds: NotificationThresholds) => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const initialSeed = React.useMemo(() => createClientDemoSeed(), []);
  const [schools, setSchools] = useState<School[]>(initialSeed.schools);
  const [users, setUsers] = useState<UserProfile[]>(initialSeed.users);
  const [buses, setBuses] = useState<Bus[]>(initialSeed.buses);
  const [routes, setRoutes] = useState<BusRoute[]>(initialSeed.routes);
  const [students, setStudents] = useState<Student[]>(initialSeed.students);
  const [trips, setTrips] = useState<Trip[]>(initialSeed.trips);
  const [locations, setLocations] = useState<Record<string, BusLocation>>(initialSeed.locations);
  const [boardingRecords, setBoardingRecords] = useState<BoardingRecord[]>(initialSeed.boardingRecords);
  const [notifications, setNotifications] = useState<NotificationEvent[]>(initialSeed.notifications);
  const [incidents, setIncidents] = useState<IncidentReport[]>(initialSeed.incidents);

  const [currentRole, setCurrentRole] = useState<UserRole>('guardian');
  const [currentUser, setCurrentUser] = useState<UserProfile>(initialSeed.users[0]);

  const [colorPalette, setColorPaletteState] = useState<ColorPalette>('turquoise');
  const [deviceMode, setDeviceMode] = useState<DeviceMode>('duo');

  const setColorPalette = (palette: ColorPalette) => {
    setColorPaletteState(palette);
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-palette', palette);
    }
  };

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-palette', colorPalette);
    }
  }, [colorPalette]);

  const [isDemoMode, setIsDemoMode] = useState<boolean>(true);
  const [isRealGpsActive, setIsRealGpsActive] = useState<boolean>(false);
  const [networkStatus, setNetworkStatus] = useState<'connected' | 'disconnected' | 'reconnecting'>('connected');
  const [voiceGuidanceEnabled, setVoiceGuidanceEnabled] = useState<boolean>(true);
  const [selectedChildId, setSelectedChildId] = useState<string>('student-1');
  const [isSimulationRunning, setIsSimulationRunning] = useState<boolean>(false);

  const simulationIndexRef = useRef<number>(2);
  const simulationTimerRef = useRef<any>(null);
  const gpsWatchIdRef = useRef<number | null>(null);

  const [backendAvailable, setBackendAvailable] = useState<boolean>(false);

  // Fetch initial bootstrap data
  const fetchBootstrap = useCallback(async () => {
    try {
      const res = await fetch('/api/bootstrap');
      if (!res.ok) throw new Error('Bootstrap failed');
      const data = await res.json();
      setSchools(data.schools || []);
      setUsers(data.users || []);
      setBuses(data.buses || []);
      setRoutes(data.routes || []);
      setStudents(data.students || []);
      setTrips(data.trips || []);
      setLocations(data.locations || {});
      setBoardingRecords(data.boardingRecords || []);
      setNotifications(data.notifications || []);
      setIncidents(data.incidents || []);
      setNetworkStatus('connected');
      setBackendAvailable(true);
    } catch {
      setBackendAvailable(false);
    }
  }, []);

  useEffect(() => {
    fetchBootstrap();
  }, [fetchBootstrap]);

  // Sync role to matching user
  useEffect(() => {
    if (users.length > 0) {
      const matching = users.find((u) => u.role === currentRole);
      if (matching && matching.id !== currentUser.id) {
        setCurrentUser(matching);
      }
    }
  }, [currentRole, users]);

  // Real-time SSE Connection (only when backend API is active)
  useEffect(() => {
    if (!backendAvailable) return;
    let es: EventSource | null = null;
    let reconnectTimeout: any = null;

    function connectSSE() {
      try {
        es = new EventSource('/api/stream');

        es.onopen = () => {
          setNetworkStatus('connected');
        };

        es.addEventListener('bus_location', (event) => {
          const loc: BusLocation = JSON.parse(event.data);
          setLocations((prev) => ({ ...prev, [loc.busId]: loc }));
        });

        es.addEventListener('trip_update', (event) => {
          const updatedTrip: Trip = JSON.parse(event.data);
          setTrips((prev) => {
            const idx = prev.findIndex((t) => t.id === updatedTrip.id);
            if (idx >= 0) {
              const copy = [...prev];
              copy[idx] = updatedTrip;
              return copy;
            }
            return [updatedTrip, ...prev];
          });
        });

        es.addEventListener('bus_update', (event) => {
          const updatedBus: Bus = JSON.parse(event.data);
          setBuses((prev) => {
            const idx = prev.findIndex((b) => b.id === updatedBus.id);
            if (idx >= 0) {
              const copy = [...prev];
              copy[idx] = updatedBus;
              return copy;
            }
            return [...prev, updatedBus];
          });
        });

        es.addEventListener('boarding_update', (event) => {
          const record: BoardingRecord = JSON.parse(event.data);
          setBoardingRecords((prev) => {
            const idx = prev.findIndex((r) => r.id === record.id || (r.tripId === record.tripId && r.studentId === record.studentId));
            if (idx >= 0) {
              const copy = [...prev];
              copy[idx] = record;
              return copy;
            }
            return [record, ...prev];
          });
          playArrivalChime();
        });

        es.addEventListener('new_notifications', (event) => {
          const newNotifs: NotificationEvent[] = JSON.parse(event.data);
          setNotifications((prev) => [...newNotifs, ...prev]);

          newNotifs.forEach((n) => {
            if (n.type === 'approaching' || n.type === 'nearby') {
              playApproachingChime();
              showSystemNotification(n.title, n.message);
            } else if (n.type === 'arrived' || n.type === 'boarded' || n.type === 'dropped_off') {
              playArrivalChime();
              showSystemNotification(n.title, n.message);
            } else if (n.type === 'delay' || n.type === 'emergency') {
              playAlertChime();
              showSystemNotification(n.title, n.message);
            }
          });
        });

        es.addEventListener('incident_new', (event) => {
          const incident: IncidentReport = JSON.parse(event.data);
          setIncidents((prev) => [incident, ...prev]);
          playAlertChime();
        });

        es.addEventListener('routes_update', (event) => {
          const updatedRoutes: BusRoute[] = JSON.parse(event.data);
          setRoutes(updatedRoutes);
        });

        es.addEventListener('bootstrap_reset', () => {
          fetchBootstrap();
        });

        es.onerror = () => {
          setNetworkStatus('reconnecting');
          es?.close();
          reconnectTimeout = setTimeout(connectSSE, 3000);
        };
      } catch {
        setNetworkStatus('disconnected');
        reconnectTimeout = setTimeout(connectSSE, 4000);
      }
    }

    connectSSE();

    return () => {
      es?.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [backendAvailable, fetchBootstrap]);

  // Active Trip & Active Bus resolution
  const activeTrip = trips.find((t) => t.status === 'active' || t.status === 'paused') || trips[0];
  const activeBus = activeTrip ? buses.find((b) => b.id === activeTrip.busId) : buses[0];
  const activeLocation = activeBus ? locations[activeBus.id] : undefined;

  // Stale detection
  const isBusLocationStale = activeLocation ? isLocationStale(activeLocation.timestamp, 25) : false;

  // Location ping handler
  const sendLocationPing = async (payload: {
    busId: string;
    tripId: string;
    latitude: number;
    longitude: number;
    speed?: number;
    heading?: number;
    accuracy?: number;
    timestamp?: string;
  }) => {
    try {
      const res = await fetch('/api/locations/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Ping failed');
    } catch {
      // Local network loss handling
      setNetworkStatus('disconnected');
    }
  };

  // Start Trip
  const startTrip = async (busId: string, routeId: string, driverId: string, tripType: 'morning' | 'afternoon' = 'morning') => {
    const res = await fetch('/api/trips/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ busId, routeId, driverId, tripType }),
    });
    if (res.ok) {
      if (voiceGuidanceEnabled) {
        speakDriverGuidance('Trip started. GPS tracking is live. Drive safely.');
      }
      fetchBootstrap();
    }
  };

  const pauseTrip = async (tripId: string) => {
    const res = await fetch('/api/trips/pause', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tripId }),
    });
    if (res.ok && voiceGuidanceEnabled) {
      speakDriverGuidance('Trip paused. Location sharing paused.');
    }
  };

  const resumeTrip = async (tripId: string) => {
    const res = await fetch('/api/trips/resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tripId }),
    });
    if (res.ok && voiceGuidanceEnabled) {
      speakDriverGuidance('Trip resumed. Location sharing active.');
    }
  };

  const endTrip = async (tripId: string) => {
    const res = await fetch('/api/trips/end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tripId }),
    });
    if (res.ok) {
      setIsSimulationRunning(false);
      if (voiceGuidanceEnabled) {
        speakDriverGuidance('Trip completed. Great job today!');
      }
      fetchBootstrap();
    }
  };

  const markBoarding = async (
    tripId: string,
    studentId: string,
    stopId: string,
    status: 'boarded' | 'absent' | 'dropped_off',
    driverNotes?: string
  ) => {
    const optimisticRecord: BoardingRecord = {
      id: `rec-local-${Date.now()}`,
      tripId,
      studentId,
      stopId,
      status,
      timestamp: new Date().toISOString(),
      driverNotes,
    };
    setBoardingRecords((prev) => {
      const idx = prev.findIndex((r) => r.tripId === tripId && r.studentId === studentId);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = optimisticRecord;
        return copy;
      }
      return [optimisticRecord, ...prev];
    });
    try {
      await fetch('/api/boarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripId, studentId, stopId, status, driverNotes }),
      });
    } catch {
      // Offline / static host fallback already applied optimistically
    }
  };

  const reportIncident = async (payload: {
    tripId: string;
    busId: string;
    driverId: string;
    driverName: string;
    type: any;
    message: string;
    severity?: any;
    delayMinutes?: number;
  }) => {
    const nowIso = new Date().toISOString();
    const delayMins = payload.delayMinutes || 0;
    if (delayMins > 0) {
      setTrips((prev) =>
        prev.map((t) =>
          t.id === payload.tripId ? { ...t, delayMinutes: t.delayMinutes + delayMins, updatedAt: nowIso } : t
        )
      );
    }
    const localNotif: NotificationEvent = {
      id: `notif-local-${Date.now()}`,
      recipientUserId: 'parent-1',
      recipientRole: 'guardian',
      title: delayMins > 0 ? `Schedule Update (+${delayMins} min)` : 'Route Notice',
      message: payload.message,
      type: 'delay',
      tripId: payload.tripId,
      timestamp: nowIso,
      isRead: false,
      priority: 'high',
    };
    setNotifications((prev) => [localNotif, ...prev]);
    try {
      await fetch('/api/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {
      // Offline / static host fallback already applied optimistically
    }
  };

  const markNotificationRead = async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
    try {
      await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
    } catch {
      // Static fallback
    }
  };

  const resetDemoData = async () => {
    const fresh = createClientDemoSeed();
    setSchools(fresh.schools);
    setUsers(fresh.users);
    setBuses(fresh.buses);
    setRoutes(fresh.routes);
    setStudents(fresh.students);
    setTrips(fresh.trips);
    setLocations(fresh.locations);
    setBoardingRecords(fresh.boardingRecords);
    setNotifications(fresh.notifications);
    setIncidents(fresh.incidents);
    simulationIndexRef.current = 1;
    setIsSimulationRunning(false);
    try {
      const res = await fetch('/api/reset-demo', { method: 'POST' });
      if (res.ok) await fetchBootstrap();
    } catch {
      // Static host fallback already reset local seed
    }
  };

  const updateThresholds = async (thresholds: NotificationThresholds) => {
    await fetch('/api/settings/thresholds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(thresholds),
    });
    await fetchBootstrap();
  };

  const addRouteStop = async (routeId: string, stop: any) => {
    await fetch(`/api/routes/${routeId}/stops`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stop),
    });
    await fetchBootstrap();
  };

  const addBus = async (bus: any) => {
    await fetch('/api/buses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bus),
    });
    await fetchBootstrap();
  };

  const addStudent = async (student: any) => {
    await fetch('/api/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(student),
    });
    await fetchBootstrap();
  };

  // Simulation step logic
  const advanceSimulationStep = useCallback(() => {
    if (!activeTrip || !activeBus) return;
    const route = routes.find((r) => r.id === activeTrip.routeId);
    if (!route || !route.waypoints || route.waypoints.length === 0) return;

    let nextIdx = (simulationIndexRef.current + 1) % route.waypoints.length;
    simulationIndexRef.current = nextIdx;

    const [lat, lng] = route.waypoints[nextIdx];

    sendLocationPing({
      busId: activeBus.id,
      tripId: activeTrip.id,
      latitude: lat,
      longitude: lng,
      speed: 26,
      accuracy: 5,
    });
  }, [activeTrip, activeBus, routes]);

  const toggleSimulation = () => {
    setIsSimulationRunning((prev) => !prev);
  };

  // Simulation timer
  useEffect(() => {
    if (isSimulationRunning && activeTrip?.status === 'active') {
      simulationTimerRef.current = setInterval(() => {
        advanceSimulationStep();
      }, 4000);
    } else {
      if (simulationTimerRef.current) clearInterval(simulationTimerRef.current);
    }
    return () => {
      if (simulationTimerRef.current) clearInterval(simulationTimerRef.current);
    };
  }, [isSimulationRunning, activeTrip?.status, advanceSimulationStep]);

  // Real GPS watch position when enabled
  useEffect(() => {
    if (isRealGpsActive && currentRole === 'driver' && activeTrip && activeBus) {
      if ('geolocation' in navigator) {
        gpsWatchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            sendLocationPing({
              busId: activeBus.id,
              tripId: activeTrip.id,
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              speed: pos.coords.speed ? Math.round(pos.coords.speed * 3.6) : 25,
              heading: pos.coords.heading || 0,
              accuracy: Math.round(pos.coords.accuracy),
              timestamp: new Date(pos.timestamp).toISOString(),
            });
          },
          (err) => {
            console.warn('GPS watch error:', err.message);
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 3000 }
        );
      }
    } else {
      if (gpsWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(gpsWatchIdRef.current);
        gpsWatchIdRef.current = null;
      }
    }
    return () => {
      if (gpsWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(gpsWatchIdRef.current);
      }
    };
  }, [isRealGpsActive, currentRole, activeTrip, activeBus]);

  return (
    <AppContext.Provider
      value={{
        school: schools[0] || null,
        users,
        buses,
        routes,
        students,
        trips,
        locations,
        boardingRecords,
        notifications,
        incidents,
        currentUser,
        currentRole,
        setCurrentRole,
        setCurrentUser,
        isDemoMode,
        setIsDemoMode,
        isRealGpsActive,
        setIsRealGpsActive,
        networkStatus,
        voiceGuidanceEnabled,
        setVoiceGuidanceEnabled,
        selectedChildId,
        setSelectedChildId,
        activeTrip,
        activeBus,
        activeLocation,
        isBusLocationStale,
        startTrip,
        pauseTrip,
        resumeTrip,
        endTrip,
        sendLocationPing,
        markBoarding,
        reportIncident,
        markNotificationRead,
        resetDemoData,
        colorPalette,
        setColorPalette,
        isSimulationRunning,
        toggleSimulation,
        advanceSimulationStep,
        updateThresholds,
        addRouteStop,
        addBus,
        addStudent,
        deviceMode,
        setDeviceMode,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
};
