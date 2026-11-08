import '@fontsource-variable/syne';
import '@fontsource-variable/ibm-plex-sans';
import './styles.css';

import { FixedStepRunner } from './core/fixedStep';
import { FLIGHT, createFlightState, stepFlight, type FlightState } from './flight/flightModel';
import {
  KeyboardInputSource,
  ScriptedInputSource,
  demoInput,
  type GameAction,
  type InputSource,
} from './flight/input';
import {
  createRunRules,
  updateRunRules,
  type FailureReason,
  type RunRulesState,
} from './game/runRules';
import type { Group } from 'three';
import { loadBest, submitBest } from './game/storage';
import { FlightAudio } from './audio/synth';
import { AircraftLibrary, BUILT_IN_AIRCRAFT_ID } from './model/aircraftLibrary';
import { disposeObject3D } from './model/glb';
import { GameRenderer, WebGL2UnavailableError, type RenderStats } from './render/GameRenderer';
import { GameUI, type ModelListItem } from './ui/GameUI';
import { ChunkedWorldAdapter, type WorldAdapterStats } from './world/chunkedWorldAdapter';
import { generateSakuraMegacity } from './world/proceduralCity';
import type { SurfaceQuery, WorldStats } from './world/worldTypes';

type GameMode = 'title' | 'running' | 'paused' | 'failed';

interface DebugSnapshot {
  ready: boolean;
  mode: GameMode;
  runTime: number;
  best: number;
  speed: number;
  altitude: number;
  position: { x: number; y: number; z: number };
  surfaceDistance: number | null;
  surfaceLocked: boolean;
  grace: number;
  failureReason: FailureReason;
  world: WorldStats;
  adapter: WorldAdapterStats | null;
  render: RenderStats;
  seed: number;
  debugInput: boolean;
  selectedAircraft: string;
  localModelCount: number;
}

interface SkimmerDebugBridge {
  readonly version: string;
  snapshot(): DebugSnapshot;
  start(): void;
  retry(): void;
  title(): void;
  setPose(position: { x: number; y: number; z: number }): DebugSnapshot;
  advance(seconds: number): DebugSnapshot;
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
const SURFACE_QUERY_RANGE = 90;
const builtInModel: ModelListItem = {
  id: BUILT_IN_AIRCRAFT_ID,
  name: 'KITE-07',
  meta: '程序化 · 8 m · 内置',
  tag: 'BUILT-IN',
};

let mode: GameMode = 'title';
let modeBeforeLibrary: GameMode = 'title';
let flightState: FlightState | null = null;
let runRules: RunRulesState = createRunRules();
let lastSurfaceHit: SurfaceQuery | null = null;
let worldAdapter: ChunkedWorldAdapter | null = null;
let lastFrameTime = performance.now();
let muted = false;
let qualityName: 'balanced' | 'high' = 'balanced';
let best = loadBest();
let renderer: GameRenderer | null = null;
let currentImportedAircraft: Group | null = null;
let modelLoadVersion = 0;

const stepRunner = new FixedStepRunner(FLIGHT.fixedDt, 12);
const audio = new FlightAudio();
const aircraftLibrary = new AircraftLibrary();
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
    audio.setMuted(muted);
    return muted;
  },
  onQualityChange: () => {
    qualityName = qualityName === 'balanced' ? 'high' : 'balanced';
    renderer?.setQuality(qualityName);
    return qualityName === 'balanced' ? '平衡' : '高';
  },
  onImportModel: (file) => {
    void importAircraft(file);
  },
  onSelectModel: (id) => {
    void selectAircraft(id);
  },
  onRemoveModel: () => {
    void removeSelectedAircraft();
  },
  onRotateModel: () => {
    void rotateSelectedAircraft();
  },
});

ui.setBest(best);
ui.setModels([builtInModel], builtInModel.id);

const refreshModelOptions = (): void => {
  ui.setModels(aircraftLibrary.options(), aircraftLibrary.getSelectedId());
};

const applyAircraft = (root: Group | null): void => {
  const previous = currentImportedAircraft;
  currentImportedAircraft = root;
  renderer?.setAircraftModel(root);
  if (previous) disposeObject3D(previous);
};

const selectAircraft = async (id: string): Promise<void> => {
  if (!renderer) return;
  const previousSelection = aircraftLibrary.getSelectedId();
  const version = ++modelLoadVersion;
  ui.setModelBusy(true, '正在载入本机机型…');
  try {
    aircraftLibrary.select(id);
    const loaded = await aircraftLibrary.load(id);
    if (version !== modelLoadVersion) {
      if (loaded) disposeObject3D(loaded.root);
      return;
    }
    applyAircraft(loaded?.root ?? null);
    refreshModelOptions();
    const selected = aircraftLibrary.options().find((option) => option.id === id);
    ui.showToast(`已切换机型：${selected?.name ?? id}`);
  } catch (error) {
    if (version === modelLoadVersion) {
      aircraftLibrary.select(previousSelection);
      refreshModelOptions();
      const message = error instanceof Error ? error.message : String(error);
      ui.showToast(`机型载入失败：${message}`, true, 5200);
    }
  } finally {
    if (version === modelLoadVersion) ui.setModelBusy(false);
  }
};

const importAircraft = async (file: File): Promise<void> => {
  ui.setModelBusy(true, '正在验证并保存本机 GLB…');
  try {
    await aircraftLibrary.importFile(file);
    refreshModelOptions();
    await selectAircraft(aircraftLibrary.getSelectedId());
    ui.showToast(`已导入 ${file.name}。模型仅保存在此浏览器。`);
  } catch (error) {
    ui.setModelBusy(false);
    const message = error instanceof Error ? error.message : String(error);
    ui.showToast(`导入失败：${message}`, true, 6000);
  }
};

const removeSelectedAircraft = async (): Promise<void> => {
  const id = aircraftLibrary.getSelectedId();
  if (id === BUILT_IN_AIRCRAFT_ID) return;
  try {
    await aircraftLibrary.remove(id);
    refreshModelOptions();
    await selectAircraft(BUILT_IN_AIRCRAFT_ID);
    ui.showToast('已从本机机库移除模型。');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ui.showToast(`移除失败：${message}`, true, 5200);
  }
};

const rotateSelectedAircraft = async (): Promise<void> => {
  const id = aircraftLibrary.getSelectedId();
  if (id === BUILT_IN_AIRCRAFT_ID) return;
  try {
    await aircraftLibrary.rotate(id);
    await selectAircraft(id);
    ui.showToast('已旋转模型 180°。');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ui.showToast(`旋转失败：${message}`, true, 5200);
  }
};
const syncHud = (): void => {
  if (!flightState) return;
  ui.updateFlight({
    runTime: runRules.elapsed,
    best,
    speed: flightState.speed,
    altitude: flightState.position.y,
    boosting: flightState.boosting,
  });
  ui.updateSurface({
    distance: lastSurfaceHit?.distance ?? null,
    grace: runRules.grace,
    locked: runRules.locked,
  });
};

const simulateFixedStep = (dt: number): boolean => {
  if (mode !== 'running' || !flightState || !worldAdapter) return false;
  flightState = stepFlight(flightState, inputSource.sample(flightState.elapsed), dt);
  lastSurfaceHit = worldAdapter.queryNearest(flightState.position, SURFACE_QUERY_RANGE);
  runRules = updateRunRules(runRules, { distance: lastSurfaceHit?.distance ?? null }, dt);
  return runRules.status === 'running';
};

const finishRun = (): void => {
  if (!flightState || runRules.status !== 'failed' || mode === 'failed') return;
  mode = 'failed';
  keyboard.setEnabled(false);
  stepRunner.reset();
  audio.fail();
  const score = submitBest(runRules.elapsed);
  best = score.best;
  ui.setBest(best);

  const graceFailure = runRules.failureReason === 'grace-expired';
  ui.showFailure({
    title: graceFailure ? '天际线甩掉了你' : '撞上天际线',
    reason: graceFailure
      ? '你连续 5 秒离开了所有有效表面。回到建筑、屋脊、桥面、地面或悬浮岛附近。'
      : '你触碰了建筑或场景表面。贴近飞行，但别把机翼送进去。',
    runTime: runRules.elapsed,
    best,
    isNewBest: score.isNewBest,
  });
};

const resetFlightState = (): void => {
  if (!renderer) return;
  const spawn = renderer.getWorldSpawn();
  flightState = createFlightState({
    position: { ...spawn.position },
    yaw: spawn.yaw,
    pitch: spawn.pitch,
    speed: spawn.speed,
  });
  runRules = createRunRules();
  lastSurfaceHit = worldAdapter?.queryNearest(flightState.position, SURFACE_QUERY_RANGE) ?? null;
  stepRunner.reset();
};

const startRun = (): void => {
  if (!renderer) return;
  closeLibrary(false);
  resetFlightState();
  lastFrameTime = performance.now();
  mode = 'running';
  keyboard.setEnabled(!debugInputEnabled);
  audio.start();
  audio.setMuted(muted);
  ui.showFlight();
  syncHud();
  if (flightState) renderer.snapCamera(flightState);
};

const returnToTitle = (): void => {
  closeLibrary(false);
  mode = 'title';
  keyboard.setEnabled(false);
  audio.stop();
  resetFlightState();
  ui.showTitle();
  ui.setBest(best);
};

const openLibrary = (): void => {
  if (ui.isLibraryOpen()) return;
  modeBeforeLibrary = mode;
  if (mode === 'running') {
    mode = 'paused';
    keyboard.setEnabled(false);
    stepRunner.reset();
    audio.pause();
  }
  ui.openLibrary();
  refreshModelOptions();
};

const closeLibrary = (resume = true): void => {
  if (!ui.isLibraryOpen()) return;
  ui.closeLibrary();
  if (resume && mode === 'paused' && modeBeforeLibrary === 'running') {
    mode = 'running';
    stepRunner.reset();
    lastFrameTime = performance.now();
    keyboard.setEnabled(!debugInputEnabled);
    audio.resume();
  }
};

const debugSnapshot = (): DebugSnapshot => {
  if (!renderer || !flightState) {
    throw new Error('Game is not ready.');
  }
  return {
    ready: true,
    mode,
    runTime: runRules.elapsed,
    best,
    speed: flightState.speed,
    altitude: flightState.position.y,
    position: { ...flightState.position },
    surfaceDistance: lastSurfaceHit?.distance ?? null,
    surfaceLocked: runRules.locked,
    grace: runRules.grace,
    failureReason: runRules.failureReason,
    world: renderer.getWorldStats(),
    adapter: worldAdapter?.getStats() ?? null,
    render: renderer.getStats(),
    seed,
    debugInput: debugInputEnabled,
    selectedAircraft: aircraftLibrary.getSelectedId(),
    localModelCount: Math.max(0, aircraftLibrary.options().length - 1),
  };
};

const debugAdvance = (seconds: number): DebugSnapshot => {
  if (!flightState || mode !== 'running') return debugSnapshot();
  const steps = Math.min(7200, Math.max(0, Math.floor(seconds / FLIGHT.fixedDt)));
  for (let index = 0; index < steps; index += 1) {
    if (!simulateFixedStep(FLIGHT.fixedDt)) break;
  }
  syncHud();
  if (runRules.status === 'failed') finishRun();
  lastFrameTime = performance.now();
  return debugSnapshot();
};

const debugSetPose = (position: { x: number; y: number; z: number }): DebugSnapshot => {
  if (!flightState) return debugSnapshot();
  flightState = {
    ...flightState,
    position: { x: position.x, y: position.y, z: position.z },
  };
  lastSurfaceHit = worldAdapter?.queryNearest(flightState.position, SURFACE_QUERY_RANGE) ?? null;
  syncHud();
  return debugSnapshot();
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
    stepRunner.advance(delta, simulateFixedStep);
    syncHud();
    if (runRules.status === 'failed') finishRun();
    if (flightState) audio.update(flightState.speed, flightState.boosting);
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
  ui.setLoadingCopy('正在建立表面空间索引');
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  worldAdapter = new ChunkedWorldAdapter(world.chunks);

  ui.setLoadingCopy('正在编译近距飞行场景');
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  renderer = new GameRenderer(canvas, world);
  ui.setLoadingCopy('正在载入本机机库');
  try {
    const options = await aircraftLibrary.initialize();
    ui.setModels(options, aircraftLibrary.getSelectedId());
    const selected = aircraftLibrary.getSelectedId();
    const loaded = await aircraftLibrary.load(selected);
    applyAircraft(loaded?.root ?? null);
  } catch (error) {
    aircraftLibrary.select(BUILT_IN_AIRCRAFT_ID);
    ui.setModels([builtInModel], BUILT_IN_AIRCRAFT_ID);
    const message = error instanceof Error ? error.message : String(error);
    setTimeout(() => ui.showToast(`本机模型库不可用，已使用内置机型：${message}`, true, 6200), 0);
  }
  resetFlightState();
  ui.finishLoading();
  ui.showTitle();
  renderer.renderTitle(performance.now());
  requestAnimationFrame(frame);

  window.__SKIMMER_SCRAPER__ = {
    version: '0.1.0',
    snapshot: debugSnapshot,
    start: startRun,
    retry: startRun,
    title: returnToTitle,
    setPose: debugSetPose,
    advance: debugAdvance,
  };

  if (autoStart || debugInputEnabled) startRun();
};

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    lastFrameTime = performance.now();
    stepRunner.reset();
  }
});

window.addEventListener('skimmer:webgl-context-lost', () => {
  ui.showFatal('WebGL2 上下文已丢失。请重新载入页面。');
});

window.addEventListener('beforeunload', () => {
  audio.dispose();
  if (currentImportedAircraft) disposeObject3D(currentImportedAircraft);
  aircraftLibrary.dispose();
  worldAdapter?.dispose();
  renderer?.dispose();
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



