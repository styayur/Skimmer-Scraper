import {
  isWorldRole, validateWorldOptions, validMotionPath, WORLD_IMPORT_LIMITS,
  type WorldImportOptions, type WorldMotionPath, type WorldRole,
} from './worldManifest';

const prefix = 'glb-world:';
const version = 1;
export const MAX_IMPORTED_SEED_LENGTH = 512_000;

export interface ImportedWorldSeed {
  fingerprint: string;
  variant: number;
  options: WorldImportOptions;
}

const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('无效的世界种子。');
  return value as Record<string, unknown>;
};

const number = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('无效的世界种子。');
  return value;
};

const meshIds = (entries: Record<string, unknown>): string[] => {
  const ids = Object.keys(entries);
  for (const id of ids) {
    if (!/^[1-9]\d{0,3}$/.test(id) || Number(id) > WORLD_IMPORT_LIMITS.nodes) throw new Error('无效的网格编号。');
  }
  return ids;
};

// Normalize both pasted data and local options. Only the fields used by the
// importer enter the seed, so it holds no file name, binary data or credentials.
const seedOptions = (value: unknown): WorldImportOptions => {
  const raw = record(value);
  const up = raw.up;
  if (up !== 'y' && up !== 'z' && up !== '-z') throw new Error('无效的世界方向。');
  const spawn = raw.spawn === null ? null : record(raw.spawn);
  const options: WorldImportOptions = {
    scale: number(raw.scale), yaw: number(raw.yaw), up,
    spawn: spawn ? { x: number(spawn.x), y: number(spawn.y), z: number(spawn.z) } : null,
    spawnYaw: number(raw.spawnYaw),
  };
  if (raw.roles !== undefined) {
    const entries = record(raw.roles);
    const roles: Record<string, WorldRole> = {};
    for (const id of meshIds(entries)) {
      const role = entries[id];
      if (!isWorldRole(role)) throw new Error('无效的碰撞分类。');
      roles[id] = role;
    }
    if (Object.keys(roles).length) options.roles = roles;
  }
  if (raw.motion !== undefined) {
    const motion = record(raw.motion);
    if (typeof motion.loop !== 'boolean') throw new Error('无效的动画设置。');
    options.motion = { clip: number(motion.clip), loop: motion.loop };
    if (motion.paths !== undefined) {
      const entries = record(motion.paths);
      const paths: Record<string, WorldMotionPath | null> = {};
      for (const id of meshIds(entries)) {
        const path = entries[id];
        if (path === null) paths[id] = null;
        else if (validMotionPath(path)) {
          const { offset: { x, y, z }, seconds } = path;
          paths[id] = { offset: { x, y, z }, seconds };
        } else throw new Error('无效的运动路径。');
      }
      if (Object.keys(paths).length) options.motion.paths = paths;
    }
  }
  validateWorldOptions(options);
  // Existing local challenge records include the import configuration fingerprint.
  return Object.fromEntries(Object.keys(raw)
    .filter(key => Object.hasOwn(options, key))
    .map(key => [key, options[key as keyof WorldImportOptions]])) as unknown as WorldImportOptions;
};

const validIdentity = (fingerprint: unknown, variant: unknown): boolean =>
  typeof fingerprint === 'string' && /^[a-f0-9]{64}$/.test(fingerprint)
  && typeof variant === 'number' && Number.isInteger(variant) && variant >= 0 && variant <= 0xffff_ffff;

export const isImportedSeed = (value: string): boolean =>
  value.trim().length > 64 && value.trimStart().startsWith(prefix);

export const encodeImportedWorldSeed = ({ fingerprint, variant, options }: ImportedWorldSeed): string => {
  if (!validIdentity(fingerprint, variant)) throw new Error('无效的世界种子。');
  return prefix + btoa(JSON.stringify([version, fingerprint, variant, seedOptions(options)]))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const decodeImportedWorldSeed = (value: string): ImportedWorldSeed => {
  const text = value.trim();
  const payload = text.slice(prefix.length);
  if (text.length > MAX_IMPORTED_SEED_LENGTH || !isImportedSeed(text) || !/^[A-Za-z0-9_-]+$/.test(payload)) {
    throw new Error('世界种子不完整，请重新复制。');
  }
  try {
    const data: unknown = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    if (!Array.isArray(data) || data.length !== 4 || data[0] !== version || !validIdentity(data[1], data[2])) {
      throw new Error('Invalid imported world identity.');
    }
    return { fingerprint: data[1], variant: data[2], options: seedOptions(data[3]) };
  } catch {
    throw new Error('世界种子无效或版本不受支持。');
  }
};

export const newImportedVariant = (previous = 0): number => {
  const seed = new Uint32Array(1);
  do crypto.getRandomValues(seed);
  while (seed[0] === 0 || seed[0] === previous);
  return seed[0]!;
};
