import type { ModulationFrame } from '../core/modulation';
import { scrapeLayers } from '../core/scrape-layers';
import { FoleyVoice } from './foley-voice';

/** Owns the audio context. Create it inside a tap: browsers only start audio from a user gesture. */
export class AudioEngine {
  private readonly ctx: AudioContext;
  private readonly analyser: AnalyserNode;
  private readonly voice: FoleyVoice;
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

    this.voice = new FoleyVoice(this.ctx, scrapeLayers(this.ctx.sampleRate), this.analyser);
    void this.ctx.resume();

    // Hidden pages stop getting frames, so a stroke in progress would otherwise keep sounding.
    document.addEventListener('visibilitychange', () => {
      void (document.hidden ? this.ctx.suspend() : this.ctx.resume());
    });
  }

  apply(frame: ModulationFrame) {
    this.voice.apply(frame);
  }

  /** Call on touch down: iOS can leave the context interrupted after a call or a trip to another app. */
  wake() {
    if (this.ctx.state !== 'running') void this.ctx.resume();
  }

  get state() {
    return this.ctx.state;
  }

  /** Peak of the latest output, for the overlay. */
  outputPeak() {
    this.analyser.getFloatTimeDomainData(this.scope);
    let peak = 0;
    for (const v of this.scope) peak = Math.max(peak, Math.abs(v));
    return peak;
  }
}
