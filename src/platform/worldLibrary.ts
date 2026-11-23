import { WorldResourceManager } from '../world/imports/worldResourceManager';
import {
  WORLD_IMPORT_LIMITS,
  type WorldManifest,
} from '../world/imports/worldManifest';

export type WorldLibrary = Pick<
  WorldResourceManager,
  'list' | 'get' | 'save' | 'remove' | 'close'
>;
type Invoke = <T>(
  command: string,
  args?: Record<string, unknown> | ArrayBuffer,
) => Promise<T>;
interface Saved {
  manifest: WorldManifest;
  keptVariant?: number;
}

class NativeWorldLibrary implements WorldLibrary {
  public constructor(private readonly invoke: Invoke) {}

  private entries(): Promise<Saved[]> {
    return this.invoke('world_list');
  }

  public async list(): Promise<WorldManifest[]> {
    return (await this.entries()).map((entry) => entry.manifest);
  }

  public async get(id: string) {
    const entry = (await this.entries()).find(
      (item) => item.manifest.id === id,
    );
    if (!entry) return null;
    const size = entry.manifest.bytes;
    if (
      !Number.isSafeInteger(size) ||
      size < 20 ||
      size > WORLD_IMPORT_LIMITS.bytes
    )
      throw Error('本地世界文件大小无效。');
    const data = new Uint8Array(size);
    const chunk = 1024 * 1024;
    for (let offset = 0; offset < size; offset += chunk) {
      const length = Math.min(chunk, size - offset);
      const part = await this.invoke<ArrayBuffer>('world_read', {
        id,
        offset,
        length,
      });
      if (part.byteLength !== length) throw Error('本地世界读取不完整。');
      data.set(new Uint8Array(part), offset);
    }
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
    if (
      Array.from(digest, (v) => v.toString(16).padStart(2, '0')).join('') !== id
    )
      throw Error('本地世界校验失败。');
    return { ...entry, data: data.buffer };
  }

  public async save(
    manifest: WorldManifest,
    data: ArrayBuffer,
    keptVariant?: number,
  ): Promise<void> {
    const metadata = new TextEncoder().encode(
      JSON.stringify({ manifest, keptVariant }),
    );
    const packet = new Uint8Array(4 + metadata.byteLength + data.byteLength);
    new DataView(packet.buffer).setUint32(0, metadata.byteLength, true);
    packet.set(metadata, 4);
    packet.set(new Uint8Array(data), 4 + metadata.length);
    await this.invoke('world_save', packet.buffer);
  }

  public remove(id: string): Promise<void> {
    return this.invoke('world_remove', { id });
  }
  public close(): void {
    /* Native connections close after each operation. */
  }
}

export function createWorldLibrary(): WorldLibrary {
  const host = window as Window & { __TAURI__?: { core: { invoke: Invoke } } };
  return host.__TAURI__
    ? new NativeWorldLibrary(host.__TAURI__.core.invoke)
    : new WorldResourceManager(window.indexedDB);
}
