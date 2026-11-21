import { ActionRouter } from './ui/ActionRouter';
import { OverlayManager } from './ui/OverlayManager';
import '@fontsource-variable/syne';
import '@fontsource-variable/ibm-plex-sans';
import './styles.css';
import { version } from '../package.json';
import { normalizeRules, saveRules, type RuleConfig } from './game/ruleConfig';
import { RunSettingsPanel } from './ui/RunSettings';
import { loadControls, shapeInput } from './flight/controlSettings';
import { GamepadInputSource } from './flight/gamepad';
import { bindControlSettings } from './ui/ControlSettings';
import { resolveShield } from './game/shield';
import { loadCameraAnchor, recommendCameraAnchor, type CameraAnchorSetting, type RecommendedAnchorPreset } from './model/cameraAnchors';
import { bindCameraAnchorSettings } from './ui/CameraAnchorSettings';
import { loadFlightSetup } from './game/flightSetup';
import type { Vec3 } from './core/math';
import { CompanionTeam } from './companions/AgentController';
import { saveCompanions, type CompanionSettings } from './companions/settings';
import { bindCompanionSettings } from './ui/CompanionSettings';
import { updateCompanionHud } from './ui/CompanionHud';
import { SymbiosisRuntime } from './ai/SymbiosisRuntime';
import { bindModelSettings } from './ui/ModelSettings';
import type { Perception } from './ai/contracts';
import { SkyJourney } from './game/skyJourney';
import { chooseSkyArrival,chooseSkyEntry,stepSkyDive } from './game/skyFlight';
import { journeyWorld } from './world/journeyWorlds';
import { JourneyHud } from './ui/JourneyHud';

import type { CameraMode, VisualStimulation } from './config/experience';
import { EXPERIENCE_CONFIG } from './config/experience';
import { FixedStepRunner } from './core/fixedStep';
import { FLIGHT, createFlightState, stepFlight, type FlightState } from './flight/flightModel';
import {
  KeyboardInputSource,
  ScriptedInputSource,
  demoInput,
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
import { buildWorldShareUrl, DEFAULT_WORLD_SEED, GENERATOR_VERSION, resolveWorldSettings, worldSettingsFromSearch } from './world/worldConfig';
import type { SurfaceQuery, WorldStats } from './world/worldTypes';

type GameMode = 'title' | 'running' | 'paused' | 'failed';

interface DebugSnapshot {
  worldReleases: Array<{seed:number;bvhBefore:number;bvhAfter:number;rootChildrenAfter:number;disposedGeometryCount:number}>;
  journey: ReturnType<SkyJourney['snapshot']> & ReturnType<JourneyHud['snapshot']>;
  cooperation: ReturnType<SymbiosisRuntime['snapshot']>;
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
  surface(position: {x:number;y:number;z:number}, range?:number): SurfaceQuery | null;
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
    options?: { pitch?: number; preserveCompanions?: boolean },
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
let worldStreamer: WorldStreamer | null = null;
const journey = new SkyJourney();
let pendingWorldSwap: Promise<void> | null = null;
let diveStart: FlightState['position'] | null = null;
let diveEnd: FlightState['position'] | null = null;
let journeyArrival:ReturnType<typeof chooseSkyArrival>=null;
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
  worldStreamer.setCompanionPositions(companions.agents.filter(agent => agent.deployed).map(agent => agent.flight.position));
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
const keyboard = new KeyboardInputSource();
keyboard.setEnabled(false);
const scripted = new ScriptedInputSource(demoInput);
const inputSource: InputSource = debugInputEnabled ? scripted : keyboard;

const ui: GameUI = new GameUI({
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
  onVisualStimulationToggle: () => toggleVisualStimulation(),
  onCameraSelect: (view) => applyCameraMode(view),
  onRecordingHintDismiss: () => dismissRecordingHint(),
  onWorldApply: (seedValue, worldMode, upgrade) => applyWorldSettings(seedValue, worldMode, upgrade),
  onWorldRandom: () => createRandomSeed(),
  onWorldCopySeed: (seedValue) => { void copyWorldText(seedValue.trim(), '种子已复制。'); },
  onWorldCopyLink: (seedValue, worldMode) => { void copyWorldLink(seedValue, worldMode); },
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
  window.location.assign(buildWorldShareUrl(window.location.href, next));
};

const copyWorldLink = async (
  seedValue: string,
  worldMode: WorldMode,
): Promise<void> => {
  const next = resolveWorldSettings({
    seed: seedValue, preset: baseWorldSettings.preset, mode: worldMode,
    generatorVersion: baseWorldSettings.generatorVersion,
  });
  await copyWorldText(buildWorldShareUrl(window.location.href, next), '分享链接已复制。');
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

const runScoreContext = () => ({ ...scoreContextFor(baseWorldSettings,runRules.config),journey:journey.worldIndex>0 });
const createStreamer = (settings:typeof worldSettings):WorldStreamer => {
  const history=revisionHistory;
  return new WorldStreamer(settings,{renderRadius:2,collisionRadius:1,maxLoadedChunks:41,
    revisionProvider:history?(x,z)=>history.revisionFor(x,z):undefined,
    onChunkActivated:history?({chunkX,chunkZ,revision})=>history.markActive(chunkX,chunkZ,revision):undefined,
    onChunkRetired:history?({chunkX,chunkZ,revision})=>history.markRetired(chunkX,chunkZ,revision):undefined});
};
const loadJourneyWorld = async (index:number,token:number):Promise<boolean> => {
  symbiosis.invalidate();companions.dispose();
  renderer?.releaseWorld();
  if(worldStreamer){
    const before=worldStreamer.getStreamerStats();const releasedSeed=worldStreamer.settings.seed;
    worldStreamer.dispose();const after=worldStreamer.getStreamerStats();
    worldReleases.push({seed:releasedSeed,bvhBefore:before.bvhCount,bvhAfter:after.bvhCount,rootChildrenAfter:worldStreamer.root.children.length,disposedGeometryCount:after.disposedGeometryCount});
    if(worldReleases.length>16)worldReleases.shift();
  }
  worldStreamer=null;
  worldSettings=journeyWorld(baseWorldSettings,index);
  revisionHistory=worldSettings.mode==='ephemeral'?new ChunkRevisionHistory(DEFAULT_REVISION_HISTORY_SIZE):null;
  const next=createStreamer(worldSettings);worldStreamer=next;
  const spawn=next.getDefaultSpawn();flightState=createFlightState(spawn);renderer?.setWorld(next,index);
  renderer?.snapCamera(toRenderFlightState(flightState));
  return await waitForCollisionCoverage(spawn.position,{x:0,y:0,z:-spawn.speed},30000,()=>token===worldTransition&&worldStreamer===next);
};
const restoreJourneyStart = async (token:number):Promise<boolean> => {
  const replace=journey.worldIndex>0||journey.active||worldSettings.seed!==baseWorldSettings.seed;
  journey.reset();journeyHud.reset();diveStart=null;diveEnd=null;journeyArrival=null;renderer?.setInversion(0);
  return !replace||await loadJourneyWorld(0,token);
};
const beginSkySwap = ():void => {
  const token=++worldTransition;const index=journey.worldIndex+1;
  const job=(async()=>{
    const ready=await loadJourneyWorld(index,token);
    if(token!==worldTransition)return;
    if(!ready||!worldStreamer||!flightState)throw Error('Unable to prepare new sky');
    const spawn=chooseSkyArrival(worldStreamer.getDefaultSpawn(),worldStreamer);
    if(!spawn)throw Error('No safe exit corridor');journeyArrival=spawn;
    diveEnd={...spawn.position};diveStart=chooseSkyEntry(spawn.position,worldStreamer);
    if(!diveStart)throw Error('No safe entry corridor');
    flightState=createFlightState({...spawn,position:{...diveStart},pitch:-1});
    companions.configure(companionSettings);companions.reset(flightState,worldStreamer);
    renderer?.snapCamera(toRenderFlightState(flightState));journey.worldReady();
    best=loadBest(runScoreContext());ui.setBest(best);lastSurfaceHit=worldStreamer.queryNearest(flightState.position,SURFACE_QUERY_RANGE);
    buffering=false;neededCoverage=null;stepRunner.reset();lastFrameTime=performance.now();
  })();
  pendingWorldSwap=job;
  void job.catch(()=>{if(token===worldTransition){mode='title';ui.showFatal('新世界准备失败。请刷新或重试，原有存档未变更。');}}).finally(()=>{if(pendingWorldSwap===job)pendingWorldSwap=null;});
};
const simulateJourneyStep = (dt:number):boolean => {
  if(!flightState||!worldStreamer||journey.phase==='WORLD_SWAP')return false;
  const event=journey.step(dt);
  if(event==='swap'){journeyHud.update(journey,true);beginSkySwap();return true;}
  if((journey.phase==='DIVE'||journey.phase==='RECOVERY'||event==='completed')&&diveStart&&diveEnd){
    flightState=stepSkyDive(flightState,diveStart,diveEnd,journey.phase==='DIVE'?journey.progress:1,dt,journeyArrival?.yaw??0);
  }else flightState={...flightState,velocity:{x:0,y:0,z:0},elapsed:flightState.elapsed+dt};
  companions.step(flightState,worldStreamer,dt);
  lastSurfaceHit=worldStreamer.queryNearest(flightState.position,SURFACE_QUERY_RANGE);
  if(event==='completed'){
    flightState={...createFlightState({... (journeyArrival??worldStreamer.getDefaultSpawn()),position:{...flightState.position}}),elapsed:flightState.elapsed};
    companions.configure(companionSettings);companions.reset(flightState,worldStreamer);journeyHud.completed(journey.crossings,journey.time);
    proximityFeedback=createProximityFeedback();
  }
  return true;
};

const simulateFixedStep = (dt: number, holdPosition = false): boolean => {
  if (mode !== 'running' || !flightState || !worldStreamer) return false;
  if(journey.active)return simulateJourneyStep(dt);
  if (!worldStreamer.isCollisionCovered(flightState.position)) {
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
  if (!worldStreamer.isCollisionCovered(nextState.position)) {
    neededCoverage = nextState;
    syncWorldStreaming(nextState);
    buffering = true;
    return false;
  }

  buffering = false;
  neededCoverage = null;
  shieldCooldown = Math.max(0, shieldCooldown - dt);
  shieldGlow = Math.max(0, shieldGlow - dt * 3);
  if (runRules.config.shield) {
    const contact = resolveShield(flightState, nextState, worldStreamer);
    nextState = contact.flight;
    if (contact.impact) {
      shieldGlow = 1;
      if (shieldCooldown === 0) { shieldImpacts++; gamepad.impact(); shieldCooldown = 0.2; }
    }
  }
  const previousY=flightState.position.y;
  flightState = nextState;
  lastSurfaceHit = worldStreamer.queryNearest(flightState.position, SURFACE_QUERY_RANGE);
  runRules = updateRunRules(runRules, { distance: lastSurfaceHit?.distance ?? null }, dt);
  if (runRules.status === 'running') {
    companions.step(flightState, worldStreamer, dt);
    runRules = symbiosis.step(flightState, runRules, worldStreamer, worldSettings.seed, dt);
  }
  if(journey.observe(previousY,flightState,runRules,dt)){
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
  if (!renderer || !worldStreamer) return;
  const spawn = worldStreamer.getDefaultSpawn();
  flightState = createFlightState({
    position: { ...spawn.position },
    yaw: spawn.yaw,
    pitch: spawn.pitch,
    speed: spawn.speed,
  });
  runRules = createRunRules({ ...selectedRules, assisted: companionSettings.count > 0 });
  companions.configure(companionSettings); companions.reset(flightState, worldStreamer);
  symbiosis.reset();
  journey.reset();journeyHud.reset();renderer.setInversion(0);diveStart=null;diveEnd=null;
  best=loadBest(scoreContextFor(baseWorldSettings,runRules.config));ui.setBest(best);
  shieldGlow = 0; shieldImpacts = 0; shieldCooldown = 0;
  renderer.setCameraAnchor(currentAnchor().anchor);
  proximityFeedback = createProximityFeedback();
  buffering = false;
  syncWorldStreaming(flightState);
  neededCoverage = null;
  lastSurfaceHit = worldStreamer.isCollisionCovered(flightState.position)
    ? worldStreamer.queryNearest(flightState.position, SURFACE_QUERY_RANGE)
    : null;
  stepRunner.reset();
};

const startRun = async (): Promise<void> => {
  if (!renderer || !worldStreamer) return;
  runGeneration++;
  const transition = ++worldTransition;
  actionRouter.clear();
  mode = 'title';
  symbiosis.suspend();
  keyboard.setEnabled(false);
  stepRunner.reset();
  audio.stop();
  ui.showLoading('正在准备出生点区块');
  if(!await restoreJourneyStart(transition)||transition!==worldTransition)return;

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

const debugPause = (): boolean => {
  if (mode !== 'running') return mode === 'paused';
  mode = 'paused';
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
  symbiosis.suspend();
  keyboard.setEnabled(false);
  stepRunner.reset();
  audio.stop();

  if(renderer)ui.showLoading('正在返回起点');
  if(renderer&&worldStreamer&&(!await restoreJourneyStart(transition)||transition!==worldTransition))return;

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

const debugSnapshot = (): DebugSnapshot => {
  if (!renderer || !flightState) {
    throw new Error('Game is not ready.');
  }
  const camera = renderer.getCameraSnapshot();
  return {
    worldReleases:worldReleases.map(item=>({...item})),
    journey: {...journey.snapshot(),...journeyHud.snapshot()},
    cooperation: symbiosis.snapshot(),
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
    seed:worldSettings.seed,
    debugInput: debugInputEnabled,
    selectedAircraft: aircraftLibrary.getSelectedId(),
    localModelCount: Math.max(0, aircraftLibrary.options().length - 1),
    cameraMode: camera.mode,
    cameraBlend: camera.blend,
    cameraAnchor: camera.anchor,
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
    chunkStates: worldStreamer?.getChunkStates() ?? [],
  };
};

const debugAdvance = async (
  seconds: number,
  options: { holdPosition?: boolean } = {},
): Promise<DebugSnapshot> => {
  if (!flightState || mode !== 'running' || !worldStreamer) return debugSnapshot();
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
      renderer?.snapCamera(toRenderFlightState(flightState));
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
  options: { pitch?: number; preserveCompanions?: boolean } = {},
): Promise<DebugSnapshot> => {
  if (!flightState || !worldStreamer) return debugSnapshot();
  const covered = await waitForCollisionCoverage(position, flightState.velocity);
  if (!options.preserveCompanions) companions.relocate({ x: position.x - flightState.position.x, y: position.y - flightState.position.y, z: position.z - flightState.position.z });
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

const bindFlightOptions = (): void => {
  new RunSettingsPanel(selectedRules, (next) => {
    if (mode !== 'title' && mode !== 'failed') return;
    selectedRules = normalizeRules({ ...next, assisted: companionSettings.count > 0 });
    saveRules(selectedRules);
    best = loadBest(scoreContextFor(worldSettings, selectedRules));
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
      best = loadBest(scoreContextFor(worldSettings, selectedRules));
      ui.setBest(best);
    }
  });
};
const updateModelStatus = bindModelSettings(symbiosis, error => ui.showToast(error, true));
const journeyHud = new JourneyHud(()=>journey.skip());
const overlays = new OverlayManager({
  menu: document.getElementById('pause-panel')!,
  rules: document.getElementById('rules-panel')!,
  world: document.getElementById('world-panel')!,
  library: document.getElementById('library-panel')!,
  help: document.getElementById('help-panel')!,
});
const actionRouter = new ActionRouter(overlays, {
  mode: () => mode,
  available: () => ui.canInteract,
  pause: debugPause,
  resume: debugResume,
  start: () => { void startRun(); },
  title: () => { void returnToTitle(); },
  camera: toggleCameraMode,
});
document.getElementById('library-panel')!.addEventListener('skimmer:open', refreshModelOptions);
keyboard.onAction(actionRouter.route);

const frame = (now: number): void => {
  if (mode !== 'running') symbiosis.suspend();
  else if (!debugAdvancing && !buffering && !journey.active) void symbiosis.request();
  updateModelStatus();
  journeyHud.update(journey, mode === 'running', runRules.config.mode === 'challenge' || (flightState?.position.y ?? 0) > 420);
  const reducedRotation=preferences.visualStimulation==='reduced'||window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const inversion=journey.phase==='INVERSION'?Math.PI*journey.progress:journey.phase==='WORLD_SWAP'?Math.PI:journey.phase==='DIVE'?Math.PI*(1-journey.progress):0;
  renderer?.setInversion(reducedRotation?0:inversion);
  const menuInput = ui.canInteract && (mode === 'title' || mode === 'failed' || Boolean(overlays.current));
  gamepad.poll(controls, actionRouter.route, menuInput, now);
  document.querySelector('#input-device')!.textContent = gamepad.device;
  const delta = Math.min(0.1, Math.max(0, (now - lastFrameTime) / 1000));
  lastFrameTime = now;

  if (renderer && flightState && worldStreamer) {
    renderer.setCompanions(mode === 'title' ? [] : companions.agents, worldStreamer.getRenderOrigin());
    renderer.setRelay(symbiosis.relayFlash,symbiosis.time,worldStreamer.getRenderOrigin());
    updateCompanionHud(companions.agents, symbiosis.planner);
    const streaming = streamPreparationCount === 0 ? syncWorldStreaming(flightState) : null;
    if (mode === 'running') {
      if (debugAdvancing) {
        stepRunner.reset();
      } else if (streamPreparationCount > 0 || !streaming?.coverageComplete) {
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
      renderer.setShieldImpact(shieldGlow);
    } else if (mode === 'title' && !cockpitPreview) {
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

  const streamer = createStreamer(worldSettings);
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
  best = loadBest(scoreContextFor(worldSettings, selectedRules));
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
    surface: (position, range=90) => worldStreamer?.queryNearest(position,range)??null,
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
  }
});

window.addEventListener('skimmer:webgl-context-lost', () => {
  actionRouter.clear();
  debugPause();
  ui.showFatal('WebGL2 上下文已丢失。请重新载入页面。');
});

window.addEventListener('beforeunload', () => {
  symbiosis.client.disconnect();
  companions.dispose();
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
