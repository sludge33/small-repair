import type { Tool } from '../core/bowl-repair';
import type { ModulationFrame } from '../core/modulation';
import { oneShot, type OneShot } from '../core/one-shots';
import { scrapeLayers } from '../core/scrape-layers';
import { FoleyVoice } from './foley-voice';

const FIT_TONE_LEVEL = 0.07;
const FIT_TONE_LOW_HZ = 196;
const FIT_TONE_OCTAVES = 1.5;
const FIT_TONE_SMOOTHING_SECONDS = 0.03;

/** Owns the audio context. Create it inside a tap: browsers only start audio from a user gesture. */
export class AudioEngine {
  private readonly ctx: AudioContext;
  private readonly analyser: AnalyserNode;
  private readonly fitOscillator: OscillatorNode;
  private readonly fitGain: GainNode;
  private readonly oneShots = new Map<OneShot, AudioBuffer>();
  private voice: FoleyVoice | null = null;
  private voiceTool: Tool | null = null;
  private readonly scope: Float32Array<ArrayBuffer>;

  constructor() {
    // Otherwise the iPhone ring switch silences Web Audio.
    const session = (navigator as any).audioSession;
    if (session) session.type = 'playback';

    const AC: typeof AudioContext = window.AudioContext ?? (window as any).webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.connect(this.ctx.destination);
    this.scope = new Float32Array(this.analyser.fftSize);

    this.fitGain = this.ctx.createGain();
    this.fitGain.gain.value = 0;
    this.fitOscillator = this.ctx.createOscillator();
    this.fitOscillator.frequency.value = FIT_TONE_LOW_HZ;
    this.fitOscillator.connect(this.fitGain).connect(this.analyser);
    this.fitOscillator.start();

    void this.ctx.resume();

    // Hidden pages stop getting frames, so a stroke in progress would otherwise keep sounding.
    document.addEventListener('visibilitychange', () => {
      void (document.hidden ? this.ctx.suspend() : this.ctx.resume());
    });
  }

  apply(frame: ModulationFrame) {
    this.voice?.apply(frame);
  }

  /** Swaps in the continuous sound of a tool. Hands and the lid have none, only one-shots. */
  setTool(tool: Tool | null) {
    if (tool === this.voiceTool) return;
    this.voiceTool = tool;
    this.voice?.retire();
    const stroked = tool === 'blade' || tool === 'brush' || tool === 'duster' || tool === 'cloth';
    this.voice = stroked ? new FoleyVoice(this.ctx, scrapeLayers(this.ctx.sampleRate, tool), this.analyser) : null;
  }

  play(name: OneShot) {
    const source = this.ctx.createBufferSource();
    source.buffer = this.oneShotBuffer(name);
    source.connect(this.analyser);
    source.start();
  }

  /** A held shard's rising tone. @param pull 0–1 towards the seat; 0 is silent. */
  fitTone(pull: number) {
    const now = this.ctx.currentTime;
    this.fitGain.gain.setTargetAtTime(pull * pull * FIT_TONE_LEVEL, now, FIT_TONE_SMOOTHING_SECONDS);
    this.fitOscillator.frequency.setTargetAtTime(FIT_TONE_LOW_HZ * Math.pow(2, pull * FIT_TONE_OCTAVES), now, FIT_TONE_SMOOTHING_SECONDS);
  }

  /** Call on touch down: iOS can leave the context interrupted after a call or a trip to another app. */
  wake() {
    if (this.ctx.state !== 'running') void this.ctx.resume();
  }

  get state() {
    return this.ctx.state;
  }

  private oneShotBuffer(name: OneShot) {
    let buffer = this.oneShots.get(name);
    if (!buffer) {
      const samples = oneShot(name, this.ctx.sampleRate);
      buffer = this.ctx.createBuffer(1, samples.length, this.ctx.sampleRate);
      buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
      this.oneShots.set(name, buffer);
    }
    return buffer;
  }

  /** Peak of the latest output, for the overlay. */
  outputPeak() {
    this.analyser.getFloatTimeDomainData(this.scope);
    let peak = 0;
    for (const v of this.scope) peak = Math.max(peak, Math.abs(v));
    return peak;
  }
}
