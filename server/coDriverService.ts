import { Content, FunctionDeclaration, GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  buildDriverContextSummary,
  inferSpeechLangFromText,
} from '../src/utils/coDriverHelpers';
import { computeGoogleTrafficRoutes } from './googleMapsService';
import { CoDriverExecutedAction, CoDriverMapPlace, CoDriverTurnResponse } from '../src/types';

export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const err = new Error('GEMINI_API_KEY is not configured in Settings > Secrets.');
    (err as any).statusCode = 403;
    throw err;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function formatCoDriverError(err: any, fallback: string): string {
  const raw = typeof err?.message === 'string' ? err.message.trim() : '';
  if (!raw) return fallback;
  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw);
      const nestedMsg = parsed?.error?.message || parsed?.message;
      if (typeof nestedMsg === 'string' && nestedMsg.trim()) {
        return nestedMsg.trim();
      }
    } catch {
      // Keep raw string if not valid JSON
    }
  }
  return raw;
}

// Per-session contextual memory (keeps recent multi-turn conversation history)
const sessionMemories = new Map<string, Content[]>();
const sessionLanguages = new Map<string, string>();

export function clearCoDriverSession(sessionId?: string) {
  if (sessionId) {
    sessionMemories.delete(sessionId);
    sessionLanguages.delete(sessionId);
  } else {
    sessionMemories.clear();
    sessionLanguages.clear();
  }
}

function getSessionHistory(sessionId: string): Content[] {
  const existing = sessionMemories.get(sessionId);
  if (!existing) return [];
  return [...existing];
}

function saveSessionHistory(sessionId: string, history: Content[]) {
  // Bound memory to last 24 content items while starting cleanly on a 'user' turn
  let trimmed = history.slice(-24);
  while (trimmed.length > 0 && trimmed[0].role !== 'user') {
    trimmed = trimmed.slice(1);
  }
  sessionMemories.set(sessionId, trimmed);
}

export const coDriverTools: FunctionDeclaration[] = [
  {
    name: 'get_live_route_status',
    description:
      'Get real-time bus speed, GPS status, next stop distance and ETA, waiting student count, and active trip delays.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'get_alternative_routes',
    description:
      'Query Google Maps traffic-aware routing for alternative detour or bypass routes around current traffic delays while preserving student stops.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'apply_alternative_route',
    description:
      'Switch the active bus route polyline on the live map to a selected alternative bypass option and optionally notify parents.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        optionId: {
          type: Type.STRING,
          description:
            'Alternative route option ID, e.g. "google-route-0", "alt-franklin-bypass", or "alt-gough-corridor".',
        },
        notifyParents: {
          type: Type.BOOLEAN,
          description: 'Whether to send a route update notification to parents on the route.',
        },
        reason: {
          type: Type.STRING,
          description: 'Short reason for switching routes, e.g. heavy traffic congestion.',
        },
      },
      required: ['optionId'],
    },
  },
  {
    name: 'report_delay_or_incident',
    description:
      'Report a traffic delay, weather slowdown, breakdown, route change, or emergency and automatically notify parents and dispatch.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        type: {
          type: Type.STRING,
          description: 'Incident type: "traffic", "delay", "weather", "breakdown", "route_change", or "emergency".',
        },
        delayMinutes: {
          type: Type.NUMBER,
          description: 'Estimated delay duration in minutes (default 10).',
        },
        message: {
          type: Type.STRING,
          description: 'Clear summary message describing the delay or incident.',
        },
        severity: {
          type: Type.STRING,
          description: 'Severity level: "low", "medium", or "high".',
        },
      },
      required: ['type', 'delayMinutes', 'message'],
    },
  },
  {
    name: 'check_in_student',
    description:
      'Mark a student on the route as boarded, absent, or dropped_off and notify their parent automatically.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        studentNameOrId: {
          type: Type.STRING,
          description: 'Student full name, first name, or student ID (e.g. "Leo", "Maya Jenkins", "student-1").',
        },
        status: {
          type: Type.STRING,
          description: 'Check-in status: "boarded", "absent", or "dropped_off".',
        },
        notes: {
          type: Type.STRING,
          description: 'Optional brief note.',
        },
      },
      required: ['studentNameOrId', 'status'],
    },
  },
  {
    name: 'control_trip_state',
    description: 'Start, pause, resume, or end the active school bus trip.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: {
          type: Type.STRING,
          description: 'Trip lifecycle action: "start", "pause", "resume", or "end".',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'get_student_roster',
    description:
      'List students assigned to this route along with their scheduled stop and current boarding status.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'broadcast_guardian_update',
    description:
      'Send a helpful status or reassurance update notification to all parents on the current bus route.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: {
          type: Type.STRING,
          description: 'Short notification title.',
        },
        message: {
          type: Type.STRING,
          description: 'Short, reassuring message for parents.',
        },
      },
      required: ['title', 'message'],
    },
  },
];

export function getActiveDrivingEntities(db: any) {
  const activeTrip =
    db.trips.find((t: any) => t.status === 'active' || t.status === 'paused') || db.trips[0];
  const activeBus = activeTrip
    ? db.buses.find((b: any) => b.id === activeTrip.busId)
    : db.buses[0];
  const activeRoute = activeTrip
    ? db.routes.find((r: any) => r.id === activeTrip.routeId)
    : db.routes[0];
  const activeLocation = activeBus ? db.locations[activeBus.id] : undefined;

  return { activeTrip, activeBus, activeRoute, activeLocation };
}

export function buildSystemInstruction(db: any, preferredLanguageHint?: string): string {
  const { activeTrip, activeBus, activeRoute, activeLocation } = getActiveDrivingEntities(db);
  const context = buildDriverContextSummary({
    bus: activeBus,
    route: activeRoute,
    trip: activeTrip,
    location: activeLocation,
    students: db.students || [],
    boardingRecords: db.boardingRecords || [],
    incidents: db.incidents || [],
  });

  const routeStudents = (db.students || [])
    .filter((s: any) => s.routeId === activeRoute?.id)
    .map((s: any) => {
      const stop = activeRoute?.stops?.find(
        (st: any) =>
          st.id === (activeTrip?.tripType === 'afternoon' ? s.afternoonStopId : s.morningStopId)
      );
      const rec = (db.boardingRecords || []).find(
        (r: any) => r.tripId === activeTrip?.id && r.studentId === s.id
      );
      return `${s.fullName} (${s.grade}, stop: ${stop?.name || 'Assigned Stop'}, status: ${rec?.status || 'pending'})`;
    });

  return [
    'You are RouteMate AI Co-Driver, an intelligent, proactive, hands-free voice companion riding alongside a school bus driver.',
    '',
    'CORE RULES:',
    '1. MULTILINGUAL: Always understand ANY language the driver uses and respond naturally in that EXACT same language. If the driver switches languages mid-conversation, switch immediately to match them.',
    preferredLanguageHint
      ? `   Current preferred language context: ${preferredLanguageHint}.`
      : '   Match the driver’s spoken language naturally.',
    '2. SAFETY-FIRST VOICE STYLE: Keep responses warm, human-like, calm, and concise (1 to 3 short spoken sentences). Never use markdown, bullet points, emojis, or asterisks because your reply is read aloud while the driver is driving.',
    '3. CONTEXTUAL & PROACTIVE: You see the live telemetry below. Anticipate needs—if there is traffic or a delay, check Google Maps traffic-aware alternatives, mention ETA impact, and offer to notify parents or reroute.',
    '4. AUTONOMOUS ACTION WITH SAFETY AUTHORIZATION: Execute routine queries, delay reports, student check-ins, and route checks via your tools whenever asked. For major state changes like ending a trip, triggering an emergency alert, or rerouting when the driver has not yet confirmed a proposed detour, ask for quick verbal confirmation first unless the driver explicitly told you to do it now.',
    '',
    'LIVE DRIVING TELEMETRY SNAPSHOT:',
    JSON.stringify(context),
    '',
    'ROUTE STUDENT ROSTER:',
    routeStudents.join('; ') || 'No students assigned.',
  ].join('\n');
}

export async function executeCoDriverTool(
  toolName: string,
  args: Record<string, any>,
  db: any,
  broadcastEvent: (eventName: string, data: any) => void
): Promise<{ result: any; actionRecord?: CoDriverExecutedAction }> {
  const { activeTrip, activeBus, activeRoute, activeLocation } = getActiveDrivingEntities(db);
  const now = new Date().toISOString();

  switch (toolName) {
    case 'get_live_route_status': {
      const summary = buildDriverContextSummary({
        bus: activeBus,
        route: activeRoute,
        trip: activeTrip,
        location: activeLocation,
        students: db.students || [],
        boardingRecords: db.boardingRecords || [],
        incidents: db.incidents || [],
      });
      return { result: summary };
    }

    case 'get_alternative_routes': {
      const gmpResult = await computeGoogleTrafficRoutes(activeRoute, activeLocation);
      return {
        result: {
          quotaExceeded: gmpResult.quotaExceeded,
          routes: gmpResult.options.map((o) => ({
            id: o.id,
            name: o.name,
            corridorSummary: o.corridorSummary,
            estimatedMinutesSaved: o.estimatedMinutesSaved,
            distanceDeltaMeters: o.distanceDeltaMeters,
            stopsPreserved: o.stopsPreserved,
            totalStops: o.totalStops,
            source: o.source || 'local_corridor',
          })),
        },
      };
    }

    case 'apply_alternative_route': {
      if (!activeRoute) {
        return { result: { success: false, error: 'No active route found.' } };
      }
      const gmpResult = await computeGoogleTrafficRoutes(activeRoute, activeLocation);
      const options = gmpResult.options;
      const chosen =
        options.find((o) => o.id === args.optionId) ||
        options.find((o) =>
          o.name.toLowerCase().includes(String(args.optionId || '').toLowerCase())
        ) ||
        options[0];

      if (!chosen) {
        return { result: { success: false, error: 'No alternative route option available.' } };
      }

      activeRoute.waypoints = chosen.waypoints;
      if (activeTrip && activeTrip.delayMinutes > 0) {
        activeTrip.delayMinutes = Math.max(0, activeTrip.delayMinutes - chosen.estimatedMinutesSaved);
        activeTrip.updatedAt = now;
        broadcastEvent('trip_update', activeTrip);
      }
      broadcastEvent('routes_update', db.routes);

      let notifiedCount = 0;
      if (args.notifyParents !== false && activeTrip) {
        const studentsOnRoute = db.students.filter((s: any) => s.routeId === activeRoute.id);
        const seenGuardians = new Set<string>();
        const newNotifs: any[] = [];
        studentsOnRoute.forEach((s: any) => {
          if (s.guardianId && !seenGuardians.has(s.guardianId)) {
            seenGuardians.add(s.guardianId);
            const notif = {
              id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              recipientUserId: s.guardianId,
              recipientRole: 'guardian',
              title: `Route Updated: ${activeBus?.busNumber || 'Bus'}`,
              message: `Taking ${chosen.name} (${args.reason || 'traffic bypass'}) — saves ~${chosen.estimatedMinutesSaved} min. All stops preserved.`,
              type: 'delay',
              tripId: activeTrip.id,
              timestamp: now,
              isRead: false,
              priority: 'high',
            };
            db.notifications.unshift(notif);
            newNotifs.push(notif);
            notifiedCount++;
          }
        });
        if (newNotifs.length > 0) {
          broadcastEvent('new_notifications', newNotifs);
        }
      }

      return {
        result: {
          success: true,
          appliedRoute: chosen.name,
          source: chosen.source || 'local_corridor',
          estimatedMinutesSaved: chosen.estimatedMinutesSaved,
          stopsPreserved: chosen.stopsPreserved,
          parentsNotified: notifiedCount,
        },
        actionRecord: {
          toolName,
          summary: `Rerouted via ${chosen.name} (~${chosen.estimatedMinutesSaved}m saved)`,
          success: true,
          timestamp: now,
        },
      };
    }

    case 'report_delay_or_incident': {
      if (!activeTrip || !activeBus) {
        return { result: { success: false, error: 'No active trip or bus found.' } };
      }
      const incType = args.type || 'traffic';
      const delayMins = Math.max(1, Number(args.delayMinutes) || 10);
      const message = String(args.message || 'Traffic delay reported by driver via Co-Driver.');
      const severity = args.severity || (incType === 'emergency' ? 'high' : 'medium');

      const incident = {
        id: `inc-${Date.now()}`,
        tripId: activeTrip.id,
        busId: activeBus.id,
        driverId: activeTrip.driverId,
        driverName: activeTrip.driverName || 'Driver',
        type: incType,
        message,
        severity,
        timestamp: now,
        resolved: false,
      };
      db.incidents.unshift(incident);

      activeTrip.delayMinutes = (activeTrip.delayMinutes || 0) + delayMins;
      activeTrip.delayReason = message;
      activeTrip.updatedAt = now;

      if (incType === 'breakdown' || incType === 'emergency') {
        activeBus.status = 'delayed';
        broadcastEvent('bus_update', activeBus);
      }

      const studentsOnRoute = db.students.filter((s: any) => s.routeId === activeTrip.routeId);
      const seenGuardians = new Set<string>();
      const createdNotifs: any[] = [];
      studentsOnRoute.forEach((s: any) => {
        if (s.guardianId && !seenGuardians.has(s.guardianId)) {
          seenGuardians.add(s.guardianId);
          const notif = {
            id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            recipientUserId: s.guardianId,
            recipientRole: 'guardian',
            title: `Route Delay Alert: ${activeBus.busNumber}`,
            message: `${message} Estimated delay: ${delayMins} mins.`,
            type: incType === 'emergency' ? 'emergency' : 'delay',
            tripId: activeTrip.id,
            timestamp: now,
            isRead: false,
            priority: 'high',
          };
          db.notifications.unshift(notif);
          createdNotifs.push(notif);
        }
      });

      broadcastEvent('incident_new', incident);
      broadcastEvent('trip_update', activeTrip);
      if (createdNotifs.length > 0) {
        broadcastEvent('new_notifications', createdNotifs);
      }

      return {
        result: {
          success: true,
          incidentId: incident.id,
          totalDelayMinutes: activeTrip.delayMinutes,
          guardiansNotified: seenGuardians.size,
        },
        actionRecord: {
          toolName,
          summary: `Reported +${delayMins}m ${incType} delay · Notified ${seenGuardians.size} parent(s)`,
          success: true,
          timestamp: now,
        },
      };
    }

    case 'check_in_student': {
      if (!activeTrip) {
        return { result: { success: false, error: 'No active trip.' } };
      }
      const query = String(args.studentNameOrId || '').trim().toLowerCase();
      const status = (args.status || 'boarded') as 'boarded' | 'absent' | 'dropped_off';

      const student = db.students.find(
        (s: any) =>
          s.id.toLowerCase() === query ||
          s.studentIdCode?.toLowerCase() === query ||
          s.fullName.toLowerCase().includes(query)
      );

      if (!student) {
        return { result: { success: false, error: `Could not find student matching "${args.studentNameOrId}".` } };
      }

      const stopId =
        activeTrip.tripType === 'afternoon' ? student.afternoonStopId : student.morningStopId;

      const record = {
        id: `rec-${Date.now()}`,
        tripId: activeTrip.id,
        studentId: student.id,
        stopId: stopId || activeRoute?.stops?.[0]?.id || 'stop-1',
        status,
        timestamp: now,
        driverNotes: args.notes || 'Voice check-in via AI Co-Driver',
      };

      const existingIdx = db.boardingRecords.findIndex(
        (r: any) => r.tripId === activeTrip.id && r.studentId === student.id
      );
      if (existingIdx >= 0) {
        db.boardingRecords[existingIdx] = record;
      } else {
        db.boardingRecords.unshift(record);
      }

      if (student.guardianId) {
        const title =
          status === 'boarded'
            ? `${student.fullName} Boarded`
            : status === 'dropped_off'
            ? `${student.fullName} Dropped Off`
            : `${student.fullName} Marked Absent`;
        const msg =
          status === 'boarded'
            ? `${student.fullName} has safely boarded ${activeBus?.busNumber || 'the bus'}.`
            : status === 'dropped_off'
            ? `${student.fullName} has safely arrived and been dropped off.`
            : `${student.fullName} was marked absent at the pickup stop.`;
        const notif = {
          id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          recipientUserId: student.guardianId,
          recipientRole: 'guardian',
          title,
          message: msg,
          type: status === 'absent' ? 'delay' : status,
          tripId: activeTrip.id,
          studentId: student.id,
          stopId,
          timestamp: now,
          isRead: false,
          priority: 'high',
        };
        db.notifications.unshift(notif);
        broadcastEvent('new_notifications', [notif]);
      }

      broadcastEvent('boarding_update', record);

      return {
        result: { success: true, student: student.fullName, status },
        actionRecord: {
          toolName,
          summary: `Marked ${student.fullName} as ${status.replace('_', ' ')}`,
          success: true,
          timestamp: now,
        },
      };
    }

    case 'control_trip_state': {
      const action = String(args.action || '').toLowerCase();
      if (!activeTrip || !activeBus || !activeRoute) {
        return { result: { success: false, error: 'Missing active trip or route.' } };
      }

      if (action === 'pause') {
        activeTrip.status = 'paused';
        activeTrip.updatedAt = now;
        broadcastEvent('trip_update', activeTrip);
        return {
          result: { success: true, status: 'paused' },
          actionRecord: { toolName, summary: 'Paused trip GPS sharing', success: true, timestamp: now },
        };
      }
      if (action === 'resume') {
        activeTrip.status = 'active';
        activeTrip.updatedAt = now;
        broadcastEvent('trip_update', activeTrip);
        return {
          result: { success: true, status: 'active' },
          actionRecord: { toolName, summary: 'Resumed live trip tracking', success: true, timestamp: now },
        };
      }
      if (action === 'end') {
        activeTrip.status = 'completed';
        activeTrip.endTime = now;
        activeTrip.updatedAt = now;
        activeBus.status = 'in_depot';
        activeBus.currentTripId = undefined;
        broadcastEvent('trip_update', activeTrip);
        broadcastEvent('bus_update', activeBus);
        return {
          result: { success: true, status: 'completed' },
          actionRecord: { toolName, summary: 'Ended school bus trip', success: true, timestamp: now },
        };
      }
      if (action === 'start') {
        activeTrip.status = 'active';
        activeTrip.startTime = now;
        activeTrip.updatedAt = now;
        activeBus.status = 'active';
        activeBus.currentTripId = activeTrip.id;
        broadcastEvent('trip_update', activeTrip);
        broadcastEvent('bus_update', activeBus);
        return {
          result: { success: true, status: 'active' },
          actionRecord: { toolName, summary: 'Started live bus trip', success: true, timestamp: now },
        };
      }
      return { result: { success: false, error: `Unknown trip action: ${action}` } };
    }

    case 'get_student_roster': {
      const roster = (db.students || [])
        .filter((s: any) => s.routeId === activeRoute?.id)
        .map((s: any) => {
          const stopId =
            activeTrip?.tripType === 'afternoon' ? s.afternoonStopId : s.morningStopId;
          const stop = activeRoute?.stops?.find((st: any) => st.id === stopId);
          const rec = (db.boardingRecords || []).find(
            (r: any) => r.tripId === activeTrip?.id && r.studentId === s.id
          );
          return {
            name: s.fullName,
            grade: s.grade,
            stopName: stop?.name || 'Stop',
            scheduledTime: stop?.scheduledTime || '',
            status: rec?.status || 'pending',
          };
        });
      return { result: roster };
    }

    case 'broadcast_guardian_update': {
      if (!activeTrip) {
        return { result: { success: false, error: 'No active trip.' } };
      }
      const studentsOnRoute = db.students.filter((s: any) => s.routeId === activeTrip.routeId);
      const seenGuardians = new Set<string>();
      const newNotifs: any[] = [];
      studentsOnRoute.forEach((s: any) => {
        if (s.guardianId && !seenGuardians.has(s.guardianId)) {
          seenGuardians.add(s.guardianId);
          const notif = {
            id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            recipientUserId: s.guardianId,
            recipientRole: 'guardian',
            title: String(args.title || `Bus Update: ${activeBus?.busNumber || 'RouteMate'}`),
            message: String(args.message || 'Your bus driver shared a live route update.'),
            type: 'delay',
            tripId: activeTrip.id,
            timestamp: now,
            isRead: false,
            priority: 'normal',
          };
          db.notifications.unshift(notif);
          newNotifs.push(notif);
        }
      });
      if (newNotifs.length > 0) {
        broadcastEvent('new_notifications', newNotifs);
      }
      return {
        result: { success: true, guardiansNotified: seenGuardians.size },
        actionRecord: {
          toolName,
          summary: `Sent parent update to ${seenGuardians.size} family account(s)`,
          success: true,
          timestamp: now,
        },
      };
    }

    default:
      return { result: { success: false, error: `Unknown tool: ${toolName}` } };
  }
}

async function synthesizeSpeechWav(ai: GoogleGenAI, text: string): Promise<string | undefined> {
  const clean = text.trim();
  if (!clean) return undefined;

  try {
    const ttsResponse = await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: clean,
              speechMetadata: {
                style:
                  'Calm, warm, reassuring AI bus co-driver speaking naturally and clearly to a driver on the road',
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });
    return ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  } catch (err) {
    // Non-fatal fallback: browser Web Speech synthesis will read replyText
    console.warn('Gemini TTS fallback to browser speech:', (err as Error)?.message);
    return undefined;
  }
}

function extractMapPlaces(response: any, seenUris: Set<string>, out: CoDriverMapPlace[]) {
  const chunks = response?.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (!Array.isArray(chunks)) return;
  for (const chunk of chunks) {
    const uri = chunk?.maps?.uri;
    const title = chunk?.maps?.title;
    if (typeof uri === 'string' && uri.trim() && !seenUris.has(uri)) {
      seenUris.add(uri);
      out.push({
        title: typeof title === 'string' && title.trim() ? title.trim() : 'Google Maps Place',
        uri: uri.trim(),
      });
    }
  }
}

export async function runCoDriverTurn(params: {
  sessionId: string;
  message?: string;
  audioBase64?: string;
  mimeType?: string;
  includeAudio?: boolean;
  db: any;
  broadcastEvent: (eventName: string, data: any) => void;
}): Promise<CoDriverTurnResponse> {
  const ai = getGeminiClient();
  const { sessionId, audioBase64, mimeType, includeAudio = true, db, broadcastEvent } = params;
  let transcript = (params.message || '').trim();

  // Step 1: Transcribe driver audio in ANY spoken language via gemini-3.5-transcribe
  if (!transcript && audioBase64) {
    const cleanBase64 = audioBase64.includes(',') ? audioBase64.split(',')[1] : audioBase64;
    const transcribeRes = await ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType || 'audio/webm',
              data: cleanBase64,
            },
          },
          {
            text: 'Transcribe the driver speech accurately in its original spoken language. Return only the spoken words without extra commentary. If no intelligible speech is heard, return an empty string.',
          },
        ],
      },
    });
    transcript = (transcribeRes.text || '').trim();
  }

  if (!transcript) {
    return {
      transcript: '',
      replyText: '',
      languageCode: sessionLanguages.get(sessionId) || 'en-US',
      executedActions: [],
    };
  }

  const detectedLang = inferSpeechLangFromText(transcript);
  sessionLanguages.set(sessionId, detectedLang);

  // Step 2: Build contextual multi-turn conversation & run hybrid tool-calling + Google Maps grounding on gemini-4-hydrogen
  const history = getSessionHistory(sessionId);
  const workingContents: Content[] = [
    ...history,
    { role: 'user', parts: [{ text: transcript }] },
  ];

  const { activeLocation } = getActiveDrivingEntities(db);
  const executedActions: CoDriverExecutedAction[] = [];
  const mapPlaces: CoDriverMapPlace[] = [];
  const seenPlaceUris = new Set<string>();
  const systemInstruction = buildSystemInstruction(db, detectedLang);

  let finalReplyText = '';

  for (let step = 0; step < 4; step++) {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: workingContents,
      config: {
        systemInstruction,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        tools: [{ googleMaps: {} }, { functionDeclarations: coDriverTools }],
        toolConfig: {
          includeServerSideToolInvocations: true,
          ...(activeLocation
            ? {
                retrievalConfig: {
                  latLng: {
                    latitude: activeLocation.latitude,
                    longitude: activeLocation.longitude,
                  },
                },
              }
            : {}),
        },
      },
    });

    extractMapPlaces(response, seenPlaceUris, mapPlaces);

    const candidateContent = response.candidates?.[0]?.content;
    if (candidateContent) {
      workingContents.push(candidateContent);
    }

    const calls = response.functionCalls;
    if (calls && calls.length > 0) {
      const responseParts = await Promise.all(
        calls.map(async (call) => {
          const exec = await executeCoDriverTool(
            call.name || '',
            (call.args || {}) as Record<string, any>,
            db,
            broadcastEvent
          );
          if (exec.actionRecord) {
            executedActions.push(exec.actionRecord);
          }
          return {
            functionResponse: {
              id: call.id,
              name: call.name || '',
              response: exec.result,
            },
          };
        })
      );

      workingContents.push({
        role: 'user',
        parts: responseParts,
      });
      continue;
    }

    finalReplyText = (response.text || '').trim();
    break;
  }

  if (!finalReplyText) {
    finalReplyText = 'Got it. I have updated your route status.';
  }

  saveSessionHistory(sessionId, workingContents);

  const replyLang = inferSpeechLangFromText(finalReplyText) || detectedLang;
  const audioOutBase64 = includeAudio ? await synthesizeSpeechWav(ai, finalReplyText) : undefined;

  return {
    transcript,
    replyText: finalReplyText,
    languageCode: replyLang,
    executedActions,
    mapPlaces: mapPlaces.length > 0 ? mapPlaces : undefined,
    audioBase64: audioOutBase64,
    audioMimeType: audioOutBase64 ? 'audio/wav' : undefined,
  };
}

export async function runProactiveCheck(params: {
  sessionId: string;
  eventType: string;
  details: string;
  includeAudio?: boolean;
  db: any;
}): Promise<{ shouldSpeak: boolean; replyText: string; languageCode: string; audioBase64?: string; audioMimeType?: string }> {
  const ai = getGeminiClient();
  const { sessionId, eventType, details, includeAudio = true, db } = params;
  const preferredLang = sessionLanguages.get(sessionId) || 'en-US';
  const systemInstruction = buildSystemInstruction(db, preferredLang);
  const history = getSessionHistory(sessionId);

  const proactivePrompt = [
    `[PROACTIVE SYSTEM CONTEXT EVENT: ${eventType}]`,
    details,
    `Speak a brief, natural, helpful 1-2 sentence heads-up to the driver in ${preferredLang} (or the language they last used).`,
    'Suggest the single smartest next action (e.g., checking an alternative route or notifying parents) and ask if they want you to go ahead, so they can answer with a simple "Yes". Do not call mutating tools yet.',
  ].join(' ');

  const workingContents: Content[] = [
    ...history,
    { role: 'user', parts: [{ text: proactivePrompt }] },
  ];

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: workingContents,
    config: {
      systemInstruction,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  });

  const replyText = (response.text || '').trim();
  const candidateContent = response.candidates?.[0]?.content;
  if (candidateContent) {
    workingContents.push(candidateContent);
    saveSessionHistory(sessionId, workingContents);
  }

  const audioBase64 = includeAudio && replyText ? await synthesizeSpeechWav(ai, replyText) : undefined;

  return {
    shouldSpeak: Boolean(replyText),
    replyText,
    languageCode: inferSpeechLangFromText(replyText) || preferredLang,
    audioBase64,
    audioMimeType: audioBase64 ? 'audio/wav' : undefined,
  };
}
