import {
  AlternativeRouteOption,
  BoardingRecord,
  Bus,
  BusLocation,
  BusRoute,
  IncidentReport,
  RouteStop,
  Student,
  Trip,
} from '../types';
import { haversineDistance } from './proximity';
import { calculateETAMinutes } from './eta';

export interface DriverContextSummary {
  busNumber: string;
  busStatus: string;
  tripId: string | null;
  tripStatus: string;
  tripType: string;
  delayMinutes: number;
  delayReason?: string;
  routeName: string;
  routeCode: string;
  speedKmh: number;
  locationCoords: { latitude: number; longitude: number } | null;
  isLocationStale: boolean;
  nextStop: {
    id: string;
    name: string;
    address: string;
    sequenceOrder: number;
    scheduledTime: string;
    distanceMeters: number;
    etaMinutes: number;
    waitingStudents: { id: string; fullName: string; grade: string; status: string }[];
  } | null;
  remainingStopsCount: number;
  boardedCount: number;
  absentCount: number;
  pendingCount: number;
  recentIncidents: { type: string; message: string; timestamp: string }[];
}

export function buildDriverContextSummary(params: {
  bus?: Bus;
  route?: BusRoute;
  trip?: Trip;
  location?: BusLocation;
  students: Student[];
  boardingRecords: BoardingRecord[];
  incidents: IncidentReport[];
  isStale?: boolean;
}): DriverContextSummary {
  const { bus, route, trip, location, students, boardingRecords, incidents, isStale = false } = params;
  const stops = route?.stops || [];
  const currentStopIdx = trip?.currentStopIndex ?? 0;

  const nextStop: RouteStop | undefined =
    stops.find((s) => s.sequenceOrder > currentStopIdx) || stops[stops.length - 1];

  const routeStudents = students.filter((s) => s.routeId === route?.id);

  const getStudentStatus = (studentId: string) => {
    const rec = boardingRecords.find(
      (r) => r.tripId === trip?.id && r.studentId === studentId
    );
    return rec?.status || 'pending';
  };

  let distanceMeters = 0;
  let etaMinutes = 0;
  if (location && nextStop) {
    distanceMeters = haversineDistance(
      location.latitude,
      location.longitude,
      nextStop.latitude,
      nextStop.longitude
    );
    etaMinutes = calculateETAMinutes(distanceMeters, location.speed || 25) + (trip?.delayMinutes || 0);
  }

  const waitingStudents = nextStop
    ? routeStudents
        .filter((s) => {
          const isMorning = trip?.tripType !== 'afternoon';
          return (
            (isMorning && s.morningStopId === nextStop.id) ||
            (!isMorning && s.afternoonStopId === nextStop.id) ||
            nextStop.assignedStudentIds.includes(s.id)
          );
        })
        .map((s) => ({
          id: s.id,
          fullName: s.fullName,
          grade: s.grade,
          status: getStudentStatus(s.id),
        }))
    : [];

  let boardedCount = 0;
  let absentCount = 0;
  let pendingCount = 0;
  routeStudents.forEach((s) => {
    const st = getStudentStatus(s.id);
    if (st === 'boarded' || st === 'dropped_off') boardedCount++;
    else if (st === 'absent') absentCount++;
    else pendingCount++;
  });

  const remainingStopsCount = stops.filter((s) => s.sequenceOrder > currentStopIdx).length;

  return {
    busNumber: bus?.busNumber || 'Bus 14',
    busStatus: bus?.status || 'active',
    tripId: trip?.id || null,
    tripStatus: trip?.status || 'scheduled',
    tripType: trip?.tripType || 'morning',
    delayMinutes: trip?.delayMinutes || 0,
    delayReason: trip?.delayReason,
    routeName: route?.name || 'Assigned School Route',
    routeCode: route?.code || 'RT-01',
    speedKmh: Math.round(location?.speed || 0),
    locationCoords: location
      ? { latitude: location.latitude, longitude: location.longitude }
      : null,
    isLocationStale: isStale,
    nextStop: nextStop
      ? {
          id: nextStop.id,
          name: nextStop.name,
          address: nextStop.address,
          sequenceOrder: nextStop.sequenceOrder,
          scheduledTime: nextStop.scheduledTime,
          distanceMeters,
          etaMinutes,
          waitingStudents,
        }
      : null,
    remainingStopsCount,
    boardedCount,
    absentCount,
    pendingCount,
    recentIncidents: incidents.slice(0, 3).map((i) => ({
      type: i.type,
      message: i.message,
      timestamp: i.timestamp,
    })),
  };
}

export function computeAlternativeRouteOptions(
  route: BusRoute | undefined,
  currentLocation?: BusLocation
): AlternativeRouteOption[] {
  if (!route || !route.stops || route.stops.length === 0) return [];

  const startLat = currentLocation?.latitude ?? route.stops[0].latitude;
  const startLng = currentLocation?.longitude ?? route.stops[0].longitude;
  const endStop = route.stops[route.stops.length - 1];
  const midStops = route.stops.slice(1);

  const bypassWaypoints: [number, number][] = [
    [startLat, startLng],
    [Number((startLat - 0.0022).toFixed(5)), Number((startLng + 0.0038).toFixed(5))],
    [Number(((startLat + endStop.latitude) / 2 - 0.0018).toFixed(5)), Number(((startLng + endStop.longitude) / 2 + 0.0042).toFixed(5))],
    ...midStops.map((s): [number, number] => [s.latitude, s.longitude]),
  ];

  const expressWaypoints: [number, number][] = [
    [startLat, startLng],
    [Number((startLat + 0.0025).toFixed(5)), Number((startLng + 0.0048).toFixed(5))],
    [Number(((startLat + endStop.latitude) / 2 + 0.002).toFixed(5)), Number(((startLng + endStop.longitude) / 2 + 0.0035).toFixed(5))],
    ...midStops.map((s): [number, number] => [s.latitude, s.longitude]),
  ];

  return [
    {
      id: 'alt-franklin-bypass',
      name: 'Franklin St Express Bypass',
      corridorSummary: 'Routes two blocks west via Franklin St to avoid main-corridor congestion while keeping all scheduled student stops.',
      estimatedMinutesSaved: 7,
      distanceDeltaMeters: 350,
      stopsPreserved: route.stops.length,
      totalStops: route.stops.length,
      waypoints: bypassWaypoints,
    },
    {
      id: 'alt-gough-corridor',
      name: 'Gough St Parallel Corridor',
      corridorSummary: 'Uses signal-synchronized Gough St parallel corridor toward Oakridge Academy with fewer left turns.',
      estimatedMinutesSaved: 5,
      distanceDeltaMeters: 520,
      stopsPreserved: route.stops.length,
      totalStops: route.stops.length,
      waypoints: expressWaypoints,
    },
  ];
}

export interface ProactiveTrigger {
  eventType: 'approaching_stop' | 'delay_detected' | 'low_speed_congestion';
  dedupKey: string;
  details: string;
}

export function evaluateProactiveTrigger(
  context: DriverContextSummary,
  seenKeys: Set<string>
): ProactiveTrigger | null {
  if (context.tripStatus !== 'active') return null;

  if (context.delayMinutes >= 5) {
    const key = `delay-${context.tripId}-${context.delayMinutes}`;
    if (!seenKeys.has(key)) {
      return {
        eventType: 'delay_detected',
        dedupKey: key,
        details: `Trip has an active ${context.delayMinutes}-minute delay (${context.delayReason || 'traffic slowdown'}). Next stop is ${context.nextStop?.name || 'upcoming stop'} (${context.nextStop?.etaMinutes || 0} min ETA).`,
      };
    }
  }

  if (context.nextStop && context.nextStop.distanceMeters > 0 && context.nextStop.distanceMeters <= 450) {
    const pendingStudents = context.nextStop.waitingStudents.filter((s) => s.status === 'pending');
    if (pendingStudents.length > 0) {
      const key = `stop-approach-${context.tripId}-${context.nextStop.id}`;
      if (!seenKeys.has(key)) {
        return {
          eventType: 'approaching_stop',
          dedupKey: key,
          details: `Approaching ${context.nextStop.name} (${context.nextStop.distanceMeters}m away). ${pendingStudents.length} student(s) waiting: ${pendingStudents.map((s) => s.fullName).join(', ')}.`,
        };
      }
    }
  }

  return null;
}

export function inferSpeechLangFromText(text: string): string {
  const sample = (text || '').trim();
  if (!sample) return 'en-US';

  if (/[\u0900-\u097F]/.test(sample)) return 'hi-IN'; // Devanagari (Hindi/Marathi)
  if (/[\u0600-\u06FF]/.test(sample)) return 'ar-SA'; // Arabic
  if (/[\u4E00-\u9FFF]/.test(sample)) return 'zh-CN'; // Chinese
  if (/[\u3040-\u30FF]/.test(sample)) return 'ja-JP'; // Japanese
  if (/[\uAC00-\uD7AF]/.test(sample)) return 'ko-KR'; // Korean
  if (/[\u0B80-\u0BFF]/.test(sample)) return 'ta-IN'; // Tamil

  const lower = sample.toLowerCase();
  if (/[ñ¿¡]|\b(hola|retraso|parada|ruta|estudiantes|minutos|tráfico|autobús|sí|gracias)\b/.test(lower)) {
    return 'es-ES';
  }
  if (/[çàâêîôûéèù]|\b(bonjour|retard|arrêt|itinéraire|élèves|merci|embouteillage)\b/.test(lower)) {
    return 'fr-FR';
  }
  if (/[ãõ]|\b(olá|atraso|ônibus|parada|rota|obrigado|trânsito)\b/.test(lower)) {
    return 'pt-BR';
  }
  if (/[äöüß]|\b(hallo|verspätung|haltestelle|schüler|stau|danke)\b/.test(lower)) {
    return 'de-DE';
  }

  return 'en-US';
}

export function decodeEncodedPolyline(encoded: string): [number, number][] {
  if (!encoded) return [];
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    const dLat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dLat;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    const dLng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dLng;

    points.push([Number((lat / 1e5).toFixed(5)), Number((lng / 1e5).toFixed(5))]);
  }

  return points;
}

export function formatGoogleRoutesToOptions(
  apiRoutes: Array<{
    distanceMeters?: number;
    duration?: string;
    description?: string;
    routeLabels?: string[];
    polyline?: { encodedPolyline?: string };
  }>,
  stopsCount: number
): AlternativeRouteOption[] {
  if (!Array.isArray(apiRoutes) || apiRoutes.length === 0) return [];
  const parseSeconds = (dur?: string): number => {
    if (!dur) return 0;
    const match = dur.match(/(\d+)/);
    return match ? Number(match[1]) : 0;
  };

  const baseDuration = parseSeconds(apiRoutes[0]?.duration);
  const baseDistance = apiRoutes[0]?.distanceMeters || 0;

  return apiRoutes
    .filter((r) => Boolean(r?.polyline?.encodedPolyline))
    .map((r, idx) => {
      const waypoints = decodeEncodedPolyline(r.polyline?.encodedPolyline || '');
      const durationSec = parseSeconds(r.duration);
      const savedMinutes =
        idx === 0
          ? 0
          : Math.max(1, Math.round((baseDuration - durationSec) / 60) || 4);
      const labels = (r.routeLabels || []).join(', ');
      const desc = r.description?.trim() || (idx === 0 ? 'Primary Google Traffic Route' : `Bypass Corridor #${idx}`);
      return {
        id: `gmaps-route-${idx + 1}`,
        name: desc,
        corridorSummary: `Google Maps Live Traffic (${labels || 'TRAFFIC_AWARE'} · ${Math.max(1, Math.round(durationSec / 60))} min, ${((r.distanceMeters || 0) / 1000).toFixed(1)} km)`,
        estimatedMinutesSaved: savedMinutes,
        distanceDeltaMeters: (r.distanceMeters || 0) - baseDistance,
        stopsPreserved: stopsCount,
        totalStops: stopsCount,
        waypoints,
        source: 'google_routes' as const,
      };
    });
}

