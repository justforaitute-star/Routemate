// Audio chime synthesizer using Web Audio API (zero external assets needed)

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function playApproachingChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Pleasant two-tone bell (E5 -> G5)
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now); // E5
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(783.99, now + 0.15); // G5

    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.18, now + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.2);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.6);
  } catch {
    // Audio context may be restricted before user gesture
  }
}

export function playArrivalChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Harmonious 3-tone triumphant chime (C5 -> E5 -> G5)
    [523.25, 659.25, 783.99].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = now + idx * 0.12;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.2, startTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.5);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.5);
    });
  } catch {
    // Ignore audio restriction
  }
}

export function playAlertChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now); // A4
    osc.frequency.setValueAtTime(392, now + 0.15); // G4

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.5);
  } catch {
    // Ignore
  }
}

// Voice synthesis speech for hands-free driver guidance (multilingual)
export function speakDriverGuidance(text: string, lang = 'en-US', onEnd?: () => void) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    onEnd?.();
    return;
  }
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 1.02;
    utterance.pitch = 1.0;
    utterance.volume = 0.95;
    if (onEnd) {
      utterance.onend = () => onEnd();
      utterance.onerror = () => onEnd();
    }
    window.speechSynthesis.speak(utterance);
  } catch {
    onEnd?.();
  }
}

let activeAudioEl: HTMLAudioElement | null = null;

export function stopCoDriverSpeech() {
  try {
    if (activeAudioEl) {
      activeAudioEl.pause();
      activeAudioEl.src = '';
      activeAudioEl = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  } catch {
    // Ignore cleanup errors
  }
}

export function playCoDriverSpeech(params: {
  text: string;
  languageCode?: string;
  audioBase64?: string;
  audioMimeType?: string;
}): Promise<void> {
  stopCoDriverSpeech();
  const { text, languageCode = 'en-US', audioBase64, audioMimeType = 'audio/wav' } = params;

  return new Promise((resolve) => {
    if (audioBase64 && typeof Audio !== 'undefined') {
      try {
        const audio = new Audio(`data:${audioMimeType};base64,${audioBase64}`);
        activeAudioEl = audio;
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          if (activeAudioEl === audio) activeAudioEl = null;
          resolve();
        };
        audio.onended = finish;
        audio.onerror = () => {
          if (settled) return;
          settled = true;
          if (activeAudioEl === audio) activeAudioEl = null;
          speakDriverGuidance(text, languageCode, resolve);
        };
        audio.play().catch(() => {
          if (settled) return;
          settled = true;
          if (activeAudioEl === audio) activeAudioEl = null;
          speakDriverGuidance(text, languageCode, resolve);
        });
        return;
      } catch {
        // Fallback to SpeechSynthesis
      }
    }

    speakDriverGuidance(text, languageCode, resolve);
  });
}
