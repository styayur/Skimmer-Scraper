/** Wall-clock streaming diagnostics. Simulation time stops while coverage is pending. */
export class BufferingEvents {
  private since: number | null = null;
  private completedMs = 0;
  private entries = 0;
  private recent: { atMs: number; buffering: boolean }[] = [];

  get active(): boolean { return this.since !== null; }

  set(active: boolean, atMs: number): void {
    if (this.active === active) return;
    if (active) {
      this.since = atMs;
      this.entries++;
    } else {
      this.completedMs += atMs - this.since!;
      this.since = null;
    }
    this.recent.push({ atMs, buffering: active });
    if (this.recent.length > 128) this.recent.shift();
  }

  snapshot(atMs: number) {
    const currentMs = this.since === null ? 0 : atMs - this.since;
    return { entries: this.entries, completedMs: this.completedMs, currentMs,
      totalMs: this.completedMs + currentMs, recent: this.recent.slice() };
  }
}
