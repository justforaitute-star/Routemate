import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDriverContextSummary,
  computeAlternativeRouteOptions,
  decodeEncodedPolyline,
  evaluateProactiveTrigger,
  formatGoogleRoutesToOptions,
  inferSpeechLangFromText,
} from './coDriverHelpers.ts';
import {
  base64Pcm16ToFloat32,
  float32ToPcm16Base64,
  resampleFloat32,
} from './liveAudio.ts';
import { Bus, BusLocation, BusRoute, Student, Trip } from '../types/index.ts';

const sampleBus: Bus = {
  id: 'bus-1',
  schoolId: 'school-1',
  busNumber: 'Bus 14',
  plateNumber: 'SCH-1402',
  model: 'Blue Bird Vision',
  capacity: 48,
  status: 'active',
  currentTripId: 'trip-1',
};

const sampleRoute: BusRoute = {
  id: 'route-1',
  schoolId: 'school-1',
  name: 'North Valley Run',
  code: 'NV-14',
  type: 'morning',
  assignedBusId: 'bus-1',
  stops: [
    {
      id: 'stop-1',
      routeId: 'route-1',
      name: 'Pine & Fillmore',
      address: '100 Pine St',
      latitude: 37.785,
      longitude: -122.432,
      sequenceOrder: 1,
      scheduledTime: '07:40 AM',
      assignedStudentIds: [],
    },
    {
      id: 'stop-2',
      routeId: 'route-1',
      name: 'Grove Park & Polk',
      address: '450 Grove St',
      latitude: 37.778,
      longitude: -122.418,
      sequenceOrder: 2,
      scheduledTime: '07:46 AM',
      assignedStudentIds: ['student-1'],
    },
  ],
  waypoints: [
    [37.785, -122.432],
    [37.778, -122.418],
  ],
};

const sampleTrip: Trip = {
  id: 'trip-1',
  schoolId: 'school-1',
  busId: 'bus-1',
  routeId: 'route-1',
  driverId: 'driver-1',
  driverName: 'Marcus Vance',
  tripType: 'morning',
  status: 'active',
  currentStopIndex: 1,
  delayMinutes: 0,
  updatedAt: new Date().toISOString(),
};

const sampleLocation: BusLocation = {
  busId: 'bus-1',
  tripId: 'trip-1',
  latitude: 37.7795,
  longitude: -122.4205,
  speed: 25,
  heading: 135,
  accuracy: 6,
  timestamp: new Date().toISOString(),
};

const sampleStudents: Student[] = [
  {
    id: 'student-1',
    schoolId: 'school-1',
    fullName: 'Leo Jenkins',
    grade: 'Grade 5',
    studentIdCode: 'STU-101',
    guardianId: 'parent-1',
    guardianName: 'Sarah Jenkins',
    guardianPhone: '555-0101',
    busId: 'bus-1',
    routeId: 'route-1',
    morningStopId: 'stop-2',
    afternoonStopId: 'stop-2',
  },
];

describe('Co-Driver Pure Helpers', () => {
  it('builds live driver context summary with next stop ETA and waiting students', () => {
    const ctx = buildDriverContextSummary({
      bus: sampleBus,
      route: sampleRoute,
      trip: sampleTrip,
      location: sampleLocation,
      students: sampleStudents,
      boardingRecords: [],
      incidents: [],
    });

    assert.equal(ctx.busNumber, 'Bus 14');
    assert.equal(ctx.nextStop?.name, 'Grove Park & Polk');
    assert.equal(ctx.nextStop?.waitingStudents.length, 1);
    assert.equal(ctx.nextStop?.waitingStudents[0].fullName, 'Leo Jenkins');
    assert.ok((ctx.nextStop?.distanceMeters ?? 0) > 100 && (ctx.nextStop?.distanceMeters ?? 0) < 400);
  });

  it('computes alternative route bypass options preserving all stops', () => {
    const options = computeAlternativeRouteOptions(sampleRoute, sampleLocation);
    assert.equal(options.length, 2);
    assert.equal(options[0].stopsPreserved, sampleRoute.stops.length);
    assert.ok(options[0].estimatedMinutesSaved > 0);
    assert.ok(options[0].waypoints.length >= 3);
  });

  it('evaluates proactive triggers and deduplicates seen keys', () => {
    const ctx = buildDriverContextSummary({
      bus: sampleBus,
      route: sampleRoute,
      trip: sampleTrip,
      location: sampleLocation,
      students: sampleStudents,
      boardingRecords: [],
      incidents: [],
    });

    const seen = new Set<string>();
    const first = evaluateProactiveTrigger(ctx, seen);
    assert.equal(first?.eventType, 'approaching_stop');
    assert.ok(first?.details.includes('Leo Jenkins'));

    if (first) seen.add(first.dedupKey);
    const second = evaluateProactiveTrigger(ctx, seen);
    assert.equal(second, null);
  });

  it('infers BCP-47 speech language codes across scripts and European languages', () => {
    assert.equal(inferSpeechLangFromText('Hay mucho tráfico, diez minutos de retraso'), 'es-ES');
    assert.equal(inferSpeechLangFromText('अगले स्टॉप पर कितने छात्र हैं?'), 'hi-IN');
    assert.equal(inferSpeechLangFromText('前方交通拥堵，请改道'), 'zh-CN');
    assert.equal(inferSpeechLangFromText('Bonjour, quel est notre retard?'), 'fr-FR');
    assert.equal(inferSpeechLangFromText('How many minutes to the next stop?'), 'en-US');
  });

  it('decodes Google encoded polylines accurately using standard test vector', () => {
    const decoded = decodeEncodedPolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    assert.equal(decoded.length, 3);
    assert.ok(Math.abs(decoded[0][0] - 38.5) < 0.001);
    assert.ok(Math.abs(decoded[0][1] - -120.2) < 0.001);
    assert.ok(Math.abs(decoded[2][0] - 43.252) < 0.001);
    assert.ok(Math.abs(decoded[2][1] - -126.453) < 0.001);
  });

  it('formats Google Routes API responses into preserved-stop AlternativeRouteOptions', () => {
    const formatted = formatGoogleRoutesToOptions(
      [
        {
          distanceMeters: 4200,
          duration: '720s',
          description: 'Van Ness Ave',
          routeLabels: ['DEFAULT_ROUTE'],
          polyline: { encodedPolyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' },
        },
        {
          distanceMeters: 4450,
          duration: '480s',
          description: 'Franklin St Bypass',
          routeLabels: ['DEFAULT_ROUTE_ALTERNATE'],
          polyline: { encodedPolyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' },
        },
      ],
      4
    );
    assert.equal(formatted.length, 2);
    assert.equal(formatted[1].name, 'Franklin St Bypass');
    assert.equal(formatted[1].estimatedMinutesSaved, 4);
    assert.equal(formatted[1].stopsPreserved, 4);
    assert.equal(formatted[1].source, 'google_routes');
  });

  it('roundtrips PCM16 base64 encoding and downsamples 48kHz to 16kHz cleanly', () => {
    const input = new Float32Array([0, 0.5, -0.5, 0.25, -0.25, 0]);
    const b64 = float32ToPcm16Base64(input);
    const out = base64Pcm16ToFloat32(b64);
    assert.equal(out.length, input.length);
    for (let i = 0; i < input.length; i++) {
      assert.ok(Math.abs(out[i] - input[i]) < 0.001);
    }

    const highRate = new Float32Array(480);
    for (let i = 0; i < highRate.length; i++) highRate[i] = Math.sin(i * 0.1) * 0.5;
    const downsampled = resampleFloat32(highRate, 48000, 16000);
    assert.equal(downsampled.length, 160);
  });
});
