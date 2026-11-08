import '@fontsource-variable/syne';
import '@fontsource-variable/ibm-plex-sans';
import './styles.css';

import type { CameraMode, VisualStimulation } from './config/experience';
import { EXPERIENCE_CONFIG } from './config/experience';
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
import { loadPreferences, savePreferences, type GamePreferences } from './game/preferences';
import { createProximityFeedback, updateProximityFeedback, type ProximityFeedbackState } from './game/proximityFeedback';
import { loadBest, scoreContextFor, submitBest } from './game/storage';
import { FlightAudio } from './audio/synth';
import { AircraftLibrary, BUILT_IN_AIRCRAFT_ID } from './model/aircraftLibrary';
import { disposeObject3D } from './model/glb';
import { GameRenderer, WebGL2UnavailableError, type RenderStats } from './render/GameRenderer';
import { GameUI, type ModelListItem } from './ui/GameUI';
import type { WorldAdapterStats } from './world/chunkedWorldAdapter';
import {
  DEFAULT_REVISION_HISTORY_SIZE,
  ChunkRevisionHistory,
  type ChunkRevisionSnapshot,
} from './world/chunkRevisionHistory';
import { WorldStreamer, type StreamerStats, type StreamerUpdate } from './world/worldStreamer';
import type { WorldMode, WorldPresetId } from './world/worldConfig';
import { buildWorldShareUrl, DEFAULT_WORLD_SEED, resolveWorldSettings, worldSettingsFromSearch } from './world/worldConfig';
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
  cameraMode: CameraMode;
  cameraBlend: number;
  fov: number;
  proximity: number;
  proximityZone: string;
  visualStimulation: VisualStimulation;
  recordingHintVisible: boolean;
  worldPreset: WorldPresetId;
  worldMode: WorldMode;
  generatorVersion: number;
  worldFingerprint: number;
  streaming: StreamerStats | null;
  buffering: boolean;
  renderOrigin: { x: number; y: number; z: number };
  revisionHistory: ChunkRevisionSnapshot | null;
  chunkStates: Array<{
    key: string;
    state: string;
    revision: number;
    fingerprint: number | null;
  }>;
}

interface SkimmerDebugBridge {
  readonly version: string;
  toggleCamera(): CameraMode;
  setCameraMode(mode: CameraMode): CameraMode;
  snapshot(): DebugSnapshot;
  start(): void;
  retry(): void;
  title(): void;
  setPose(
    position: { x: number; y: number; z: number },
    options?: { pitch?: number },
  ): Promise<DebugSnapshot>;
  advance(
    seconds: number,
    options?: { holdPosition?: boolean },
  ): Promise<DebugSnapshot>;
}

declare global {
  interface Window {
    __SKIMMER_SCRAPER__?: SkimmerDebugBridge;
  }
}

const params = new URLSearchParams(window.location.search);
const debugInputEnabled = params.has('debug');
const autoStart = params.get('autostart') === '1';
const worldSettings = worldSettingsFromSearch(window.location.search);
const seed = worldSettings.seed;
const revisionHistory = worldSettings.mode === 'ephemeral'
  ? new ChunkRevisionHistory(DEFAULT_REVISION_HISTORY_SIZE)
  : null;
const SURFACE_QUERY_RANGE = 90;
const builtInModel: ModelListItem = {
  id: BUILT_IN_AIRCRAFT_ID,
  name: 'KITE-07',
  meta: '程序化 · 8 m · 内置',
  tag: 'BUILT-IN',
};

let mode: GameMode = 'title';
let modeBeforeLibrary: GameMode = 'title';
let modeBeforeWorld: GameMode = 'title';
let flightState: FlightState | null = null;
let runRules: RunRulesState = createRunRules();
let lastSurfaceHit: SurfaceQuery | null = null;
let worldStreamer: WorldStreamer | null = null;
let buffering = false;
let worldTransition = 0;
let streamPreparationCount = 0;
let lastFrameTime = performance.now();
let muted = false;
let qualityName: 'balanced' | 'high' = 'balanced';
let best = loadBest(scoreContextFor(worldSettings));
let preferences: GamePreferences = loadPreferences();
let proximityFeedback: ProximityFeedbackState = createProximityFeedback();
let renderer: GameRenderer | null = null;
let currentImportedAircraft: Group | null = null;
let modelLoadVersion = 0;

const stepRunner = new FixedStepRunner(FLIGHT.fixedDt, 12);
const visualScaleFor = (level: VisualStimulation): number => level === 'reduced'
  ? EXPERIENCE_CONFIG.visuals.reducedScale
  : EXPERIENCE_CONFIG.visuals.standardScale;

const delay = (milliseconds: number): Promise<void> => new Promise((resolve) => {
  setTimeout(resolve, milliseconds);
});

const syncWorldStreaming = (
  state: Pick<FlightState, 'position' | 'velocity'>,
): StreamerUpdate | null => {
  if (!worldStreamer) return null;
  const update = worldStreamer.update(state.position, state.velocity);
  if (update.rebaseDelta) renderer?.shiftRenderOrigin(update.rebaseDelta);
  return update;
};

const toRenderFlightState = (state: FlightState): FlightState => {
  if (!worldStreamer) return state;
  return {
    ...state,
    position: worldStreamer.getLocalPosition(state.position),
  };
};

const waitForCollisionCoverage = async (
  position: { x: number; y: number; z: number },
  velocity: { x: number; y: number; z: number },
  timeoutMs = 30_000,
  shouldContinue: () => boolean = () => true,
): Promise<boolean> => {
  if (!worldStreamer) return false;
  const started = performance.now();
  streamPreparationCount += 1;
  try {
    while (shouldContinue() && performance.now() - started <= timeoutMs) {
      const update = syncWorldStreaming({ position, velocity });
      if (update?.coverageComplete) {
        buffering = false;
        return true;
      }
      buffering = true;
      await delay(8);
    }
    buffering = true;
    return false;
  } finally {
    streamPreparationCount = Math.max(0, streamPreparationCount - 1);
  }
};
const audio = new FlightAudio();
const aircraftLibrary = new AircraftLibrary();
const keyboard = new KeyboardInputSource();
keyboard.setEnabled(false);
const scripted = new ScriptedInputSource(demoInput);
const inputSource: InputSource = debugInputEnabled ? scripted : keyboard;

const ui: GameUI = new GameUI({
  onStart: () => { void startRun(); },
  onRetry: () => { void startRun(); },
  onMenu: () => { void returnToTitle(); },
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
  onCameraToggle: () => toggleCameraMode(),
  onVisualStimulationToggle: () => toggleVisualStimulation(),
  onRecordingHintDismiss: () => dismissRecordingHint(),
  onWorldOpen: () => openWorldPanel(),
  onWorldClose: () => closeWorldPanel(),
  onWorldApply: (seedValue, preset, worldMode) => applyWorldSettings(seedValue, preset, worldMode),
  onWorldRandom: () => createRandomSeed(),
  onWorldCopySeed: (seedValue) => { void copyWorldText(seedValue.trim(), '种子已复制。'); },
  onWorldCopyLink: (seedValue, preset, worldMode) => { void copyWorldLink(seedValue, preset, worldMode); },
  onWorldReset: () => ({ seed: String(DEFAULT_WORLD_SEED), preset: 'sakura', mode: 'stable' }),
});

ui.setBest(best);
ui.setModels([builtInModel], builtInModel.id);
ui.setCameraMode(preferences.cameraMode);
ui.setVisualStimulation(preferences.visualStimulation === 'reduced');
ui.setRecordingHintVisible(!preferences.recordingHintDismissed);
ui.setWorldSettings(worldSettings);

const persistPreferences = (next: Partial<GamePreferences>): void => {
  preferences = { ...preferences, ...next };
  savePreferences(preferences);
};

const applyCameraMode = (mode: CameraMode): CameraMode => {
  persistPreferences({ cameraMode: mode });
  renderer?.setCameraMode(mode);
  ui.setCameraMode(mode);
  return mode;
};

const toggleCameraMode = (): CameraMode => {
  const current = renderer?.getCameraSnapshot().mode ?? preferences.cameraMode;
  return applyCameraMode(current === 'chase' ? 'cockpit' : 'chase');
};

const toggleVisualStimulation = (): boolean => {
  const next: VisualStimulation = preferences.visualStimulation === 'standard' ? 'reduced' : 'standard';
  persistPreferences({ visualStimulation: next });
  renderer?.setVisualStimulation(next);
  ui.setVisualStimulation(next === 'reduced');
  return next === 'reduced';
};

const dismissRecordingHint = (): void => {
  persistPreferences({ recordingHintDismissed: true });
};

const createRandomSeed = (): string => {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(values[0] || 1);
};

const copyWorldText = async (text: string, successMessage: string): Promise<void> => {
  try {
    await navigator.clipboard.writeText(text);
    ui.showToast(successMessage);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    ui.showToast(copied ? successMessage : '复制失败，请手动选择种子文本。', !copied);
  }
};

const applyWorldSettings = (
  seedValue: string,
  preset: WorldPresetId,
  worldMode: WorldMode,
): void => {
  const next = resolveWorldSettings({ seed: seedValue, preset, mode: worldMode });
  window.location.assign(buildWorldShareUrl(window.location.href, next));
};

const copyWorldLink = async (
  seedValue: string,
  preset: WorldPresetId,
  worldMode: WorldMode,
): Promise<void> => {
  const next = resolveWorldSettings({ seed: seedValue, preset, mode: worldMode });
  await copyWorldText(buildWorldShareUrl(window.location.href, next), '分享链接已复制。');
};

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
    proximity: proximityFeedback.intensity,
    zone: proximityFeedback.zone,
    buffering,
  });
};

const simulateFixedStep = (dt: number, holdPosition = false): boolean => {
  if (mode !== 'running' || !flightState || !worldStreamer) return false;
  if (!worldStreamer.isCollisionCovered(flightState.position)) {
    syncWorldStreaming(flightState);
    buffering = true;
    return false;
  }

  let nextState = stepFlight(flightState, inputSource.sample(flightState.elapsed), dt);
  if (holdPosition) {
    nextState = {
      ...nextState,
      position: { ...flightState.position },
      velocity: { x: 0, y: 0, z: 0 },
    };
  }
  if (!worldStreamer.isCollisionCovered(nextState.position)) {
    syncWorldStreaming(nextState);
    buffering = true;
    return false;
  }

  buffering = false;
  flightState = nextState;
  lastSurfaceHit = worldStreamer.queryNearest(flightState.position, SURFACE_QUERY_RANGE);
  runRules = updateRunRules(runRules, { distance: lastSurfaceHit?.distance ?? null }, dt);
  proximityFeedback = updateProximityFeedback(
    proximityFeedback,
    lastSurfaceHit?.distance ?? null,
    dt,
    visualScaleFor(preferences.visualStimulation),
  );
  return runRules.status === 'running';
};

const finishRun = (): void => {
  if (!flightState || runRules.status !== 'failed' || mode === 'failed') return;
  mode = 'failed';
  keyboard.setEnabled(false);
  stepRunner.reset();
  audio.fail();
  const score = submitBest(runRules.elapsed, scoreContextFor(worldSettings));
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
  if (!renderer || !worldStreamer) return;
  const spawn = worldStreamer.getDefaultSpawn();
  flightState = createFlightState({
    position: { ...spawn.position },
    yaw: spawn.yaw,
    pitch: spawn.pitch,
    speed: spawn.speed,
  });
  runRules = createRunRules();
  proximityFeedback = createProximityFeedback();
  buffering = false;
  syncWorldStreaming(flightState);
  lastSurfaceHit = worldStreamer.isCollisionCovered(flightState.position)
    ? worldStreamer.queryNearest(flightState.position, SURFACE_QUERY_RANGE)
    : null;
  stepRunner.reset();
};

const startRun = async (): Promise<void> => {
  if (!renderer || !worldStreamer) return;
  const transition = ++worldTransition;
  closeLibrary(false);
  closeWorldPanel(false);
  mode = 'title';
  keyboard.setEnabled(false);
  stepRunner.reset();
  audio.stop();
  ui.showLoading('正在准备出生点区块');

  const spawn = worldStreamer.getDefaultSpawn();
  const covered = await waitForCollisionCoverage(
    spawn.position,
    { x: 0, y: 0, z: -spawn.speed },
    30_000,
    () => transition === worldTransition,
  );
  if (transition !== worldTransition) return;
  if (!covered || !renderer || !worldStreamer) {
    ui.showFatal('无法准备出生点周围的碰撞区块。请重试；若持续出现，请刷新页面。');
    return;
  }

  resetFlightState();
  if (!flightState) return;
  syncWorldStreaming(flightState);
  lastSurfaceHit = worldStreamer.queryNearest(flightState.position, SURFACE_QUERY_RANGE);
  lastFrameTime = performance.now();
  mode = 'running';
  keyboard.setEnabled(!debugInputEnabled);
  audio.start();
  audio.setMuted(muted);
  ui.finishLoading();
  ui.showFlight();
  syncHud();
  renderer.snapCamera(toRenderFlightState(flightState));
};

const returnToTitle = async (): Promise<void> => {
  const transition = ++worldTransition;
  closeLibrary(false);
  closeWorldPanel(false);
  mode = 'title';
  keyboard.setEnabled(false);
  stepRunner.reset();
  audio.stop();

  if (!renderer || !worldStreamer) {
    ui.showTitle();
    ui.setBest(best);
    return;
  }

  ui.showLoading('正在返回起点');
  const spawn = worldStreamer.getDefaultSpawn();
  const covered = await waitForCollisionCoverage(
    spawn.position,
    { x: 0, y: 0, z: -spawn.speed },
    30_000,
    () => transition === worldTransition,
  );
  if (transition !== worldTransition) return;
  if (!covered) {
    ui.showFatal('无法恢复出生点周围的城市区块。请重新载入页面。');
    return;
  }

  resetFlightState();
  if (flightState) {
    syncWorldStreaming(flightState);
    renderer.snapCamera(toRenderFlightState(flightState));
  }
  ui.finishLoading();
  ui.showTitle();
  ui.setBest(best);
};

const openLibrary = (): void => {
  if (ui.isLibraryOpen()) return;
  if (ui.isWorldOpen()) closeWorldPanel();
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


const openWorldPanel = (): void => {
  if (ui.isWorldOpen()) return;
  if (ui.isLibraryOpen()) closeLibrary();
  modeBeforeWorld = mode;
  if (mode === 'running') {
    mode = 'paused';
    keyboard.setEnabled(false);
    stepRunner.reset();
    audio.pause();
  }
  ui.openWorld();
};

const closeWorldPanel = (resume = true): void => {
  if (!ui.isWorldOpen()) return;
  ui.closeWorld();
  if (resume && mode === 'paused' && modeBeforeWorld === 'running') {
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
    adapter: worldStreamer?.getAdapterStats() ?? null,
    streaming: worldStreamer?.getStreamerStats() ?? null,
    buffering,
    renderOrigin: worldStreamer?.getRenderOrigin() ?? { x: 0, y: 0, z: 0 },
    render: renderer.getStats(),
    seed,
    debugInput: debugInputEnabled,
    selectedAircraft: aircraftLibrary.getSelectedId(),
    localModelCount: Math.max(0, aircraftLibrary.options().length - 1),
    cameraMode: renderer.getCameraSnapshot().mode,
    cameraBlend: renderer.getCameraSnapshot().blend,
    fov: renderer.getCameraSnapshot().fov,
    proximity: proximityFeedback.intensity,
    proximityZone: proximityFeedback.zone,
    visualStimulation: preferences.visualStimulation,
    recordingHintVisible: !preferences.recordingHintDismissed,
    worldPreset: worldSettings.preset,
    worldMode: worldSettings.mode,
    generatorVersion: worldSettings.generatorVersion,
    worldFingerprint: renderer.getWorldFingerprint(),
    revisionHistory: revisionHistory?.snapshot() ?? null,
    chunkStates: worldStreamer?.getChunkStates() ?? [],
  };
};

const debugAdvance = async (
  seconds: number,
  options: { holdPosition?: boolean } = {},
): Promise<DebugSnapshot> => {
  if (!flightState || mode !== 'running' || !worldStreamer) return debugSnapshot();
  const targetSteps = Math.min(7200, Math.max(0, Math.floor(seconds / FLIGHT.fixedDt)));
  let simulatedSteps = 0;
  while (simulatedSteps < targetSteps && mode === 'running') {
    if (simulatedSteps % 120 === 0) {
      const covered = await waitForCollisionCoverage(flightState.position, flightState.velocity);
      if (!covered || mode !== 'running') break;
    }
    if (!simulateFixedStep(FLIGHT.fixedDt, options.holdPosition === true)) {
      if (mode !== 'running' || runRules.status === 'failed') break;
      const covered = await waitForCollisionCoverage(flightState.position, flightState.velocity);
      if (!covered || mode !== 'running') break;
      continue;
    }
    simulatedSteps += 1;
  }
  if (flightState) {
    syncWorldStreaming(flightState);
    renderer?.snapCamera(toRenderFlightState(flightState));
  }
  syncHud();
  if (runRules.status === 'failed') finishRun();
  lastFrameTime = performance.now();
  return debugSnapshot();
};

const debugSetPose = async (
  position: { x: number; y: number; z: number },
  options: { pitch?: number } = {},
): Promise<DebugSnapshot> => {
  if (!flightState || !worldStreamer) return debugSnapshot();
  const covered = await waitForCollisionCoverage(position, flightState.velocity);
  flightState = {
    ...flightState,
    position: { x: position.x, y: position.y, z: position.z },
    attitude: {
      ...flightState.attitude,
      pitch: options.pitch ?? flightState.attitude.pitch,
    },
  };
  buffering = !covered;
  syncWorldStreaming(flightState);
  lastSurfaceHit = covered
    ? worldStreamer.queryNearest(flightState.position, SURFACE_QUERY_RANGE)
    : null;
  proximityFeedback = updateProximityFeedback(proximityFeedback, lastSurfaceHit?.distance ?? null, 1, visualScaleFor(preferences.visualStimulation));
  renderer?.snapCamera(toRenderFlightState(flightState));
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
  if (action === 'camera' && mode !== 'title') toggleCameraMode();
  if (action === 'start' && mode === 'title') void startRun();
  if (action === 'retry' && mode !== 'title') void startRun();
});

const frame = (now: number): void => {
  const delta = Math.min(0.1, Math.max(0, (now - lastFrameTime) / 1000));
  lastFrameTime = now;

  if (renderer && flightState && worldStreamer) {
    const streaming = streamPreparationCount === 0 ? syncWorldStreaming(flightState) : null;
    if (mode === 'running') {
      if (streamPreparationCount > 0 || !streaming?.coverageComplete) {
        buffering = true;
        stepRunner.reset();
      } else {
        buffering = false;
        stepRunner.advance(delta, simulateFixedStep);
        if (flightState) syncWorldStreaming(flightState);
      }
      syncHud();
      if (runRules.status === 'failed') finishRun();
      audio.update(flightState.speed, flightState.boosting, proximityFeedback.intensity);
      renderer.renderFlight(
        toRenderFlightState(flightState),
        delta,
        now,
        proximityFeedback.intensity,
      );
    } else if (mode === 'title') {
      renderer.renderTitle(now);
    } else {
      renderer.renderFlight(toRenderFlightState(flightState), 0, now);
    }
  } else if (renderer && mode === 'title') {
    renderer.renderTitle(now);
  }

  requestAnimationFrame(frame);
};

const boot = async (): Promise<void> => {
  ui.setLoadingCopy('正在构筑空中城区');
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

  const canvas = document.getElementById('game-canvas');
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing game canvas.');

  const streamer = new WorldStreamer(worldSettings, {
    renderRadius: 2,
    collisionRadius: 1,
    maxLoadedChunks: 41,
    revisionProvider: revisionHistory
      ? (chunkX, chunkZ) => revisionHistory.revisionFor(chunkX, chunkZ)
      : undefined,
    onChunkActivated: revisionHistory
      ? ({ chunkX, chunkZ, revision }) => revisionHistory.markActive(chunkX, chunkZ, revision)
      : undefined,
    onChunkRetired: revisionHistory
      ? ({ chunkX, chunkZ, revision }) => revisionHistory.markRetired(chunkX, chunkZ, revision)
      : undefined,
  });
  worldStreamer = streamer;
  ui.setLoadingCopy('正在准备出生点碰撞区块');
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  const spawn = streamer.getDefaultSpawn();
  const covered = await waitForCollisionCoverage(
    spawn.position,
    { x: 0, y: 0, z: -spawn.speed },
  );
  if (!covered) throw new Error('Timed out while preparing the spawn collision ring.');

  ui.setLoadingCopy('正在编译近距飞行场景');
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  renderer = new GameRenderer(canvas, streamer);
  renderer.setCameraMode(preferences.cameraMode, true);
  renderer.setVisualStimulation(preferences.visualStimulation);
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
  if (flightState) syncWorldStreaming(flightState);
  ui.finishLoading();
  ui.showTitle();
  renderer.renderTitle(performance.now());
  requestAnimationFrame(frame);

  window.__SKIMMER_SCRAPER__ = {
    version: '0.2.0',
    toggleCamera: toggleCameraMode,
    setCameraMode: applyCameraMode,
    snapshot: debugSnapshot,
    start: startRun,
    retry: startRun,
    title: returnToTitle,
    setPose: debugSetPose,
    advance: debugAdvance,
  };

  if (autoStart || debugInputEnabled) void startRun();
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
  if (renderer) renderer.dispose();
  else worldStreamer?.dispose();
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
