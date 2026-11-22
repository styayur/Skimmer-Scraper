import { WORLD_IMPORT_LIMITS as limits, type WorldManifest } from './worldManifest';

interface SavedWorld {
  manifest: WorldManifest;
  savedAt: number;
  keptVariant?: number;
}

const manifests = 'manifests';
const files = 'files';
const result = <T>(request: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error('无法读取本地世界。'));
});
const complete = (transaction: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onabort = () => reject(transaction.error ?? new Error('本地世界保存已中止。'));
  transaction.onerror = () => reject(transaction.error ?? new Error('本地世界存储发生错误。'));
});

/** Keep the library's manifest reads independent of the potentially large binary records. */
export class WorldResourceManager {
  private database: Promise<IDBDatabase> | null = null;

  public constructor(private readonly factory: IDBFactory, private readonly name = 'skimmer-scraper-worlds-v1') {}

  public async list(): Promise<WorldManifest[]> {
    const db = await this.open();
    const transaction = db.transaction(manifests, 'readonly');
    const [entries] = await Promise.all([result<SavedWorld[]>(transaction.objectStore(manifests).getAll()), complete(transaction)]);
    return entries.sort((a, b) => b.savedAt - a.savedAt).map(entry => entry.manifest);
  }

  public async get(id: string): Promise<{ manifest: WorldManifest; data: ArrayBuffer; keptVariant?: number } | null> {
    const db = await this.open();
    const transaction = db.transaction([manifests, files], 'readonly');
    const [entry, data] = await Promise.all([
      result<SavedWorld | undefined>(transaction.objectStore(manifests).get(id)),
      result<ArrayBuffer | undefined>(transaction.objectStore(files).get(id)),
      complete(transaction),
    ]);
    return entry && data ? { manifest: entry.manifest, data, keptVariant: entry.keptVariant } : null;
  }

  public async save(manifest: WorldManifest, data: ArrayBuffer, keptVariant?: number): Promise<void> {
    const db = await this.open();
    const transaction = db.transaction([manifests, files], 'readwrite');
    const store = transaction.objectStore(manifests);
    const finished = complete(transaction);
    const current = result<SavedWorld[]>(store.getAll());
    await Promise.all([finished, current.then(entries => {
      const others = entries.filter(entry => entry.manifest.id !== manifest.id);
      if (others.length >= limits.savedWorlds || others.reduce((bytes, entry) => bytes + entry.manifest.bytes, data.byteLength) > limits.savedBytes) {
        transaction.abort();
        throw new Error('本地世界库已满，最多保存 6 个世界和 256 MB 的 GLB。');
      }
      store.put({ manifest, savedAt: Date.now(), keptVariant } satisfies SavedWorld, manifest.id);
      transaction.objectStore(files).put(data, manifest.id);
    })]);
  }

  public async remove(id: string): Promise<void> {
    const db = await this.open();
    const transaction = db.transaction([manifests, files], 'readwrite');
    const finished = complete(transaction);
    transaction.objectStore(manifests).delete(id);
    transaction.objectStore(files).delete(id);
    await finished;
  }

  public close(): void {
    void this.database?.then(db => db.close(), () => {});
    this.database = null;
  }

  private open(): Promise<IDBDatabase> {
    if (!this.database) {
      this.database = new Promise<IDBDatabase>((resolve, reject) => {
        const request = this.factory.open(this.name, 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore(manifests);
          request.result.createObjectStore(files);
        };
        request.onsuccess = () => {
          request.result.onversionchange = () => request.result.close();
          resolve(request.result);
        };
        request.onerror = () => reject(request.error ?? new Error('无法打开本地世界库。'));
      }).catch(error => { this.database = null; throw error; });
    }
    return this.database;
  }
}
