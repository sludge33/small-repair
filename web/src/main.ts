import { AudioEngine } from './audio/audio';
import { isTouching } from './core/gesture';
import { ModulationMapper } from './core/modulation';
import { DebugOverlay } from './debug-overlay';
import { Haptics } from './haptics';
import { GestureInput } from './input';
import './styles.css';

const surface = document.getElementById('surface')!;
const marker = document.getElementById('marker')!;
const start = document.getElementById('start')!;

function begin() {
  // The tap also unlocks audio and, on Android, vibration: both are refused until the user has tapped the page.
  const audio = new AudioEngine();
  const input = new GestureInput(surface);
  const mapper = new ModulationMapper();
  const haptics = new Haptics();
  const overlay = new DebugOverlay(document.getElementById('overlay')!);
  input.onTouchDown = () => audio.wake();

  let lastTime = performance.now() / 1000;
  let framesThisSecond = 0;
  let rateWindowStart = lastTime;
  let sampleRateHz = 0;

  const frame = () => {
    const time = performance.now() / 1000;
    const deltaTime = time - lastTime;
    lastTime = time;

    const gesture = input.step(time);
    const modulation = mapper.map(gesture, deltaTime);
    audio.apply(modulation);
    haptics.step(modulation, deltaTime);

    framesThisSecond++;
    if (time - rateWindowStart >= 1) {
      sampleRateHz = framesThisSecond / (time - rateWindowStart);
      framesThisSecond = 0;
      rateWindowStart = time;
    }

    marker.hidden = !isTouching(gesture);
    if (!marker.hidden) {
      const { x, y } = input.clientPosition;
      marker.style.transform = `translate(${x}px, ${y}px)`;
    }

    overlay.update(
      gesture,
      modulation,
      {
        sampleRateHz,
        rawPressure: input.rawPressureSignal,
        audioState: audio.state,
        outputPeak: audio.outputPeak(),
        hapticBackend: haptics.backend,
        ticksFired: haptics.ticksFired,
      },
      input.touchCount,
    );

    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

document.getElementById('begin')!.addEventListener('click', () => {
  start.hidden = true;
  begin();
});

surface.addEventListener('contextmenu', (e) => e.preventDefault());

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
