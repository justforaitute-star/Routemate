import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import {
  CoDriverExecutedAction,
  CoDriverMessage,
  CoDriverTurnResponse,
} from '../../types';
import {
  buildDriverContextSummary,
  evaluateProactiveTrigger,
  inferSpeechLangFromText,
} from '../../utils/coDriverHelpers';
import { playCoDriverSpeech, stopCoDriverSpeech } from '../../utils/audioAlerts';
import { LiveAudioEngine } from '../../utils/liveAudio';
import {
  Mic,
  MicOff,
  Sparkles,
  Send,
  Volume2,
  VolumeX,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Languages,
  MapPin,
  ExternalLink,
  Radio,
} from 'lucide-react';

type VoiceLoopState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking';

interface CoDriverPanelProps {
  onHandsFreeChange?: (active: boolean) => void;
  compact?: boolean;
}

export const CoDriverPanel: React.FC<CoDriverPanelProps> = ({
  onHandsFreeChange,
  compact = false,
}) => {
  const {
    activeTrip,
    activeBus,
    activeLocation,
    routes,
    students,
    boardingRecords,
    incidents,
    isBusLocationStale,
    currentUser,
  } = useApp();

  const currentRoute = routes.find((r) => r.id === activeTrip?.routeId) || routes[0];
  const sessionId = `driver-${currentUser.id || 'default'}`;

  const [handsFreeEnabled, setHandsFreeEnabled] = useState<boolean>(false);
  const [proactiveEnabled, setProactiveEnabled] = useState<boolean>(true);
  const [voiceState, setVoiceState] = useState<VoiceLoopState>('idle');
  const [micLevel, setMicLevel] = useState<number>(0);
  const [activeLang, setActiveLang] = useState<string>('Auto · Any Language');
  const [textInput, setTextInput] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [liveInputDraft, setLiveInputDraft] = useState<string>('');
  const [liveOutputDraft, setLiveOutputDraft] = useState<string>('');
  const [livePendingActions, setLivePendingActions] = useState<CoDriverExecutedAction[]>([]);
  const [messages, setMessages] = useState<CoDriverMessage[]>([
    {
      id: 'codriver-welcome',
      role: 'codriver',
      text: 'Gemini Co-Driver ready. Tap Start Live Voice for hands-free dialogue in any language, or type below when parked for Google Maps-grounded route help.',
      timestamp: new Date().toISOString(),
      languageCode: 'en-US',
    },
  ]);

  const handsFreeRef = useRef<boolean>(false);
  const voiceStateRef = useRef<VoiceLoopState>('idle');
  const liveReadyRef = useRef<boolean>(false);
  const liveWsRef = useRef<WebSocket | null>(null);
  const audioEngineRef = useRef<LiveAudioEngine | null>(null);
  const liveInputDraftRef = useRef<string>('');
  const liveOutputDraftRef = useRef<string>('');
  const liveActionsRef = useRef<CoDriverExecutedAction[]>([]);
  const seenProactiveKeysRef = useRef<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const updateVoiceState = useCallback((next: VoiceLoopState) => {
    voiceStateRef.current = next;
    setVoiceState(next);
  }, []);

  useEffect(() => {
    handsFreeRef.current = handsFreeEnabled;
    onHandsFreeChange?.(handsFreeEnabled);
  }, [handsFreeEnabled, onHandsFreeChange]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, liveInputDraft, liveOutputDraft]);

  const driverContext = useMemo(
    () =>
      buildDriverContextSummary({
        bus: activeBus,
        route: currentRoute,
        trip: activeTrip,
        location: activeLocation,
        students,
        boardingRecords,
        incidents,
        isStale: isBusLocationStale,
      }),
    [activeBus, currentRoute, activeTrip, activeLocation, students, boardingRecords, incidents, isBusLocationStale]
  );

  const commitLiveTurnDrafts = useCallback(() => {
    const inputStr = liveInputDraftRef.current.trim();
    const outputStr = liveOutputDraftRef.current.trim();
    const actions = liveActionsRef.current;

    if (!inputStr && !outputStr && actions.length === 0) return;

    const now = new Date().toISOString();
    const toAppend: CoDriverMessage[] = [];

    if (inputStr) {
      const lang = inferSpeechLangFromText(inputStr);
      setActiveLang(lang.toUpperCase());
      toAppend.push({
        id: `drv-live-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        role: 'driver',
        text: inputStr,
        timestamp: now,
        languageCode: lang,
        isLive: true,
      });
    }

    if (outputStr || actions.length > 0) {
      const replyLang = inferSpeechLangFromText(outputStr || inputStr);
      toAppend.push({
        id: `ai-live-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        role: 'codriver',
        text: outputStr || 'Completed requested action.',
        timestamp: now,
        languageCode: replyLang,
        isLive: true,
        executedActions: actions.length > 0 ? [...actions] : undefined,
      });
    }

    liveInputDraftRef.current = '';
    liveOutputDraftRef.current = '';
    liveActionsRef.current = [];
    setLiveInputDraft('');
    setLiveOutputDraft('');
    setLivePendingActions([]);

    if (toAppend.length > 0) {
      setMessages((prev) => [...prev.slice(-14), ...toAppend]);
    }
  }, []);

  const stopLiveSession = useCallback(() => {
    liveReadyRef.current = false;
    handsFreeRef.current = false;
    setHandsFreeEnabled(false);

    if (liveWsRef.current) {
      try {
        liveWsRef.current.onclose = null;
        liveWsRef.current.onerror = null;
        liveWsRef.current.onmessage = null;
        liveWsRef.current.close();
      } catch {
        // Ignore close errors
      }
      liveWsRef.current = null;
    }

    if (audioEngineRef.current) {
      audioEngineRef.current.stopAll();
      audioEngineRef.current = null;
    }

    commitLiveTurnDrafts();
    setMicLevel(0);
    updateVoiceState('idle');
  }, [commitLiveTurnDrafts, updateVoiceState]);

  useEffect(() => {
    return () => {
      stopCoDriverSpeech();
      stopLiveSession();
    };
  }, [stopLiveSession]);

  const toggleHandsFree = async () => {
    if (handsFreeEnabled) {
      stopLiveSession();
      return;
    }

    setErrorMessage(null);
    stopCoDriverSpeech();

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setErrorMessage(
        'Microphone access is unavailable in this browser. Use the message box when parked.'
      );
      return;
    }

    updateVoiceState('connecting');
    const engine = new LiveAudioEngine();
    audioEngineRef.current = engine;

    try {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${window.location.host}/ws/codriver-live?sessionId=${encodeURIComponent(
        sessionId
      )}`;

      const ws = new WebSocket(wsUrl);
      liveWsRef.current = ws;

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);

          if (msg.type === 'ready') {
            liveReadyRef.current = true;
            setHandsFreeEnabled(true);
            handsFreeRef.current = true;
            updateVoiceState('listening');
          } else if (msg.type === 'audio' && msg.data) {
            updateVoiceState('speaking');
            engine.playPcm24kChunk(msg.data, (playing) => {
              if (!playing && handsFreeRef.current && voiceStateRef.current === 'speaking') {
                updateVoiceState('listening');
              }
            });
          } else if (msg.type === 'interrupted') {
            engine.stopPlayback();
            commitLiveTurnDrafts();
            if (handsFreeRef.current) {
              updateVoiceState('listening');
            }
          } else if (msg.type === 'input_transcript' && msg.text) {
            liveInputDraftRef.current = liveInputDraftRef.current
              ? `${liveInputDraftRef.current} ${msg.text}`.replace(/\s+/g, ' ').trim()
              : msg.text.trim();
            setLiveInputDraft(liveInputDraftRef.current);
            setActiveLang(inferSpeechLangFromText(liveInputDraftRef.current).toUpperCase());
          } else if (msg.type === 'output_transcript' && msg.text) {
            liveOutputDraftRef.current = liveOutputDraftRef.current
              ? `${liveOutputDraftRef.current}${msg.text}`
              : msg.text;
            setLiveOutputDraft(liveOutputDraftRef.current);
          } else if (msg.type === 'tool_action' && msg.action) {
            liveActionsRef.current = [...liveActionsRef.current, msg.action];
            setLivePendingActions([...liveActionsRef.current]);
          } else if (msg.type === 'turn_complete') {
            commitLiveTurnDrafts();
            if (handsFreeRef.current && voiceStateRef.current !== 'speaking') {
              updateVoiceState('listening');
            }
          } else if (msg.type === 'error') {
            setErrorMessage(msg.message || 'Live Co-Driver connection error.');
            stopLiveSession();
          } else if (msg.type === 'closed') {
            if (handsFreeRef.current) {
              stopLiveSession();
            }
          }
        } catch {
          // Ignore malformed frame
        }
      };

      ws.onerror = () => {
        setErrorMessage('Live Voice WebSocket connection failed. Verify server and GEMINI_API_KEY.');
        stopLiveSession();
      };

      ws.onclose = () => {
        if (handsFreeRef.current) {
          stopLiveSession();
        }
      };

      await engine.startMic(
        (b64Pcm16k) => {
          if (ws.readyState === WebSocket.OPEN && liveReadyRef.current) {
            ws.send(JSON.stringify({ type: 'audio', data: b64Pcm16k }));
          }
        },
        (rms) => setMicLevel(rms)
      );
    } catch (err: any) {
      stopLiveSession();
      setErrorMessage(
        err?.name === 'NotAllowedError'
          ? 'Microphone permission denied. Allow mic access or type below when parked.'
          : err?.message || 'Unable to initialize Live Voice Co-Driver.'
      );
    }
  };

  const appendTurnResult = useCallback(
    async (data: CoDriverTurnResponse, userShownText?: string) => {
      const now = new Date().toISOString();
      const nextMsgs: CoDriverMessage[] = [];

      const spokenTranscript = userShownText || data.transcript;
      if (spokenTranscript && spokenTranscript.trim()) {
        nextMsgs.push({
          id: `drv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          role: 'driver',
          text: spokenTranscript,
          timestamp: now,
          languageCode: data.languageCode,
        });
      }

      if (data.languageCode) {
        setActiveLang(data.languageCode.toUpperCase());
      }

      nextMsgs.push({
        id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        role: 'codriver',
        text: data.replyText,
        timestamp: now,
        languageCode: data.languageCode,
        executedActions: data.executedActions,
        mapPlaces: data.mapPlaces,
      });

      setMessages((prev) => [...prev.slice(-14), ...nextMsgs]);

      if (data.audioBase64) {
        updateVoiceState('speaking');
        await playCoDriverSpeech({
          text: data.replyText,
          languageCode: data.languageCode || 'en-US',
          audioBase64: data.audioBase64,
          audioMimeType: data.audioMimeType,
        });
      }

      updateVoiceState(handsFreeRef.current ? 'listening' : 'idle');
    },
    [updateVoiceState]
  );

  // Proactive Driving Situation Intelligence
  useEffect(() => {
    if (!proactiveEnabled) return;
    if (voiceStateRef.current === 'thinking' || voiceStateRef.current === 'connecting') return;

    const trigger = evaluateProactiveTrigger(driverContext, seenProactiveKeysRef.current);
    if (!trigger) return;

    seenProactiveKeysRef.current.add(trigger.dedupKey);

    // If Live Gemini 3.8 session is open, inject context directly into the live stream
    if (
      handsFreeRef.current &&
      liveReadyRef.current &&
      liveWsRef.current?.readyState === WebSocket.OPEN
    ) {
      liveWsRef.current.send(
        JSON.stringify({
          type: 'context_event',
          eventType: trigger.eventType,
          details: trigger.details,
        })
      );
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/codriver/proactive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            eventType: trigger.eventType,
            details: trigger.details,
            includeAudio: false,
          }),
        });
        const payload = await res.json();
        if (!res.ok || cancelled) return;

        const proactiveText = payload?.replyText || payload?.message;
        if (payload?.shouldSpeak && proactiveText) {
          setMessages((prev) => [
            ...prev.slice(-14),
            {
              id: `pro-${Date.now()}`,
              role: 'codriver',
              text: proactiveText,
              timestamp: new Date().toISOString(),
              languageCode: payload.languageCode || 'en-US',
              isProactive: true,
            },
          ]);
        }
      } catch {
        // Background proactive alert skips silently on network/key absence
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [driverContext, proactiveEnabled, sessionId]);

  const handleTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const message = textInput.trim();
    if (!message || voiceState === 'thinking' || voiceState === 'connecting') return;

    setTextInput('');
    setErrorMessage(null);

    if (
      handsFreeRef.current &&
      liveReadyRef.current &&
      liveWsRef.current?.readyState === WebSocket.OPEN
    ) {
      const lang = inferSpeechLangFromText(message);
      setActiveLang(lang.toUpperCase());
      setMessages((prev) => [
        ...prev.slice(-14),
        {
          id: `drv-txt-${Date.now()}`,
          role: 'driver',
          text: message,
          timestamp: new Date().toISOString(),
          languageCode: lang,
          isLive: true,
        },
      ]);
      liveWsRef.current.send(JSON.stringify({ type: 'text', text: message }));
      return;
    }

    updateVoiceState('thinking');

    try {
      const res = await fetch('/api/codriver/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message,
          includeAudio: false,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error || 'Co-Driver request failed.');
      }
      await appendTurnResult(payload as CoDriverTurnResponse, message);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unable to reach AI Co-Driver.');
      updateVoiceState(handsFreeRef.current ? 'listening' : 'idle');
    }
  };

  const handleInterruptSpeech = () => {
    stopCoDriverSpeech();
    audioEngineRef.current?.stopPlayback();
    updateVoiceState(handsFreeRef.current ? 'listening' : 'idle');
  };

  const handleResetMemory = async () => {
    stopCoDriverSpeech();
    audioEngineRef.current?.stopPlayback();
    seenProactiveKeysRef.current.clear();
    liveInputDraftRef.current = '';
    liveOutputDraftRef.current = '';
    liveActionsRef.current = [];
    setLiveInputDraft('');
    setLiveOutputDraft('');
    setLivePendingActions([]);
    setErrorMessage(null);

    await fetch('/api/codriver/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    }).catch(() => {});

    setMessages([
      {
        id: `codriver-reset-${Date.now()}`,
        role: 'codriver',
        text: 'Conversation memory cleared. Ready whenever you need me.',
        timestamp: new Date().toISOString(),
        languageCode: 'en-US',
      },
    ]);
  };

  const statusLabel =
    voiceState === 'connecting'
      ? 'Connecting Gemini Live...'
      : voiceState === 'listening'
      ? 'Live · Listening Hands-Free'
      : voiceState === 'thinking'
      ? 'Thinking & Executing...'
      : voiceState === 'speaking'
      ? 'Co-Driver Speaking'
      : 'Hands-Free Standby';

  return (
    <div className="clear-glass-card rounded-2xl p-3 space-y-2.5" data-testid="codriver-panel">
      {/* Header Row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`relative w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-transform ${
              handsFreeEnabled ? 'clear-glass-btn-primary' : 'clear-glass-btn text-[var(--primary)]'
            }`}
            style={{
              transform:
                handsFreeEnabled && micLevel > 0.05
                  ? `scale(${1 + Math.min(0.2, micLevel * 0.2)})`
                  : undefined,
            }}
          >
            {voiceState === 'thinking' || voiceState === 'connecting' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : handsFreeEnabled ? (
              <Radio className="w-4 h-4 animate-pulse" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="text-xs font-extrabold text-[#304C64] truncate">AI Co-Driver</h3>
              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white/45 border border-white/70 text-[#26788E] whitespace-nowrap shrink-0">
                <Languages className="w-2.5 h-2.5" />
                {activeLang}
              </span>
            </div>
            <p className="text-[10px] font-semibold text-slate-600 truncate" data-testid="codriver-status">
              {statusLabel}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {voiceState === 'speaking' && (
            <button
              type="button"
              onClick={handleInterruptSpeech}
              aria-label="Stop Co-Driver Speaking"
              className="clear-glass-btn-amber w-7 h-7 rounded-full flex items-center justify-center"
            >
              <VolumeX className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setProactiveEnabled((v) => !v)}
            aria-label={proactiveEnabled ? 'Disable proactive alerts' : 'Enable proactive alerts'}
            title={proactiveEnabled ? 'Proactive Alerts On' : 'Proactive Alerts Muted'}
            className={`w-7 h-7 rounded-full flex items-center justify-center ${
              proactiveEnabled ? 'clear-glass-btn text-[var(--primary)]' : 'clear-glass-btn text-slate-400'
            }`}
          >
            <Volume2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleResetMemory}
            aria-label="Reset Co-Driver Conversation"
            title="Clear conversation memory"
            className="clear-glass-btn w-7 h-7 rounded-full flex items-center justify-center text-[#304C64]"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Real-time Full-Duplex Gemini Live Voice Toggle */}
      <button
        type="button"
        onClick={toggleHandsFree}
        disabled={voiceState === 'connecting'}
        data-testid="codriver-handsfree-toggle"
        className={`w-full py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all whitespace-nowrap ${
          handsFreeEnabled ? 'clear-glass-btn-amber' : 'clear-glass-btn-primary'
        }`}
      >
        {voiceState === 'connecting' ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
            <span>Connecting Live Co-Driver...</span>
          </>
        ) : handsFreeEnabled ? (
          <>
            <MicOff className="w-3.5 h-3.5 shrink-0" />
            <span>Stop Live Voice Session</span>
          </>
        ) : (
          <>
            <Mic className="w-3.5 h-3.5 shrink-0" />
            <span>Start Live Voice Co-Driver (Any Language)</span>
          </>
        )}
      </button>

      {/* Error Propagation Banner (No Mock Fallback) */}
      {errorMessage && (
        <div
          role="alert"
          data-testid="codriver-error"
          className="flex items-start gap-1.5 p-2 rounded-xl bg-rose-500/15 border border-rose-500/35 text-[11px] font-semibold text-[#631B08] overflow-hidden"
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#E2480C]" />
          <span className="leading-snug min-w-0 break-words [overflow-wrap:anywhere]">{errorMessage}</span>
        </div>
      )}

      {/* Conversation Feed */}
      <div
        className={`${
          compact ? 'max-h-32' : 'max-h-44'
        } overflow-y-auto space-y-1.5 pr-0.5`}
        data-testid="codriver-messages"
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`rounded-xl px-2.5 py-1.5 text-[11px] leading-snug ${
              msg.role === 'driver'
                ? 'bg-[#26788E]/18 border border-[#26788E]/30 text-[#1e3547] ml-4'
                : 'bg-white/45 border border-white/75 text-[#304C64] mr-2'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-500">
                {msg.role === 'driver'
                  ? 'Driver'
                  : msg.isProactive
                  ? 'Proactive Co-Driver'
                  : msg.isLive
                  ? 'Gemini Live'
                  : 'Co-Driver'}
              </span>
              {msg.languageCode && (
                <span className="text-[9px] font-bold text-slate-400">{msg.languageCode}</span>
              )}
            </div>
            <p className="font-medium break-words">{msg.text}</p>

            {/* Executed Tool Badges */}
            {msg.executedActions && msg.executedActions.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {msg.executedActions.map((act, idx) => (
                  <span
                    key={`${msg.id}-act-${idx}`}
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold ${
                      act.success
                        ? 'bg-emerald-500/20 text-emerald-900 border border-emerald-500/35'
                        : 'bg-rose-500/15 text-rose-900 border border-rose-500/30'
                    }`}
                  >
                    <CheckCircle2 className="w-2.5 h-2.5 shrink-0" />
                    <span className="truncate max-w-[200px]">{act.summary}</span>
                  </span>
                ))}
              </div>
            )}

            {/* Google Maps Grounding Links */}
            {msg.mapPlaces && msg.mapPlaces.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {msg.mapPlaces.map((place, idx) => (
                  <a
                    key={`${msg.id}-place-${idx}`}
                    href={place.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-[#26788E]/12 text-[#26788E] border border-[#26788E]/30 hover:bg-[#26788E]/20 transition-colors"
                  >
                    <MapPin className="w-2.5 h-2.5 shrink-0" />
                    <span className="truncate max-w-[150px]">{place.title}</span>
                    <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Live Streaming Transcript Drafts */}
        {liveInputDraft && (
          <div className="rounded-xl px-2.5 py-1.5 text-[11px] leading-snug bg-[#26788E]/12 border border-dashed border-[#26788E]/40 text-[#1e3547] ml-4">
            <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-500 block mb-0.5">
              Driver (Live)...
            </span>
            <p className="font-medium break-words">{liveInputDraft}</p>
          </div>
        )}

        {(liveOutputDraft || livePendingActions.length > 0) && (
          <div className="rounded-xl px-2.5 py-1.5 text-[11px] leading-snug bg-white/55 border border-dashed border-[#26788E]/45 text-[#304C64] mr-2">
            <span className="text-[9px] font-extrabold uppercase tracking-wider text-[#26788E] block mb-0.5">
              Gemini Live...
            </span>
            {liveOutputDraft && <p className="font-medium break-words">{liveOutputDraft}</p>}
            {livePendingActions.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {livePendingActions.map((act, idx) => (
                  <span
                    key={`pending-act-${idx}`}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-emerald-500/20 text-emerald-900 border border-emerald-500/35"
                  >
                    <CheckCircle2 className="w-2.5 h-2.5 shrink-0" />
                    <span className="truncate max-w-[200px]">{act.summary}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Parked / Grounded Text Input */}
      <form onSubmit={handleTextSubmit} className="flex items-center gap-1.5 pt-0.5">
        <input
          type="text"
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          placeholder="Ask about traffic, detours, nearby stops (when parked)..."
          aria-label="Message AI Co-Driver"
          disabled={voiceState === 'thinking' || voiceState === 'connecting'}
          className="clear-glass-input flex-1 min-w-0 px-2.5 py-1.5 rounded-xl text-[11px] font-medium placeholder:text-slate-500"
        />
        <button
          type="submit"
          disabled={!textInput.trim() || voiceState === 'thinking' || voiceState === 'connecting'}
          aria-label="Send to AI Co-Driver"
          className="clear-glass-btn-primary w-8 h-8 rounded-xl flex items-center justify-center shrink-0 disabled:opacity-50"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
};
