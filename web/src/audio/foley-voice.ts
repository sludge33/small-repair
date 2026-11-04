import type { ModulationFrame } from '../core/modulation';
import { BODY_LEVEL, OUTPUT_LEVEL, type FoleyLayers } from '../core/scrape-layers';

const SMOOTHING_SECONDS = 0.005;
// BiquadFilter Q is in dB for a low-pass. -6 dB is linear Q 0.5: no resonance, however far the cutoff moves.
const LOWPASS_Q_DB = -6;

/**
 * One continuous tool-on-material sound: looping speed layers and a body layer, driven by the modulation every frame.
 * This takes the place of the layered FMOD event in the original plan.
 */
export class FoleyVoice {
  private readonly slow: GainNode;
  private readonly medium: GainNode;
  private readonly fast: GainNode;
  private readonly body: GainNode;
  private readonly lowpass: BiquadFilterNode;
  private readonly master: GainNode;
  private readonly panner: StereoPannerNode;
  private readonly textures: AudioBufferSourceNode[] = [];
  private lastGain = 0;

  constructor(
    private readonly ctx: BaseAudioContext,
    layers: FoleyLayers,
    output: AudioNode,
  ) {
    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.Q.value = LOWPASS_Q_DB;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.panner = ctx.createStereoPanner();

    this.slow = this.addLayer(layers.slow, this.lowpass, true);
    this.medium = this.addLayer(layers.medium, this.lowpass, true);
    this.fast = this.addLayer(layers.fast, this.lowpass, true);
    this.body = this.addLayer(layers.body, this.master, false);

    this.lowpass.connect(this.master);
    this.master.connect(this.panner).connect(output);
  }

  apply(frame: ModulationFrame) {
    // Silent and staying silent: nothing to schedule.
    if (frame.gain <= 0 && this.lastGain <= 0) return;
    this.lastGain = frame.gain;

    this.glide(this.slow.gain, frame.slowLayer);
    this.glide(this.medium.gain, frame.mediumLayer);
    this.glide(this.fast.gain, frame.fastLayer);
    this.glide(this.body.gain, frame.body * BODY_LEVEL);
    this.glide(this.lowpass.frequency, frame.lowpassHz);
    this.glide(this.master.gain, frame.gain * OUTPUT_LEVEL);
    this.glide(this.panner.pan, frame.pan);

    // Resampling stands in for the pitch shift; the body stays put so pressure keeps the same weight at every speed.
    const rate = Math.pow(2, frame.pitchSemitones / 12);
    for (const source of this.textures) this.glide(source.playbackRate, rate);
  }

  private addLayer(samples: Float32Array, destination: AudioNode, pitched: boolean) {
    const buffer = this.ctx.createBuffer(1, samples.length, this.ctx.sampleRate);
    buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    source.connect(gain).connect(destination);
    source.start();

    if (pitched) this.textures.push(source);
    return gain;
  }

  private glide(param: AudioParam, value: number) {
    param.setTargetAtTime(value, this.ctx.currentTime, SMOOTHING_SECONDS);
  }
}
