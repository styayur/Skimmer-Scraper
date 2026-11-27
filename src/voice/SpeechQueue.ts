import { radioPriority, type RadioLine } from '../ai/radioDialogue';

const maxPending = 3;
const duplicateWindowMs = 14_000;
const maxRemembered = 24;
interface PendingSpeech { line: RadioLine; playbackId: number; expires: number }

/** One speaker at a time. Risk calls interrupt routine speech, and old notices expire. */
export class SpeechQueue {
  private readonly pending: PendingSpeech[] = [];
  private readonly recent = new Map<string, number>();
  private active: { line: RadioLine; controller: AbortController; playbackId: number } | null = null;
  private serial = 0;

  public constructor(private readonly play: (line: RadioLine, signal: AbortSignal, playbackId: number) => Promise<void>,
    private readonly now: () => number = () => performance.now(),
    private readonly transition?: (line: RadioLine, playbackId: number, phase: 'queued' | 'cancelled') => void) {}

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
    if (this.active && radioPriority[line.priority] > radioPriority[this.active.line.priority]) {
      this.cancelActive();
      for (let i = this.pending.length - 1; i >= 0; i--) {
        if (this.pending[i]!.line.priority === 'notice') this.discard(i);
      }
    }
    const playbackId = ++this.serial;
    this.transition?.(line, playbackId, 'queued');
    this.pending.push({ line, playbackId, expires: now + (line.priority === 'notice' ? 6500 : 10_000) });
    this.pending.sort((a, b) => radioPriority[b.line.priority] - radioPriority[a.line.priority] || a.line.id - b.line.id);
    if (this.pending.length > maxPending) this.discard(maxPending);
    this.drain();
  }

  public clear(): boolean {
    const hadSpeech = !!this.active || this.pending.length > 0;
    while (this.pending.length) this.discard(this.pending.length - 1);
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
      if (this.pending[i]!.expires <= now) this.discard(i);
    }
  }

  private discard(index: number): void {
    const [job] = this.pending.splice(index, 1);
    this.transition?.(job!.line, job!.playbackId, 'cancelled');
  }

  private drain(): void {
    if (this.active) return;
    this.discardExpired(this.now());
    const next = this.pending.shift();
    if (!next) return;
    const active = { line: next.line, playbackId: next.playbackId, controller: new AbortController() };
    this.active = active;
    const complete = () => {
      if (this.active !== active) return;
      this.active = null;
      this.drain();
    };
    void this.play(active.line, active.controller.signal, active.playbackId).then(complete, complete);
  }
}
