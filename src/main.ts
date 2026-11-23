import { ActionRouter } from './ui/ActionRouter';
import { OverlayManager } from './ui/OverlayManager';
import { bindGameTutorial } from './ui/GameTutorial';
import { RadioPanel } from './ui/RadioPanel';
import { bindVoicePanel, showVoiceStatus } from './ui/VoicePanel';
import { VoiceRadio } from './voice/VoiceRadio';
import { radioText } from './ai/radioDialogue';
import '@fontsource-variable/syne';
import '@fontsource-variable/ibm-plex-sans';
import './styles.css';
import { version } from '../package.json';
import { normalizeRules, saveRules, type RuleConfig } from './game/ruleConfig';
import { RunSettingsPanel } from './ui/RunSettings';
import { loadControls, shapeInput } from './flight/controlSettings';
import { GamepadInputSource } from './flight/gamepad';
import { bindControlSettings } from './ui/ControlSettings';
import { flightWouldCollide, resolveShield } from './game/shield';
import { loadCameraAnchor, recommendCameraAnchor, type CameraAnchorSetting, type RecommendedAnchorPreset } from './model/cameraAnchors';
import { bindCameraAnchorSettings } from './ui/CameraAnchorSettings';
import { loadFlightSetup } from './game/flightSetup';
import { distance, type Vec3 } from './core/math';
import { CompanionTeam } from './companions/AgentController';
import { saveCompanions, type CompanionSettings } from './companions/settings';
import { bindCompanionSettings } from './ui/CompanionSettings';
import { updateCompanionHud } from './ui/CompanionHud';
import { SymbiosisRuntime } from './ai/SymbiosisRuntime';
import { bindModelSettings } from './ui/ModelSettings';
import type { Perception } from './ai/contracts';
import { SkyJourney } from './game/skyJourney';
import { planSkyPassage, stepSkyDive, translateWingForSky, type SkyPassage } from './game/skyFlight';
import { journeyWorld } from './world/journeyWorlds';
import { JourneyHud } from './ui/JourneyHud';
import { bindDesktopWindow } from './platform/desktopWindow';

import type { CameraMode, VisualStimulation } from './config/experience';
import { EXPERIENCE_CONFIG } from './config/experience';
import { FixedStepRunner } from './core/fixedStep';
import { FLIGHT, createFlightState, stepFlight, type FlightState } from './flight/flightModel';
import { streamingForecast } from './flight/streamingForecast';
import {
  KeyboardInputSource,
  ScriptedInputSource,
  demoInput,
  type InputSource,
} from './flight/input';
import {
  COLLISION_RADIUS,
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
import { buildWorldShareUrl, DEFAULT_WORLD_SEED, DENSE_GENERATOR_VERSION, GENERATOR_VERSION, resolveWorldSettings, worldSettingsFromSearch } from './world/worldConfig';
import { queryFlightSurface, type SurfaceQuery, type WorldStats } from './world/worldTypes';
import { ImportedWorldAdapter } from './world/imports/importedWorldAdapter';
import type { WorldManifest } from './world/imports/worldManifest';
import { WorldImporter } from './world/imports/worldImporter';
import { WorldResourceManager } from './world/imports/worldResourceManager';
import { WorldImportPanel, type ImportedWorldSource } from './ui/WorldImportPanel';

type GameMode = 'title' | 'running' | 'paused' | 'failed';

interface DebugSnapshot {
  localWorld: { manifest: WorldManifest; spawn: Vec3; collisionVisible: boolean } | null;
  worldReleases: Array<{seed:number;bvhBefore:number;bvhAfter:number;dynamicBvhBefore:number;dynamicBvhAfter:number;rootChildrenAfter:number;disposedGeometryCount:number}>;
  dynamicStructures: ReturnType<WorldStreamer['getDynamicSnapshot']> | ReturnType<ImportedWorldAdapter['getDynamicSnapshot']>;
  journey: ReturnType<SkyJourney['snapshot']> & ReturnType<JourneyHud['snapshot']>;
  cooperation: ReturnType<SymbiosisRuntime['snapshot']>;
  voice: ReturnType<VoiceRadio['snapshot']>;
  attitude: FlightState['attitude'];
  control: FlightState['control'];
  companionSettings: CompanionSettings;
  companions: Array<{ id: number; callsign: string; position: { x: number; y: number; z: number };
    velocity: { x: number; y: number; z: number }; target: { x: number; y: number; z: number }; task: string;
    surfaceDistance: number | null; decisions: number; impacts: number; uncovered: boolean; deployed: boolean }>;
  companionEvents: CompanionTeam['events'];
  shieldImpacts: number;
  inputDevice: string;
  rules: RuleConfig;
  ready: boolean;
  mode: GameMode;
  runTime: number;
  best: number;
  speed: number;
  altitude: number;
  position: { x: number; y: number; z: number };
  velocity: Vec3;
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
  cameraAnchor: Vec3 | null;
  cameraOrientation: ReturnType<GameRenderer['getCameraSnapshot']>['orientation'];
  cameraPosition: Vec3;
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
  skipJourney():void;
  surface(position: Vec3, range?: number, proximityOnly?: boolean): SurfaceQuery | null;
  aiPerception(): Perception | null;
  aiRequest(): Promise<boolean>;
  aiReplay(decision: unknown, perception: Perception): boolean;
  relay(id: number): DebugSnapshot;
  readonly version: string;
  toggleCamera(): CameraMode;
  setCameraMode(mode: CameraMode): CameraMode;
  snapshot(): DebugSnapshot;
  start(): void;
  retry(): void;
  title(): void;
  pause(): boolean;
  resume(): boolean;
  setPose(
    position: { x: number; y: number; z: number },
    options?: { pitch?: number; yaw?: number; roll?: number; preserveCompanions?: boolean },
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
const initialSetup = loadFlightSetup(window.localStorage, false);
let selectedRules = initialSetup.rules;
let companionSettings = initialSetup.companions;
const companions = new CompanionTeam();
const symbiosis = new SymbiosisRuntime(companions);
let controls = loadControls();
const gamepad = new GamepadInputSource();
let shieldGlow = 0;
let shieldImpacts = 0;
let shieldCooldown = 0;
const debugInputEnabled = params.has('debug');
const autoStart = params.get('autostart') === '1';
const baseWorldSettings = worldSettingsFromSearch(window.location.search);
let worldSettings = journeyWorld(baseWorldSettings,0);
let revisionHistory = worldSettings.mode === 'ephemeral'
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
let flightState: FlightState | null = null;
let runRules: RunRulesState = createRunRules(selectedRules);
let lastSurfaceHit: SurfaceQuery | null = null;
let activeWorld: WorldStreamer | ImportedWorldAdapter | null = null;
const journey = new SkyJourney();
let pendingWorldSwap: Promise<void> | null = null;
let skyPassage: SkyPassage | null = null;
let worldReleases:DebugSnapshot['worldReleases']=[];
let buffering = false;
let worldTransition = 0;
let runGeneration = 0;
let streamPreparationCount = 0;
let neededCoverage: Pick<FlightState, 'position' | 'velocity'> | null = null;
let debugAdvancing = false;
let lastFrameTime = performance.now();
let muted = false;
let qualityName: 'balanced' | 'high' = 'balanced';
let best = loadBest(scoreContextFor(worldSettings, selectedRules));
let preferences: GamePreferences = loadPreferences();
let proximityFeedback: ProximityFeedbackState = createProximityFeedback();
let renderer: GameRenderer | null = null;
let currentImportedAircraft: Group | null = null;
let cockpitPreview = false;
let motionPreview = false;
let pendingRadio: { message: string; useModel: boolean; until: number } | null = null;
let modelLoadVersion = 0;

const stepRunner = new FixedStepRunner(FLIGHT.fixedDt, 12);
const visualScaleFor = (level: VisualStimulation): number => level === 'reduced'
  ? EXPERIENCE_CONFIG.visuals.reducedScale
  : EXPERIENCE_CONFIG.visuals.standardScale;

const delay = (milliseconds: number): Promise<void> => new Promise((resolve) => {
  setTimeout(resolve, milliseconds);
});

const syncWorldStreaming = (
  state: FlightState | Pick<FlightState, 'position' | 'velocity'>,
  includeCompanions = true,
): StreamerUpdate | null => {
  if (!(activeWorld instanceof WorldStreamer)) return null;
  activeWorld.setCompanionPositions(includeCompanions
    ? companions.agents.filter(agent => agent.deployed).map(agent => agent.flight.position) : []);
  const forecast = 'attitude' in state ? () => streamingForecast(state, controls) : undefined;
  const update = activeWorld.update(state.position, state.velocity, { forecast, inFlight: mode === 'running' });
  if (update.rebaseDelta) renderer?.shiftRenderOrigin(update.rebaseDelta);
  return update;
};

const toRenderFlightState = (state: FlightState): FlightState => {
  if (!activeWorld) return state;
  return {
    ...state,
    position: activeWorld.getLocalPosition(state.position),
  };
};

const waitForCollisionCoverage = async (
  position: { x: number; y: number; z: number },
  velocity: { x: number; y: number; z: number },
  timeoutMs = 30_000,
  shouldContinue: () => boolean = () => true,
  includeCompanions = true,
): Promise<boolean> => {
  if (!activeWorld) return false;
  const started = performance.now();
  streamPreparationCount += 1;
  try {
    while (shouldContinue() && performance.now() - started <= timeoutMs) {
      const update = syncWorldStreaming({ position, velocity }, includeCompanions);
      if (update?.coverageComplete || activeWorld instanceof ImportedWorldAdapter && activeWorld.isCollisionCovered(position)) {
        buffering = false;
        return true;
      }
      buffering = true;
      syncHud();
      await delay(8);
    }
    buffering = true;
    syncHud();
    return false;
  } finally {
    streamPreparationCount = Math.max(0, streamPreparationCount - 1);
  }
};
const audio = new FlightAudio();
const aircraftLibrary = new AircraftLibrary();
const worldImporter = new WorldImporter();
const worldResources = new WorldResourceManager(window.indexedDB);
const keyboard = new KeyboardInputSource();
keyboard.setEnabled(false);
const scripted = new ScriptedInputSource(demoInput);
const inputSource: InputSource = debugInputEnabled ? scripted : keyboard;

const ui: GameUI = new GameUI({
  onMuteToggle: () => {
    muted = !muted;
    audio.setMuted(muted);
    if (muted) voiceRadio.silence();
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
  onVisualStimulationToggle: () => toggleVisualStimulation(),
  onCameraSelect: (view) => applyCameraMode(view),
  onRecordingHintDismiss: () => dismissRecordingHint(),
  onWorldApply: (seedValue, worldMode, upgrade) => {
    if (upgrade || !worldPanel.useSeed(seedValue)) applyWorldSettings(seedValue, worldMode, upgrade);
  },
  onWorldRandom: () => createRandomSeed(),
  onWorldCopySeed: (seedValue) => { void copyWorldText(worldPanel.activeSeed ?? seedValue.trim(), '种子已复制。'); },
  onWorldReset: () => ({ seed: String(DEFAULT_WORLD_SEED), mode: 'stable' }),
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

const applyCameraMode = (view: CameraMode): CameraMode => {
  persistPreferences({ cameraMode: view });
  if (!cockpitPreview) renderer?.setCameraMode(view, mode !== 'running');
  ui.setCameraMode(view);
  return view;
};

const toggleCameraMode = (): CameraMode => {
  return applyCameraMode(preferences.cameraMode === 'chase' ? 'cockpit' : 'chase');
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
  worldMode: WorldMode,
  upgrade = false,
): void => {
  const next = resolveWorldSettings({
    seed: seedValue, preset: baseWorldSettings.preset, mode: worldMode,
    generatorVersion: upgrade ? GENERATOR_VERSION : baseWorldSettings.generatorVersion,
  });
  worldPanel.clearVisit();
  window.location.assign(buildWorldShareUrl(window.location.href, next));
};

const refreshModelOptions = (): void => {
  ui.setModels(aircraftLibrary.options(), aircraftLibrary.getSelectedId());
};

const recommendAnchor = (preset: RecommendedAnchorPreset): Vec3 => {
  const bounds = renderer?.getAircraftBounds();
  return bounds ? recommendCameraAnchor(bounds, preset) : { x: 0, y: 0.72, z: -2.35 };
};

const currentAnchor = (): CameraAnchorSetting => {
  const saved = loadCameraAnchor(aircraftLibrary.getSelectedId());
  if (saved?.preset === 'custom') return saved;
  const preset = saved?.preset ?? 'standard';
  return { preset, anchor: recommendAnchor(preset) };
};

const previewCockpit = (anchor: Vec3 | null): void => {
  if (!anchor && !cockpitPreview) return;
  const wasPreviewing = cockpitPreview;
  cockpitPreview = anchor !== null;
  document.getElementById('app')?.classList.toggle('is-cockpit-preview', cockpitPreview);
  renderer?.setCameraAnchor(anchor ?? currentAnchor().anchor);
  if (cockpitPreview !== wasPreviewing) renderer?.setCameraMode(cockpitPreview ? 'cockpit' : preferences.cameraMode, true);
};

const applyAircraft = (root: Group | null): void => {
  const previous = currentImportedAircraft;
  currentImportedAircraft = root;
  renderer?.setAircraftModel(root);
  renderer?.setCameraAnchor(currentAnchor().anchor);
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
    graceSeconds: runRules.config.graceSeconds,
    freeFlight: runRules.config.mode === 'free',
    shieldContact: shieldGlow > 0,
    distance: lastSurfaceHit?.distance ?? null,
    grace: runRules.grace,
    locked: runRules.locked,
    proximity: proximityFeedback.intensity,
    zone: proximityFeedback.zone,
    buffering,
  });
};

const runScoreContext = (rules: RuleConfig = runRules.config) => activeWorld instanceof ImportedWorldAdapter
  ? { ...scoreContextFor(activeWorld.settings, rules), worldAsset: `${activeWorld.manifest.id}-${activeWorld.getFingerprint()}` }
  : { ...scoreContextFor(baseWorldSettings, rules), journey: journey.worldIndex > 0 };
const createStreamer = (settings:typeof worldSettings, history = revisionHistory):WorldStreamer => {
  return new WorldStreamer(settings,{renderRadius:2,collisionRadius:1,maxLoadedChunks:41,
    revisionProvider:history?(x,z)=>history.revisionFor(x,z):undefined,
    onChunkActivated:history?({chunkX,chunkZ,revision})=>history.markActive(chunkX,chunkZ,revision):undefined,
    onChunkRetired:history?({chunkX,chunkZ,revision})=>history.markRetired(chunkX,chunkZ,revision):undefined});
};
const releaseActiveWorld = (): void => {
  renderer?.releaseWorld();
  if (!activeWorld) return;
  const before = activeWorld.getAdapterStats().bvhCount;
  const dynamicBvhBefore = activeWorld.getDynamicSnapshot().length;
  activeWorld.dispose();
  const disposedGeometryCount = activeWorld instanceof WorldStreamer
    ? activeWorld.getStreamerStats().disposedGeometryCount : activeWorld.disposedGeometryCount;
  worldReleases.push({ seed: activeWorld.settings.seed, bvhBefore: before, bvhAfter: activeWorld.getAdapterStats().bvhCount,
    dynamicBvhBefore, dynamicBvhAfter: activeWorld.getDynamicSnapshot().length, rootChildrenAfter: activeWorld.root.children.length,
    disposedGeometryCount });
  if (worldReleases.length > 16) worldReleases.shift();
  activeWorld = null;
};

const loadJourneyWorld = async (index:number, token:number): Promise<boolean> => {
  releaseActiveWorld();
  worldSettings=journeyWorld(baseWorldSettings,index);
  revisionHistory=worldSettings.mode==='ephemeral'?new ChunkRevisionHistory(DEFAULT_REVISION_HISTORY_SIZE):null;
  const next=createStreamer(worldSettings);activeWorld=next;
  const spawn = next.getDefaultSpawn();
  renderer?.setWorld(next, index);
  return await waitForCollisionCoverage(spawn.position,{x:0,y:0,z:-spawn.speed},30000,()=>token===worldTransition&&activeWorld===next,false);
};
const restoreJourneyStart = async (token:number):Promise<boolean> => {
  const replace=!(activeWorld instanceof ImportedWorldAdapter) && (journey.worldIndex>0||journey.active||worldSettings.seed!==baseWorldSettings.seed);
  journey.reset();journeyHud.reset();skyPassage = null;renderer?.setInversion(0);
  return !replace||await loadJourneyWorld(0,token);
};
const carryCameraAcross = (from: Vec3, to: Vec3): void => {
  renderer?.shiftRenderOrigin({ x: from.x - to.x, y: from.y - to.y, z: from.z - to.z });
};

const beginSkySwap = (): void => {
  if (!flightState) return;
  const entry = flightState;
  const previousLocal = toRenderFlightState(entry).position;
  const wings = companions.agents.filter(agent => agent.deployed).map(agent => [agent.id, agent.flight] as const);
  const token = ++worldTransition;
  const index = journey.worldIndex + 1;
  const job = (async () => {
    const ready = await loadJourneyWorld(index, token);
    if (token !== worldTransition) return;
    if (!ready || !activeWorld) throw new Error('Unable to prepare new sky');
    const passage = planSkyPassage(entry, activeWorld.getDefaultSpawn(), activeWorld);
    if (!passage) throw new Error('No safe entry and exit corridor');
    skyPassage = passage;
    flightState = { ...entry, position: passage.start };
    carryCameraAcross(previousLocal, toRenderFlightState(flightState).position);
    const transferred = new Map(wings.map(([id, flight]) => [id, translateWingForSky(flight, passage)] as const));
    companions.reset(flightState, activeWorld, transferred);
    journey.worldReady();
    if (passage.adjustedHeading) ui.showToast('已绕开出口障碍并调整航向。', false, 2400);
    best = loadBest(runScoreContext());
    ui.setBest(best);
    lastSurfaceHit = queryFlightSurface(activeWorld, flightState.position, SURFACE_QUERY_RANGE);
    buffering = false;
    neededCoverage = null;
    stepRunner.reset();
    lastFrameTime = performance.now();
  })();
  pendingWorldSwap = job;
  void job.catch(() => {
    if (token === worldTransition) {
      mode = 'title';
      ui.showFatal('新世界准备失败。请刷新页面后重试。');
    }
  }).finally(() => { if (pendingWorldSwap === job) pendingWorldSwap = null; });
};

const simulateJourneyStep = (dt: number): boolean => {
  if (!flightState || !activeWorld || journey.phase === 'WORLD_SWAP') return false;
  const previousPhase = journey.phase;
  const event = journey.step(dt);
  if (event === 'swap') {
    journeyHud.update(journey, true);
    beginSkySwap();
    return true;
  }
  activeWorld.stepMotion(dt);
  if (previousPhase === 'DIVE' && skyPassage) {
    const next = stepSkyDive(flightState, skyPassage, journey.phase === 'DIVE' ? journey.progress : 1, dt);
    if (distance(next.position, flightState.position) > 4) {
      // Skipping the dive can move the ship past the remaining path in one step.
      carryCameraAcross(toRenderFlightState(flightState).position, toRenderFlightState(next).position);
    }
    flightState = next;
  } else {
    const { position, velocity } = flightState;
    flightState = {
      ...flightState,
      position: { x: position.x + velocity.x * dt, y: position.y + velocity.y * dt, z: position.z + velocity.z * dt },
      elapsed: flightState.elapsed + dt,
    };
  }
  companions.step(flightState, activeWorld, dt);
  lastSurfaceHit = queryFlightSurface(activeWorld, flightState.position, SURFACE_QUERY_RANGE);
  if (event === 'completed') {
    skyPassage = null;
    journeyHud.completed(journey.crossings, journey.time);
    symbiosis.flightReport(3, [`穿越完成。已进入第 ${journey.crossings} 层天空。`, `Crossing complete. Entering sky ${journey.crossings}.`]);
    proximityFeedback = createProximityFeedback();
  }
  return true;
};

const simulateFixedStep = (dt: number, holdPosition = false): boolean => {
  if (mode !== 'running' || !flightState || !activeWorld) return false;
  if(journey.active)return simulateJourneyStep(dt);
  if (!activeWorld.isCollisionCovered(flightState.position)) {
    neededCoverage = flightState;
    syncWorldStreaming(flightState);
    buffering = true;
    return false;
  }

  const keys = inputSource.sample(flightState.elapsed);
  const keyboardActive = keys.boost || Math.abs(keys.pitch) + Math.abs(keys.roll) + Math.abs(keys.yaw) > 0;
  const input = debugInputEnabled ? keys : keyboardActive ? shapeInput(keys, controls) : gamepad.sample(controls);
  let nextState = stepFlight(flightState, input, dt, controls);
  if (holdPosition) {
    nextState = {
      ...nextState,
      position: { ...flightState.position },
      velocity: { x: 0, y: 0, z: 0 },
    };
  }
  if (!activeWorld.isCollisionCovered(nextState.position)) {
    neededCoverage = nextState;
    syncWorldStreaming(nextState);
    buffering = true;
    return false;
  }

  buffering = false;
  neededCoverage = null;
  activeWorld.stepMotion(dt);
  shieldCooldown = Math.max(0, shieldCooldown - dt);
  shieldGlow = Math.max(0, shieldGlow - dt * 3);
  if (runRules.config.shield) {
    const contact = resolveShield(flightState, nextState, activeWorld);
    nextState = contact.flight;
    if (contact.impact) {
      shieldGlow = 1;
      if (shieldCooldown === 0) {
        shieldImpacts++; gamepad.impact(); shieldCooldown = 0.2;
        symbiosis.flightReport(2, ['防护罩已吸收撞击。注意避开障碍。', 'Shield absorbed the impact. Clear the obstacle.'], 'risk');
      }
    }
  }
  const collisionDistance = !runRules.config.shield
    && (activeWorld instanceof ImportedWorldAdapter || worldSettings.generatorVersion >= DENSE_GENERATOR_VERSION)
    ? flightWouldCollide(flightState, nextState, activeWorld) ? COLLISION_RADIUS : null : undefined;
  const previousY=flightState.position.y;
  flightState = nextState;
  const previousSurface = lastSurfaceHit;
  lastSurfaceHit = queryFlightSurface(activeWorld, flightState.position, SURFACE_QUERY_RANGE);
  runRules = updateRunRules(runRules, { distance: lastSurfaceHit?.distance ?? null, collisionDistance }, dt);
  if (runRules.status === 'running') {
    companions.step(flightState, activeWorld, dt);
    runRules = symbiosis.step(flightState, runRules, activeWorld, worldSettings.seed, dt);
    if (lastSurfaceHit?.surfaceId.endsWith(':garden') && lastSurfaceHit.distance < 70
      && (previousSurface?.surfaceId !== lastSurfaceHit.surfaceId || previousSurface.distance >= 70)) {
      symbiosis.flightReport(3, ['发现一座浮空花园。留意它的升降轨迹。', 'Floating garden ahead. Watch its vertical motion.']);
    }
  }
  if(activeWorld instanceof WorldStreamer && journey.observe(previousY,flightState,runRules,dt)){
    pendingRadio=null;
    symbiosis.invalidate();companions.clearTargets();
    for(const agent of companions.agents)companions.setTarget(agent.id,flightState.position,'REGROUP',12);
  }
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
  voiceRadio.reset();
  symbiosis.suspend();
  keyboard.setEnabled(false);
  stepRunner.reset();
  audio.fail();
  const score = submitBest(runRules.elapsed, runScoreContext());
  best = score.best;
  ui.setBest(best);

  const graceFailure = runRules.failureReason === 'grace-expired';
  ui.showFailure({
    title: graceFailure ? '天际线甩掉了你' : '撞上天际线',
    reason: graceFailure
      ? `你连续 ${runRules.config.graceSeconds} 秒离开了所有有效表面。回到建筑、屋脊、桥面、地面或悬浮岛附近。`
      : '你触碰了建筑或场景表面。贴近飞行，但别把机翼送进去。',
    runTime: runRules.elapsed,
    best,
    isNewBest: score.isNewBest,
  });
};

const resetFlightState = (): void => {
  if (!renderer || !activeWorld) return;
  motionPreview = false;
  pendingRadio = null;
  activeWorld.resetMotion();
  const spawn = activeWorld.getDefaultSpawn();
  flightState = createFlightState({
    position: { ...spawn.position },
    yaw: spawn.yaw,
    pitch: spawn.pitch,
    speed: spawn.speed,
  });
  runRules = createRunRules({ ...selectedRules, assisted: companionSettings.count > 0 });
  companions.configure(companionSettings); companions.reset(flightState, activeWorld);
  symbiosis.reset();
  journey.reset();journeyHud.reset();renderer.setInversion(0);skyPassage = null;
  best=loadBest(runScoreContext());ui.setBest(best);
  shieldGlow = 0; shieldImpacts = 0; shieldCooldown = 0;
  renderer.setCameraAnchor(currentAnchor().anchor);
  proximityFeedback = createProximityFeedback();
  buffering = false;
  syncWorldStreaming(flightState);
  neededCoverage = null;
  lastSurfaceHit = activeWorld.isCollisionCovered(flightState.position)
    ? queryFlightSurface(activeWorld, flightState.position, SURFACE_QUERY_RANGE)
    : null;
  stepRunner.reset();
};

const startRun = async (): Promise<void> => {
  if (!renderer || !activeWorld) return;
  voiceRadio.reset();
  runGeneration++;
  const transition = ++worldTransition;
  actionRouter.clear();
  mode = 'title';
  symbiosis.suspend();
  keyboard.setEnabled(false);
  stepRunner.reset();
  audio.stop();
  ui.showLoading(activeWorld instanceof ImportedWorldAdapter ? '正在准备本地世界' : '正在准备出生点区块');
  if(!await restoreJourneyStart(transition)||transition!==worldTransition)return;

  const spawn = activeWorld.getDefaultSpawn();
  const covered = await waitForCollisionCoverage(
    spawn.position,
    { x: 0, y: 0, z: -spawn.speed },
    30_000,
    () => transition === worldTransition,
  );
  if (transition !== worldTransition) return;
  if (!covered || !renderer || !activeWorld) {
    ui.showFatal('无法准备出生点周围的碰撞区块。请重试；若持续出现，请刷新页面。');
    return;
  }

  resetFlightState();
  if (!flightState) return;
  syncWorldStreaming(flightState);
  lastSurfaceHit = queryFlightSurface(activeWorld, flightState.position, SURFACE_QUERY_RANGE);
  lastFrameTime = performance.now();
  mode = 'running';
  symbiosis.flightReport(1, ['编队已就位。沿前方航线出发。', 'Formation ready. Continue ahead.']);
  keyboard.setEnabled(!debugInputEnabled);
  audio.start();
  audio.setMuted(muted);
  ui.finishLoading();
  ui.showFlight();
  syncHud();
  renderer.snapCamera(toRenderFlightState(flightState));
};

const debugPause = (): boolean => {
  if (mode !== 'running') return mode === 'paused';
  mode = 'paused';
  if (document.pointerLockElement) document.exitPointerLock();
  voiceRadio.suspend();
  pendingRadio = null;
  symbiosis.suspend();
  keyboard.setEnabled(false);
  stepRunner.reset();
  audio.pause();
  return true;
};

const debugResume = (): boolean => {
  if (mode !== 'paused' || !flightState) return mode === 'running';
  mode = 'running';
  stepRunner.reset();
  lastFrameTime = performance.now();
  keyboard.setEnabled(!debugInputEnabled);
  audio.resume();
  return true;
};

const returnToTitle = async (): Promise<void> => {
  runGeneration++;
  const transition = ++worldTransition;
  actionRouter.clear();
  mode = 'title';
  voiceRadio.reset();
  symbiosis.suspend();
  keyboard.setEnabled(false);
  stepRunner.reset();
  audio.stop();

  if(renderer)ui.showLoading('正在返回起点');
  if(renderer&&activeWorld&&(!await restoreJourneyStart(transition)||transition!==worldTransition))return;

  if (!renderer || !activeWorld) {
    ui.showTitle();
    ui.setBest(best);
    return;
  }

  ui.showLoading('正在返回起点');
  const spawn = activeWorld.getDefaultSpawn();
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

const debugSnapshot = (): DebugSnapshot => {
  if (!renderer || !flightState) {
    throw new Error('Game is not ready.');
  }
  const camera = renderer.getCameraSnapshot();
  return {
    localWorld: activeWorld instanceof ImportedWorldAdapter ? {
      manifest: activeWorld.manifest, spawn: activeWorld.getDefaultSpawn().position, collisionVisible: activeWorld.isCollisionVisible(),
    } : null,
    dynamicStructures: activeWorld?.getDynamicSnapshot() ?? [],
    worldReleases:worldReleases.map(item=>({...item})),
    journey: {...journey.snapshot(),...journeyHud.snapshot()},
    cooperation: symbiosis.snapshot(),
    voice: voiceRadio.snapshot(),
    ready: true,
    attitude: { ...flightState.attitude },
    control: { ...flightState.control },
    rules: { ...runRules.config },
    companionSettings: { ...companionSettings },
    companions: companions.agents.map(agent => ({ id: agent.id, callsign: agent.callsign,
      position: { ...agent.flight.position }, velocity: { ...agent.flight.velocity }, target: { ...agent.target },
      task: agent.task, surfaceDistance: agent.surfaceDistance, decisions: agent.decisions, impacts: agent.impacts, uncovered: agent.uncovered, deployed: agent.deployed })),
    companionEvents: companions.events.slice(-32).map(event => ({ ...event })),
    shieldImpacts,
    inputDevice: gamepad.device,
    mode,
    runTime: runRules.elapsed,
    best,
    speed: flightState.speed,
    altitude: flightState.position.y,
    position: { ...flightState.position },
    velocity: { ...flightState.velocity },
    surfaceDistance: lastSurfaceHit?.distance ?? null,
    surfaceLocked: runRules.locked,
    grace: runRules.grace,
    failureReason: runRules.failureReason,
    world: renderer.getWorldStats(),
    adapter: activeWorld?.getAdapterStats() ?? null,
    streaming: activeWorld instanceof WorldStreamer ? activeWorld.getStreamerStats() : null,
    buffering,
    renderOrigin: activeWorld?.getRenderOrigin() ?? { x: 0, y: 0, z: 0 },
    render: renderer.getStats(),
    seed:worldSettings.seed,
    debugInput: debugInputEnabled,
    selectedAircraft: aircraftLibrary.getSelectedId(),
    localModelCount: Math.max(0, aircraftLibrary.options().length - 1),
    cameraMode: camera.mode,
    cameraBlend: camera.blend,
    cameraAnchor: camera.anchor,
    cameraOrientation: camera.orientation,
    cameraPosition: camera.position,
    fov: camera.fov,
    proximity: proximityFeedback.intensity,
    proximityZone: proximityFeedback.zone,
    visualStimulation: preferences.visualStimulation,
    recordingHintVisible: !preferences.recordingHintDismissed,
    worldPreset: worldSettings.preset,
    worldMode: worldSettings.mode,
    generatorVersion: worldSettings.generatorVersion,
    worldFingerprint: renderer.getWorldFingerprint(),
    revisionHistory: revisionHistory?.snapshot() ?? null,
    chunkStates: activeWorld instanceof WorldStreamer ? activeWorld.getChunkStates() : [],
  };
};

const debugAdvance = async (
  seconds: number,
  options: { holdPosition?: boolean } = {},
): Promise<DebugSnapshot> => {
  if (!flightState || mode !== 'running' || !activeWorld) return debugSnapshot();
  if (debugAdvancing) return debugSnapshot();
  debugAdvancing = true;
  const generation=runGeneration;
  try {
    const targetSteps = Math.min(7200, Math.max(0, Math.floor(seconds / FLIGHT.fixedDt)));
    let simulatedSteps = 0;
    while (simulatedSteps < targetSteps && mode === 'running' && generation===runGeneration) {
      if(pendingWorldSwap){await pendingWorldSwap;await delay(0);continue;}
      if (simulatedSteps % 120 === 0) {
        const covered = await waitForCollisionCoverage(flightState.position, flightState.velocity);
        if (!covered || mode !== 'running') break;
        await delay(0);
      }
      if (!simulateFixedStep(FLIGHT.fixedDt, options.holdPosition === true)) {
        if (mode !== 'running' || runRules.status === 'failed') break;
        const target = neededCoverage ?? flightState;
        const covered = await waitForCollisionCoverage(target.position, target.velocity);
        if (!covered || mode !== 'running') break;
        await delay(0);
        continue;
      }
      simulatedSteps += 1;
    }
    if (flightState) {
      syncWorldStreaming(flightState);
      if (!journey.active) renderer?.snapCamera(toRenderFlightState(flightState));
    }
    syncHud();
    if (runRules.status === 'failed') finishRun();
    lastFrameTime = performance.now();
    return debugSnapshot();
  } finally {
    debugAdvancing = false;
    stepRunner.reset(); lastFrameTime = performance.now();
  }
};

const debugSetPose = async (
  position: { x: number; y: number; z: number },
  options: { pitch?: number; yaw?: number; roll?: number; preserveCompanions?: boolean } = {},
): Promise<DebugSnapshot> => {
  if (!flightState || !activeWorld) return debugSnapshot();
  const covered = await waitForCollisionCoverage(position, flightState.velocity);
  if (!options.preserveCompanions) companions.relocate({ x: position.x - flightState.position.x, y: position.y - flightState.position.y, z: position.z - flightState.position.z });
  flightState = {
    ...flightState,
    position: { x: position.x, y: position.y, z: position.z },
    attitude: {
      ...flightState.attitude,
      pitch: options.pitch ?? flightState.attitude.pitch,
      yaw: options.yaw ?? flightState.attitude.yaw,
      roll: options.roll ?? flightState.attitude.roll,
    },
  };
  buffering = !covered;
  syncWorldStreaming(flightState);
  lastSurfaceHit = covered
    ? queryFlightSurface(activeWorld, flightState.position, SURFACE_QUERY_RANGE)
    : null;
  proximityFeedback = updateProximityFeedback(proximityFeedback, lastSurfaceHit?.distance ?? null, 1, visualScaleFor(preferences.visualStimulation));
  renderer?.snapCamera(toRenderFlightState(flightState));
  syncHud();
  return debugSnapshot();
};

const bindFlightOptions = (): void => {
  new RunSettingsPanel(selectedRules, (next) => {
    if (mode !== 'title' && mode !== 'failed') return;
    selectedRules = normalizeRules({ ...next, assisted: companionSettings.count > 0 });
    saveRules(selectedRules);
    best = loadBest(runScoreContext(selectedRules));
    ui.setBest(best);
  }, () => mode === 'title' || mode === 'failed');
  bindControlSettings(next => { controls = next; });
  bindCameraAnchorSettings({
    aircraft: () => aircraftLibrary.getSelectedId(),
    current: currentAnchor,
    recommend: recommendAnchor,
    preview: previewCockpit,
    apply: () => renderer?.setCameraAnchor(currentAnchor().anchor),
  });
  bindCompanionSettings(companionSettings, () => mode === 'title' || mode === 'failed', next => {
    companionSettings = next;
    companions.configure(next);
    if (mode === 'title' || mode === 'failed') {
      selectedRules = normalizeRules({ ...selectedRules, assisted: next.count > 0 });
      saveRules(selectedRules);
      best = loadBest(runScoreContext(selectedRules));
      ui.setBest(best);
    }
  });
};
const updateModelStatus = bindModelSettings(symbiosis, error => ui.showToast(error, true));
const journeyHud = new JourneyHud(()=>journey.skip());
const tutorialPanel = document.getElementById('help-panel')!;
bindGameTutorial(tutorialPanel);
const overlays = new OverlayManager({
  menu: document.getElementById('pause-panel')!,
  rules: document.getElementById('rules-panel')!,
  world: document.getElementById('world-panel')!,
  library: document.getElementById('library-panel')!,
  help: tutorialPanel,
  radio: document.getElementById('radio-panel')!,
});
const radioAvailable = () => companionSettings.count > 0 && !journey.active;
const voiceAvailable = () => mode === 'running' && ui.canInteract && radioAvailable() && !document.hidden;
const actionRouter = new ActionRouter(overlays, {
  mode: () => mode,
  available: () => ui.canInteract,
  pause: debugPause,
  resume: debugResume,
  start: () => { void startRun(); },
  title: () => { void returnToTitle(); },
  camera: toggleCameraMode,
  radioAvailable,
  voice: (action, source) => {
    if (action === 'start') return voiceRadio.begin(source);
    if (action === 'stop') return voiceRadio.release(source);
    return voiceRadio.cancel(action === 'cancel-all', action === 'cancel-all' ? undefined : source);
  },
});

const queueRadioDialogue = (raw: string, useModel = true): boolean => {
  if ((mode !== 'running' && mode !== 'paused') || !radioAvailable() || pendingRadio || symbiosis.client.containsCredential(raw)) return false;
  const message = radioText(raw);
  if (!message) return false;
  pendingRadio = { message, useModel, until: performance.now() + 6_000 };
  if (mode === 'paused') {
    actionRouter.clear();
    debugResume();
  }
  return true;
};
const voiceRadio = new VoiceRadio(symbiosis.client, { available: voiceAvailable, send: queueRadioDialogue, status: showVoiceStatus });
const updateVoicePanel = bindVoicePanel(voiceRadio, action => actionRouter.route(action, false, 'touch'),
  language => { symbiosis.radioLanguage = language; });
const radioPanel = new RadioPanel(symbiosis.radio, queueRadioDialogue, () => voiceRadio.silence());

const activateWorld = (world: ImportedWorldAdapter | WorldStreamer, history: ChunkRevisionHistory | null, source?: ImportedWorldSource): void => {
  if (!renderer) throw new Error('游戏尚未准备好。');
  ++runGeneration;
  ++worldTransition;
  actionRouter.clear();
  mode = 'title';
  voiceRadio.reset();
  keyboard.setEnabled(false);
  stepRunner.reset();
  audio.stop();
  symbiosis.invalidate();
  releaseActiveWorld();
  activeWorld = world;
  worldSettings = world.settings;
  revisionHistory = history;
  renderer.setWorld(world, 0);
  resetFlightState();
  ui.setWorldSettings(baseWorldSettings);
  worldPanel.setActive(world instanceof ImportedWorldAdapter ? world : null, source);
  ui.finishLoading();
  ui.showTitle();
};

const worldPanel = new WorldImportPanel(worldResources, {
  read: file => worldImporter.read(file),
  open: (data, name, options, variant) => worldImporter.load(data, name, options, loader => {
    if (!renderer) throw new Error('WebGL2 场景尚未准备好。');
    renderer.configureWorldTextures(loader);
  }, variant),
  apply: (world, source) => activateWorld(world, null, source),
  notice: (message, warning) => ui.showToast(message, warning),
  collision: visible => { if (activeWorld instanceof ImportedWorldAdapter) activeWorld.setCollisionVisible(visible); },
  motion: running => { if (activeWorld instanceof ImportedWorldAdapter) activeWorld.setMotionRunning(running); },
  preview: enabled => { motionPreview = enabled && mode === 'title'; },
  previewState: () => ({ available: mode === 'title', enabled: motionPreview }),
  builtIn: async current => {
    if (!(activeWorld instanceof ImportedWorldAdapter)) return;
    const settings = journeyWorld(baseWorldSettings, 0);
    const history = settings.mode === 'ephemeral' ? new ChunkRevisionHistory(DEFAULT_REVISION_HISTORY_SIZE) : null;
    const next = createStreamer(settings, history);
    try {
      await next.prime();
      if (!current()) return;
      activateWorld(next, history);
    } finally {
      if (activeWorld !== (next as WorldStreamer | ImportedWorldAdapter)) next.dispose();
    }
  },
});
document.getElementById('library-panel')!.addEventListener('skimmer:open', refreshModelOptions);
keyboard.onAction(actionRouter.route);

const frame = (now: number): void => {
  if (mode !== 'running') symbiosis.suspend();
  else if (!debugAdvancing && !buffering && !journey.active) {
    if (!pendingRadio) void symbiosis.request();
    else if (symbiosis.canSendDialogue()) {
      const { message, useModel } = pendingRadio;
      pendingRadio = null;
      void symbiosis.sendDialogue(message, useModel);
    } else if (now > pendingRadio.until) {
      pendingRadio = null;
      ui.showToast('伴机电台暂不可用。', true);
    }
  }
  const voiceInFlight = voiceAvailable();
  voiceRadio.update(voiceInFlight, symbiosis.radio.current(), muted || symbiosis.radio.muted);
  radioPanel.update(mode === 'running' && !journey.active, voiceRadio.spokenLine);
  audio.setDucked(voiceInFlight && voiceRadio.ducking);
  updateVoicePanel(voiceInFlight);
  updateModelStatus();
  journeyHud.update(journey, mode === 'running' && activeWorld instanceof WorldStreamer, runRules.config.mode === 'challenge' || (flightState?.position.y ?? 0) > 420);
  const reducedRotation=preferences.visualStimulation==='reduced'||window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const inversion=journey.phase==='INVERSION'?Math.PI*journey.progress:journey.phase==='WORLD_SWAP'?Math.PI:journey.phase==='DIVE'?Math.PI*(1-journey.progress):0;
  renderer?.setInversion(reducedRotation?0:inversion);
  const menuInput = ui.canInteract && (mode === 'title' || mode === 'failed' || Boolean(overlays.current));
  gamepad.poll(controls, action => actionRouter.route(action, false, 'gamepad'), menuInput, now);
  document.querySelector('#input-device')!.textContent = gamepad.device;
  const delta = Math.min(0.1, Math.max(0, (now - lastFrameTime) / 1000));
  lastFrameTime = now;

  // The veil holds the last rendered view while the old world is being replaced.
  if (journey.phase === 'WORLD_SWAP') {
    requestAnimationFrame(frame);
    return;
  }

  if (renderer && flightState && activeWorld) {
    renderer.setCompanions(mode === 'title' ? [] : companions.agents, activeWorld.getRenderOrigin());
    renderer.setRelay(symbiosis.relayFlash,symbiosis.time,activeWorld.getRenderOrigin());
    updateCompanionHud(companions.agents, symbiosis.planner);
    const preparingWorld = streamPreparationCount > 0;
    if (!preparingWorld && (mode !== 'running' || debugAdvancing)) syncWorldStreaming(flightState);
    if (mode === 'running') {
      if (debugAdvancing) {
        stepRunner.reset();
      } else if (preparingWorld || (activeWorld instanceof WorldStreamer && !activeWorld.isCollisionCovered(flightState.position))) {
        if (!preparingWorld) syncWorldStreaming(flightState);
        buffering = true;
        stepRunner.reset();
      } else {
        buffering = false;
        stepRunner.advance(delta, simulateFixedStep);
        if (flightState && !pendingWorldSwap && !neededCoverage) syncWorldStreaming(flightState);
      }
      syncHud();
      if (runRules.status === 'failed') finishRun();
      audio.update(flightState.speed, flightState.boosting, proximityFeedback.intensity);
      if (!pendingWorldSwap) renderer.renderFlight(
        toRenderFlightState(flightState),
        delta,
        now,
        proximityFeedback.intensity,
      );
      renderer.setShieldImpact(shieldGlow);
    } else if (mode === 'title' && !cockpitPreview) {
      if (motionPreview && activeWorld instanceof ImportedWorldAdapter) activeWorld.stepMotion(delta);
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
  bindDesktopWindow(canvas, () => mode === 'running', () => actionRouter.route('menu'), message => ui.showToast(message, true));

  const streamer = createStreamer(worldSettings);
  activeWorld = streamer;
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
  let hasLocalAircraft = false;
  try {
    const options = await aircraftLibrary.initialize();
    hasLocalAircraft = options.length > 1;
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
  const setup = !initialSetup.returning && hasLocalAircraft
    ? loadFlightSetup(window.localStorage, true)
    : initialSetup;
  selectedRules = setup.rules;
  companionSettings = setup.companions;
  if (!setup.returning) {
    saveRules(selectedRules);
    saveCompanions(companionSettings);
  }
  await worldPanel.restoreVisit();
  best = loadBest(runScoreContext(selectedRules));
  ui.setBest(best);
  bindFlightOptions();
  resetFlightState();
  if (flightState) syncWorldStreaming(flightState);
  ui.finishLoading();
  ui.showTitle();
  renderer.renderTitle(performance.now());
  requestAnimationFrame(frame);

  window.__SKIMMER_SCRAPER__ = {
    skipJourney:()=>journey.skip(),
    surface: (position, range = 90, proximityOnly = false) => activeWorld
      ? proximityOnly ? queryFlightSurface(activeWorld, position, range) : activeWorld.queryNearest(position, range) : null,
    aiPerception: () => symbiosis.perception(),
    aiRequest: () => symbiosis.request(),
    aiReplay: (decision, perception) => symbiosis.replay(decision, perception),
    relay: (id) => { if (mode === 'running') runRules = symbiosis.relayAttempt(id); return debugSnapshot(); },
    version,
    toggleCamera: toggleCameraMode,
    setCameraMode: applyCameraMode,
    snapshot: debugSnapshot,
    start: startRun,
    retry: startRun,
    title: returnToTitle,
    pause: debugPause,
    resume: debugResume,
    setPose: debugSetPose,
    advance: debugAdvance,
  };

  if (autoStart || debugInputEnabled) void startRun();
};

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    lastFrameTime = performance.now();
    stepRunner.reset();
  } else {
    voiceRadio.cancelPreview();
    voiceRadio.update(false, symbiosis.radio.current());
  }
});

window.addEventListener('blur', () => {
  voiceRadio.cancelPreview();
  voiceRadio.update(false, symbiosis.radio.current());
});
window.addEventListener('pointerdown', event => { if (event.isTrusted) voiceRadio.unlock(); });
window.addEventListener('keydown', event => { if (event.isTrusted && !event.repeat) voiceRadio.unlock(); });
navigator.mediaDevices?.addEventListener('devicechange', () => {
  voiceRadio.cancelPreview();
  voiceRadio.update(voiceAvailable(), symbiosis.radio.current(), true);
});
window.addEventListener('pagehide', () => voiceRadio.dispose());

window.addEventListener('skimmer:webgl-context-lost', () => {
  actionRouter.clear();
  debugPause();
  ui.showFatal('WebGL2 上下文已丢失。请重新载入页面。');
});

window.addEventListener('beforeunload', () => {
  voiceRadio.dispose();
  symbiosis.client.disconnect();
  companions.dispose();
  audio.dispose();
  if (currentImportedAircraft) disposeObject3D(currentImportedAircraft);
  aircraftLibrary.dispose();
  worldResources.close();
  if (renderer) renderer.dispose();
  else activeWorld?.dispose();
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
