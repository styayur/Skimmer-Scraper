import { describe, expect, it } from 'vitest';
import { DragonChunkGenerator } from '../../src/world/dragonRealm';
import {
  resolveWorldSettings,
  worldSettingsFromSearch,
  buildWorldShareUrl,
} from '../../src/world/worldConfig';
import { SkyJourney } from '../../src/game/skyJourney';
import { validatePack } from '../../src/platform/worldPacks';
import manifest from '../../public/realms/dragonspine/web/world-pack.json';

describe('Dragonspine world contract', () => {
  it('shares seeds without changing legacy world URLs', () => {
    const settings = worldSettingsFromSearch('?theme=dragon&seed=8112');
    expect(
      worldSettingsFromSearch(
        new URL(buildWorldShareUrl('https://example.org/game/', settings))
          .search,
      ),
    ).toEqual(settings);
    expect(worldSettingsFromSearch('?seed=8112').theme).toBeUndefined();
  });
  it('keeps collision vertices identical along neighboring tile edges and independent of loading order', () => {
    const settings = resolveWorldSettings({ seed: '8112' });
    const source = new DragonChunkGenerator(settings);
    const left = source.generate(-1, 0, 0),
      right = source.generate(0, 0, 0),
      again = source.generate(-1, 0, 0);
    const samples = (chunk: typeof left, x: number) => {
      const pos = chunk.collisionGeometry.getAttribute('position');
      const values = new Set<string>();
      for (let n = 0; n < pos.count; n++)
        if (pos.getX(n) === x) values.add(pos.getZ(n) + ':' + pos.getY(n));
      return [...values].sort();
    };
    expect(samples(left, 220)).toEqual(samples(right, 0));
    expect(again.fingerprint).toBe(left.fingerprint);
    for (const chunk of [left, right, again]) {
      chunk.group.children.forEach((child) => {
        if ('geometry' in child)
          (child.geometry as { dispose(): void }).dispose();
      });
      chunk.collisionGeometry.dispose();
    }
    source.dispose();
  });
  it('shortens the visual phase and holds at the world exchange until acknowledged', () => {
    const journey = new SkyJourney();
    journey.fast = true;
    journey.phase = 'THRESHOLD';
    journey.step(0.17);
    expect(journey.phase).toBe('INVERSION');
    expect(journey.step(0.49)).toBe('swap');
    for (let i = 0; i < 120; i++) journey.step(1 / 60);
    expect(journey.phase).toBe('WORLD_SWAP');
    expect(journey.worldIndex).toBe(0);
    journey.worldReady();
    expect(journey.phase).toBe('DIVE');
  });
  it('accepts the bundled manifest and rejects duplicate positions and out-of-scope filenames', () => {
    expect(validatePack(manifest).files.length).toBe(100);
    const duplicate = {
      ...manifest,
      files: [manifest.files[0], manifest.files[0]],
    };
    expect(() => validatePack(duplicate)).toThrow();
    expect(() =>
      validatePack({
        ...manifest,
        files: [{ ...manifest.files[0], name: '../asset.glb' }],
      }),
    ).toThrow();
  });
});
