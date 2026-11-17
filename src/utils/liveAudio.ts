// Real-time 16kHz PCM capture and gapless 24kHz PCM playback utilities for Gemini Live API

export function resampleFloat32(
  input: Float32Array,
  fromSampleRate: number,
  toSampleRate: number
): Float32Array {
  if (fromSampleRate === toSampleRate || input.length === 0) {
    return input;
  }
  const ratio = fromSampleRate / toSampleRate;
  const outputLength = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const srcIdx = i * ratio;
    const low = Math.floor(srcIdx);
    const high = Math.min(low + 1, input.length - 1);
    const frac = srcIdx - low;
    output[i] = input[low] * (1 - frac) + input[high] * frac;
  }

  return output;
}

export function float32ToPcm16Base64(float32: Float32Array): string {
  const pcm16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const clamped = Math.max(-1, Math.min(1, float32[i]));
    pcm16[i] = clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
  }
  const bytes = new Uint8Array(pcm16.buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

export function base64Pcm16ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const sampleCount = Math.floor(bytes.byteLength / 2);
  const view = new DataView(bytes.buffer, bytes.byteOffset, sampleCount * 2);
  const float32 = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const int16 = view.getInt16(i * 2, true);
    float32[i] = int16 / 32768;
  }
  return float32;
}

export class LiveAudioEngine {
  private inputCtx: AudioContext | null = null;
  private outputCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private nextStartTime = 0;
  private activeSources = new Set<AudioBufferSourceNode>();
  private isCapturing = false;

  async startMic(
    onAudioChunkBase64: (base64Pcm16k: string) => void,
    onMicLevel?: (rms: number) => void
  ): Promise<void> {
    if (this.isCapturing) return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone access is unavailable in this browser.');
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    this.micStream = stream;

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const inputCtx = new AudioContextClass({ sampleRate: 16000 });
    if (inputCtx.state === 'suspended') {
      await inputCtx.resume();
    }
    this.inputCtx = inputCtx;

    // Pre-warm 24kHz playback AudioContext on user gesture
    this.ensureOutputContext();

    const source = inputCtx.createMediaStreamSource(stream);
    const processor = inputCtx.createScriptProcessor(4096, 1, 1);

    // Connect through a silent GainNode so browsers fire onaudioprocess without echoing mic audio
    const silentGain = inputCtx.createGain();
    silentGain.gain.value = 0;

    source.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(inputCtx.destination);

    this.sourceNode = source;
    this.processor = processor;
    this.isCapturing = true;

    processor.onaudioprocess = (ev) => {
      if (!this.isCapturing) return;
      const raw = ev.inputBuffer.getChannelData(0);

      let sum = 0;
      for (let i = 0; i < raw.length; i++) {
        sum += raw[i] * raw[i];
      }
      const rms = Math.sqrt(sum / raw.length);
      onMicLevel?.(Math.min(1, rms * 6));

      const pcm16k = resampleFloat32(raw, inputCtx.sampleRate, 16000);
      const b64 = float32ToPcm16Base64(pcm16k);
      onAudioChunkBase64(b64);
    };
  }

  private ensureOutputContext(): AudioContext {
    if (!this.outputCtx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.outputCtx = new AudioContextClass({ sampleRate: 24000 });
    }
    if (this.outputCtx.state === 'suspended') {
      this.outputCtx.resume().catch(() => {});
    }
    return this.outputCtx;
  }

  playPcm24kChunk(base64Audio: string, onPlaybackStateChange?: (playing: boolean) => void) {
    if (!base64Audio) return;
    const ctx = this.ensureOutputContext();
    const samples = base64Pcm16ToFloat32(base64Audio);
    if (samples.length === 0) return;

    const audioBuffer = ctx.createBuffer(1, samples.length, 24000);
    audioBuffer.getChannelData(0).set(samples);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);

    const now = ctx.currentTime;
    const startAt = Math.max(now + 0.02, this.nextStartTime);
    this.nextStartTime = startAt + audioBuffer.duration;

    this.activeSources.add(source);
    onPlaybackStateChange?.(true);

    source.onended = () => {
      this.activeSources.delete(source);
      if (this.activeSources.size === 0) {
        this.nextStartTime = 0;
        onPlaybackStateChange?.(false);
      }
    };

    source.start(startAt);
  }

  stopPlayback() {
    for (const src of this.activeSources) {
      try {
        src.stop();
        src.disconnect();
      } catch {
        // Ignore already-stopped nodes
      }
    }
    this.activeSources.clear();
    this.nextStartTime = 0;
  }

  stopAll() {
    this.isCapturing = false;
    this.stopPlayback();

    if (this.processor) {
      this.processor.onaudioprocess = null;
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    if (this.inputCtx) {
      this.inputCtx.close().catch(() => {});
      this.inputCtx = null;
    }
    if (this.outputCtx) {
      this.outputCtx.close().catch(() => {});
      this.outputCtx = null;
    }
  }
}
