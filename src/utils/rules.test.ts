import test from 'node:test';
import assert from 'node:assert/strict';
import {
  haversineDistance,
  calculateBearing,
  determineProximityStage,
  generateEventKey,
  shouldTriggerProximityAlert,
} from './proximity';
import { calculateETAMinutes, formatETADisplay, isLocationStale } from './eta';
import { canTransitionTripState, calculateTripProgress } from './tripState';

test('haversineDistance calculates accurate distance between coordinates', () => {
  // NYC Times Square to Grand Central (~800m)
  const d = haversineDistance(40.758, -73.9855, 40.7527, -73.9772);
  assert.ok(d > 750 && d < 1000, `Expected distance ~800m, got ${d}`);
  
  // Same coordinate is 0
  assert.equal(haversineDistance(51.5, -0.1, 51.5, -0.1), 0);
});

test('calculateBearing returns valid degrees 0-360', () => {
  const bearingNorth = calculateBearing(0, 0, 1, 0);
  assert.ok(bearingNorth >= 0 && bearingNorth < 1, `North should be ~0 deg, got ${bearingNorth}`);

  const bearingEast = calculateBearing(0, 0, 0, 1);
  assert.ok(bearingEast > 89 && bearingEast < 91, `East should be ~90 deg, got ${bearingEast}`);
});

test('determineProximityStage respects thresholds', () => {
  const thresholds = {
    earlyWarningMeters: 2000,
    approachingMeters: 1000,
    nearbyMeters: 500,
    arrivalMeters: 80,
  };

  assert.equal(determineProximityStage(2500, thresholds), 'far');
  assert.equal(determineProximityStage(1800, thresholds), 'early_warning');
  assert.equal(determineProximityStage(950, thresholds), 'approaching');
  assert.equal(determineProximityStage(450, thresholds), 'nearby');
  assert.equal(determineProximityStage(50, thresholds), 'arrived');
  assert.equal(determineProximityStage(0, thresholds), 'arrived');
});

test('shouldTriggerProximityAlert deduplicates events correctly', () => {
  const tripId = 'trip-123';
  const stopId = 'stop-45';
  const key = generateEventKey(tripId, stopId, 'approaching');
  
  const dispatched = new Set<string>();
  assert.equal(shouldTriggerProximityAlert(tripId, stopId, 'approaching', dispatched), true);
  
  dispatched.add(key);
  assert.equal(shouldTriggerProximityAlert(tripId, stopId, 'approaching', dispatched), false);
  
  // Different stage triggers once
  assert.equal(shouldTriggerProximityAlert(tripId, stopId, 'nearby', dispatched), true);
  
  // 'far' stage never triggers alert
  assert.equal(shouldTriggerProximityAlert(tripId, stopId, 'far', dispatched), false);
});

test('calculateETAMinutes and formatETADisplay calculate realistic arrival times', () => {
  assert.equal(calculateETAMinutes(0, 40), 0);
  assert.equal(formatETADisplay(0), 'Arriving now');

  const etaMins = calculateETAMinutes(1500, 30);
  assert.ok(etaMins >= 2 && etaMins <= 8, `Expected reasonable ETA minutes, got ${etaMins}`);
  assert.equal(formatETADisplay(1), '1 min away');
  assert.equal(formatETADisplay(5), '5 mins away');
});

test('isLocationStale detects stale timestamps over threshold', () => {
  const now = Date.now();
  const fresh = new Date(now - 5000).toISOString(); // 5s ago
  const stale = new Date(now - 45000).toISOString(); // 45s ago

  assert.equal(isLocationStale(fresh, 30, now), false);
  assert.equal(isLocationStale(stale, 30, now), true);
  assert.equal(isLocationStale('invalid-date', 30, now), true);
});

test('canTransitionTripState validates trip lifecycle transitions', () => {
  assert.equal(canTransitionTripState('scheduled', 'active'), true);
  assert.equal(canTransitionTripState('scheduled', 'cancelled'), true);
  assert.equal(canTransitionTripState('scheduled', 'completed'), false); // Cannot complete unscheduled
  
  assert.equal(canTransitionTripState('active', 'paused'), true);
  assert.equal(canTransitionTripState('active', 'completed'), true);
  assert.equal(canTransitionTripState('paused', 'active'), true);
  assert.equal(canTransitionTripState('completed', 'active'), false); // Terminal state
});

test('calculateTripProgress calculates percent accurately', () => {
  assert.equal(calculateTripProgress(4, 0), 0);
  assert.equal(calculateTripProgress(4, 2), 50);
  assert.equal(calculateTripProgress(4, 4), 100);
  assert.equal(calculateTripProgress(0, 0), 0);
});
