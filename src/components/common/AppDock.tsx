import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  LayoutGrid,
  CheckSquare,
  Bell,
  Layers,
  Mic,
  MicOff,
  Loader2,
  Route as RouteIcon,
  QrCode,
  UserCheck,
  Map as MapIcon,
  Sliders,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { LiveAudioEngine } from '../../utils/liveAudio';
import { playCoDriverSpeech, stopCoDriverSpeech } from '../../utils/audioAlerts';
import {
  getDockTabsForRole,
  normalizeTabForRole,
  RoleDockTabSpec,
  SectionTabId,
} from '../../utils/roleSectionHelpers';

export type DemoTabId = SectionTabId;

interface AppDockProps {
  activeTab: SectionTabId;
  onTabChange: (tab: SectionTabId) => void;
}

type MicState = 'idle' | 'connecting' | 'listening' | 'recording' | 'thinking' | 'speaking';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Audio encoding failed'));
    reader.readAsDataURL(blob);
  });
}

function getRecorderMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return 'audio/webm';
  for (const type of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return 'audio/webm';
}

export const AppDock: React.FC<AppDockProps> = ({ activeTab, onTabChange }) => {
  const { notifications, currentUser, currentRole } = useApp();
  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const normalizedActiveTab = normalizeTabForRole(currentRole, activeTab);

  const [isMicOpen, setIsMicOpen] = useState<boolean>(false);
  const [micState, setMicState] = useState<MicState>('idle');
  const [micLevel, setMicLevel] = useState<number>(0);
  const [caption, setCaption] = useState<string>('');
  const [errorLine, setErrorLine] = useState<string | null>(null);

  const sessionId = `demo-driver-${currentUser.id || 'default'}`;
  const activeRef = useRef<boolean>(false);
  const micStateRef = useRef<MicState>('idle');
  const wsRef = useRef<WebSocket | null>(null);
  const engineRef = useRef<LiveAudioEngine | null>(null);
  const liveReadyRef = useRef<boolean>(false);

  // Fallback HTTP turn recorder refs (used automatically if Live WebSocket closes before ready)
  const fallbackStreamRef = useRef<MediaStream | null>(null);
  const fallbackCtxRef = useRef<AudioContext | null>(null);
  const fallbackAnalyserRef = useRef<AnalyserNode | null>(null);
  const fallbackRecorderRef = useRef<MediaRecorder | null>(null);
  const fallbackVadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fallbackChunksRef = useRef<Blob[]>([]);
  const speechStartRef = useRef<number>(0);
  const lastSoundRef = useRef<number>(0);
  const loudFramesRef = useRef<number>(0);

  const setVoiceState = useCallback((next: MicState) => {
    micStateRef.current = next;
    setMicState(next);
  }, []);

  const stopFallbackPipeline = useCallback(() => {
    if (fallbackVadTimerRef.current) {
      clearInterval(fallbackVadTimerRef.current);
      fallbackVadTimerRef.current = null;
    }
    if (fallbackRecorderRef.current && fallbackRecorderRef.current.state !== 'inactive') {
      try {
        fallbackRecorderRef.current.onstop = null;
        fallbackRecorderRef.current.stop();
      } catch {
        // Ignore stop errors
      }
    }
    fallbackRecorderRef.current = null;
    fallbackChunksRef.current = [];
    if (fallbackStreamRef.current) {
      fallbackStreamRef.current.getTracks().forEach((t) => t.stop());
      fallbackStreamRef.current = null;
    }
    if (fallbackCtxRef.current) {
      fallbackCtxRef.current.close().catch(() => {});
      fallbackCtxRef.current = null;
    }
    fallbackAnalyserRef.current = null;
  }, []);

  const stopCoDriver = useCallback(() => {
    activeRef.current = false;
    liveReadyRef.current = false;
    stopCoDriverSpeech();

    if (wsRef.current) {
      try {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.onmessage = null;
        wsRef.current.close();
      } catch {
        // Ignore
      }
      wsRef.current = null;
    }

    if (engineRef.current) {
      engineRef.current.stopAll();
      engineRef.current = null;
    }

    stopFallbackPipeline();
    setMicLevel(0);
    setVoiceState('idle');
  }, [setVoiceState, stopFallbackPipeline]);

  useEffect(() => {
    return () => {
      stopCoDriver();
    };
  }, [stopCoDriver]);

  const submitVoiceClipFallback = useCallback(
    async (blob: Blob, mimeType: string) => {
      if (!activeRef.current || blob.size < 1000) {
        if (activeRef.current) setVoiceState('listening');
        return;
      }
      setVoiceState('thinking');
      setCaption('Thinking...');
      setErrorLine(null);

      try {
        const audioBase64 = await blobToBase64(blob);
        const res = await fetch('/api/codriver/turn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            audioBase64,
            mimeType: mimeType.split(';')[0] || 'audio/webm',
            includeAudio: true,
          }),
        });
        const payload = await res.json();
        if (!res.ok) {
          throw new Error(payload?.error || 'Co-Driver service unavailable.');
        }
        const replyText = (payload?.replyText || '').trim();
        if (replyText) {
          setCaption(replyText);
          setVoiceState('speaking');
          await playCoDriverSpeech({
            text: replyText,
            languageCode: payload.languageCode || 'en-US',
            audioBase64: payload.audioBase64,
            audioMimeType: payload.audioMimeType,
          });
        }
        if (activeRef.current) {
          setVoiceState('listening');
          setCaption('Listening...');
        }
      } catch (err: any) {
        setErrorLine(err?.message || 'Unable to reach Co-Driver.');
        if (activeRef.current) {
          setVoiceState('listening');
        }
      }
    },
    [sessionId, setVoiceState]
  );

  const startHttpVoiceFallback = useCallback(async () => {
    if (!activeRef.current || fallbackStreamRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (!activeRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      fallbackStreamRef.current = stream;

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      if (ctx.state === 'suspended') await ctx.resume();
      fallbackCtxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      fallbackAnalyserRef.current = analyser;

      setVoiceState('listening');
      setCaption('Listening...');
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const mimeType = getRecorderMimeType();

      const startClip = () => {
        if (!activeRef.current || !fallbackStreamRef.current || micStateRef.current !== 'listening') return;
        try {
          const rec = new MediaRecorder(fallbackStreamRef.current, { mimeType });
          fallbackRecorderRef.current = rec;
          fallbackChunksRef.current = [];
          speechStartRef.current = Date.now();
          lastSoundRef.current = Date.now();

          rec.ondataavailable = (ev) => {
            if (ev.data && ev.data.size > 0) fallbackChunksRef.current.push(ev.data);
          };
          rec.onstop = () => {
            const chunks = fallbackChunksRef.current;
            fallbackChunksRef.current = [];
            fallbackRecorderRef.current = null;
            if (!activeRef.current) return;
            const blob = new Blob(chunks, { type: mimeType });
            void submitVoiceClipFallback(blob, mimeType);
          };
          rec.start(250);
          setVoiceState('recording');
          setCaption('Hearing you...');
        } catch {
          setErrorLine('Voice recording unavailable on this browser.');
        }
      };

      fallbackVadTimerRef.current = setInterval(() => {
        if (!activeRef.current || !fallbackAnalyserRef.current) return;
        const st = micStateRef.current;
        if (st === 'thinking' || st === 'speaking') {
          setMicLevel(0);
          return;
        }
        fallbackAnalyserRef.current.getByteTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const v = (dataArray[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        setMicLevel(Math.min(1, rms * 6));

        const now = Date.now();
        if (rms > 0.028) {
          loudFramesRef.current += 1;
          lastSoundRef.current = now;
          if (st === 'listening' && loudFramesRef.current >= 2) {
            loudFramesRef.current = 0;
            startClip();
          }
        } else {
          loudFramesRef.current = 0;
          if (st === 'recording') {
            if (now - lastSoundRef.current >= 1200 || now - speechStartRef.current >= 14000) {
              fallbackRecorderRef.current?.stop();
            }
          }
        }
      }, 75);
    } catch (err: any) {
      setErrorLine(
        err?.name === 'NotAllowedError'
          ? 'Microphone permission denied.'
          : err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError'
          ? 'No microphone detected on this device.'
          : 'Microphone unavailable on this device.'
      );
      stopCoDriver();
    }
  }, [setVoiceState, stopCoDriver, submitVoiceClipFallback]);

  const startCoDriver = async () => {
    setErrorLine(null);
    setCaption('Connecting...');
    setIsMicOpen(true);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setErrorLine('Microphone is unavailable in this browser.');
      setVoiceState('idle');
      return;
    }

    activeRef.current = true;
    setVoiceState('connecting');

    const engine = new LiveAudioEngine();
    engineRef.current = engine;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/codriver-live?sessionId=${encodeURIComponent(
      sessionId
    )}`;

    let fellBack = false;
    const triggerFallback = (msg?: string) => {
      if (fellBack || !activeRef.current) return;
      fellBack = true;
      liveReadyRef.current = false;
      try {
        wsRef.current?.close();
      } catch {
        // Ignore
      }
      wsRef.current = null;
      engine.stopAll();
      engineRef.current = null;
      if (msg) setErrorLine(msg);
      void startHttpVoiceFallback();
    };

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (ev) => {
        if (!activeRef.current) return;
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'ready') {
            liveReadyRef.current = true;
            setVoiceState('listening');
            setCaption('Listening...');
          } else if (msg.type === 'audio' && msg.data) {
            setVoiceState('speaking');
            engine.playPcm24kChunk(msg.data, (playing) => {
              if (!playing && activeRef.current && micStateRef.current === 'speaking') {
                setVoiceState('listening');
                setCaption('Listening...');
              }
            });
          } else if (msg.type === 'interrupted') {
            engine.stopPlayback();
            if (activeRef.current) {
              setVoiceState('listening');
              setCaption('Listening...');
            }
          } else if (msg.type === 'input_transcript' && msg.text) {
            setCaption(msg.text.trim());
          } else if (msg.type === 'output_transcript' && msg.text) {
            setCaption(msg.text.trim());
          } else if (msg.type === 'error') {
            if (!liveReadyRef.current) {
              triggerFallback(msg.message);
            } else {
              setErrorLine(msg.message || 'Voice session interrupted.');
            }
          } else if (msg.type === 'closed' && !liveReadyRef.current) {
            triggerFallback();
          }
        } catch {
          // Ignore malformed WS frames
        }
      };

      ws.onerror = () => {
        if (!liveReadyRef.current) {
          triggerFallback();
        }
      };

      ws.onclose = () => {
        if (activeRef.current && !liveReadyRef.current) {
          triggerFallback();
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
      stopCoDriver();
      setErrorLine(
        err?.name === 'NotAllowedError'
          ? 'Microphone permission denied.'
          : err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError'
          ? 'No microphone detected on this device.'
          : err?.message || 'Microphone unavailable on this device.'
      );
    }
  };

  const handleMicPress = () => {
    if (isMicOpen && (activeRef.current || micState !== 'idle')) {
      stopCoDriver();
      setIsMicOpen(false);
      setCaption('');
      setErrorLine(null);
      return;
    }
    if (isMicOpen && errorLine) {
      setIsMicOpen(false);
      setErrorLine(null);
      return;
    }
    void startCoDriver();
  };

  const isListeningOrActive =
    micState === 'listening' ||
    micState === 'recording' ||
    micState === 'speaking' ||
    micState === 'thinking' ||
    micState === 'connecting';

  const DOCK_ICON_MAP: Record<RoleDockTabSpec['iconKey'], any> = {
    overview: LayoutGrid,
    routes: RouteIcon,
    stops: CheckSquare,
    pass: QrCode,
    roster: Layers,
    alerts: Bell,
    profile: UserCheck,
    settings: Sliders,
    map: MapIcon,
  };

  const { left: leftTabs, right: rightTabs } = getDockTabsForRole(currentRole);

  return (
    <div className="shrink-0 z-[1050] px-3 pb-[max(0.625rem,env(safe-area-inset-bottom))] pt-1 relative">
      {/* Minimalist Floating Mic Halo when Co-Driver is active */}
      {isMicOpen && (
        <div
          data-testid="codriver-minimal-overlay"
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-6 flex flex-col items-center gap-2 pointer-events-auto animate-in fade-in slide-in-from-bottom-2 duration-200"
        >
          <div className="relative flex items-center justify-center">
            {isListeningOrActive && (
              <span
                className="absolute inset-0 rounded-full transition-transform duration-150 pointer-events-none"
                style={{
                  transform: `scale(${1.18 + micLevel * 0.45})`,
                  background:
                    micState === 'speaking'
                      ? 'rgba(226, 72, 12, 0.24)'
                      : 'rgba(38, 120, 142, 0.24)',
                }}
              />
            )}
            <button
              type="button"
              onClick={handleMicPress}
              data-testid="codriver-orb-mic"
              aria-label={isListeningOrActive ? 'Stop Co-Driver Mic' : 'Start Co-Driver Mic'}
              className={`relative w-16 h-16 rounded-full flex items-center justify-center shadow-xl transition-all ${
                micState === 'speaking'
                  ? 'clear-glass-btn-amber'
                  : isListeningOrActive
                  ? 'clear-glass-btn-primary'
                  : 'liquid-glass-elevated text-[#304C64]'
              }`}
            >
              {micState === 'connecting' || micState === 'thinking' ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : isListeningOrActive ? (
                <Mic className="w-6 h-6" />
              ) : (
                <MicOff className="w-6 h-6" />
              )}
            </button>
          </div>

          {(errorLine || caption) && (
            <div
              data-testid={errorLine ? 'codriver-error' : 'codriver-caption'}
              className={`max-w-[260px] sm:max-w-xs px-3 py-1 rounded-full liquid-glass-elevated text-[11px] font-semibold text-center truncate ${
                errorLine ? 'text-[#631B08]' : 'text-[#304C64]'
              }`}
            >
              {errorLine || caption}
            </div>
          )}
        </div>
      )}

      {/* Unified Clear Liquid Glass Bottom Dock (Mobile + Tablet + Desktop) */}
      <nav
        aria-label="Primary Navigation Dock"
        className="max-w-md mx-auto clear-glass-card rounded-full px-1.5 py-1 shadow-lg"
      >
        <div className="grid grid-cols-[1fr_1fr_auto_1fr_1fr] items-center gap-1">
          {leftTabs.map((tab) => {
            const Icon = DOCK_ICON_MAP[tab.iconKey] || LayoutGrid;
            const isActive = normalizedActiveTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                data-testid={`dock-tab-${tab.id}`}
                onClick={() => onTabChange(tab.id)}
                className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-full transition-all whitespace-nowrap ${
                  isActive
                    ? 'clear-glass-btn-primary font-bold'
                    : 'text-[#304C64]/75 hover:text-[#304C64] font-semibold hover:bg-white/30'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'stroke-[2.4]' : 'stroke-[1.9]'}`} />
                <span className="text-[10px] tracking-tight mt-0.5 leading-none">
                  {tab.label}
                </span>
              </button>
            );
          })}

          {/* Centered Minimalist Co-Driver Mic Button directly in the Dock */}
          <div className="px-1 flex items-center justify-center">
            <button
              type="button"
              onClick={handleMicPress}
              data-testid="dock-codriver-mic"
              aria-label={isMicOpen ? 'Close Co-Driver Microphone' : 'Co-Driver Voice Microphone'}
              title="Voice Co-Driver"
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-all shadow-md ${
                isMicOpen
                  ? micState === 'speaking'
                    ? 'clear-glass-btn-amber scale-105'
                    : 'clear-glass-btn-primary scale-105'
                  : 'clear-glass-btn-primary hover:scale-105'
              }`}
            >
              {micState === 'connecting' || micState === 'thinking' ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Mic className="w-5 h-5" />
              )}
            </button>
          </div>

          {rightTabs.map((tab) => {
            const Icon = DOCK_ICON_MAP[tab.iconKey] || Bell;
            const isActive = normalizedActiveTab === tab.id;
            const badgeCount = tab.showUnreadBadge ? unreadCount : 0;
            return (
              <button
                key={tab.id}
                type="button"
                data-testid={`dock-tab-${tab.id}`}
                onClick={() => onTabChange(tab.id)}
                className={`relative flex flex-col items-center justify-center py-1.5 px-1 rounded-full transition-all whitespace-nowrap ${
                  isActive
                    ? 'clear-glass-btn-primary font-bold'
                    : 'text-[#304C64]/75 hover:text-[#304C64] font-semibold hover:bg-white/30'
                }`}
              >
                <div className="relative">
                  <Icon className={`w-4 h-4 ${isActive ? 'stroke-[2.4]' : 'stroke-[1.9]'}`} />
                  {badgeCount > 0 && (
                    <span
                      className="absolute -top-1 -right-2 min-w-3.5 h-3.5 px-0.5 rounded-full text-white text-[8px] font-extrabold flex items-center justify-center shadow-xs"
                      style={{ backgroundColor: 'var(--accent-amber, #E2480C)' }}
                    >
                      {badgeCount > 9 ? '9+' : badgeCount}
                    </span>
                  )}
                </div>
                <span className="text-[10px] tracking-tight mt-0.5 leading-none">
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
