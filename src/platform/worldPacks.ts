import { readGlbContainer } from '../model/glb';
import { inspectWorldGlb } from '../world/imports/worldGlbPreflight';
import { version as clientVersion } from '../../package.json';

export interface PackFile {
  name: string;
  cx: number;
  cz: number;
  bytes: number;
  sha256: string;
  bounds: number[];
}
export interface WorldPack {
  schema: 2;
  id: string;
  theme: 'ascendant';
  seed: number;
  tier: 'web' | 'high';
  generatorVersion: 2;
  packVersion: string;
  minimumClient: string;
  maximumClient?: string;
  baseWorld?: string;
  unpackedBytes?: number;
  collision: string;
  chunkMeters: number;
  source: string;
  license: string;
  files: PackFile[];
}
type Invoke = <T>(
  cmd: string,
  args?: object | ArrayBuffer,
  options?: { headers: Record<string, string> },
) => Promise<T>;
const host = () =>
  (window as Window & { __TAURI__?: { core: { invoke: Invoke } } }).__TAURI__
    ?.core;
export const nativePacksAvailable = () => !!host();

function compareVersion(a: string, b: string): number {
  const numeric = /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/;
  if (!numeric.test(a) || !numeric.test(b)) throw Error('无效的客户端版本范围。');
  const right = b.split('.').map(Number);
  return a.split('.').map((n, i) => Number(n) - right[i]!).find(delta => delta !== 0) ?? 0;
}

export function validatePack(input: unknown, version = clientVersion): WorldPack {
  const p = input as WorldPack | null;
  const baseWorld = 'dragonspine-ascendant-2';
  // The v0.8.2 schema-2 generator and its collision surface carry forward byte for byte.
  const inheritedCap = p?.minimumClient === '0.8.2' && p.maximumClient === '0.8.2'
    && p.packVersion === '2.0.0';
  if (
    !p ||
    p.schema !== 2 ||
    p.theme !== 'ascendant' ||
    p.generatorVersion !== p.schema ||
    p.collision !== baseWorld ||
    (p.id !== 'ascendant-'+p.tier+'-2-'+p.seed || p.baseWorld !== baseWorld || p.unpackedBytes === undefined) ||
    compareVersion(version, p.minimumClient) < 0 ||
    (p.maximumClient !== undefined && !inheritedCap && compareVersion(version, p.maximumClient) > 0) ||
    p.chunkMeters !== 220 ||
    !Number.isSafeInteger(p.seed) ||
    p.seed < 0 ||
    p.seed > 0xffffffff ||
    !['web', 'high'].includes(p.tier) ||
    !/^[a-z0-9-]{1,64}$/.test(p.id) ||
    typeof p.license !== 'string' ||
    !p.license.trim() ||
    typeof p.source !== 'string' ||
    !p.source.trim() ||
    !Array.isArray(p.files) ||
    !p.files.length ||
    p.files.length > 1024
  )
    throw Error('不兼容的世界包清单。');
  const coords = new Set<string>(),
    names = new Set<string>();
  let total = 0;
  for (const f of p.files) {
    const key = f.cx + ':' + f.cz;
    if (
      !Number.isSafeInteger(f.cx) ||
      !Number.isSafeInteger(f.cz) ||
      !Number.isSafeInteger(f.bytes) ||
      f.bytes < 20 ||
      f.bytes > 8 * 1024 ** 2 ||
      !/^[a-zA-Z0-9_-]{1,90}\.glb$/.test(f.name) ||
      !/^[0-9a-f]{64}$/.test(f.sha256) ||
      !Array.isArray(f.bounds) ||
      f.bounds.length !== 6 ||
      !f.bounds.every(Number.isFinite) ||
      f.bounds[0] !== f.cx * 220 ||
      f.bounds[2] !== f.cz * 220 ||
      f.bounds[3] !== f.cx * 220 + 220 ||
      f.bounds[5] !== f.cz * 220 + 220 ||
      f.bounds[1]! > f.bounds[4]! ||
      names.has(f.name) ||
      coords.has(key)
    )
      throw Error('世界包分块记录无效。');
    names.add(f.name);
    coords.add(key);
    total += f.bytes;
  }
  if (total > 1024 ** 3 || (p.unpackedBytes !== undefined && p.unpackedBytes !== total)) throw Error('资源包大小与客户端预算不符。');
  return p;
}
export function inspectPackTile(data: ArrayBuffer): void {
  const { json } = readGlbContainer(data, 8 << 20, {
    strict: true,
    maxJsonBytes: 256 << 10,
  });
  const accessors = json.accessors ?? [];
  // Version one refines a static terrain surface. The shared base owns collision and moving objects.
  if (
    !Array.isArray(json.nodes) ||
    json.nodes.length > 32 ||
    !Array.isArray(json.meshes) ||
    json.meshes.length > 16 ||
    accessors.length > 64 ||
    accessors.reduce((total, a) => total + (a.count ?? 0), 0) > 600000 ||
    (Array.isArray(json.skins) && json.skins.length) ||
    (Array.isArray(json.animations) && json.animations.length)
  ) {
    throw Error('分块超过静态网格预算。');
  }
  const checked = inspectWorldGlb(data);
  if (checked.texturePixels !== 0 || checked.extensions.size)
    throw Error('分块超出第 1 版材质预算。');
}

export async function libraryPacks(): Promise<Array<{ id: string; pack?: WorldPack; retired?: boolean }>> {
  const records = await host()?.invoke<unknown[]>('pack_list') ?? [];
  const rows: Array<{ id: string; pack?: WorldPack; retired?: boolean }> = [];
  for (const record of records) {
    const id = (record as { id?: string } | null)?.id;
    if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(id)) continue;
    try { rows.push({ id, pack: validatePack(record) }); }
    catch { rows.push({ id, retired: (record as { schema?: number }).schema === 1 }); }
  }
  return rows;
}
export async function installedPacks(): Promise<WorldPack[]> {
  return (await libraryPacks()).flatMap(row => row.pack ?? []);
}
export async function installPack(
  files: FileList,
  signal: AbortSignal,
  progress: (n: number, total: number) => void,
): Promise<WorldPack> {
  const native = host();
  if (!native) throw Error('需要 Windows 桌面版。');
  const manifest = [...files].find(
    (f) =>
      f.webkitRelativePath.split('/').length === 2 &&
      f.name === 'world-pack.json',
  );
  if (!manifest || manifest.size > 1024 ** 2)
    throw Error('请选择包含 world-pack.json 的资源包目录。');
  const pack = validatePack(JSON.parse(await manifest.text()));
  const byName = new Map(
    [...files]
      .filter((f) => f.webkitRelativePath.split('/').length === 2)
      .map((f) => [f.name, f]),
  );
  const token = await native.invoke<string>('pack_begin', { manifest: pack });
  try {
    let count = 0;
    for (const tile of pack.files) {
      signal.throwIfAborted();
      const file = byName.get(tile.name);
      if (!file || file.size !== tile.bytes)
        throw Error('缺失或损坏的分块：' + tile.name);
      const data = await file.arrayBuffer();
      inspectPackTile(data);
      await native.invoke('pack_put', data, {
        headers: { 'x-pack-session': token },
      });
      progress(++count, pack.files.length);
    }
    signal.throwIfAborted();
    await native.invoke('pack_finish', { token });
    return pack;
  } catch (error) {
    await native.invoke('pack_abort', { token });
    throw error;
  }
}

const webBase = () => new URL('./realms/dragonspine/web/', document.baseURI);
export async function webPack(signal: AbortSignal): Promise<WorldPack> {
  const response = await fetch(new URL('world-pack.json', webBase()), {
    signal,
  });
  if (!response.ok) throw Error('无法读取内置分块清单。');
  return validatePack(await response.json());
}
export async function loadPackTile(
  pack: WorldPack,
  file: PackFile,
  signal: AbortSignal,
): Promise<ArrayBuffer> {
  signal.throwIfAborted();
  let bytes: ArrayBuffer;
  if (pack.tier === 'high') {
    const native = host();
    if (!native) throw Error('高精度资源包需要桌面端。');
    bytes = await native.invoke('pack_read', {
      id: pack.id,
      digest: file.sha256,
    });
  } else {
    const response = await fetch(new URL(file.name, webBase()), { signal });
    if (!response.ok) throw Error('无法读取内置分块。');
    bytes = await response.arrayBuffer();
  }
  signal.throwIfAborted();
  if (bytes.byteLength !== file.bytes) throw Error('分块长度无效。');
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  if (
    Array.from(hash, (b) => b.toString(16).padStart(2, '0')).join('') !==
    file.sha256
  )
    throw Error('分块校验失败。');
  return bytes;
}
export async function removePack(id: string): Promise<void> {
  await host()?.invoke('pack_remove', { id });
}

export async function verifyPack(id: string): Promise<number> {
  const native = host();
  if (!native) throw Error('需要 Windows 桌面版。');
  return native.invoke<number>('pack_verify', { id });
}

export async function installOfficialPack(signal: AbortSignal, progress: (text: string) => void): Promise<WorldPack> {
  const native = host();
  if (!native) throw Error('需要 Windows 桌面版。');
  signal.throwIfAborted();
  type Progress = { received: number; total: number; verified: number };
  const cancel = () => { void native.invoke('official_pack_cancel').catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  let active = true;
  const poll = async () => {
    while (active) {
      const state = await native.invoke<Progress | null>('official_pack_progress').catch(() => null);
      if (active && state?.total) progress(state.verified ? '已校验 ' + state.verified + ' 个分块'
        : '正在下载 ' + Math.floor(100 * state.received / state.total) + '%');
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  };
  try {
    const result = native.invoke<unknown>('official_pack_install');
    void poll();
    return validatePack(await result);
  } finally {
    active = false;
    signal.removeEventListener('abort', cancel);
  }
}
