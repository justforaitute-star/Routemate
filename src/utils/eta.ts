/**
 * Estimates remaining arrival time in minutes.
 * Takes road/straight-line distance, current vehicle speed, and a realistic city traffic minimum speed.
 */
export function calculateETAMinutes(
  distanceMeters: number,
  currentSpeedKmh: number = 30,
  trafficFactor: number = 1.2
): number {
  if (distanceMeters <= 50) return 0;

  // Use at least 15 km/h in urban school zones if vehicle is stopped at traffic lights
  const effectiveSpeedKmh = Math.max(currentSpeedKmh > 5 ? currentSpeedKmh : 22, 15);
  const effectiveSpeedMps = (effectiveSpeedKmh * 1000) / 3600;

  const rawSeconds = (distanceMeters / effectiveSpeedMps) * trafficFactor;
  const minutes = Math.ceil(rawSeconds / 60);

  return Math.max(1, minutes);
}

/**
 * Formats ETA for display (e.g. "Arriving now", "3 mins", "14 mins").
 */
export function formatETADisplay(minutes: number): string {
  if (minutes <= 0) return 'Arriving now';
  if (minutes === 1) return '1 min away';
  return `${minutes} mins away`;
}

/**
 * Checks if a GPS coordinate timestamp is considered stale (e.g. lost connection > 25 seconds).
 */
export function isLocationStale(
  timestampIso: string,
  staleThresholdSeconds: number = 25,
  referenceNowMs: number = Date.now()
): boolean {
  try {
    const timestampMs = new Date(timestampIso).getTime();
    if (isNaN(timestampMs)) return true;
    const diffSeconds = (referenceNowMs - timestampMs) / 1000;
    return diffSeconds > staleThresholdSeconds;
  } catch {
    return true;
  }
}
