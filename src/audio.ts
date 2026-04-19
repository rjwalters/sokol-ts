import { type AudioDesc, type Audio } from "./types.js";

// AudioWorklet processor source — runs in the audio rendering thread.
// The main thread sends filled channel buffers back in response to 'request' messages.
const PROCESSOR_SOURCE = `
class SokolProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this._numChannels = options.processorOptions.numChannels;
    this._bufferFrames = options.processorOptions.bufferFrames;
    this._pending = null;
    this.port.onmessage = (e) => {
      if (e.data.type === 'buffer') {
        this._pending = e.data.channels;
      }
    };
    // Request the first buffer immediately
    this.port.postMessage({ type: 'request', numFrames: this._bufferFrames });
  }
  process(_inputs, outputs) {
    const out = outputs[0];
    if (this._pending) {
      for (let ch = 0; ch < out.length && ch < this._pending.length; ch++) {
        out[ch].set(this._pending[ch]);
      }
      this._pending = null;
    }
    // Request the next buffer
    this.port.postMessage({ type: 'request', numFrames: this._bufferFrames });
    return true;
  }
}
registerProcessor('sokol-processor', SokolProcessor);
`;

export async function createAudio(desc: AudioDesc): Promise<Audio> {
  const numChannels = desc.numChannels ?? 2;
  const bufferFrames = desc.bufferFrames ?? 128;
  const volume = desc.volume ?? 1.0;

  // Create AudioContext with requested sample rate (or browser default)
  const contextOptions: AudioContextOptions = {};
  if (desc.sampleRate !== undefined) {
    contextOptions.sampleRate = desc.sampleRate;
  }
  const context = new AudioContext(contextOptions);

  // Install AudioWorklet processor via inline Blob URL (keeps lib self-contained)
  const blob = new Blob([PROCESSOR_SOURCE], { type: "application/javascript" });
  const blobUrl = URL.createObjectURL(blob);
  try {
    await context.audioWorklet.addModule(blobUrl);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }

  // Create the worklet node
  const workletNode = new AudioWorkletNode(context, "sokol-processor", {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [numChannels],
    processorOptions: { numChannels, bufferFrames },
  });

  // Create gain node for volume control, connect graph: worklet -> gain -> destination
  const gainNode = context.createGain();
  gainNode.gain.value = volume;
  workletNode.connect(gainNode);
  gainNode.connect(context.destination);

  // Interleaved scratch buffer filled by the user callback, then split per channel
  const interleavedBuf = new Float32Array(bufferFrames * numChannels);

  // Handle 'request' messages from the worklet: fill buffer via callback, post back
  workletNode.port.onmessage = (e: MessageEvent) => {
    if (e.data.type !== "request") return;

    interleavedBuf.fill(0);
    desc.streamCallback(interleavedBuf, bufferFrames, numChannels);

    // De-interleave into per-channel arrays expected by the worklet
    const channels: Float32Array[] = [];
    for (let ch = 0; ch < numChannels; ch++) {
      const chBuf = new Float32Array(bufferFrames);
      for (let i = 0; i < bufferFrames; i++) {
        chBuf[i] = interleavedBuf[i * numChannels + ch];
      }
      channels.push(chBuf);
    }

    workletNode.port.postMessage({ type: "buffer", channels });
  };

  // Visibility change handling: suspend when hidden, resume when visible
  let userSuspended = false;

  const onVisibilityChange = () => {
    if (document.hidden) {
      if (context.state === "running") {
        context.suspend().catch(() => undefined);
      }
    } else {
      if (!userSuspended && context.state === "suspended") {
        context.resume().catch(() => undefined);
      }
    }
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  // Eagerly attempt resume — succeeds on localhost / after a gesture
  context.resume().catch(() => undefined);

  let _shutdown = false;

  const audio: Audio = {
    get sampleRate(): number {
      return context.sampleRate;
    },

    get numChannels(): number {
      return numChannels;
    },

    get isRunning(): boolean {
      return context.state === "running";
    },

    async suspend(): Promise<void> {
      if (_shutdown) return;
      userSuspended = true;
      await context.suspend();
    },

    async resume(): Promise<void> {
      if (_shutdown) {
        throw new Error("sokol_audio: cannot resume after shutdown");
      }
      userSuspended = false;
      await context.resume();
    },

    setVolume(v: number): void {
      gainNode.gain.value = Math.max(0, Math.min(1, v));
    },

    shutdown(): void {
      if (_shutdown) return;
      _shutdown = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      workletNode.disconnect();
      gainNode.disconnect();
      context.close().catch(() => undefined);
    },
  };

  return audio;
}
