import { describe, expect, it } from 'vitest';
import { formatTime, loadBest, submitBest } from '../../src/game/storage';

class MemoryStorage implements Storage {
  private readonly data = new Map<string, string>();
  public get length(): number { return this.data.size; }
  public clear(): void { this.data.clear(); }
  public getItem(key: string): string | null { return this.data.get(key) ?? null; }
  public key(index: number): string | null { return [...this.data.keys()][index] ?? null; }
  public removeItem(key: string): void { this.data.delete(key); }
  public setItem(key: string, value: string): void { this.data.set(key, value); }
}

describe('local score storage', () => {
  it('formats survival time with stable centiseconds', () => {
    expect(formatTime(0)).toBe('00:00.00');
    expect(formatTime(61.239)).toBe('01:01.23');
    expect(formatTime(Number.NaN)).toBe('00:00.00');
  });

  it('stores only a strictly better local best', () => {
    const storage = new MemoryStorage();
    expect(loadBest(storage)).toBe(0);
    expect(submitBest(12.5, storage)).toEqual({ best: 12.5, isNewBest: true });
    expect(submitBest(11.9, storage)).toEqual({ best: 12.5, isNewBest: false });
    expect(submitBest(13.1, storage)).toEqual({ best: 13.1, isNewBest: true });
    expect(loadBest(storage)).toBe(13.1);
  });
});
