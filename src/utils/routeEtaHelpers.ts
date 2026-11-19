import { BusLocation, BusRoute, RouteEtaSummary, RouteStop, RouteStopEta } from '../types';
import { haversineDistance } from './proximity';
import { decodeEncodedPolyline } from './coDriverHelpers';

export interface GoogleRoutesApiLeg {
  distanceMeters?: number;
  duration?: string;
  staticDuration?: string;
}

export interface GoogleRoutesApiRoute {
  distanceMeters?: number;
  duration?: string;
  staticDuration?: string;
  polyline?: {
    encodedPolyline?: string;
  };
  legs?: GoogleRoutesApiLeg[];
}

export function parseGoogleDurationSeconds(duration?: string): number {
  if (!duration || typeof duration !== 'string') return 0;
  const parsed = Number(duration.replace(/s$/i, '').trim());
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

export function formatArrivalClock(
  baseTimestampMs: number,
  addSeconds: number,
  timeZone?: string
): string {
  const safeBase = Number.isFinite(baseTimestampMs) ? baseTimestampMs : Date.now();
  const safeAdd = Number.isFinite(addSeconds) ? Math.max(0, addSeconds) : 0;
  const arrivalDate = new Date(safeBase + safeAdd * 1000);
  try {
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      ...(timeZone ? { timeZone } : {}),
    }).format(arrivalDate);
  } catch {
    return arrivalDate.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  }
}

export function formatDistanceCompact(meters: number): string {
  if (!Number.isFinite(meters) || meters <= 0) return '0 m';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function determineTrafficCondition(
  trafficDeltaMinutes: number
): 'clear' | 'moderate' | 'heavy' {
  if (trafficDeltaMinutes >= 5) return 'heavy';
  if (trafficDeltaMinutes >= 2) return 'moderate';
  return 'clear';
}

export function getRemainingStopsForRoute(
  route: BusRoute,
  currentStopIndex: number = 0
): { passedStops: RouteStop[]; upcomingStops: RouteStop[] } {
  const ordered = [...(route.stops || [])].sort(
    (a, b) => a.sequenceOrder - b.sequenceOrder
  );
  if (ordered.length === 0) {
    return { passedStops: [], upcomingStops: [] };
  }

  const upcomingStops = ordered.filter((s) => s.sequenceOrder > currentStopIndex);
  if (upcomingStops.length === 0) {
    // Route complete or near final destination: treat final stop as active target
    return {
      passedStops: ordered.slice(0, -1),
      upcomingStops: [ordered[ordered.length - 1]],
    };
  }

  const upcomingIds = new Set(upcomingStops.map((s) => s.id));
  const passedStops = ordered.filter((s) => !upcomingIds.has(s.id));
  return { passedStops, upcomingStops };
}

export function parseGoogleComputeRoutesEta(params: {
  apiRoute: GoogleRoutesApiRoute;
  route: BusRoute;
  currentStopIndex?: number;
  extraDelayMinutes?: number;
  nowMs?: number;
  timeZone?: string;
}): RouteEtaSummary {
  const {
    apiRoute,
    route,
    currentStopIndex = 0,
    extraDelayMinutes = 0,
    nowMs = Date.now(),
    timeZone,
  } = params;

  const extraDelaySec = Math.max(0, Math.round(extraDelayMinutes * 60));
  const totalDurationSeconds =
    parseGoogleDurationSeconds(apiRoute.duration) + extraDelaySec;
  const rawStaticSeconds = parseGoogleDurationSeconds(apiRoute.staticDuration);
  const staticDurationSeconds =
    rawStaticSeconds > 0 ? rawStaticSeconds : Math.max(0, totalDurationSeconds - extraDelaySec);

  const trafficDeltaMinutes = Math.max(
    0,
    Math.round((totalDurationSeconds - staticDurationSeconds) / 60)
  );
  const totalDistanceMeters = Math.max(0, Math.round(apiRoute.distanceMeters || 0));

  const { passedStops, upcomingStops } = getRemainingStopsForRoute(route, currentStopIndex);
  const legs = Array.isArray(apiRoute.legs) ? apiRoute.legs : [];

  const stopEtas: RouteStopEta[] = [];

  for (const passed of passedStops) {
    stopEtas.push({
      stopId: passed.id,
      stopName: passed.name,
      sequenceOrder: passed.sequenceOrder,
      scheduledTime: passed.scheduledTime,
      estimatedArrivalTime: passed.scheduledTime,
      etaMinutes: 0,
      legDurationSeconds: 0,
      legDistanceMeters: 0,
      cumulativeDistanceMeters: 0,
      isPassed: true,
    });
  }

  let cumulativeSeconds = 0;
  let cumulativeDistance = 0;

  if (upcomingStops.length > 0) {
    if (legs.length >= upcomingStops.length) {
      upcomingStops.forEach((stop, idx) => {
        const leg = legs[idx];
        const legDur =
          parseGoogleDurationSeconds(leg?.duration) + (idx === 0 ? extraDelaySec : 0);
        const legDist = Math.max(0, Math.round(leg?.distanceMeters || 0));
        cumulativeSeconds += legDur;
        cumulativeDistance += legDist;
        stopEtas.push({
          stopId: stop.id,
          stopName: stop.name,
          sequenceOrder: stop.sequenceOrder,
          scheduledTime: stop.scheduledTime,
          estimatedArrivalTime: formatArrivalClock(nowMs, cumulativeSeconds, timeZone),
          etaMinutes: Math.max(1, Math.round(cumulativeSeconds / 60)),
          legDurationSeconds: legDur,
          legDistanceMeters: legDist,
          cumulativeDistanceMeters: cumulativeDistance,
          isPassed: false,
        });
      });
    } else {
      // Proportional allocation if Routes API merges segments or omits per-leg fields
      const totalWeights = upcomingStops.map((_, idx) => idx + 1);
      const count = upcomingStops.length;
      const perStopSec = Math.max(60, Math.round(totalDurationSeconds / count));
      const perStopDist = Math.round(totalDistanceMeters / count);
      upcomingStops.forEach((stop, idx) => {
        cumulativeSeconds =
          idx === count - 1 ? totalDurationSeconds : perStopSec * totalWeights[idx];
        cumulativeDistance =
          idx === count - 1 ? totalDistanceMeters : perStopDist * totalWeights[idx];
        stopEtas.push({
          stopId: stop.id,
          stopName: stop.name,
          sequenceOrder: stop.sequenceOrder,
          scheduledTime: stop.scheduledTime,
          estimatedArrivalTime: formatArrivalClock(nowMs, cumulativeSeconds, timeZone),
          etaMinutes: Math.max(1, Math.round(cumulativeSeconds / 60)),
          legDurationSeconds: perStopSec,
          legDistanceMeters: perStopDist,
          cumulativeDistanceMeters: cumulativeDistance,
          isPassed: false,
        });
      });
    }
  }

  const encodedPolyline = apiRoute.polyline?.encodedPolyline;
  const decodedWaypoints = encodedPolyline
    ? decodeEncodedPolyline(encodedPolyline)
    : undefined;

  const etaMinutes = Math.max(1, Math.round(totalDurationSeconds / 60));

  return {
    routeId: route.id,
    routeName: route.name,
    routeCode: route.code,
    source: 'google_routes_api',
    totalDurationSeconds,
    staticDurationSeconds,
    etaMinutes,
    trafficDeltaMinutes,
    trafficCondition: determineTrafficCondition(trafficDeltaMinutes),
    distanceMeters: totalDistanceMeters,
    estimatedArrivalTime: formatArrivalClock(nowMs, totalDurationSeconds, timeZone),
    encodedPolyline,
    decodedWaypoints: decodedWaypoints && decodedWaypoints.length > 1 ? decodedWaypoints : undefined,
    stopEtas,
    computedAtIso: new Date(nowMs).toISOString(),
  };
}

export interface GoogleJsSdkRouteLegLike {
  distanceMeters?: number;
  durationMillis?: number | null;
  staticDurationMillis?: number | null;
}

export interface GoogleJsSdkLatLngLike {
  lat: number | (() => number);
  lng: number | (() => number);
}

export interface GoogleJsSdkRouteLike {
  distanceMeters?: number;
  durationMillis?: number | null;
  staticDurationMillis?: number | null;
  path?: GoogleJsSdkLatLngLike[];
  legs?: GoogleJsSdkRouteLegLike[];
}

export function parseGoogleJsSdkRouteEta(params: {
  sdkRoute: GoogleJsSdkRouteLike;
  route: BusRoute;
  currentStopIndex?: number;
  extraDelayMinutes?: number;
  nowMs?: number;
  timeZone?: string;
}): RouteEtaSummary {
  const {
    sdkRoute,
    route,
    currentStopIndex = 0,
    extraDelayMinutes = 0,
    nowMs = Date.now(),
    timeZone,
  } = params;

  const extraDelaySec = Math.max(0, Math.round(extraDelayMinutes * 60));
  const rawDurationSec = Math.max(0, Math.round((sdkRoute.durationMillis || 0) / 1000));
  const totalDurationSeconds = rawDurationSec + extraDelaySec;
  const rawStaticSec = Math.max(0, Math.round((sdkRoute.staticDurationMillis || 0) / 1000));
  const staticDurationSeconds =
    rawStaticSec > 0 ? rawStaticSec : Math.max(0, totalDurationSeconds - extraDelaySec);

  const trafficDeltaMinutes = Math.max(
    0,
    Math.round((totalDurationSeconds - staticDurationSeconds) / 60)
  );
  const totalDistanceMeters = Math.max(0, Math.round(sdkRoute.distanceMeters || 0));

  const { passedStops, upcomingStops } = getRemainingStopsForRoute(route, currentStopIndex);
  const legs = Array.isArray(sdkRoute.legs) ? sdkRoute.legs : [];

  const stopEtas: RouteStopEta[] = passedStops.map((passed) => ({
    stopId: passed.id,
    stopName: passed.name,
    sequenceOrder: passed.sequenceOrder,
    scheduledTime: passed.scheduledTime,
    estimatedArrivalTime: passed.scheduledTime,
    etaMinutes: 0,
    legDurationSeconds: 0,
    legDistanceMeters: 0,
    cumulativeDistanceMeters: 0,
    isPassed: true,
  }));

  let cumulativeSeconds = 0;
  let cumulativeDistance = 0;

  if (upcomingStops.length > 0) {
    if (legs.length >= upcomingStops.length) {
      upcomingStops.forEach((stop, idx) => {
        const leg = legs[idx];
        const legDur =
          Math.max(0, Math.round((leg?.durationMillis || 0) / 1000)) +
          (idx === 0 ? extraDelaySec : 0);
        const legDist = Math.max(0, Math.round(leg?.distanceMeters || 0));
        cumulativeSeconds += legDur;
        cumulativeDistance += legDist;
        stopEtas.push({
          stopId: stop.id,
          stopName: stop.name,
          sequenceOrder: stop.sequenceOrder,
          scheduledTime: stop.scheduledTime,
          estimatedArrivalTime: formatArrivalClock(nowMs, cumulativeSeconds, timeZone),
          etaMinutes: Math.max(1, Math.round(cumulativeSeconds / 60)),
          legDurationSeconds: legDur,
          legDistanceMeters: legDist,
          cumulativeDistanceMeters: cumulativeDistance,
          isPassed: false,
        });
      });
    } else {
      const count = upcomingStops.length;
      const perStopSec = Math.max(60, Math.round(totalDurationSeconds / count));
      const perStopDist = Math.round(totalDistanceMeters / count);
      upcomingStops.forEach((stop, idx) => {
        cumulativeSeconds = idx === count - 1 ? totalDurationSeconds : perStopSec * (idx + 1);
        cumulativeDistance = idx === count - 1 ? totalDistanceMeters : perStopDist * (idx + 1);
        stopEtas.push({
          stopId: stop.id,
          stopName: stop.name,
          sequenceOrder: stop.sequenceOrder,
          scheduledTime: stop.scheduledTime,
          estimatedArrivalTime: formatArrivalClock(nowMs, cumulativeSeconds, timeZone),
          etaMinutes: Math.max(1, Math.round(cumulativeSeconds / 60)),
          legDurationSeconds: perStopSec,
          legDistanceMeters: perStopDist,
          cumulativeDistanceMeters: cumulativeDistance,
          isPassed: false,
        });
      });
    }
  }

  const decodedWaypoints: [number, number][] | undefined = Array.isArray(sdkRoute.path)
    ? sdkRoute.path
        .map((pt): [number, number] | null => {
          const lat = typeof pt.lat === 'function' ? pt.lat() : pt.lat;
          const lng = typeof pt.lng === 'function' ? pt.lng() : pt.lng;
          return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
        })
        .filter((coord): coord is [number, number] => coord !== null)
    : undefined;

  return {
    routeId: route.id,
    routeName: route.name,
    routeCode: route.code,
    source: 'google_routes_api',
    totalDurationSeconds,
    staticDurationSeconds,
    etaMinutes: Math.max(1, Math.round(totalDurationSeconds / 60)),
    trafficDeltaMinutes,
    trafficCondition: determineTrafficCondition(trafficDeltaMinutes),
    distanceMeters: totalDistanceMeters,
    estimatedArrivalTime: formatArrivalClock(nowMs, totalDurationSeconds, timeZone),
    decodedWaypoints: decodedWaypoints && decodedWaypoints.length > 1 ? decodedWaypoints : undefined,
    stopEtas,
    computedAtIso: new Date(nowMs).toISOString(),
  };
}

export function computeLocalRouteEta(params: {
  route: BusRoute;
  location?: BusLocation;
  currentStopIndex?: number;
  extraDelayMinutes?: number;
  nowMs?: number;
  timeZone?: string;
}): RouteEtaSummary {
  const {
    route,
    location,
    currentStopIndex = 0,
    extraDelayMinutes = 0,
    nowMs = Date.now(),
    timeZone,
  } = params;

  const { passedStops, upcomingStops } = getRemainingStopsForRoute(route, currentStopIndex);
  const effectiveSpeedKmh =
    location && location.speed > 6 ? location.speed : 26; // Realistic SF urban transit speed
  const speedMps = (effectiveSpeedKmh * 1000) / 3600;
  const roadWindingMultiplier = 1.28; // Urban street grid correction vs straight-line
  const trafficMultiplier = extraDelayMinutes > 0 ? 1.18 : 1.08;

  const stopEtas: RouteStopEta[] = [];
  for (const passed of passedStops) {
    stopEtas.push({
      stopId: passed.id,
      stopName: passed.name,
      sequenceOrder: passed.sequenceOrder,
      scheduledTime: passed.scheduledTime,
      estimatedArrivalTime: passed.scheduledTime,
      etaMinutes: 0,
      legDurationSeconds: 0,
      legDistanceMeters: 0,
      cumulativeDistanceMeters: 0,
      isPassed: true,
    });
  }

  let prevLat = location?.latitude ?? route.stops[0]?.latitude ?? 37.7749;
  let prevLng = location?.longitude ?? route.stops[0]?.longitude ?? -122.4194;

  let cumulativeDurationSec = 0;
  let cumulativeStaticSec = 0;
  let cumulativeDistance = 0;

  upcomingStops.forEach((stop, idx) => {
    const rawMeters = haversineDistance(prevLat, prevLng, stop.latitude, stop.longitude);
    const roadMeters = Math.max(120, Math.round(rawMeters * roadWindingMultiplier));
    const staticLegSec = Math.max(45, Math.round(roadMeters / speedMps));
    const dwellSec = idx > 0 ? 45 : 20; // Stop boarding dwell buffer
    const delaySec = idx === 0 ? Math.max(0, Math.round(extraDelayMinutes * 60)) : 0;
    const trafficLegSec = Math.round(staticLegSec * trafficMultiplier) + dwellSec + delaySec;

    cumulativeStaticSec += staticLegSec + dwellSec;
    cumulativeDurationSec += trafficLegSec;
    cumulativeDistance += roadMeters;

    stopEtas.push({
      stopId: stop.id,
      stopName: stop.name,
      sequenceOrder: stop.sequenceOrder,
      scheduledTime: stop.scheduledTime,
      estimatedArrivalTime: formatArrivalClock(nowMs, cumulativeDurationSec, timeZone),
      etaMinutes: Math.max(1, Math.round(cumulativeDurationSec / 60)),
      legDurationSeconds: trafficLegSec,
      legDistanceMeters: roadMeters,
      cumulativeDistanceMeters: cumulativeDistance,
      isPassed: false,
    });

    prevLat = stop.latitude;
    prevLng = stop.longitude;
  });

  const trafficDeltaMinutes = Math.max(
    0,
    Math.round((cumulativeDurationSec - cumulativeStaticSec) / 60)
  );
  const etaMinutes = Math.max(1, Math.round(cumulativeDurationSec / 60));

  return {
    routeId: route.id,
    routeName: route.name,
    routeCode: route.code,
    source: 'corridor_estimate',
    totalDurationSeconds: cumulativeDurationSec,
    staticDurationSeconds: cumulativeStaticSec,
    etaMinutes,
    trafficDeltaMinutes,
    trafficCondition: determineTrafficCondition(trafficDeltaMinutes),
    distanceMeters: cumulativeDistance,
    estimatedArrivalTime: formatArrivalClock(nowMs, cumulativeDurationSec, timeZone),
    stopEtas,
    computedAtIso: new Date(nowMs).toISOString(),
  };
}
