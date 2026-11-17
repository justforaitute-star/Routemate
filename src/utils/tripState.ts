import { TripStatus } from '../types';

/**
 * Valid state transitions for a school bus trip.
 */
const ALLOWED_TRANSITIONS: Record<TripStatus, TripStatus[]> = {
  scheduled: ['active', 'cancelled'],
  active: ['paused', 'completed', 'cancelled'],
  paused: ['active', 'completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function canTransitionTripState(from: TripStatus, to: TripStatus): boolean {
  if (from === to) return true;
  const allowed = ALLOWED_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

/**
 * Computes overall completion percentage of a route.
 */
export function calculateTripProgress(totalStops: number, currentStopIndex: number): number {
  if (totalStops <= 0) return 0;
  if (currentStopIndex >= totalStops) return 100;
  return Math.min(100, Math.round((currentStopIndex / totalStops) * 100));
}
