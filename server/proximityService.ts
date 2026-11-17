import { initialDb } from './db';
import {
  haversineDistance,
  determineProximityStage,
  generateEventKey,
  calculateBearing,
  ProximityStage,
} from '../src/utils/proximity';
import { calculateETAMinutes } from '../src/utils/eta';
import { BusLocation, NotificationEvent } from '../src/types';

export interface LocationPingPayload {
  busId: string;
  tripId: string;
  latitude: number;
  longitude: number;
  speed?: number;
  heading?: number;
  accuracy?: number;
  timestamp?: string;
}

export function processLocationPing(
  db: typeof initialDb,
  payload: LocationPingPayload,
  broadcastEvent?: (eventName: string, data: any) => void
): { success: boolean; triggeredNotifications: NotificationEvent[]; activeTrip?: any } {
  const { busId, tripId, latitude, longitude, speed = 25, accuracy = 8 } = payload;

  const bus = db.buses.find((b) => b.id === busId);
  const trip = db.trips.find((t) => t.id === tripId && (t.status === 'active' || t.status === 'paused'));

  if (!bus || !trip) {
    return { success: false, triggeredNotifications: [] };
  }

  // Calculate heading if previous location exists and not provided
  let calculatedHeading = payload.heading;
  const previousLocation = db.locations[busId];
  if (calculatedHeading === undefined && previousLocation) {
    calculatedHeading = calculateBearing(
      previousLocation.latitude,
      previousLocation.longitude,
      latitude,
      longitude
    );
  }

  const busLocation: BusLocation = {
    busId,
    tripId,
    latitude,
    longitude,
    speed,
    heading: calculatedHeading ?? 0,
    accuracy,
    timestamp: payload.timestamp || new Date().toISOString(),
    isStale: false,
  };

  db.locations[busId] = busLocation;
  if (!db.locationHistory[tripId]) {
    db.locationHistory[tripId] = [];
  }
  db.locationHistory[tripId].push(busLocation);

  // Proximity evaluation
  const route = db.routes.find((r) => r.id === trip.routeId);
  const school = db.schools.find((s) => s.id === trip.schoolId) || db.schools[0];
  const triggeredNotifications: NotificationEvent[] = [];

  if (route && school) {
    const thresholds = school.thresholds;

    for (const stop of route.stops) {
      const distance = haversineDistance(latitude, longitude, stop.latitude, stop.longitude);
      const stage = determineProximityStage(distance, thresholds);

      if (stage !== 'far') {
        const key = generateEventKey(tripId, stop.id, stage);

        if (!db.sentNotificationKeys.has(key)) {
          db.sentNotificationKeys.add(key);

          // Get students assigned to this stop
          const studentsAtStop = db.students.filter(
            (s) =>
              (trip.tripType === 'morning' && s.morningStopId === stop.id) ||
              (trip.tripType === 'afternoon' && s.afternoonStopId === stop.id) ||
              stop.assignedStudentIds.includes(s.id)
          );

          const etaMins = calculateETAMinutes(distance, speed);

          // Build message text based on stage
          let title = '';
          let message = '';
          let notifType: any = stage;

          switch (stage) {
            case 'early_warning':
              title = `${bus.busNumber} Early Notice`;
              message = `Your school bus is on the way to ${stop.name}. Estimated arrival: ~${etaMins} mins (${Math.round(distance / 1000 * 10) / 10} km away).`;
              break;
            case 'approaching':
              title = `${bus.busNumber} Approaching (~1 km)`;
              message = `Your bus is approximately ${Math.round(distance)}m away from ${stop.name}. Please get ready for pickup.`;
              break;
            case 'nearby':
              title = `${bus.busNumber} Nearby!`;
              message = `Your bus is nearby (~${Math.round(distance)}m)! Please head out to ${stop.name} now.`;
              break;
            case 'arrived':
              title = `${bus.busNumber} Arrived at Stop`;
              message = `Your school bus has arrived at ${stop.name}. Please board safely.`;
              break;
          }

          // If no assigned students found, also alert any guardian linked to this stop
          const targetRecipients: { userId: string; role: any }[] = [];
          for (const st of studentsAtStop) {
            // Alert student
            targetRecipients.push({ userId: st.id, role: 'student' });
            // Alert guardian
            if (st.guardianId) {
              targetRecipients.push({ userId: st.guardianId, role: 'guardian' });
            }
          }

          // Fallback: If no explicit students assigned to intermediate stop, notify all guardians on route for transparency
          if (targetRecipients.length === 0) {
            const allRouteStudents = db.students.filter((s) => s.routeId === route.id);
            for (const st of allRouteStudents) {
              if (st.guardianId && !targetRecipients.some((r) => r.userId === st.guardianId)) {
                targetRecipients.push({ userId: st.guardianId, role: 'guardian' });
              }
            }
          }

          // Generate notification objects
          for (const recipient of targetRecipients) {
            const notif: NotificationEvent = {
              id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              recipientUserId: recipient.userId,
              recipientRole: recipient.role,
              title,
              message,
              type: notifType,
              tripId,
              stopId: stop.id,
              timestamp: new Date().toISOString(),
              isRead: false,
              priority: stage === 'arrived' || stage === 'nearby' ? 'high' : 'normal',
            };

            db.notifications.unshift(notif);
            triggeredNotifications.push(notif);
          }
        }
      }

      // Auto update currentStopIndex when bus reaches or passes the stop
      if (distance <= thresholds.arrivalMeters) {
        if (trip.currentStopIndex < stop.sequenceOrder) {
          trip.currentStopIndex = stop.sequenceOrder;
          trip.updatedAt = new Date().toISOString();
        }
      }
    }
  }

  // Notify listeners via SSE if registered
  if (broadcastEvent) {
    broadcastEvent('bus_location', busLocation);
    if (triggeredNotifications.length > 0) {
      broadcastEvent('new_notifications', triggeredNotifications);
    }
    broadcastEvent('trip_update', trip);
  }

  return { success: true, triggeredNotifications, activeTrip: trip };
}
