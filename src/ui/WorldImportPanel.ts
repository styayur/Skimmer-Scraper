import { localizeDiagnostic } from '../i18n/diagnostics';
import { t, selectedLocale } from '../i18n';
import type { ImportedWorldAdapter } from '../world/imports/importedWorldAdapter';
import type { ImportVariantRequest, WorldImporter } from '../world/imports/worldImporter';
import type { WorldLibrary } from '../platform/worldLibrary';
import { WorldMotionSettings } from './WorldMotionSettings';
import {
  defaultWorldImportOptions, isWorldRole, WORLD_IMPORT_LIMITS, type WorldImportOptions, type WorldRole,
} from '../world/imports/worldManifest';
import {
  decodeImportedWorldSeed, encodeImportedWorldSeed, isImportedSeed, MAX_IMPORTED_SEED_LENGTH, newImportedVariant,
  type ImportedWorldSeed,
} from '../world/imports/worldVariantSeed';

export interface ImportedWorldSource {
  data: ArrayBuffer;
  saved: boolean;
  replay: boolean;
}

interface Draft {
  data: ArrayBuffer;
  world: ImportedWorldAdapter;
  saved?: { keptVariant?: number };
}

interface Hooks {
  read: WorldImporter['read'];
  open: (data: ArrayBuffer, name: string, options: WorldImportOptions, variant?: ImportVariantRequest) => Promise<ImportedWorldAdapter>;
  apply: (world: ImportedWorldAdapter, source: ImportedWorldSource) => void;
  notice: (message: string, warning?: boolean) => void;
  builtIn: (current: () => boolean) => Promise<void>;
  collision: (visible: boolean) => void;
  motion: (running: boolean) => void;
  preview: (enabled: boolean) => void;
  previewState: () => { available: boolean; enabled: boolean };
}

const get = <T extends HTMLElement = HTMLElement>(name: string) => document.getElementById(`local-world-${name}`) as T;
const sessionKey = 'skimmer-scraper.imported-visit.v1';
const fileSize = (bytes: number): string => bytes >= 1024 * 1024
  ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.ceil(bytes / 1024))} KB`;

export class WorldImportPanel {
  private readonly panel = document.getElementById('world-panel')!;
  private readonly form = get<HTMLFormElement>('config');
  private readonly file = get<HTMLInputElement>('file');
  private readonly library = get<HTMLDetailsElement>('library');
  private readonly select = get<HTMLSelectElement>('select');
  private readonly analyze = get<HTMLButtonElement>('analyze');
  private readonly cancel = get<HTMLButtonElement>('cancel');
  private readonly status = get('status');
  private readonly manual = get<HTMLInputElement>('manual');
  private readonly position = get<HTMLFieldSetElement>('position');
  private readonly meshes = get<HTMLSelectElement>('mesh');
  private readonly role = get<HTMLSelectElement>('role');
  private readonly save = get<HTMLInputElement>('save');
  private readonly motionSettings = new WorldMotionSettings();
  private readonly seedInput = document.querySelector<HTMLInputElement>('#world-seed-input')!;
  private readonly seedForm = document.querySelector<HTMLFormElement>('#world-form')!;
  private currentFile: File | null = null;
  private draft: Draft | null = null;
  private active: { world: ImportedWorldAdapter; source: ImportedWorldSource } | null = null;
  private pendingSeed: ImportedWorldSeed | null = null;
  private roles: Record<string, WorldRole> = {};
  private generation = 0;
  private busy = false;

  public constructor(private readonly store: WorldLibrary, private readonly hooks: Hooks) {
    this.seedInput.maxLength = MAX_IMPORTED_SEED_LENGTH;
    const drop = get('drop');
    this.file.addEventListener('change', () => this.selectFile(this.file.files?.[0]));
    drop.addEventListener('dragover', event => { event.preventDefault(); drop.dataset.dragging = ''; });
    drop.addEventListener('dragleave', () => delete drop.dataset.dragging);
    drop.addEventListener('drop', event => {
      event.preventDefault();
      delete drop.dataset.dragging;
      this.selectFile(event.dataTransfer?.files[0]);
    });
    this.panel.addEventListener('skimmer:open', () => {
      void this.refresh();
      const preview = hooks.previewState();
      get('motion-preview-label').hidden = !preview.available;
      get<HTMLInputElement>('motion-preview').checked = preview.enabled;
    });
    this.panel.addEventListener('skimmer:close', () => this.discard());
    this.cancel.addEventListener('click', () => {
      this.pendingSeed = null;
      this.discard();
      this.status.textContent = t('worldImportPanel.importCancelled');
    });
    this.manual.addEventListener('change', () => { this.position.disabled = !this.manual.checked; });
    this.meshes.addEventListener('change', () => this.updateRole());
    this.role.addEventListener('change', () => {
      if (isWorldRole(this.role.value)) this.roles[this.meshes.value] = this.role.value;
    });
    get<HTMLInputElement>('collision').addEventListener('change', event => this.hooks.collision((event.target as HTMLInputElement).checked));
    get<HTMLInputElement>('motion-running').addEventListener('change', event => this.hooks.motion((event.target as HTMLInputElement).checked));
    get<HTMLInputElement>('motion-preview').addEventListener('change', event => this.hooks.preview((event.target as HTMLInputElement).checked));
    get('builtin').addEventListener('click', () => {
      void this.run(t('worldImportPanel.preparingProceduralCity'), current => this.hooks.builtIn(current));
    });
    get('new-variant').addEventListener('click', () => {
      const current = this.active;
      if (!current) return;
      const { world: { manifest }, source } = current;
      void this.run(t('worldImportPanel.generatingANewVariant'), task => this.openVisit(
        { fingerprint: manifest.id, variant: newImportedVariant(manifest.variant?.seed), options: manifest.options },
        source.data, manifest.name, source.saved, false, task,
      ));
    });
    get('keep').addEventListener('click', () => {
      const active = this.active;
      if (!active) return;
      void this.run(t('worldImportPanel.savingTheCurrentWorld'), async current => {
        const { manifest } = active.world;
        await store.save(manifest, active.source.data, manifest.variant?.seed ?? 0);
        if (!current()) return;
        active.source = { data: active.source.data, saved: true, replay: true };
        this.rememberVisit();
        void this.refresh();
        this.status.textContent = '';
        hooks.notice(t('worldImportPanel.currentWorldSaved'));
      });
    });
    this.analyze.addEventListener('click', () => {
      const file = this.currentFile;
      if (file) void this.run(t('worldImportPanel.analyzingModelAndCollisionMeshes'), async current => {
        const data = await hooks.read(file);
        if (!current()) return;
        const seed = this.pendingSeed;
        if (seed) await this.openVisit(seed, data, file.name, false, true, current);
        else await this.prepare(data, file.name, defaultWorldImportOptions, current);
      });
    });
    get('load').addEventListener('click', () => {
      this.pendingSeed = null;
      void this.run(t('worldImportPanel.openingLocalWorld'), async current => {
        const record = await this.store.get(this.select.value);
        if (!record) throw new Error(t('worldImportPanel.thisWorldWasRemovedFromThisDevice'));
        if (current()) await this.prepare(record.data, record.manifest.name, record.manifest.options, current,
          { keptVariant: record.keptVariant });
      });
    });
    get('export').addEventListener('click', () => {
      void this.run(t('worldImportPanel.exportingGLB'), async current => {
        const record = await this.store.get(this.select.value);
        if (!record) throw new Error(t('worldImportPanel.thisWorldWasRemovedFromThisDevice'));
        if (!current()) return;
        const link = document.createElement('a');
        const url = URL.createObjectURL(new Blob([record.data], { type: 'model/gltf-binary' }));
        link.href = url;
        link.download = record.manifest.name + '.glb';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        this.status.textContent = t('worldImportPanel.exported');
      });
    });
    get('remove').addEventListener('click', () => {
      void this.run(t('worldImportPanel.removingLocalCopy'), async current => {
        const id = this.select.value;
        await this.store.remove(id);
        if (this.active?.world.manifest.id === id) {
          this.active.source.saved = false;
          this.rememberVisit();
        }
        await this.refresh();
        if (current()) this.status.textContent = t('worldImportPanel.localCopyRemoved');
      });
    });
    this.form.addEventListener('submit', event => {
      event.preventDefault();
      void this.apply();
    });
  }

  public setActive(world: ImportedWorldAdapter | null, source?: ImportedWorldSource): void {
    this.active = world && source ? { world, source } : null;
    this.pendingSeed = null;
    get('active').hidden = world === null;
    get('name').textContent = world ? t('worldImportPanel.activeWorldName', { name: world.manifest.name }) : '';
    get<HTMLInputElement>('collision').checked = world?.isCollisionVisible() ?? false;
    get('motion-controls').hidden = !world || !(world.manifest.animations.length || world.manifest.meshRoles.some(mesh => mesh.motion));
    get<HTMLInputElement>('motion-running').checked = world?.isMotionRunning() ?? false;
    this.seedForm.toggleAttribute('data-imported', !!world);
    this.seedForm.querySelector<HTMLButtonElement>('[type=submit]')!.textContent = world ? t('worldImportPanel.applySeed') : t('ui.generateAndReload');
    this.seedForm.querySelector<HTMLElement>('[data-help-section]')!.dataset.helpSection = world ? 'guide-variants' : 'guide-world';
    if (world) this.seedInput.value = this.activeSeed ?? '';
    this.rememberVisit();
  }

  public get activeSeed(): string | undefined {
    const manifest = this.active?.world.manifest;
    return manifest && encodeImportedWorldSeed({
      fingerprint: manifest.id, variant: manifest.variant?.seed ?? 0, options: manifest.options,
    });
  }

  public useSeed(value: string): boolean {
    if (!isImportedSeed(value)) return false;
    this.library.open = true;
    void this.run(t('worldImportPanel.rebuildingLocalWorld'), async current => {
      this.pendingSeed = null;
      const seed = decodeImportedWorldSeed(value);
      const active = this.active;
      if (active?.world.manifest.id === seed.fingerprint) {
        await this.openVisit(seed, active.source.data, active.world.manifest.name, active.source.saved, true, current);
        return;
      }
      const record = await this.store.get(seed.fingerprint).catch(() => null);
      if (!current()) return;
      if (!record) {
        this.pendingSeed = seed;
        throw new Error(t('worldImportPanel.seedNeedsOriginal'));
      }
      await this.openVisit(seed, record.data, record.manifest.name, true, true, current);
    });
    return true;
  }

  public async restoreVisit(): Promise<void> {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (navigation?.type !== 'reload') return;
    try {
      const raw = sessionStorage.getItem(sessionKey);
      if (!raw) return;
      const visit = JSON.parse(raw) as { url?: string; seed?: string; replay?: boolean };
      if (visit.url !== location.href || typeof visit.seed !== 'string') return;
      const seed = decodeImportedWorldSeed(visit.seed);
      const record = await this.store.get(seed.fingerprint);
      if (!record) throw new Error(t('worldImportPanel.reimportOriginal'));
      if (!visit.replay) seed.variant = newImportedVariant(seed.variant);
      await this.openVisit(seed, record.data, record.manifest.name, true, !!visit.replay, () => true);
    } catch (error) {
      this.rememberVisit();
      this.hooks.notice(error instanceof Error ? localizeDiagnostic(error.message) : t('worldImportPanel.couldNotRestoreTheLocalWorld'), true);
    }
  }

  public clearVisit(): void {
    try { sessionStorage.removeItem(sessionKey); } catch { /* Session storage can be disabled. */ }
  }

  private rememberVisit(): void {
    const source = this.active?.source;
    if (!source?.saved) { this.clearVisit(); return; }
    try {
      sessionStorage.setItem(sessionKey, JSON.stringify({
        url: location.href, seed: this.activeSeed, replay: source.replay,
      }));
    } catch { /* The local library remains available when session storage is disabled. */ }
  }

  private async openVisit(
    seed: ImportedWorldSeed, data: ArrayBuffer, name: string, saved: boolean, exact: boolean, current: () => boolean,
  ): Promise<void> {
    const world = await this.hooks.open(data, name, seed.options, { fingerprint: seed.fingerprint, variant: seed.variant, exact });
    if (!current()) { world.dispose(); return; }
    try {
      this.hooks.apply(world, { data, saved, replay: exact });
    } catch (error) {
      world.dispose();
      throw error;
    }
    if (seed.variant && !world.manifest.variant) this.hooks.notice(t('worldImportPanel.variantFallback'), true);
  }

  private selectFile(file?: File): void {
    if (!file || this.busy) return;
    this.discard();
    if (!/\.glb$/i.test(file.name) || file.size > WORLD_IMPORT_LIMITS.bytes) {
      this.status.textContent = t('worldImportPanel.fileRequirements');
      return;
    }
    this.currentFile = file;
    this.analyze.hidden = false;
    this.cancel.hidden = false;
    const warning = file.size > 32 * 1024 * 1024 ? t('worldImportPanel.largeFileWarning') : '';
    this.status.textContent = `${file.name} · ${fileSize(file.size)}${warning}`;
  }

  private async refresh(): Promise<void> {
    try {
      const saved = await this.store.list();
      const selected = this.select.value;
      this.select.replaceChildren(...saved.map(item => new Option(`${item.name} · ${fileSize(item.bytes)}`, item.id)));
      if (saved.some(item => item.id === selected)) this.select.value = selected;
      get('saved').hidden = saved.length === 0;
    } catch {
      this.status.textContent = t('worldImportPanel.sessionOnly');
    }
  }

  private discard(): void {
    this.generation++;
    this.currentFile = null;
    this.draft?.world.dispose();
    this.draft = null;
    this.form.hidden = true;
    this.analyze.hidden = true;
    this.cancel.hidden = true;
    this.file.value = '';
    this.status.textContent = '';
  }

  private async run(label: string, operation: (current: () => boolean) => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.status.textContent = label;
    const generation = ++this.generation;
    const current = () => generation === this.generation;
    const buttons = ['analyze', 'apply', 'load', 'remove', 'builtin', 'new-variant', 'keep'].map(name => get<HTMLButtonElement>(name));
    for (const control of [...buttons, this.file, this.select]) control.disabled = true;
    this.cancel.hidden = false;
    try {
      await new Promise(requestAnimationFrame);
      if (current()) await operation(current);
    } catch (error) {
      if (current()) this.status.textContent = error instanceof Error ? localizeDiagnostic(error.message) : t('worldImportPanel.couldNotReadTheLocalWorld');
    } finally {
      this.busy = false;
      for (const control of [...buttons, this.file, this.select]) control.disabled = false;
      this.cancel.hidden = !this.draft && !this.currentFile && !this.pendingSeed;
    }
  }

  private async prepare(
    data: ArrayBuffer, name: string, options: WorldImportOptions, current: () => boolean, saved?: Draft['saved'],
  ): Promise<void> {
    this.draft?.world.dispose();
    this.draft = null;
    this.form.hidden = true;
    const world = await this.hooks.open(data, name, options);
    if (!current()) { world.dispose(); return; }
    this.draft = { data, world, saved };
    this.currentFile = null;
    this.library.open = true;
    this.analyze.hidden = true;
    this.form.hidden = false;
    const { manifest } = world;
    const { x, y, z } = world.getDefaultSpawn().position;
    const lengths = Object.values(manifest.bounds).map(value => value.toFixed(1)).join(' × ');
    const textureMiB = Math.ceil(manifest.texturePixels * 4 / (1024 * 1024));
    get('summary').textContent = t('worldImportPanel.sceneSummary', { name: manifest.name, lengths, nodes: manifest.nodes, triangles: manifest.triangles.toLocaleString(selectedLocale), materials: manifest.materials, textures: manifest.textures, textureMiB, clips: manifest.animations.length });
    this.status.textContent = manifest.triangles > 450_000 || textureMiB > 80 ? t('worldImportPanel.thisLargeSceneMayReduceFrameRate') : '';
    this.roles = { ...options.roles };
    this.meshes.replaceChildren(...manifest.meshRoles.map(mesh => new Option(mesh.name, mesh.id)));
    this.updateRole();
    this.motionSettings.show(manifest);
    this.manual.checked = options.spawn !== null;
    this.position.disabled = !this.manual.checked;
    for (const [key, value] of Object.entries({ ...options, x, y, z })) {
      const input = this.form.elements.namedItem(key);
      if (input instanceof HTMLInputElement || input instanceof HTMLSelectElement) input.value = String(value);
    }
  }

  private updateRole(): void {
    const entry = this.draft?.world.manifest.meshRoles.find(mesh => mesh.id === this.meshes.value);
    this.role.value = entry ? this.roles[entry.id] ?? entry.inferred : 'SURFACE';
  }

  private async apply(): Promise<void> {
    const draft = this.draft;
    if (!draft) return;
    const fields = new FormData(this.form);
    const motion = this.motionSettings.options();
    const options: WorldImportOptions = {
      scale: Number(fields.get('scale')), yaw: Number(fields.get('yaw')),
      up: fields.get('up') as WorldImportOptions['up'], spawnYaw: Number(fields.get('spawnYaw')),
      spawn: this.manual.checked ? { x: Number(fields.get('x')), y: Number(fields.get('y')), z: Number(fields.get('z')) } : null,
      ...(Object.keys(this.roles).length ? { roles: { ...this.roles } } : {}),
      ...(motion ? { motion } : {}),
    };
    const shouldSave = this.save.checked;
    await this.run(t('worldImportPanel.preparingWorld'), async current => {
      const changed = JSON.stringify(options) !== JSON.stringify(draft.world.manifest.options);
      const keptVariant = draft.saved?.keptVariant;
      const variant = keptVariant ?? (draft.saved ? newImportedVariant() : 0);
      const world = changed || variant ? await this.hooks.open(draft.data, draft.world.manifest.name, options,
        { fingerprint: draft.world.manifest.id, variant, exact: keptVariant !== undefined && !changed }) : draft.world;
      let applied = false;
      try {
        if (!current()) return;
        if (shouldSave) await this.store.save(world.manifest, draft.data,
          keptVariant === undefined ? undefined : world.manifest.variant?.seed ?? 0);
        if (!current()) return;
        if (world !== draft.world) draft.world.dispose();
        this.draft = null;
        this.hooks.apply(world, { data: draft.data, saved: shouldSave || !!draft.saved, replay: keptVariant !== undefined });
        if (variant && !world.manifest.variant) this.hooks.notice(t('worldImportPanel.variantFallback'), true);
        applied = true;
      } finally {
        if (!applied && (world !== draft.world || !this.draft)) world.dispose();
      }
    });
  }
}
