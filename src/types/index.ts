export type UserRole = 'driver' | 'student' | 'guardian' | 'admin';

export type ColorPalette = 'turquoise' | 'amber' | 'azure' | 'emerald' | 'coral';

export type DeviceMode = 'mobile' | 'duo' | 'tablet';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  schoolId: string;
  phone?: string;
  avatarUrl?: string;
}

export interface NotificationThresholds {
  earlyWarningMeters: number; // e.g. 2000m
  approachingMeters: number;   // e.g. 1000m
  nearbyMeters: number;        // e.g. 500m
  arrivalMeters: number;       // e.g. 80m
}

export interface School {
  id: string;
  name: string;
  code: string;
  city: string;
  contactEmail: string;
  contactPhone: string;
  emergencyPhone: string;
  thresholds: NotificationThresholds;
}

export interface Bus {
  id: string;
  schoolId: string;
  busNumber: string; // e.g. "Bus 42"
  plateNumber: string; // e.g. "SCH-9821"
  model: string; // e.g. "Blue Bird Vision 2024"
  capacity: number;
  assignedDriverId?: string;
  status: 'active' | 'in_depot' | 'maintenance' | 'delayed';
  currentTripId?: string;
}

export interface RouteStop {
  id: string;
  routeId: string;
  name: string; // e.g. "Maple Ave & 4th St"
  address: string;
  latitude: number;
  longitude: number;
  sequenceOrder: number;
  scheduledTime: string; // "07:35 AM"
  assignedStudentIds: string[];
}

export interface BusRoute {
  id: string;
  schoolId: string;
  name: string; // "North Ridge Route"
  code: string; // "NR-01"
  type: 'morning' | 'afternoon';
  assignedBusId: string;
  stops: RouteStop[];
  waypoints: [number, number][]; // coordinates for road path
}

export interface Student {
  id: string;
  schoolId: string;
  fullName: string;
  grade: string; // "Grade 5"
  studentIdCode: string; // "STU-8821"
  guardianId: string;
  guardianName: string;
  guardianPhone: string;
  busId: string;
  routeId: string;
  morningStopId: string;
  afternoonStopId: string;
  avatarUrl?: string;
}

export type TripStatus = 'scheduled' | 'active' | 'paused' | 'completed' | 'cancelled';

export interface Trip {
  id: string;
  schoolId: string;
  busId: string;
  routeId: string;
  driverId: string;
  driverName: string;
  tripType: 'morning' | 'afternoon';
  status: TripStatus;
  startTime?: string;
  endTime?: string;
  currentStopIndex: number;
  delayMinutes: number;
  delayReason?: string;
  updatedAt: string;
}

export interface BusLocation {
  busId: string;
  tripId: string;
  latitude: number;
  longitude: number;
  speed: number; // km/h
  heading: number; // degrees 0-360
  accuracy: number; // meters
  timestamp: string; // ISO string
  isStale?: boolean;
}

export type BoardingStatus = 'boarded' | 'absent' | 'dropped_off' | 'pending';

export interface BoardingRecord {
  id: string;
  tripId: string;
  studentId: string;
  stopId: string;
  status: BoardingStatus;
  timestamp: string;
  driverNotes?: string;
}

export type NotificationType =
  | 'early_warning'
  | 'approaching'
  | 'nearby'
  | 'arrived'
  | 'delay'
  | 'boarded'
  | 'dropped_off'
  | 'emergency'
  | 'trip_started'
  | 'trip_completed';

export interface NotificationEvent {
  id: string;
  recipientUserId: string;
  recipientRole: UserRole;
  title: string;
  message: string;
  type: NotificationType;
  tripId: string;
  stopId?: string;
  studentId?: string;
  timestamp: string;
  isRead: boolean;
  priority: 'normal' | 'high' | 'urgent';
}

export interface IncidentReport {
  id: string;
  tripId: string;
  busId: string;
  driverId: string;
  driverName: string;
  type: 'delay' | 'breakdown' | 'traffic' | 'route_change' | 'emergency';
  message: string;
  severity: 'low' | 'medium' | 'high';
  timestamp: string;
  resolved: boolean;
}

export interface GuardianPreferences {
  guardianId: string;
  pushEnabled: boolean;
  soundAlerts: boolean;
  notifyEarlyWarning: boolean;
  notifyApproaching: boolean;
  notifyNearby: boolean;
  notifyArrival: boolean;
  notifyBoarding: boolean;
  notifyDropOff: boolean;
  notifyDelays: boolean;
}

export interface CoDriverExecutedAction {
  toolName: string;
  summary: string;
  success: boolean;
  timestamp: string;
}

export interface CoDriverMapPlace {
  title: string;
  uri: string;
}

export interface CoDriverMessage {
  id: string;
  role: 'driver' | 'codriver' | 'system';
  text: string;
  timestamp: string;
  languageCode?: string;
  isProactive?: boolean;
  isLive?: boolean;
  executedActions?: CoDriverExecutedAction[];
  mapPlaces?: CoDriverMapPlace[];
}

export interface AlternativeRouteOption {
  id: string;
  name: string;
  corridorSummary: string;
  estimatedMinutesSaved: number;
  distanceDeltaMeters: number;
  stopsPreserved: number;
  totalStops: number;
  waypoints: [number, number][];
  source?: 'google_routes' | 'local_corridor';
}

export interface CoDriverTurnResponse {
  transcript: string;
  replyText: string;
  languageCode: string;
  executedActions: CoDriverExecutedAction[];
  mapPlaces?: CoDriverMapPlace[];
  audioBase64?: string;
  audioMimeType?: string;
}

export interface RouteStopEta {
  stopId: string;
  stopName: string;
  sequenceOrder: number;
  scheduledTime: string;
  estimatedArrivalTime: string;
  etaMinutes: number;
  legDurationSeconds: number;
  legDistanceMeters: number;
  cumulativeDistanceMeters: number;
  isPassed: boolean;
}

export interface RouteEtaSummary {
  routeId: string;
  routeName: string;
  routeCode: string;
  source: 'google_routes_api' | 'corridor_estimate';
  totalDurationSeconds: number;
  staticDurationSeconds: number;
  etaMinutes: number;
  trafficDeltaMinutes: number;
  trafficCondition: 'clear' | 'moderate' | 'heavy';
  distanceMeters: number;
  estimatedArrivalTime: string;
  encodedPolyline?: string;
  decodedWaypoints?: [number, number][];
  stopEtas: RouteStopEta[];
  computedAtIso: string;
}


