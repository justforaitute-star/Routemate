import { NotificationThresholds } from '../types';

export type ProximityStage = 'far' | 'early_warning' | 'approaching' | 'nearby' | 'arrived';

/**
 * Calculates the great-circle distance between two GPS points in meters using the Haversine formula.
 */
export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth's radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

/**
 * Calculates the compass bearing in degrees from point 1 to point 2.
 */
export function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;

  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

  const θ = Math.atan2(y, x);
  return (toDeg(θ) + 360) % 360;
}

/**
 * Determines the proximity stage based on current distance in meters and thresholds.
 */
export function determineProximityStage(
  distanceMeters: number,
  thresholds: NotificationThresholds
): ProximityStage {
  if (distanceMeters <= thresholds.arrivalMeters) {
    return 'arrived';
  }
  if (distanceMeters <= thresholds.nearbyMeters) {
    return 'nearby';
  }
  if (distanceMeters <= thresholds.approachingMeters) {
    return 'approaching';
  }
  if (distanceMeters <= thresholds.earlyWarningMeters) {
    return 'early_warning';
  }
  return 'far';
}

/**
 * Deterministic persistent event key to avoid duplicate notifications.
 */
export function generateEventKey(tripId: string, stopId: string, stage: ProximityStage): string {
  return `${tripId}:${stopId}:${stage}`;
}

/**
 * Checks if a proximity alert has already fired for this specific stop and stage on this trip.
 */
export function shouldTriggerProximityAlert(
  tripId: string,
  stopId: string,
  stage: ProximityStage,
  dispatchedEventKeys: Set<string> | string[]
): boolean {
  if (stage === 'far') return false;
  const key = generateEventKey(tripId, stopId, stage);
  if (Array.isArray(dispatchedEventKeys)) {
    return !dispatchedEventKeys.includes(key);
  }
  return !dispatchedEventKeys.has(key);
}
