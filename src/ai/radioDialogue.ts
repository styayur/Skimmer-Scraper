export const COMPANION_PROFILES = [
  { id: 1, callsign: 'KITE-1', role: 'Navigator', focus: '路线、领航和建筑结构' },
  { id: 2, callsign: 'KITE-2', role: 'Guardian', focus: '碰撞风险、护航和接力救援' },
  { id: 3, callsign: 'KITE-3', role: 'Explorer', focus: '远景、浮岛和新世界' },
] as const;

export type RadioSource = 'player' | 'local' | 'model';
export type RadioPriority = 'notice' | 'reply' | 'risk';

export interface RadioLine {
  id: number;
  agent: number | null;
  text: string;
  source: RadioSource;
  priority: RadioPriority;
}

const priority: Record<RadioPriority, number> = { notice: 0, reply: 1, risk: 2 };
const maxHistory = 32;
const maxQueue = 4;

export const radioText = (value: string, limit = 240): string =>
  Array.from(value.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, limit).join('');

/** A single bounded channel. Important alerts can interrupt routine reports. */
export class RadioDialogue {
  private serial = 0;
  private history: RadioLine[] = [];
  private queue: RadioLine[] = [];
  private active: RadioLine | null = null;
  private expires = 0;
  public muted = false;

  public player(text: string): void { this.remember(null, text, 'player', 'reply'); }

  public report(agent: number, text: string, source: 'local' | 'model', kind: RadioPriority, time: number): void {
    const line = this.remember(agent, text, source, kind);
    if (!line || this.muted) return;
    if (this.active && kind === 'risk' && this.active.priority !== 'risk') this.active = null;
    this.queue.push(line);
    this.queue.sort((a, b) => priority[b.priority] - priority[a.priority] || a.id - b.id);
    if (this.queue.length > maxQueue) this.queue.length = maxQueue;
    this.step(time);
  }

  public step(time: number): void {
    if (this.active && time < this.expires) return;
    this.active = this.queue.shift() ?? null;
    if (this.active) this.expires = time + Math.min(6, Math.max(2.5, Array.from(this.active.text).length / 10));
  }

  public interrupt(): void { this.active = null; this.queue = []; }

  public setMuted(value: boolean): void {
    this.muted = value;
    if (value) this.interrupt();
  }

  public reset(): void { this.interrupt(); this.history = []; }

  public current(): RadioLine | null { return this.active; }

  public snapshot() { return { active: this.active, history: this.history.slice(), queued: this.queue.length, muted: this.muted }; }

  private remember(agent: number | null, raw: string, source: RadioSource, kind: RadioPriority): RadioLine | null {
    const text = radioText(raw, source === 'player' ? 240 : 140);
    if (!text) return null;
    const line = { id: ++this.serial, agent, text, source, priority: kind };
    this.history.push(line);
    if (this.history.length > maxHistory) this.history.shift();
    return line;
  }
}
