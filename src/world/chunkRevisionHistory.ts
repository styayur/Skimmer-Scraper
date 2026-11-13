import { chunkKey } from './chunkSource';

export interface ChunkRevisionEntry {
  key: string;
  chunkX: number;
  chunkZ: number;
  revision: number;
  retireCount: number;
  lastUsed: number;
}

export interface ChunkRevisionSnapshot {
  maxEntries: number;
  epoch: number;
  entries: ChunkRevisionEntry[];
}

export const DEFAULT_REVISION_HISTORY_SIZE = 256;

/**
 * Bounded LRU history for Ephemeral World revisions.
 *
 * Exact per-key continuation is guaranteed while an entry remains in the LRU. Once evicted, a novel
 * revision is derived from the global retirement epoch, so old revisits still cannot silently reuse
 * stale interior data. Stable World never uses this tracker and always supplies revision 0.
 */
export class ChunkRevisionHistory {
  private readonly entries = new Map<string, ChunkRevisionEntry>();
  private readonly maxEntries: number;
  private clock = 0;
  private epoch = 0;

  public constructor(maxEntries = DEFAULT_REVISION_HISTORY_SIZE) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1) {
      throw new Error('Revision history size must be a positive integer.');
    }
    this.maxEntries = maxEntries;
  }

  public revisionFor(chunkX: number, chunkZ: number): number {
    const entry = this.entries.get(chunkKey(chunkX, chunkZ));
    if (!entry) return this.epoch;
    entry.lastUsed = ++this.clock;
    return entry.revision;
  }

  public markActive(chunkX: number, chunkZ: number, revision: number): void {
    const key = chunkKey(chunkX, chunkZ);
    const existing = this.entries.get(key);
    if (existing) {
      existing.revision = revision;
      existing.lastUsed = ++this.clock;
      return;
    }
    this.entries.set(key, {
      key,
      chunkX,
      chunkZ,
      revision,
      retireCount: 0,
      lastUsed: ++this.clock,
    });
    this.enforceBound();
  }

  public markRetired(chunkX: number, chunkZ: number, revision: number): void {
    const key = chunkKey(chunkX, chunkZ);
    const existing = this.entries.get(key);
    if (existing) {
      existing.revision = Math.max(existing.revision, revision) + 1;
      existing.retireCount += 1;
      existing.lastUsed = ++this.clock;
      this.epoch = Math.max(this.epoch, existing.revision);
    } else {
      const nextRevision = Math.max(this.epoch, revision) + 1;
      this.entries.set(key, {
        key,
        chunkX,
        chunkZ,
        revision: nextRevision,
        retireCount: 1,
        lastUsed: ++this.clock,
      });
      this.epoch = Math.max(this.epoch, nextRevision);
    }
    this.enforceBound();
  }

  public snapshot(): ChunkRevisionSnapshot {
    const entries = [...this.entries.values()]
      .sort((a, b) => b.lastUsed - a.lastUsed)
      .map((entry) => ({ ...entry }));
    return {
      maxEntries: this.maxEntries,
      epoch: this.epoch,
      entries,
    };
  }

  private enforceBound(): void {
    while (this.entries.size > this.maxEntries) {
      let oldestKey: string | null = null;
      let oldestUsed = Number.POSITIVE_INFINITY;
      for (const [key, entry] of this.entries) {
        if (entry.lastUsed < oldestUsed) {
          oldestUsed = entry.lastUsed;
          oldestKey = key;
        }
      }
      if (oldestKey === null) return;
      this.entries.delete(oldestKey);
    }
  }
}
