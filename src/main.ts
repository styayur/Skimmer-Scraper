import '@fontsource-variable/syne';
import '@fontsource-variable/ibm-plex-sans';
import './styles.css';

import { FLIGHT, createFlightState, stepFlight, type FlightState } from './flight/flightModel';
import {
  KeyboardInputSource,
  ScriptedInputSource,
  demoInput,
  type GameAction,
  type InputSource,
} from './flight/input';
import { loadBest } from './game/storage';
import { GameRenderer, WebGL2UnavailableError, type RenderStats } from './render/GameRenderer';
import { GameUI, type ModelListItem } from './ui/GameUI';
import { generateSakuraMegacity } from './world/proceduralCity';
import type { WorldStats } from './world/worldTypes';

type GameMode = 'title' | 'running' | 'paused' | 'failed';

interface DebugSnapshot {
  ready: boolean;
  mode: GameMode;
  runTime: number;
  best: number;
  speed: number;
  altitude: number;
  position: { x: number; y: number; z: number };
  world: WorldStats;
  render: RenderStats;
  seed: number;
  debugInput: boolean;
}

interface SkimmerDebugBridge {
  readonly version: string;
  snapshot(): DebugSnapshot;
  start(): void;
  retry(): void;
  title(): void;
}

declare global {
  interface Window {
    __SKIMMER_SCRAPER__?: SkimmerDebugBridge;
  }
}

const params = new URLSearchParams(window.location.search);
const debugInputEnabled = params.has('debug');
const autoStart = params.get('autostart') === '1';
const requestedSeed = Number(params.get('seed'));
const seed = Number.isFinite(requestedSeed) && requestedSeed !== 0 ? requestedSeed : 0x51a7a;
const builtInModel: ModelListItem = {
  id: 'procedural',
  name: 'KITE-07',
  meta: '程序化 · 近距截击机',
  tag: 'BUILT-IN',
};

let mode: GameMode = 'title';
let modeBeforeLibrary: GameMode = 'title';
let flightState: FlightState | null = null;
let accumulator = 0;
let lastFrameTime = performance.now();
let muted = false;
let qualityName: 'balanced' | 'high' = 'balanced';
let best = loadBest();
let renderer: GameRenderer | null = null;

const keyboard = new KeyboardInputSource();
keyboard.setEnabled(false);
const scripted = new ScriptedInputSource(demoInput);
const inputSource: InputSource = debugInputEnabled ? scripted : keyboard;

const ui: GameUI = new GameUI({
  onStart: () => startRun(),
  onRetry: () => startRun(),
  onMenu: () => returnToTitle(),
  onLibraryOpen: () => openLibrary(),
  onLibraryClose: () => closeLibrary(),
  onMuteToggle: () => {
    muted = !muted;
    return muted;
  },
  onQualityChange: () => {
    qualityName = qualityName === 'balanced' ? 'high' : 'balanced';
    renderer?.setQuality(qualityName);
    return qualityName === 'balanced' ? '平衡' : '高';
  },
  onImportModel: () => {
    ui.showToast('GLB 导入将在第 3 阶段接入；当前可使用内置 KITE-07。', false);
  },
  onSelectModel: (id) => {
    if (id === builtInModel.id) ui.selectModel(id);
  },
  onRemoveModel: () => {
    ui.showToast('内置机型不可移除。', true);
  },
});

ui.setBest(best);
ui.setModels([builtInModel], builtInModel.id);

const startRun = (): void => {
  if (!renderer) return;
  closeLibrary(false);
  flightState = createFlightState({
    position: { ...renderer.getWorldSpawn().position },
    yaw: renderer.getWorldSpawn().yaw,
    pitch: renderer.getWorldSpawn().pitch,
    speed: renderer.getWorldSpawn().speed,
  });
  accumulator = 0;
  lastFrameTime = performance.now();
  mode = 'running';
  keyboard.setEnabled(!debugInputEnabled);
  ui.showFlight();
  ui.updateFlight({
    runTime: 0,
    best,
    speed: flightState.speed,
    altitude: flightState.position.y,
    boosting: false,
  });
  ui.updateSurface({ distance: null, grace: 5, locked: true, prototype: true });
  renderer.snapCamera(flightState);
};

const returnToTitle = (): void => {
  closeLibrary(false);
  mode = 'title';
  keyboard.setEnabled(false);
  firstFlightState();
  ui.showTitle();
  ui.setBest(best);
};

const firstFlightState = (): void => {
  if (!renderer) return;
  const spawn = renderer.getWorldSpawn();
  flightState = createFlightState({
    position: { ...spawn.position },
    yaw: spawn.yaw,
    pitch: spawn.pitch,
    speed: spawn.speed,
  });
  accumulator = 0;
};

const openLibrary = (): void => {
  if (ui.isLibraryOpen()) return;
  modeBeforeLibrary = mode;
  if (mode === 'running') {
    mode = 'paused';
    keyboard.setEnabled(false);
  }
  ui.openLibrary();
  ui.setModels([builtInModel], builtInModel.id);
};

const closeLibrary = (resume = true): void => {
  if (!ui.isLibraryOpen()) return;
  ui.closeLibrary();
  if (resume && mode === 'paused' && modeBeforeLibrary === 'running') {
    mode = 'running';
    accumulator = 0;
    lastFrameTime = performance.now();
    keyboard.setEnabled(!debugInputEnabled);
  }
};

keyboard.onAction((action: GameAction) => {
  if (action === 'close') {
    closeLibrary();
    return;
  }
  if (action === 'library') {
    if (ui.isLibraryOpen()) closeLibrary();
    else openLibrary();
    return;
  }
  if (ui.isLibraryOpen()) return;
  if (action === 'start' && mode === 'title') startRun();
  if (action === 'retry' && mode !== 'title') startRun();
});

const frame = (now: number): void => {
  const delta = Math.min(0.1, Math.max(0, (now - lastFrameTime) / 1000));
  lastFrameTime = now;

  if (mode === 'running' && renderer && flightState) {
    accumulator += delta;
    let steps = 0;
    while (accumulator >= FLIGHT.fixedDt && steps < 12) {
      flightState = stepFlight(flightState, inputSource.sample(flightState.elapsed), FLIGHT.fixedDt);
      accumulator -= FLIGHT.fixedDt;
      steps += 1;
    }
    ui.updateFlight({
      runTime: flightState.elapsed,
      best,
      speed: flightState.speed,
      altitude: flightState.position.y,
      boosting: flightState.boosting,
    });
    renderer.renderFlight(flightState, delta, now);
  } else if (renderer && mode === 'title') {
    renderer.renderTitle(now);
  } else if (renderer && flightState) {
    renderer.renderFlight(flightState, mode === 'paused' ? 0 : delta, now);
  }

  requestAnimationFrame(frame);
};

const boot = async (): Promise<void> => {
  ui.setLoadingCopy('正在构筑空中城区');
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

  const canvas = document.getElementById('game-canvas');
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing game canvas.');

  const world = generateSakuraMegacity(seed);
  ui.setLoadingCopy('正在编译近距飞行场景');
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

  renderer = new GameRenderer(canvas, world);
  firstFlightState();
  ui.finishLoading();
  ui.showTitle();
  renderer.renderTitle(performance.now());
  requestAnimationFrame(frame);

  window.__SKIMMER_SCRAPER__ = {
    version: '0.1.0',
    snapshot: () => ({
      ready: renderer !== null,
      mode,
      runTime: flightState?.elapsed ?? 0,
      best,
      speed: flightState?.speed ?? 0,
      altitude: flightState?.position.y ?? 0,
      position: flightState
        ? { ...flightState.position }
        : { ...world.spawn.position },
      world: world.stats,
      render: renderer?.getStats() ?? { calls: 0, triangles: 0, points: 0, lines: 0, fps: 0 },
      seed,
      debugInput: debugInputEnabled,
    }),
    start: () => startRun(),
    retry: () => startRun(),
    title: () => returnToTitle(),
  };

  if (autoStart || debugInputEnabled) startRun();
};

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    lastFrameTime = performance.now();
    accumulator = 0;
  }
});

window.addEventListener('skimmer:webgl-context-lost', () => {
  ui.showFatal('WebGL2 上下文已丢失。请重新载入页面。');
});

boot().catch((error: unknown) => {
  if (error instanceof WebGL2UnavailableError) {
    ui.showFatal(error.message);
  } else {
    const message = error instanceof Error ? error.message : String(error);
    ui.showFatal(`启动失败：${message}`);
    console.error(error);
  }
});

