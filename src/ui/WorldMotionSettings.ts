import { t, selectedLocale } from '../i18n';
import type { WorldManifest, WorldMotionOptions, WorldMotionPath } from '../world/imports/worldManifest';

const field = <T extends HTMLElement>(name: string) => document.getElementById(`local-world-motion-${name}`) as T;
const labels: Readonly<Record<string, string>> = {
  translation: t('worldMotionSettings.translation'), rotation: t('worldMotionSettings.rotation'), scale: t('worldMotionSettings.scale'), skin: t('worldMotionSettings.skinReferencePoseCollision'), morph: t('worldMotionSettings.morphReferencePoseCollision'), other: t('worldMotionSettings.other'),
};

const channelList = new Intl.ListFormat(selectedLocale, { style: 'short', type: 'unit' });

export class WorldMotionSettings {
  private readonly clips = field<HTMLSelectElement>('clip');
  private readonly loop = field<HTMLInputElement>('loop');
  private readonly meshes = field<HTMLSelectElement>('mesh');
  private readonly custom = field<HTMLInputElement>('custom');
  private readonly path = field<HTMLFieldSetElement>('path');
  private readonly offset = (['x', 'y', 'z'] as const).map(axis => field<HTMLInputElement>(axis));
  private readonly seconds = field<HTMLInputElement>('seconds');
  private current = '';
  private manifest: WorldManifest | null = null;
  private overrides: Record<string, WorldMotionPath | null> = {};

  public constructor() {
    this.clips.addEventListener('change', () => this.showChannels());
    this.meshes.addEventListener('change', () => { this.capturePath(); this.showPath(); });
    this.custom.addEventListener('change', () => { this.path.disabled = !this.custom.checked; this.capturePath(); });
    for (const input of [...this.offset, this.seconds]) input.addEventListener('change', () => this.capturePath());
  }

  public show(manifest: WorldManifest): void {
    this.manifest = manifest;
    const saved = manifest.options.motion;
    this.overrides = { ...saved?.paths };
    this.clips.replaceChildren(new Option(t('worldMotionSettings.useReferencePose'), '-1'),
      ...manifest.animations.map((clip, index) => new Option(clip.name || t('worldMotionSettings.clipNumber', { number: index + 1 }), String(index))));
    this.clips.value = String(saved?.clip ?? (manifest.animations.length ? 0 : -1));
    this.loop.checked = saved?.loop !== false;
    this.meshes.replaceChildren(...manifest.meshRoles.map(mesh => {
      const suffix = mesh.motion === 'reference-pose' ? t('worldMotionSettings.referencePoseCollision') : mesh.motion === 'rigid' ? t('worldMotionSettings.rigid') : '';
      return new Option(`${mesh.name}${suffix}`, mesh.id);
    }));
    this.showChannels();
    this.showPath();
  }

  public options(): WorldMotionOptions | undefined {
    this.capturePath();
    const clip = Number(this.clips.value);
    const loop = this.loop.checked;
    const hasPaths = Object.keys(this.overrides).length > 0;
    if (!hasPaths && loop && clip === (this.manifest?.animations.length ? 0 : -1)) return undefined;
    return { clip, loop, ...(hasPaths ? { paths: { ...this.overrides } } : {}) };
  }

  private showChannels(): void {
    const clip = this.manifest?.animations[Number(this.clips.value)];
    const content = channelList.format(clip?.channels?.map(channel => labels[channel] ?? channel) ?? []);
    field('channels').textContent = content ? t('worldMotionSettings.secondsSContent', { seconds: clip!.seconds.toFixed(1), content }) : '';
    this.loop.disabled = !clip;
  }

  private showPath(): void {
    this.current = this.meshes.value;
    const original = this.manifest?.meshRoles.find(mesh => mesh.id === this.current)?.path;
    const enabled = Object.hasOwn(this.overrides, this.current) ? this.overrides[this.current] : original;
    const motion = enabled ?? { offset: { x: 32, y: 0, z: 0 }, seconds: 8 };
    this.custom.checked = !!enabled;
    this.path.disabled = !this.custom.checked;
    this.offset[0]!.value = String(motion.offset.x);
    this.offset[1]!.value = String(motion.offset.y);
    this.offset[2]!.value = String(motion.offset.z);
    this.seconds.value = String(motion.seconds);
  }

  private capturePath(): void {
    if (!this.current) return;
    const original = this.manifest?.meshRoles.find(mesh => mesh.id === this.current)?.path;
    if (this.custom.checked) {
      const [x = 0, y = 0, z = 0] = this.offset.map(input => input.valueAsNumber);
      const path = { offset: { x, y, z }, seconds: this.seconds.valueAsNumber };
      if (original && !Object.hasOwn(this.overrides, this.current) && JSON.stringify(original) === JSON.stringify(path)) return;
      this.overrides[this.current] = path;
    } else if (original || this.overrides[this.current] === null) this.overrides[this.current] = null;
    else delete this.overrides[this.current];
  }
}
