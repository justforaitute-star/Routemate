import http from 'http';
import fs from 'fs';
import path from 'path';
import express, { Request, Response } from 'express';
import { initialDb } from './server/db';
import { processLocationPing } from './server/proximityService';
import {
  clearCoDriverSession,
  formatCoDriverError,
  runCoDriverTurn,
  runProactiveCheck,
} from './server/coDriverService';
import { computeGoogleTrafficRoutes } from './server/googleMapsService';
import { attachCoDriverLiveWebSocket } from './server/coDriverLiveService';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '15mb' }));

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true, status: 'healthy', timestamp: new Date().toISOString() });
});

// In-memory server database state
let db = JSON.parse(JSON.stringify(initialDb));
db.sentNotificationKeys = new Set(Array.from(initialDb.sentNotificationKeys));

// SSE clients registry
const sseClients: Response[] = [];

function broadcastEvent(eventName: string, data: any) {
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (let i = sseClients.length - 1; i >= 0; i--) {
    try {
      sseClients[i].write(payload);
    } catch {
      sseClients.splice(i, 1);
    }
  }
}

// SSE endpoint
app.get('/api/stream', (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  res.write('\n');
  sseClients.push(res);

  req.on('close', () => {
    const idx = sseClients.indexOf(res);
    if (idx !== -1) sseClients.splice(idx, 1);
  });
});

// Bootstrap full initial state for client
app.get('/api/bootstrap', (_req: Request, res: Response) => {
  if (db.locations['bus-1'] && db.trips.some((t: any) => t.busId === 'bus-1' && t.status === 'active')) {
    db.locations['bus-1'].timestamp = new Date().toISOString();
  }
  res.json({
    schools: db.schools,
    users: db.users,
    buses: db.buses,
    routes: db.routes,
    students: db.students,
    trips: db.trips,
    locations: db.locations,
    boardingRecords: db.boardingRecords,
    notifications: db.notifications,
    incidents: db.incidents,
    preferences: db.preferences,
  });
});

// GPS Location Ping from Driver App
app.post('/api/locations/ping', (req: Request, res: Response) => {
  const result = processLocationPing(db, req.body, broadcastEvent);
  if (!result.success) {
    return res.status(400).json({ error: 'Failed to record location ping: bus or active trip not found' });
  }
  res.json(result);
});

// Start Trip
app.post('/api/trips/start', (req: Request, res: Response) => {
  const { busId, routeId, driverId, tripType = 'morning' } = req.body;
  const bus = db.buses.find((b: any) => b.id === busId);
  const route = db.routes.find((r: any) => r.id === routeId);
  const driver = db.users.find((u: any) => u.id === driverId);

  if (!bus || !route) {
    return res.status(400).json({ error: 'Bus or Route not found' });
  }

  // Cancel any old active trip for this bus
  db.trips.forEach((t: any) => {
    if (t.busId === busId && (t.status === 'active' || t.status === 'paused')) {
      t.status = 'completed';
      t.endTime = new Date().toISOString();
    }
  });

  const newTrip = {
    id: `trip-${Date.now()}`,
    schoolId: bus.schoolId,
    busId,
    routeId,
    driverId: driver?.id || 'driver-1',
    driverName: driver?.name || 'Assigned Driver',
    tripType,
    status: 'active',
    startTime: new Date().toISOString(),
    currentStopIndex: 0,
    delayMinutes: 0,
    updatedAt: new Date().toISOString(),
  };

  db.trips.unshift(newTrip);
  bus.status = 'active';
  bus.currentTripId = newTrip.id;

  // Set initial location at first waypoint or stop
  const startCoord = route.waypoints?.[0] || [route.stops[0].latitude, route.stops[0].longitude];
  db.locations[busId] = {
    busId,
    tripId: newTrip.id,
    latitude: startCoord[0],
    longitude: startCoord[1],
    speed: 0,
    heading: 90,
    accuracy: 5,
    timestamp: new Date().toISOString(),
    isStale: false,
  };

  // Broadcast trip start notification to guardians on this route
  const studentsOnRoute = db.students.filter((s: any) => s.routeId === routeId);
  const notifiedGuardians = new Set<string>();

  studentsOnRoute.forEach((s: any) => {
    if (s.guardianId && !notifiedGuardians.has(s.guardianId)) {
      notifiedGuardians.add(s.guardianId);
      const notif = {
        id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        recipientUserId: s.guardianId,
        recipientRole: 'guardian',
        title: `${bus.busNumber} Trip Started`,
        message: `${bus.busNumber} has departed and is on route: ${route.name}. Track live on the map.`,
        type: 'trip_started',
        tripId: newTrip.id,
        timestamp: new Date().toISOString(),
        isRead: false,
        priority: 'normal',
      };
      db.notifications.unshift(notif);
    }
  });

  broadcastEvent('trip_update', newTrip);
  broadcastEvent('bus_update', bus);
  broadcastEvent('bus_location', db.locations[busId]);
  broadcastEvent('new_notifications', db.notifications.slice(0, 5));

  res.json({ trip: newTrip, bus, location: db.locations[busId] });
});

// Pause Trip
app.post('/api/trips/pause', (req: Request, res: Response) => {
  const { tripId } = req.body;
  const trip = db.trips.find((t: any) => t.id === tripId);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });

  trip.status = 'paused';
  trip.updatedAt = new Date().toISOString();
  broadcastEvent('trip_update', trip);
  res.json({ trip });
});

// Resume Trip
app.post('/api/trips/resume', (req: Request, res: Response) => {
  const { tripId } = req.body;
  const trip = db.trips.find((t: any) => t.id === tripId);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });

  trip.status = 'active';
  trip.updatedAt = new Date().toISOString();
  broadcastEvent('trip_update', trip);
  res.json({ trip });
});

// End Trip
app.post('/api/trips/end', (req: Request, res: Response) => {
  const { tripId } = req.body;
  const trip = db.trips.find((t: any) => t.id === tripId);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });

  trip.status = 'completed';
  trip.endTime = new Date().toISOString();
  trip.updatedAt = new Date().toISOString();

  const bus = db.buses.find((b: any) => b.id === trip.busId);
  if (bus) {
    bus.status = 'in_depot';
    bus.currentTripId = undefined;
    broadcastEvent('bus_update', bus);
  }

  // Notify guardians trip completed
  const studentsOnRoute = db.students.filter((s: any) => s.routeId === trip.routeId);
  studentsOnRoute.forEach((s: any) => {
    if (s.guardianId) {
      db.notifications.unshift({
        id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        recipientUserId: s.guardianId,
        recipientRole: 'guardian',
        title: 'Trip Completed',
        message: `${bus?.busNumber || 'School Bus'} has safely completed its journey.`,
        type: 'trip_completed',
        tripId: trip.id,
        timestamp: new Date().toISOString(),
        isRead: false,
        priority: 'normal',
      });
    }
  });

  broadcastEvent('trip_update', trip);
  broadcastEvent('new_notifications', db.notifications.slice(0, 5));
  res.json({ trip, bus });
});

// Boarding: Mark student boarded, absent, or dropped off
app.post('/api/boarding', (req: Request, res: Response) => {
  const { tripId, studentId, stopId, status, driverNotes } = req.body;

  const student = db.students.find((s: any) => s.id === studentId);
  const trip = db.trips.find((t: any) => t.id === tripId);
  const bus = trip ? db.buses.find((b: any) => b.id === trip.busId) : null;

  const record = {
    id: `rec-${Date.now()}`,
    tripId,
    studentId,
    stopId,
    status, // 'boarded' | 'absent' | 'dropped_off'
    timestamp: new Date().toISOString(),
    driverNotes,
  };

  // Upsert boarding record
  const existingIndex = db.boardingRecords.findIndex(
    (r: any) => r.tripId === tripId && r.studentId === studentId
  );
  if (existingIndex >= 0) {
    db.boardingRecords[existingIndex] = record;
  } else {
    db.boardingRecords.unshift(record);
  }

  // Create immediate notification for guardian
  if (student && student.guardianId) {
    let title = '';
    let message = '';
    let notifType: any = 'boarded';

    if (status === 'boarded') {
      title = `${student.fullName} Boarded`;
      message = `${student.fullName} has safely boarded ${bus?.busNumber || 'the school bus'}.`;
      notifType = 'boarded';
    } else if (status === 'dropped_off') {
      title = `${student.fullName} Dropped Off`;
      message = `${student.fullName} has safely arrived and been dropped off.`;
      notifType = 'dropped_off';
    } else if (status === 'absent') {
      title = `${student.fullName} Marked Absent`;
      message = `${student.fullName} was marked absent at the pickup stop.`;
      notifType = 'delay';
    }

    const notif = {
      id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      recipientUserId: student.guardianId,
      recipientRole: 'guardian',
      title,
      message,
      type: notifType,
      tripId,
      studentId,
      stopId,
      timestamp: new Date().toISOString(),
      isRead: false,
      priority: 'high',
    };

    db.notifications.unshift(notif);
    broadcastEvent('new_notifications', [notif]);
  }

  broadcastEvent('boarding_update', record);
  res.json({ record });
});

// Incidents / Delay Reporting
app.post('/api/incidents', (req: Request, res: Response) => {
  const { tripId, busId, driverId, driverName, type, message, severity = 'medium', delayMinutes = 10 } = req.body;

  const trip = db.trips.find((t: any) => t.id === tripId);
  const bus = db.buses.find((b: any) => b.id === busId);

  const incident = {
    id: `inc-${Date.now()}`,
    tripId,
    busId,
    driverId,
    driverName: driverName || 'Driver',
    type,
    message,
    severity,
    timestamp: new Date().toISOString(),
    resolved: false,
  };

  db.incidents.unshift(incident);

  if (trip) {
    trip.delayMinutes = (trip.delayMinutes || 0) + delayMinutes;
    trip.delayReason = message;
    trip.updatedAt = new Date().toISOString();
  }

  if (bus && (type === 'breakdown' || type === 'emergency')) {
    bus.status = 'delayed';
  }

  // Notify all guardians on route of the delay/incident
  if (trip) {
    const studentsOnRoute = db.students.filter((s: any) => s.routeId === trip.routeId);
    studentsOnRoute.forEach((s: any) => {
      if (s.guardianId) {
        db.notifications.unshift({
          id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          recipientUserId: s.guardianId,
          recipientRole: 'guardian',
          title: `Route Delay Alert: ${bus?.busNumber || 'Bus'}`,
          message: `Delay reported: ${message}. Estimated delay: ${delayMinutes} mins.`,
          type: 'delay',
          tripId: trip.id,
          timestamp: new Date().toISOString(),
          isRead: false,
          priority: 'high',
        });
      }
    });
  }

  broadcastEvent('incident_new', incident);
  if (trip) broadcastEvent('trip_update', trip);
  if (bus) broadcastEvent('bus_update', bus);
  broadcastEvent('new_notifications', db.notifications.slice(0, 5));

  res.json({ incident, trip });
});

// Route & Stop Management
app.post('/api/routes', (req: Request, res: Response) => {
  const newRoute = {
    id: `route-${Date.now()}`,
    schoolId: 'school-1',
    ...req.body,
  };
  db.routes.push(newRoute);
  broadcastEvent('routes_update', db.routes);
  res.json({ route: newRoute });
});

app.post('/api/routes/:id/stops', (req: Request, res: Response) => {
  const route = db.routes.find((r: any) => r.id === req.params.id);
  if (!route) return res.status(404).json({ error: 'Route not found' });

  const stop = {
    id: `stop-${Date.now()}`,
    routeId: route.id,
    sequenceOrder: route.stops.length + 1,
    assignedStudentIds: [],
    ...req.body,
  };
  route.stops.push(stop);
  res.json({ stop, route });
});

// Student Management
app.post('/api/students', (req: Request, res: Response) => {
  const newStudent = {
    id: `student-${Date.now()}`,
    schoolId: 'school-1',
    studentIdCode: `STU-${Math.floor(1000 + Math.random() * 9000)}`,
    ...req.body,
  };
  db.students.push(newStudent);
  res.json({ student: newStudent });
});

// Bus Management
app.post('/api/buses', (req: Request, res: Response) => {
  const newBus = {
    id: `bus-${Date.now()}`,
    schoolId: 'school-1',
    status: 'in_depot',
    ...req.body,
  };
  db.buses.push(newBus);
  res.json({ bus: newBus });
});

// Notification Thresholds Config
app.post('/api/settings/thresholds', (req: Request, res: Response) => {
  const { earlyWarningMeters, approachingMeters, nearbyMeters, arrivalMeters } = req.body;
  const school = db.schools[0];
  if (school) {
    school.thresholds = {
      earlyWarningMeters: Number(earlyWarningMeters) || 2000,
      approachingMeters: Number(approachingMeters) || 1000,
      nearbyMeters: Number(nearbyMeters) || 500,
      arrivalMeters: Number(arrivalMeters) || 80,
    };
  }
  res.json({ thresholds: school.thresholds });
});

// Mark notification read
app.post('/api/notifications/mark-read', (req: Request, res: Response) => {
  const { id } = req.body;
  const notif = db.notifications.find((n: any) => n.id === id);
  if (notif) notif.isRead = true;
  res.json({ success: true });
});

// Web Push / FCM device token registration
app.post('/api/notifications/register-token', (req: Request, res: Response) => {
  const { userId, token, platform = 'web' } = req.body;
  if (!userId || !token) return res.status(400).json({ error: 'Missing parameters' });

  const existing = db.deviceTokens.find((t: any) => t.userId === userId && t.token === token);
  if (!existing) {
    db.deviceTokens.push({ userId, token, platform, updatedAt: new Date().toISOString() });
  }
  res.json({ success: true, registered: true });
});

// Traffic-aware route computation via Google Maps Routes API v2
app.post('/api/maps/compute-route', async (req: Request, res: Response) => {
  try {
    const { routeId, busId } = req.body || {};
    const route =
      db.routes.find((r: any) => r.id === routeId) ||
      db.routes[0];
    const targetBusId = busId || route?.assignedBusId || db.buses[0]?.id;
    const currentLocation = targetBusId ? db.locations[targetBusId] : undefined;

    const result = await computeGoogleTrafficRoutes(route, currentLocation);
    if (result.quotaExceeded) {
      return res.status(429).json({
        error: result.error || 'Google Maps Routes API quota exceeded.',
        quotaExceeded: true,
        options: result.options,
      });
    }
    res.json({ options: result.options });
  } catch (err: any) {
    res.status(500).json({
      error: formatCoDriverError(err, 'Failed to compute Google Maps route.'),
    });
  }
});

// AI Co-Driver Conversational Turn (voice audio or text, multilingual + tool execution)
app.post('/api/codriver/turn', async (req: Request, res: Response) => {
  try {
    const { sessionId = 'driver-default', message, audioBase64, mimeType, includeAudio = true } = req.body;
    const result = await runCoDriverTurn({
      sessionId,
      message,
      audioBase64,
      mimeType,
      includeAudio,
      db,
      broadcastEvent,
    });
    res.json(result);
  } catch (err: any) {
    const status = err?.status || err?.statusCode || 500;
    res.status(status >= 400 && status < 600 ? status : 500).json({
      error: formatCoDriverError(err, 'AI Co-Driver request failed.'),
    });
  }
});

// AI Co-Driver Proactive Context Evaluation
app.post('/api/codriver/proactive', async (req: Request, res: Response) => {
  try {
    const { sessionId = 'driver-default', eventType, details, includeAudio = true } = req.body;
    if (!eventType || !details) {
      return res.status(400).json({ error: 'Missing eventType or details' });
    }
    const result = await runProactiveCheck({
      sessionId,
      eventType,
      details,
      includeAudio,
      db,
    });
    res.json(result);
  } catch (err: any) {
    const status = err?.status || err?.statusCode || 500;
    res.status(status >= 400 && status < 600 ? status : 500).json({
      error: formatCoDriverError(err, 'Proactive Co-Driver check failed.'),
    });
  }
});

// Clear AI Co-Driver Session Memory
app.post('/api/codriver/reset', (req: Request, res: Response) => {
  const { sessionId } = req.body || {};
  clearCoDriverSession(sessionId);
  res.json({ success: true });
});

// Reset Demo State
app.post('/api/reset-demo', (_req: Request, res: Response) => {
  db = JSON.parse(JSON.stringify(initialDb));
  db.sentNotificationKeys = new Set(Array.from(initialDb.sentNotificationKeys));
  if (db.locations['bus-1']) {
    db.locations['bus-1'].timestamp = new Date().toISOString();
  }
  clearCoDriverSession();
  broadcastEvent('bootstrap_reset', { message: 'Demo reset' });
  res.json({ success: true, message: 'Database reset to default demo state' });
});

// Mount Vite in dev mode or serve built dist/ in production, and attach Gemini Live WebSocket bridge
async function startServer() {
  const httpServer = http.createServer(app);
  attachCoDriverLiveWebSocket({
    server: httpServer,
    getDb: () => db,
    broadcastEvent,
  });

  const distDir = path.resolve(process.cwd(), 'dist');
  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(distDir);

  if (isProd) {
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`RouteMate server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
