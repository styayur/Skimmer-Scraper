import { radioPriority, type RadioLine } from '../ai/radioDialogue';

const maxPending = 3;
const duplicateWindowMs = 14_000;
const maxRemembered = 24;
interface PendingSpeech { line: RadioLine; expires: number }

/** One speaker at a time. Risk calls interrupt routine speech, and old notices expire. */
export class SpeechQueue {
  private readonly pending: PendingSpeech[] = [];
  private readonly recent = new Map<string, number>();
  private active: { line: RadioLine; controller: AbortController } | null = null;

  public constructor(private readonly play: (line: RadioLine, signal: AbortSignal) => Promise<void>,
    private readonly now: () => number = () => performance.now()) {}

  public get current(): RadioLine | null { return this.active?.line ?? null; }
  public get count(): number { return this.pending.length; }

  public enqueue(line: RadioLine): void {
    const now = this.now();
    const key = `${line.agent}:${line.text}`;
    if (line.priority !== 'reply') {
      const last = this.recent.get(key);
      if (last !== undefined && now - last < duplicateWindowMs) return;
      this.recent.delete(key);
      this.recent.set(key, now);
      if (this.recent.size > maxRemembered) this.recent.delete(this.recent.keys().next().value!);
    }
    this.discardExpired(now);
    if (line.priority === 'risk' && this.active && this.active.line.priority !== 'risk') {
      this.cancelActive();
      for (let i = this.pending.length - 1; i >= 0; i--) {
        if (this.pending[i]!.line.priority === 'notice') this.pending.splice(i, 1);
      }
    }
    this.pending.push({ line, expires: now + (line.priority === 'notice' ? 6500 : 10_000) });
    this.pending.sort((a, b) => radioPriority[b.line.priority] - radioPriority[a.line.priority] || a.line.id - b.line.id);
    if (this.pending.length > maxPending) this.pending.length = maxPending;
    this.drain();
  }

  public clear(): boolean {
    const hadSpeech = !!this.active || this.pending.length > 0;
    this.pending.length = 0;
    this.cancelActive();
    return hadSpeech;
  }

  public reset(): void { this.clear(); this.recent.clear(); }

  private cancelActive(): void {
    const active = this.active;
    this.active = null;
    active?.controller.abort();
  }

  private discardExpired(now: number): void {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      if (this.pending[i]!.expires <= now) this.pending.splice(i, 1);
    }
  }

  private drain(): void {
    if (this.active) return;
    this.discardExpired(this.now());
    const next = this.pending.shift();
    if (!next) return;
    const active = { line: next.line, controller: new AbortController() };
    this.active = active;
    const complete = () => {
      if (this.active !== active) return;
      this.active = null;
      this.drain();
    };
    void this.play(active.line, active.controller.signal).then(complete, complete);
  }
}
