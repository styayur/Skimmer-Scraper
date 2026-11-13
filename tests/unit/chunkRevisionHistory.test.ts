import { describe, expect, it } from 'vitest';
import { ChunkRevisionHistory } from '../../src/world/chunkRevisionHistory';

describe('ephemeral chunk revision history', () => {
  it('keeps an active revision stable and advances only after retirement', () => {
    const history = new ChunkRevisionHistory(8);
    expect(history.revisionFor(2, -3)).toBe(0);
    history.markActive(2, -3, 0);
    expect(history.revisionFor(2, -3)).toBe(0);
    history.markActive(2, -3, 0);
    expect(history.snapshot().entries[0]?.revision).toBe(0);

    history.markRetired(2, -3, 0);
    expect(history.revisionFor(2, -3)).toBe(1);
    history.markActive(2, -3, 1);
    history.markRetired(2, -3, 1);
    expect(history.revisionFor(2, -3)).toBe(2);
    expect(history.snapshot().entries[0]).toMatchObject({ revision: 2, retireCount: 2 });
  });

  it('bounds metadata with LRU eviction while preserving recent exact revisions', () => {
    const history = new ChunkRevisionHistory(3);
    for (let index = 0; index < 10; index += 1) {
      const revision = history.revisionFor(index, 0);
      history.markActive(index, 0, revision);
      history.markRetired(index, 0, revision);
    }
    const snapshot = history.snapshot();
    expect(snapshot.maxEntries).toBe(3);
    expect(snapshot.entries).toHaveLength(3);
    expect(snapshot.epoch).toBeGreaterThan(0);
    expect(snapshot.entries.map((entry) => entry.key)).toEqual(['9:0', '8:0', '7:0']);

    const evictedRevisit = history.revisionFor(0, 0);
    expect(evictedRevisit).toBe(snapshot.epoch);
    expect(evictedRevisit).toBeGreaterThan(1);
  });

  it('touches recently used entries so the bounded guarantee follows actual recency', () => {
    const history = new ChunkRevisionHistory(3);
    for (let index = 0; index < 3; index += 1) {
      history.markActive(index, 0, 0);
      history.markRetired(index, 0, 0);
    }
    expect(history.revisionFor(0, 0)).toBe(1);

    history.markActive(3, 0, history.revisionFor(3, 0));
    history.markRetired(3, 0, 0);
    const keys = history.snapshot().entries.map((entry) => entry.key);
    expect(keys).toContain('0:0');
    expect(keys).not.toContain('1:0');
    expect(keys).toHaveLength(3);
  });

  it('rejects an unbounded or invalid history size', () => {
    expect(() => new ChunkRevisionHistory(0)).toThrow();
    expect(() => new ChunkRevisionHistory(1.5)).toThrow();
  });
});
