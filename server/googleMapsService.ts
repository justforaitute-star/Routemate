import { AlternativeRouteOption, BusLocation, BusRoute, RouteEtaSummary } from '../src/types';
import {
  computeAlternativeRouteOptions,
  formatGoogleRoutesToOptions,
} from '../src/utils/coDriverHelpers';
import {
  computeLocalRouteEta,
  getRemainingStopsForRoute,
  parseGoogleComputeRoutesEta,
} from '../src/utils/routeEtaHelpers';

export interface ComputeGoogleRoutesResult {
  options: AlternativeRouteOption[];
  quotaExceeded: boolean;
  error?: string;
}

export async function computeGoogleTrafficRoutes(
  route: BusRoute | undefined,
  currentLocation?: BusLocation
): Promise<ComputeGoogleRoutesResult> {
  if (!route || !route.stops || route.stops.length < 2) {
    return { options: [], quotaExceeded: false };
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return {
      options: computeAlternativeRouteOptions(route, currentLocation),
      quotaExceeded: false,
    };
  }

  const originCoord = currentLocation
    ? { latitude: currentLocation.latitude, longitude: currentLocation.longitude }
    : { latitude: route.stops[0].latitude, longitude: route.stops[0].longitude };

  const lastStop = route.stops[route.stops.length - 1];
  const destinationCoord = { latitude: lastStop.latitude, longitude: lastStop.longitude };

  // Intermediate stops between current position and school destination
  const intermediates = route.stops.slice(0, -1).map((stop) => ({
    location: {
      latLng: { latitude: stop.latitude, longitude: stop.longitude },
    },
  }));

  try {
    const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
        'X-Goog-FieldMask':
          'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.routeLabels,routes.description',
      },
      body: JSON.stringify({
        origin: { location: { latLng: originCoord } },
        destination: { location: { latLng: destinationCoord } },
        intermediates: intermediates.length > 0 ? intermediates : undefined,
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
        computeAlternativeRoutes: true,
      }),
    });

    const data = await response.json();

    if (response.status === 429 || data?.error?.status === 'RESOURCE_EXHAUSTED') {
      return {
        options: computeAlternativeRouteOptions(route, currentLocation),
        quotaExceeded: true,
        error: data?.error?.message || 'Google Maps Routes API quota exceeded.',
      };
    }

    if (!response.ok || !Array.isArray(data?.routes) || data.routes.length === 0) {
      return {
        options: computeAlternativeRouteOptions(route, currentLocation),
        quotaExceeded: false,
        error: data?.error?.message,
      };
    }

    const formatted = formatGoogleRoutesToOptions(data.routes, route.stops.length);
    return {
      options: formatted.length > 0 ? formatted : computeAlternativeRouteOptions(route, currentLocation),
      quotaExceeded: false,
    };
  } catch (err: any) {
    return {
      options: computeAlternativeRouteOptions(route, currentLocation),
      quotaExceeded: false,
      error: err?.message,
    };
  }
}

export interface ComputeRouteEtaResult {
  eta: RouteEtaSummary;
  quotaExceeded: boolean;
  error?: string;
}

export async function computeGoogleRouteEta(params: {
  route: BusRoute | undefined;
  currentLocation?: BusLocation;
  currentStopIndex?: number;
  extraDelayMinutes?: number;
}): Promise<ComputeRouteEtaResult> {
  const { route, currentLocation, currentStopIndex = 0, extraDelayMinutes = 0 } = params;

  if (!route || !route.stops || route.stops.length === 0) {
    throw new Error('Route must include at least one stop to compute arrival ETA.');
  }

  const fallbackEta = computeLocalRouteEta({
    route,
    location: currentLocation,
    currentStopIndex,
    extraDelayMinutes,
  });

  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return { eta: fallbackEta, quotaExceeded: false };
  }

  const { upcomingStops } = getRemainingStopsForRoute(route, currentStopIndex);
  if (upcomingStops.length === 0) {
    return { eta: fallbackEta, quotaExceeded: false };
  }

  const originCoord = currentLocation
    ? { latitude: currentLocation.latitude, longitude: currentLocation.longitude }
    : { latitude: route.stops[0].latitude, longitude: route.stops[0].longitude };

  const lastTargetStop = upcomingStops[upcomingStops.length - 1];
  const destinationCoord = {
    latitude: lastTargetStop.latitude,
    longitude: lastTargetStop.longitude,
  };

  const intermediates = upcomingStops.slice(0, -1).map((stop) => ({
    location: {
      latLng: { latitude: stop.latitude, longitude: stop.longitude },
    },
  }));

  try {
    const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
        'X-Goog-FieldMask':
          'routes.duration,routes.staticDuration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.duration,routes.legs.staticDuration,routes.legs.distanceMeters',
      },
      body: JSON.stringify({
        origin: { location: { latLng: originCoord } },
        destination: { location: { latLng: destinationCoord } },
        intermediates: intermediates.length > 0 ? intermediates : undefined,
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
        computeAlternativeRoutes: false,
        languageCode: 'en-US',
        units: 'METRIC',
      }),
    });

    const data = await response.json();

    if (response.status === 429 || data?.error?.status === 'RESOURCE_EXHAUSTED') {
      return {
        eta: fallbackEta,
        quotaExceeded: true,
        error: data?.error?.message || 'Google Maps Routes API quota exceeded.',
      };
    }

    if (!response.ok || !Array.isArray(data?.routes) || data.routes.length === 0) {
      return {
        eta: fallbackEta,
        quotaExceeded: false,
        error: data?.error?.message,
      };
    }

    const eta = parseGoogleComputeRoutesEta({
      apiRoute: data.routes[0],
      route,
      currentStopIndex,
      extraDelayMinutes,
    });

    return { eta, quotaExceeded: false };
  } catch (err: any) {
    return {
      eta: fallbackEta,
      quotaExceeded: false,
      error: err?.message,
    };
  }
}

