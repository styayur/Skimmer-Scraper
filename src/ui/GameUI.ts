import type { CameraMode } from '../config/experience';
import { formatTime } from '../game/storage';
import type { WorldPresetId, WorldSettings } from '../world/worldConfig';
import { WORLD_PRESET_OPTIONS } from '../world/worldConfig';

export interface FlightHudSnapshot {
  runTime: number;
  best: number;
  speed: number;
  altitude: number;
  boosting: boolean;
}

export interface SurfaceHudSnapshot {
  distance: number | null;
  grace: number;
  locked: boolean;
  proximity: number;
  zone: 'detached' | 'near' | 'strong' | 'extreme';
  prototype?: boolean;
}

export interface FailureSnapshot {
  title: string;
  reason: string;
  runTime: number;
  best: number;
  isNewBest: boolean;
}

export interface ModelListItem {
  id: string;
  name: string;
  meta: string;
  tag: string;
}

export interface GameUIHooks {
  onStart(): void;
  onRetry(): void;
  onMenu(): void;
  onLibraryOpen(): void;
  onLibraryClose(): void;
  onMuteToggle(): boolean;
  onQualityChange(): string;
  onImportModel(file: File): void;
  onSelectModel(id: string): void;
  onRemoveModel(): void;
  onRotateModel(): void;
  onCameraToggle(): CameraMode;
  onVisualStimulationToggle(): boolean;
  onRecordingHintDismiss(): void;
  onWorldOpen(): void;
  onWorldClose(): void;
  onWorldApply(seed: string, preset: WorldPresetId): void;
  onWorldRandom(): string;
  onWorldCopySeed(seed: string): void;
  onWorldCopyLink(seed: string, preset: WorldPresetId): void;
  onWorldReset(): { seed: string; preset: WorldPresetId };
}

const required = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required element #${id}.`);
  return element as T;
};

export class GameUI {
  private readonly titleScreen = required<HTMLElement>('title-screen');
  private readonly loadingScreen = required<HTMLElement>('loading-screen');
  private readonly loadingCopy = required<HTMLElement>('loading-copy');
  private readonly hud = required<HTMLElement>('hud');
  private readonly failScreen = required<HTMLElement>('fail-screen');
  private readonly libraryPanel = required<HTMLElement>('library-panel');
  private readonly webglError = required<HTMLElement>('webgl-error');
  private readonly errorMessage = required<HTMLElement>('error-message');
  private readonly titleBest = required<HTMLElement>('title-best');
  private readonly hudTimer = required<HTMLElement>('hud-timer');
  private readonly hudBest = required<HTMLElement>('hud-best');
  private readonly hudSpeed = required<HTMLElement>('hud-speed');
  private readonly hudAltitude = required<HTMLElement>('hud-altitude');
  private readonly surfaceStatus = required<HTMLElement>('surface-status');
  private readonly surfaceState = required<HTMLElement>('surface-state');
  private readonly surfaceDistance = required<HTMLElement>('surface-distance');
  private readonly graceValue = required<HTMLElement>('grace-value');
  private readonly graceBar = required<HTMLElement>('grace-bar');
  private readonly graceMeter = this.graceBar.parentElement as HTMLElement;
  private readonly flightStatus = required<HTMLElement>('flight-status');
  private readonly failTitle = required<HTMLElement>('fail-title');
  private readonly failReason = required<HTMLElement>('fail-reason');
  private readonly failTime = required<HTMLElement>('fail-time');
  private readonly failBest = required<HTMLElement>('fail-best');
  private readonly newBestBadge = required<HTMLElement>('new-best-badge');
  private readonly modelList = required<HTMLElement>('model-list');
  private readonly modelNote = required<HTMLElement>('model-note');
  private readonly removeModelButton = required<HTMLButtonElement>('remove-model-button');
  private readonly rotateModelButton = required<HTMLButtonElement>('rotate-model-button');
  private readonly modelFile = required<HTMLInputElement>('model-file');
  private readonly muteButton = required<HTMLButtonElement>('mute-button');
  private readonly qualityButton = required<HTMLButtonElement>('quality-button');
  private readonly effectsButton = required<HTMLButtonElement>('effects-button');
  private readonly cameraButton = required<HTMLButtonElement>('camera-button');
  private readonly hudView = required<HTMLElement>('hud-view');
  private readonly cockpitFrame = required<HTMLElement>('cockpit-frame');
  private readonly recordHint = required<HTMLElement>('record-hint');
  private readonly worldPanel = required<HTMLElement>('world-panel');
  private readonly worldSeedInput = required<HTMLInputElement>('world-seed-input');
  private readonly worldPresetSelect = required<HTMLSelectElement>('world-preset-select');
  private readonly worldPresetDescription = required<HTMLElement>('world-preset-description');
  private readonly titleWorldPreset = required<HTMLElement>('title-world-preset');
  private readonly titleWorldMeta = required<HTMLElement>('title-world-meta');
  private readonly toast = required<HTMLElement>('toast');
  private toastTimer: number | undefined;
  private currentModels: ModelListItem[] = [];
  private selectedModelId = 'procedural';

  public constructor(private readonly hooks: GameUIHooks) {
    required<HTMLButtonElement>('start-button').addEventListener('click', hooks.onStart);
    required<HTMLButtonElement>('retry-button').addEventListener('click', hooks.onRetry);
    required<HTMLButtonElement>('menu-button').addEventListener('click', hooks.onMenu);
    required<HTMLButtonElement>('library-open').addEventListener('click', hooks.onLibraryOpen);
    required<HTMLButtonElement>('library-close').addEventListener('click', hooks.onLibraryClose);
    required<HTMLButtonElement>('import-model-button').addEventListener('click', () => this.modelFile.click());
    this.removeModelButton.addEventListener('click', hooks.onRemoveModel);
    this.rotateModelButton.addEventListener('click', hooks.onRotateModel);
    this.modelFile.addEventListener('change', () => {
      const file = this.modelFile.files?.[0];
      if (file) hooks.onImportModel(file);
      this.modelFile.value = '';
    });
    this.muteButton.addEventListener('click', () => {
      const muted = hooks.onMuteToggle();
      this.setMuted(muted);
    });
    this.qualityButton.addEventListener('click', () => {
      const label = hooks.onQualityChange();
      this.qualityButton.textContent = `画质 · ${label}`;
    });
    this.effectsButton.addEventListener('click', () => {
      const reduced = hooks.onVisualStimulationToggle();
      this.setVisualStimulation(reduced);
    });
    this.cameraButton.addEventListener('click', () => {
      const mode = hooks.onCameraToggle();
      this.setCameraMode(mode);
    });
    required<HTMLButtonElement>('record-hint-close').addEventListener('click', () => {
      hooks.onRecordingHintDismiss();
      this.setRecordingHintVisible(false);
    });
    required<HTMLButtonElement>('world-open').addEventListener('click', hooks.onWorldOpen);
    required<HTMLButtonElement>('world-close').addEventListener('click', hooks.onWorldClose);
    required<HTMLFormElement>('world-form').addEventListener('submit', (event) => {
      event.preventDefault();
      hooks.onWorldApply(this.worldSeedInput.value, this.worldPresetSelect.value as WorldPresetId);
    });
    this.worldPresetSelect.addEventListener('change', () => this.updateWorldPresetDescription());
    required<HTMLButtonElement>('world-random').addEventListener('click', () => {
      this.worldSeedInput.value = hooks.onWorldRandom();
    });
    required<HTMLButtonElement>('world-copy-seed').addEventListener('click', () => {
      hooks.onWorldCopySeed(this.worldSeedInput.value);
    });
    required<HTMLButtonElement>('world-copy-link').addEventListener('click', () => {
      hooks.onWorldCopyLink(this.worldSeedInput.value, this.worldPresetSelect.value as WorldPresetId);
    });
    required<HTMLButtonElement>('world-reset').addEventListener('click', () => {
      const reset = hooks.onWorldReset();
      this.worldSeedInput.value = reset.seed;
      this.worldPresetSelect.value = reset.preset;
      this.updateWorldPresetDescription();
    });
    required<HTMLButtonElement>('reload-button').addEventListener('click', () => window.location.reload());
  }

  public finishLoading(): void {
    this.loadingScreen.hidden = true;
  }

  public setLoadingCopy(copy: string): void {
    this.loadingCopy.textContent = copy;
  }

  public setBest(seconds: number): void {
    const formatted = formatTime(seconds);
    this.titleBest.textContent = formatted;
    this.hudBest.textContent = formatted;
    this.failBest.textContent = formatted;
  }

  public showTitle(): void {
    this.titleScreen.hidden = false;
    this.hud.hidden = true;
    this.failScreen.hidden = true;
  }

  public showFlight(): void {
    this.titleScreen.hidden = true;
    this.failScreen.hidden = true;
    this.hud.hidden = false;
  }

  public showFailure(snapshot: FailureSnapshot): void {
    this.hud.hidden = true;
    this.titleScreen.hidden = true;
    this.failScreen.hidden = false;
    this.failTitle.textContent = snapshot.title;
    this.failReason.textContent = snapshot.reason;
    this.failTime.textContent = formatTime(snapshot.runTime);
    this.failBest.textContent = formatTime(snapshot.best);
    this.newBestBadge.hidden = !snapshot.isNewBest;
    required<HTMLButtonElement>('retry-button').focus({ preventScroll: true });
  }

  public updateFlight(snapshot: FlightHudSnapshot): void {
    this.hudTimer.textContent = formatTime(snapshot.runTime);
    this.hudBest.textContent = formatTime(snapshot.best);
    this.hudSpeed.textContent = String(Math.round(snapshot.speed)).padStart(3, '0');
    this.hudAltitude.textContent = String(Math.max(0, Math.round(snapshot.altitude))).padStart(3, '0');
    this.hudSpeed.parentElement?.classList.toggle('is-boosting', snapshot.boosting);
  }

  public updateSurface(snapshot: SurfaceHudSnapshot): void {
    const gracePercent = Math.max(0, Math.min(1, snapshot.grace / 5));
    const app = document.getElementById('app');
    this.graceBar.style.transform = `scaleX(${gracePercent})`;
    this.graceValue.textContent = `${snapshot.grace.toFixed(2)}s`;
    this.graceMeter.setAttribute('aria-valuenow', snapshot.grace.toFixed(2));
    this.surfaceDistance.textContent = snapshot.distance === null ? '-- m' : `${snapshot.distance.toFixed(1)} m`;
    app?.style.setProperty('--proximity-intensity', Math.max(0, Math.min(1, snapshot.proximity)).toFixed(4));
    this.surfaceStatus.classList.toggle('is-locked', snapshot.locked);
    this.surfaceStatus.classList.toggle('is-warning', !snapshot.locked && !snapshot.prototype);
    this.surfaceStatus.classList.toggle('is-strong', snapshot.zone === 'strong');
    this.surfaceStatus.classList.toggle('is-extreme', snapshot.zone === 'extreme');
    app?.classList.toggle('is-danger', !snapshot.locked && !snapshot.prototype && snapshot.grace < 2.4);
    if (snapshot.prototype) {
      this.surfaceState.textContent = 'SURFACE MODEL PENDING';
      this.flightStatus.textContent = '原型飞行 · 近距规则将在下一阶段接入';
    } else if (snapshot.zone === 'extreme') {
      this.surfaceState.textContent = 'RAZOR LINE / 极近贴飞';
      this.flightStatus.textContent = '极近贴飞 · 松开修正让机翼留在表面外';
    } else if (snapshot.zone === 'strong') {
      this.surfaceState.textContent = 'CLOSE VECTOR / 强化贴近';
      this.flightStatus.textContent = '贴飞增强 · 风噪与尾迹正在加强';
    } else if (snapshot.locked) {
      this.surfaceState.textContent = 'SURFACE LOCK';
      this.flightStatus.textContent = '近距稳定 · 保持这条线';
    } else {
      this.surfaceState.textContent = 'SURFACE LOST';
      this.flightStatus.textContent = '远离所有表面 · 立即回贴';
    }
    this.surfaceState.style.color = snapshot.locked ? 'var(--teal)' : 'var(--rose)';
  }

  public setCameraMode(mode: CameraMode): void {
    const cockpit = mode === 'cockpit';
    this.cameraButton.innerHTML = cockpit ? '视角 · 机头 <kbd>C</kbd>' : '视角 · 追尾 <kbd>C</kbd>';
    this.hudView.textContent = cockpit ? 'NOSE / 机头' : 'CHASE / 追尾';
    this.cockpitFrame.hidden = !cockpit;
    document.getElementById('app')?.classList.toggle('is-cockpit', cockpit);
  }

  public setVisualStimulation(reduced: boolean): void {
    this.effectsButton.textContent = reduced ? '视觉 · 柔和' : '视觉 · 标准';
    this.effectsButton.setAttribute('aria-pressed', String(reduced));
    document.getElementById('app')?.classList.toggle('low-stim', reduced);
  }

  public setRecordingHintVisible(visible: boolean): void {
    this.recordHint.hidden = !visible;
  }

  public setWorldSettings(settings: WorldSettings): void {
    this.worldSeedInput.value = settings.seedText;
    this.worldPresetSelect.value = settings.preset;
    this.updateWorldPresetDescription();
    const titleMap: Record<WorldPresetId, string> = {
      sakura: 'SAKURA<br />DUSK<br />DISTRICT',
      neon: 'NEON<br />MEGACITY<br />DISTRICT',
      archipelago: 'FLOATING<br />ARCHIPELAGO',
      randomized: 'RANDOMIZED<br />CITY',
    };
    this.titleWorldPreset.innerHTML = titleMap[settings.preset];
    this.titleWorldMeta.textContent = `WEBGL2 · SEED ${settings.seedText} · ${settings.mode.toUpperCase()}`;
  }

  public setWorldSeedValue(seed: string): void {
    this.worldSeedInput.value = seed;
  }

  public getWorldSeedValue(): string {
    return this.worldSeedInput.value;
  }

  public openWorld(): void {
    this.worldPanel.hidden = false;
    this.worldSeedInput.focus({ preventScroll: true });
  }

  public closeWorld(): void {
    this.worldPanel.hidden = true;
  }

  public isWorldOpen(): boolean {
    return !this.worldPanel.hidden;
  }

  public updateWorldPresetDescription(): void {
    const preset = WORLD_PRESET_OPTIONS.find((option) => option.id === this.worldPresetSelect.value);
    this.worldPresetDescription.textContent = preset?.description ?? '';
  }

  public openLibrary(): void {
    this.libraryPanel.hidden = false;
    required<HTMLButtonElement>('library-close').focus({ preventScroll: true });
  }

  public closeLibrary(): void {
    this.libraryPanel.hidden = true;
  }

  public isLibraryOpen(): boolean {
    return !this.libraryPanel.hidden;
  }

  public setModels(models: ModelListItem[], selectedId: string): void {
    this.currentModels = models;
    this.selectedModelId = selectedId;
    this.modelList.replaceChildren();
    for (const model of models) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'model-option';
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(model.id === selectedId));
      button.dataset.modelId = model.id;
      const text = document.createElement('span');
      const name = document.createElement('span');
      name.className = 'model-option__name';
      name.textContent = model.name;
      const meta = document.createElement('span');
      meta.className = 'model-option__meta';
      meta.textContent = model.meta;
      text.append(name, meta);
      const tag = document.createElement('span');
      tag.className = 'model-option__tag';
      tag.textContent = model.tag;
      button.append(text, tag);
      button.addEventListener('click', () => this.hooks.onSelectModel(model.id));
      this.modelList.append(button);
    }
    const current = models.find((model) => model.id === this.selectedModelId);
    this.modelNote.textContent = current
      ? `当前机型 ${current.name} · ${current.meta}`
      : '选择一架飞机开始挑战。';
    this.removeModelButton.disabled = selectedId === 'procedural';
    this.rotateModelButton.disabled = selectedId === 'procedural';
  }

  public setModelBusy(busy: boolean, note?: string): void {
    this.modelList.style.opacity = busy ? '0.45' : '1';
    this.modelList.style.pointerEvents = busy ? 'none' : '';
    if (note) this.modelNote.textContent = note;
  }

  public selectModel(id: string): void {
    if (!this.currentModels.some((model) => model.id === id)) return;
    this.setModels(this.currentModels, id);
  }

  public setMuted(muted: boolean): void {
    this.muteButton.textContent = muted ? '声音 · 关' : '声音 · 开';
    this.muteButton.setAttribute('aria-pressed', String(muted));
  }

  public showToast(message: string, error = false, duration = 3200): void {
    window.clearTimeout(this.toastTimer);
    this.toast.textContent = message;
    this.toast.classList.toggle('is-error', error);
    this.toast.hidden = false;
    this.toastTimer = window.setTimeout(() => {
      this.toast.hidden = true;
    }, duration);
  }

  public showFatal(message: string): void {
    this.loadingScreen.hidden = true;
    this.titleScreen.hidden = true;
    this.hud.hidden = true;
    this.failScreen.hidden = true;
    this.errorMessage.textContent = message;
    this.webglError.hidden = false;
  }
}
