import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeLocalRouteEta,
  determineTrafficCondition,
  formatArrivalClock,
  formatDistanceCompact,
  getRemainingStopsForRoute,
  parseGoogleComputeRoutesEta,
  parseGoogleDurationSeconds,
  parseGoogleJsSdkRouteEta,
} from './routeEtaHelpers.ts';
import { BusLocation, BusRoute } from '../types/index.ts';

const sampleRoute: BusRoute = {
  id: 'route-1',
  schoolId: 'school-1',
  name: 'Route 14A - North Valley Run',
  code: 'NR-14A',
  type: 'morning',
  assignedBusId: 'bus-1',
  waypoints: [
    [37.78, -122.425],
    [37.7745, -122.418],
    [37.768, -122.41],
    [37.762, -122.402],
  ],
  stops: [
    {
      id: 'stop-1',
      routeId: 'route-1',
      name: 'Pine St & Webster',
      address: '2100 Pine St',
      latitude: 37.78,
      longitude: -122.425,
      sequenceOrder: 1,
      scheduledTime: '07:35 AM',
      assignedStudentIds: [],
    },
    {
      id: 'stop-2',
      routeId: 'route-1',
      name: 'Grove Park & Polk',
      address: '450 Grove St',
      latitude: 37.7745,
      longitude: -122.418,
      sequenceOrder: 2,
      scheduledTime: '07:46 AM',
      assignedStudentIds: ['student-1'],
    },
    {
      id: 'stop-3',
      routeId: 'route-1',
      name: 'Oakridge Academy',
      address: '500 Oakridge Pkwy',
      latitude: 37.762,
      longitude: -122.402,
      sequenceOrder: 3,
      scheduledTime: '08:10 AM',
      assignedStudentIds: [],
    },
  ],
};

const sampleLocation: BusLocation = {
  busId: 'bus-1',
  tripId: 'trip-101',
  latitude: 37.7785,
  longitude: -122.423,
  speed: 28,
  heading: 142,
  accuracy: 5,
  timestamp: '2026-11-19T15:38:00.000Z',
};

describe('routeEtaHelpers', () => {
  it('parses Google Routes API ISO duration strings safely', () => {
    assert.equal(parseGoogleDurationSeconds('742s'), 742);
    assert.equal(parseGoogleDurationSeconds('165.6s'), 166);
    assert.equal(parseGoogleDurationSeconds('0s'), 0);
    assert.equal(parseGoogleDurationSeconds(undefined), 0);
  });

  it('formats compact distances cleanly', () => {
    assert.equal(formatDistanceCompact(0), '0 m');
    assert.equal(formatDistanceCompact(640), '640 m');
    assert.equal(formatDistanceCompact(2480), '2.5 km');
  });

  it('determines traffic severity thresholds', () => {
    assert.equal(determineTrafficCondition(0), 'clear');
    assert.equal(determineTrafficCondition(2), 'moderate');
    assert.equal(determineTrafficCondition(6), 'heavy');
  });

  it('splits passed and upcoming stops accurately', () => {
    const res = getRemainingStopsForRoute(sampleRoute, 1);
    assert.equal(res.passedStops.length, 1);
    assert.equal(res.passedStops[0].id, 'stop-1');
    assert.equal(res.upcomingStops.length, 2);
    assert.equal(res.upcomingStops[0].id, 'stop-2');
    assert.equal(res.upcomingStops[1].id, 'stop-3');
  });

  it('parses Google Routes API response with legs into cumulative per-stop ETAs', () => {
    const fixedNow = Date.UTC(2026, 10, 19, 15, 40, 0); // 07:40 AM PST
    const summary = parseGoogleComputeRoutesEta({
      route: sampleRoute,
      currentStopIndex: 1,
      nowMs: fixedNow,
      timeZone: 'America/Los_Angeles',
      apiRoute: {
        distanceMeters: 3100,
        duration: '720s', // 12 min
        staticDuration: '540s', // 9 min (+3 min traffic)
        polyline: { encodedPolyline: 'ipkcFfichVnP@j@BLoFVwM{E?' },
        legs: [
          { distanceMeters: 900, duration: '240s', staticDuration: '180s' },
          { distanceMeters: 2200, duration: '480s', staticDuration: '360s' },
        ],
      },
    });

    assert.equal(summary.source, 'google_routes_api');
    assert.equal(summary.etaMinutes, 12);
    assert.equal(summary.trafficDeltaMinutes, 3);
    assert.equal(summary.trafficCondition, 'moderate');
    assert.equal(summary.distanceMeters, 3100);
    assert.equal(summary.estimatedArrivalTime, formatArrivalClock(fixedNow, 720, 'America/Los_Angeles'));

    assert.equal(summary.stopEtas.length, 3);
    assert.equal(summary.stopEtas[0].isPassed, true);
    assert.equal(summary.stopEtas[1].stopId, 'stop-2');
    assert.equal(summary.stopEtas[1].etaMinutes, 4);
    assert.equal(summary.stopEtas[2].stopId, 'stop-3');
    assert.equal(summary.stopEtas[2].etaMinutes, 12);
    assert.equal(summary.stopEtas[2].cumulativeDistanceMeters, 3100);
    assert.ok(summary.decodedWaypoints && summary.decodedWaypoints.length > 1);
  });

  it('computes deterministic corridor fallback ETA when offline or no API key is present', () => {
    const fixedNow = Date.UTC(2026, 10, 19, 15, 40, 0);
    const fallback = computeLocalRouteEta({
      route: sampleRoute,
      location: sampleLocation,
      currentStopIndex: 1,
      extraDelayMinutes: 2,
      nowMs: fixedNow,
      timeZone: 'America/Los_Angeles',
    });

    assert.equal(fallback.source, 'corridor_estimate');
    assert.ok(fallback.etaMinutes >= 4);
    assert.ok(fallback.distanceMeters > 1500);
    assert.equal(fallback.stopEtas.length, 3);
    assert.equal(fallback.stopEtas[0].isPassed, true);
    assert.equal(fallback.stopEtas[1].isPassed, false);
    assert.ok(fallback.stopEtas[2].etaMinutes > fallback.stopEtas[1].etaMinutes);
  });

  it('parses Maps JS SDK Route.computeRoutes result with durationMillis and road-snapped path', () => {
    const fixedNow = Date.UTC(2026, 10, 19, 15, 40, 0);
    const summary = parseGoogleJsSdkRouteEta({
      route: sampleRoute,
      currentStopIndex: 1,
      nowMs: fixedNow,
      timeZone: 'America/Los_Angeles',
      sdkRoute: {
        distanceMeters: 3450,
        durationMillis: 780_000, // 13 min
        staticDurationMillis: 600_000, // 10 min (+3 min traffic)
        path: [
          { lat: () => 37.7785, lng: () => -122.423 },
          { lat: () => 37.7745, lng: () => -122.418 },
          { lat: () => 37.762, lng: () => -122.402 },
        ],
        legs: [
          { distanceMeters: 950, durationMillis: 240_000, staticDurationMillis: 180_000 },
          { distanceMeters: 2500, durationMillis: 540_000, staticDurationMillis: 420_000 },
        ],
      },
    });

    assert.equal(summary.source, 'google_routes_api');
    assert.equal(summary.etaMinutes, 13);
    assert.equal(summary.trafficDeltaMinutes, 3);
    assert.equal(summary.distanceMeters, 3450);
    assert.equal(summary.decodedWaypoints?.length, 3);
    assert.equal(summary.stopEtas[1].etaMinutes, 4);
    assert.equal(summary.stopEtas[2].etaMinutes, 13);
  });
});
