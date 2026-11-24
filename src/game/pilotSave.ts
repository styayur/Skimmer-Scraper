const prefix = 'skimmer-scraper.';
const settings = new Set(['preferences.v2', 'controls.v3', 'rules.v3', 'journey.v3', 'companions.v3',
  'voice.v1', 'camera-anchors.v3', 'transition-speed', 'selected-model.v1', 'active-pack']);
const allowed = (key: string) => key.startsWith(prefix) && key.length <= 1200 &&
  (settings.has(key.slice(prefix.length)) || key === prefix + 'best.v1' || key.startsWith(prefix + 'best.v2:'));

export function exportPilot(storage: Storage): string {
  const records: Record<string, string> = {};
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && allowed(key)) records[key] = storage.getItem(key)!;
  }
  return JSON.stringify({ format: 'skimmer-pilot', schema: 1, records }, null, 2);
}

export function importPilot(storage: Storage, text: string): void {
  if (text.length > 2 * 1024 * 1024) throw Error('存档超过大小限制。');
  const save = JSON.parse(text);
  if (save?.format !== 'skimmer-pilot' || save.schema !== 1 || !save.records ||
      typeof save.records !== 'object' || Array.isArray(save.records)) throw Error('无效的飞行存档。');
  const entries = Object.entries(save.records);
  for (const [key, value] of entries) {
    if (!allowed(key) || typeof value !== 'string') throw Error('存档包含无效记录。');
    if (key.startsWith(prefix + 'best.')) {
      if (!Number.isFinite(Number(value)) || Number(value) < 0) throw Error('成绩记录无效。');
    } else if (!['transition-speed', 'selected-model.v1', 'active-pack'].includes(key.slice(prefix.length))) {
      const record = JSON.parse(value);
      if (!record || typeof record !== 'object' || Array.isArray(record)) throw Error('设置记录无效。');
    }
  }
  const undo = new Map<string, string | null>();
  try {
    for (const [key, value] of entries) {
      const previous = storage.getItem(key);
      if (key.startsWith(prefix + 'best.') && Number(previous) > Number(value)) continue;
      undo.set(key, previous);
      storage.setItem(key, value as string);
    }
  } catch (error) {
    for (const [key, old] of undo) {
      if (old === null) storage.removeItem(key);
      else storage.setItem(key, old);
    }
    throw error;
  }
}
