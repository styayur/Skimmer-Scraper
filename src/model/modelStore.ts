export interface StoredAircraftModel {
  id: string;
  name: string;
  fileName: string;
  byteLength: number;
  triangles: number;
  importedAt: number;
  yawOffset: number;
  data: ArrayBuffer;
}

const DB_NAME = 'skimmer-scraper-models';
const DB_VERSION = 1;
const STORE_NAME = 'models';

const requestResult = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });

const transactionDone = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
  });

export class ModelStore {
  private databasePromise: Promise<IDBDatabase> | null = null;

  public constructor(
    private readonly factory: IDBFactory = indexedDB,
    private readonly databaseName = DB_NAME,
  ) {}

  public async list(): Promise<StoredAircraftModel[]> {
    const db = await this.open();
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const records = await requestResult(transaction.objectStore(STORE_NAME).getAll()) as StoredAircraftModel[];
    await transactionDone(transaction);
    return records.sort((a, b) => b.importedAt - a.importedAt);
  }

  public async get(id: string): Promise<StoredAircraftModel | null> {
    const db = await this.open();
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const record = await requestResult(transaction.objectStore(STORE_NAME).get(id)) as StoredAircraftModel | undefined;
    await transactionDone(transaction);
    return record ?? null;
  }

  public async put(record: StoredAircraftModel): Promise<void> {
    const db = await this.open();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(record);
    await transactionDone(transaction);
  }

  public async delete(id: string): Promise<void> {
    const db = await this.open();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(id);
    await transactionDone(transaction);
  }

  public async clear(): Promise<void> {
    const db = await this.open();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).clear();
    await transactionDone(transaction);
  }

  public close(): void {
    void this.databasePromise?.then((database) => database.close());
    this.databasePromise = null;
  }

  private open(): Promise<IDBDatabase> {
    if (this.databasePromise) return this.databasePromise;
    this.databasePromise = new Promise((resolve, reject) => {
      const request = this.factory.open(this.databaseName, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        this.databasePromise = null;
        reject(request.error ?? new Error('Unable to open model IndexedDB.'));
      };
      request.onblocked = () => reject(new Error('Aircraft storage is blocked by another browser tab.'));
    });
    return this.databasePromise;
  }
}
