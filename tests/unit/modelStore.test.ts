import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { ModelStore, type StoredAircraftModel } from '../../src/model/modelStore';

const record = (id: string, importedAt: number): StoredAircraftModel => ({
  id,
  name: `Aircraft ${id}`,
  fileName: `${id}.glb`,
  byteLength: 4,
  triangles: 4,
  importedAt,
  yawOffset: Math.PI,
  data: new Uint8Array([0x67, 0x6c, 0x54, 0x46]).buffer,
});

describe('local aircraft storage', () => {
  it('persists, lists, reads and deletes models in IndexedDB', async () => {
    const store = new ModelStore(indexedDB, `skimmer-test-${Date.now()}`);
    await store.put(record('old', 1));
    await store.put(record('new', 2));
    const list = await store.list();
    expect(list.map((entry) => entry.id)).toEqual(['new', 'old']);
    expect(await store.get('old')).toMatchObject({ triangles: 4, fileName: 'old.glb' });
    await store.delete('old');
    expect(await store.get('old')).toBeNull();
    await store.clear();
    expect(await store.list()).toEqual([]);
    store.close();
  });
});
