import type { SkyJourney } from '../game/skyJourney';

const recordKey = 'skimmer-scraper.journey.v3';

export class JourneyHud {
  private readonly veil = document.createElement('div');
  private readonly halo = document.createElement('div');
  public unlocked = false;
  public triggers = 0;
  private until = 0;

  constructor() {
    try { this.unlocked = JSON.parse(localStorage.getItem(recordKey) ?? '{}').fifthUnlocked === true; } catch { /* optional record */ }
    this.veil.className = 'sky-veil';
    this.halo.className = 'journey-halo';
    this.halo.id = 'journey-easter-egg';
    this.halo.hidden = true;
    for (const layer of [this.veil, this.halo]) {
      layer.setAttribute('aria-hidden', 'true');
      document.body.append(layer);
    }
  }

  reset(): void { this.triggers = 0; this.until = 0; this.halo.hidden = true; }

  completed(index: number, time: number): void {
    if (index !== 5 || this.triggers) return;
    this.triggers++;
    this.until = this.unlocked ? 0 : time + 8;
    this.unlocked = true;
    try { localStorage.setItem(recordKey, JSON.stringify({ version: 1, fifthUnlocked: true })); } catch { /* optional record */ }
  }

  update(journey: SkyJourney, running: boolean): void {
    const p = journey.progress;
    let opacity = 0;
    if (journey.phase === 'WORLD_SWAP') opacity = 1;
    if (journey.phase === 'INVERSION') opacity = Math.max(0, (p - 0.65) / 0.35);
    if (journey.phase === 'DIVE') opacity = Math.max(0, 1 - p / 0.35);
    this.veil.style.opacity = String(running ? opacity : 0);
    this.halo.hidden = !running || journey.time >= this.until;
  }

  snapshot() {
    return { easterEggUnlocked: this.unlocked, easterEggTriggers: this.triggers, easterEggVisible: !this.halo.hidden };
  }
}
