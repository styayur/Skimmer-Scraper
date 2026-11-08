import { formatTime } from '../game/storage';

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
  private readonly modelFile = required<HTMLInputElement>('model-file');
  private readonly muteButton = required<HTMLButtonElement>('mute-button');
  private readonly qualityButton = required<HTMLButtonElement>('quality-button');
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
    this.graceBar.style.transform = `scaleX(${gracePercent})`;
    this.graceValue.textContent = `${snapshot.grace.toFixed(2)}s`;
    this.graceMeter.setAttribute('aria-valuenow', snapshot.grace.toFixed(2));
    this.surfaceDistance.textContent = snapshot.distance === null ? '-- m' : `${snapshot.distance.toFixed(1)} m`;
    this.surfaceStatus.classList.toggle('is-locked', snapshot.locked);
    this.surfaceStatus.classList.toggle('is-warning', !snapshot.locked && !snapshot.prototype);
    document.getElementById('app')?.classList.toggle('is-danger', !snapshot.locked && !snapshot.prototype && snapshot.grace < 2.4);
    this.surfaceState.textContent = snapshot.prototype
      ? 'SURFACE MODEL PENDING'
      : snapshot.locked
        ? 'SURFACE LOCK'
        : 'SURFACE LOST';
    this.surfaceState.style.color = snapshot.locked ? 'var(--teal)' : 'var(--rose)';
    this.flightStatus.textContent = snapshot.prototype
      ? '原型飞行 · 近距规则将在下一阶段接入'
      : snapshot.locked
        ? '近距稳定 · 保持这条线'
        : '远离所有表面 · 立即回贴';
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

