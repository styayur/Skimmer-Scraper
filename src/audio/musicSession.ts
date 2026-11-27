import { chooseTrack, type Track } from './mzkSelection';

const pools = { city: 'City', dragonspine: 'Dragonspine', forge: 'WorldForge', local: 'Local' } as const;
const preferenceKey = 'skimmer.music.v1';
export type MusicWorld = keyof typeof pools;

export class MusicSession {
  private media: HTMLAudioElement | null = null;
  private world: MusicWorld = 'city';
  private active = false;
  private ducked = false;
  private id = '';
  private files: Track[] = [];
  private generation = 0;
  public enabled = true;
  public volume = 0.35;
  public status = '';

  constructor() {
    try {
      const prefs = JSON.parse(localStorage.getItem(preferenceKey) ?? '{}');
      if (typeof prefs.enabled === 'boolean') this.enabled = prefs.enabled;
      if (Number.isFinite(prefs.volume)) this.volume = Math.min(1, Math.max(0, prefs.volume));
    } catch { /* Flight also works with storage disabled. */ }
  }

  private save() {
    try { localStorage.setItem(preferenceKey, JSON.stringify({ enabled: this.enabled, volume: this.volume })); }
    catch { /* Keep window-scoped preferences. */ }
  }

  public setEnabled(value: boolean) {
    this.enabled = value;
    this.save();
    if (!value) this.clearTrack();
    else if (this.active) this.next();
  }

  public setVolume(value: number) {
    if (!Number.isFinite(value)) return;
    this.volume = Math.min(1, Math.max(0, value));
    this.save();
  }

  public setFiles(files: File[]) {
    this.clearTrack();
    for (const track of this.files) URL.revokeObjectURL(track.url);
    this.files = files.map((file, i) => ({ id: 'file-' + i, title: 'Local', artist: '', album: '', url: URL.createObjectURL(file) }));
    if (this.enabled && this.active) this.next();
  }

  public next() {
    if (!this.enabled) return;
    const title = pools[this.world];
    const pool = this.files.length ? this.files : [0, 1].map(i => ({
      id: this.world + i, title: title + (i ? ' II' : ''), artist: 'Skimmer-Scraper', album: title,
      url: './music/' + this.world + '-' + i + '.opus',
    }));
    const track = chooseTrack(this.files.length ? 'Local' : title, pool.filter(t => pool.length === 1 || t.id !== this.id));
    this.clearTrack();
    if (!track) { this.status = '暂无可用音乐。'; return; }
    const media = this.media ??= new Audio();
    const generation = this.generation;
    this.id = track.id;
    media.volume = 0;
    media.onended = () => { if (this.active && generation === this.generation) this.next(); };
    media.onerror = () => {
      if (generation !== this.generation || !media.error) return;
      this.clearTrack();
      this.status = '音源不可用，可选择本地音乐。';
    };
    media.src = track.url;
    if (this.active) this.play();
  }

  private play() {
    const media = this.media;
    if (!media || !this.id) return;
    const generation = this.generation;
    void media.play().then(() => {
      if (generation === this.generation) this.status = '';
    }, error => {
      if (generation === this.generation && error?.name !== 'AbortError') {
        this.status = '音乐未能播放，可重新开启或选择本地文件。';
      }
    });
  }

  /** Start on the actual input event, before async world preparation. */
  public activate(world: MusicWorld) {
    if (!this.enabled) return;
    this.active = true;
    if (this.world !== world || !this.id) {
      this.world = world;
      this.next();
    } else this.play();
  }

  public update(world: MusicWorld, active: boolean, ducked: boolean, dt: number) {
    const wasActive = this.active;
    this.active = active;
    this.ducked = ducked;
    if (world !== this.world) {
      this.clearTrack();
      this.world = world;
    }
    if (!this.enabled) return;
    if (!active) {
      if (wasActive) this.media?.pause();
      return;
    }
    if (!this.id) {
      if (!this.status || !wasActive) this.next();
      return;
    }
    if (!wasActive) this.play();
    if (this.media) {
      const target = this.volume * (ducked ? 0.25 : 1);
      this.media.volume += (target - this.media.volume) * (1 - Math.exp(-Math.max(0, dt) / 180));
    }
  }

  public snapshot() {
    return { enabled: this.enabled, active: this.active, world: this.world, ducked: this.ducked,
      selected: this.id, playing: !!this.media && !this.media.paused,
      mediaTime: this.media?.currentTime ?? 0, volume: this.media?.volume ?? 0, status: this.status };
  }

  private clearTrack() {
    this.generation++;
    this.status = '';
    this.id = '';
    const media = this.media;
    if (!media) return;
    media.onended = null;
    media.onerror = null;
    media.pause();
    media.removeAttribute('src');
    media.load();
  }

  public dispose() {
    this.clearTrack();
    this.media = null;
    this.active = false;
    for (const track of this.files) URL.revokeObjectURL(track.url);
    this.files = [];
  }
}
