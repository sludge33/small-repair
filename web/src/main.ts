import { AudioEngine } from './audio/audio';
import { BowlView } from './bowl-view';
import { BowlRepair } from './core/bowl-repair';
import { isTouching } from './core/gesture';
import { ModulationMapper } from './core/modulation';
import { ResolutionGovernor } from './core/resolution-governor';
import { DebugOverlay } from './debug-overlay';
import { Haptics } from './haptics';
import { GhostHand } from './ghost-hand';
import { GestureInput } from './input';
import { LetterDesk } from './letter-desk';
import { ParcelBench } from './parcel-bench';
import { Session } from './session';
import { ToolTray } from './tool-tray';
import { Workbench } from './workbench';
import './styles.css';

/** A long stall, such as a trip to another app, should not count as time spent curing or easing. */
const MAX_DELTA_SECONDS = 0.1;

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
  const repair = new BowlRepair();
  const view = new BowlView(surface, repair);
  const tray = new ToolTray(document.getElementById('tools')!);
  const workbench = new Workbench(surface, input, repair, view, audio, haptics, tray);
  const bench = new ParcelBench(document.getElementById('parcel')!, input, audio, haptics);
  const desk = new LetterDesk(document.getElementById('desk')!);
  const ghost = new GhostHand(document.getElementById('ghost')!);
  const session = new Session(bench, desk, workbench, repair, tray, ghost, audio, haptics, document.getElementById('again')!);
  input.onTouchDown = () => audio.wake();
  const governor = new ResolutionGovernor(view.pixelRatio);

  // Lets the preview walk the whole session with synthetic strokes.
  if (import.meta.env.DEV) Object.assign(window, { smallRepairs: { repair, view, session, bench } });

  let lastTime = performance.now() / 1000;
  let framesThisSecond = 0;
  let rateWindowStart = lastTime;
  let sampleRateHz = 0;
  let drawsThisSecond = 0;
  let drawsPerSecond = 0;

  const frame = () => {
    const time = performance.now() / 1000;
    const deltaTime = Math.min(time - lastTime, MAX_DELTA_SECONDS);
    lastTime = time;

    const gesture = input.step(time);
    const voiced = session.step(gesture, deltaTime);
    mapper.material = session.material;
    const modulation = mapper.map(voiced, deltaTime);
    audio.apply(modulation);
    haptics.step(modulation, deltaTime);
    if (session.bowlOnScreen && view.render(deltaTime)) {
      drawsThisSecond++;
      if (governor.drew(deltaTime)) view.pixelRatio = governor.ratio;
    }

    framesThisSecond++;
    if (time - rateWindowStart >= 1) {
      sampleRateHz = framesThisSecond / (time - rateWindowStart);
      drawsPerSecond = drawsThisSecond / (time - rateWindowStart);
      framesThisSecond = 0;
      drawsThisSecond = 0;
      rateWindowStart = time;
    }

    marker.hidden = !overlay.visible || !isTouching(gesture);
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
        outputPeak: overlay.visible ? audio.outputPeak() : 0,
        hapticBackend: haptics.backend,
        ticksFired: haptics.ticksFired,
        ticksRefused: haptics.refused,
        materialName: mapper.material.name,
        frameMs: performance.now() - time * 1000,
        drawsPerSecond,
        pixelRatio: view.pixelRatio,
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
