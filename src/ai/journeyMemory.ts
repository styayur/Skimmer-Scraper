import { missionTypes } from './missions';

export const JOURNEY_KEY = 'skimmer.journey-memory.v1';
const day = 86_400_000;
const maxEntries = 128;
const maxCharacters = 64 * 1024;
const realms = ['city', 'dragonspine', 'worldforge', 'kinetic-city', 'imported'] as const;
export type JourneyRealm = (typeof realms)[number];
export interface HistoricalWorld { realm: JourneyRealm; seed: number; fingerprint: number }

const details = {
  visit: ['visit'],
  landmark: ['island', 'dragon', 'structure'],
  maneuver: ['glide', 'crossing'],
  mission: missionTypes,
  rescue: ['survival-rescue'],
  dialogue: ['radio-contact'],
} as const;
export type JourneyEvent = keyof typeof details;
export type JourneyDetail = (typeof details)[JourneyEvent][number];
export interface Observation {
  id: string;
  at: number;
  world: HistoricalWorld;
  event: JourneyEvent;
  agent: number;
  detail: JourneyDetail;
}
export interface JourneyPreferences {
  enabled: boolean;
  shareWithModel: boolean;
  retentionDays: number;
  capacity: number;
}
interface Journal extends JourneyPreferences { version: 1; entries: Observation[] }
const defaults = (): Journal => ({
  version: 1, enabled: false, shareWithModel: false, retentionDays: 30, capacity: 64, entries: [],
});
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const int = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
const includes = <T extends string>(values: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (values as readonly string[]).includes(value);

function readObservation(value: unknown, earliest: number, now: number): Observation | undefined {
  if (!record(value) || !record(value.world) || !includes(realms, value.world.realm)
    || !int(value.world.seed, 0, 0xffffffff) || !int(value.world.fingerprint, 0, 0xffffffff)
    || !int(value.at, earliest, now) || !int(value.agent, 0, 3)
    || typeof value.id !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value.id)
    || typeof value.event !== 'string' || !Object.hasOwn(details, value.event)) return;
  const event = value.event as JourneyEvent;
  if (!includes<JourneyDetail>(details[event], value.detail)) return;
  const { realm, seed, fingerprint } = value.world;
  return { id: value.id, at: value.at, world: { realm, seed, fingerprint }, event, agent: value.agent, detail: value.detail };
}

function retained(journal: Journal, now: number): Observation[] {
  const ids = new Set<string>();
  return journal.entries.flatMap(item => {
    const entry = readObservation(item, Math.max(0, now - journal.retentionDays * day), now);
    if (!entry || ids.has(entry.id)) return [];
    ids.add(entry.id);
    return [entry];
  }).sort((a, b) => a.at - b.at).slice(-journal.capacity);
}

function decode(raw: string | null, now: number): Journal {
  if (raw === null) return defaults();
  if (raw.length > maxCharacters) throw Error();
  const data: unknown = JSON.parse(raw);
  if (!record(data) || data.version !== 1 || typeof data.enabled !== 'boolean'
    || typeof data.shareWithModel !== 'boolean' || !int(data.retentionDays, 1, 365)
    || !int(data.capacity, 1, maxEntries) || !Array.isArray(data.entries)) throw Error();
  const journal: Journal = {
    version: 1, enabled: data.enabled, shareWithModel: data.enabled && data.shareWithModel,
    retentionDays: data.retentionDays, capacity: data.capacity, entries: data.entries,
  };
  journal.entries = retained(journal, now);
  return journal;
}

// The model can choose an index into summaries. There is no spatial or persistent identifier on this wire.
export const shareableObservation = ({ world, event, agent, detail }: Observation) => ({
  realm: world.realm, event, agent, detail,
});
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Lock = (write: () => void) => Promise<void>;
const browserLock: Lock = async write => {
  if (typeof navigator !== 'undefined' && navigator.locks) await navigator.locks.request(JOURNEY_KEY, write);
  else write();
};

export class JourneyMemory {
  public unavailable = false;
  public constructor(
    private storage: () => Store = () => window.localStorage,
    private clock = Date.now,
    private lock: Lock = browserLock,
  ) {}

  public snapshot(): Journal {
    try {
      const journal = decode(this.storage().getItem(JOURNEY_KEY), this.clock());
      this.unavailable = false;
      return journal;
    } catch {
      this.unavailable = true;
      return defaults();
    }
  }

  private async change(edit: (journal: Journal, now: number) => void): Promise<boolean> {
    try {
      await this.lock(() => {
        const store = this.storage(), raw = store.getItem(JOURNEY_KEY), now = this.clock();
        const journal = decode(raw, now);
        edit(journal, now);
        journal.entries = retained(journal, now);
        const serialized = JSON.stringify(journal);
        if (raw !== serialized && (raw !== null || journal.enabled)) store.setItem(JOURNEY_KEY, serialized);
      });
      this.unavailable = false;
      return true;
    } catch {
      this.unavailable = true;
      return false;
    }
  }

  public prune() { return this.change(() => {}); }

  public configure(options: Partial<JourneyPreferences>) {
    return this.change(journal => {
      if (typeof options.enabled === 'boolean') journal.enabled = options.enabled;
      if (typeof options.shareWithModel === 'boolean') journal.shareWithModel = options.shareWithModel;
      if (!journal.enabled) journal.shareWithModel = false;
      if (int(options.retentionDays, 1, 365)) journal.retentionDays = options.retentionDays;
      if (int(options.capacity, 1, maxEntries)) journal.capacity = options.capacity;
    });
  }

  public remember(world: HistoricalWorld, event: JourneyEvent, detail: JourneyDetail, agent: number) {
    if (!this.snapshot().enabled) return Promise.resolve(false);
    return this.change((journal, now) => {
      if (!journal.enabled) return;
      journal.entries.push({ id: crypto.randomUUID(), at: now, world, event, agent, detail });
    });
  }

  public forget(id: string) {
    return this.change(journal => { journal.entries = journal.entries.filter(entry => entry.id !== id); });
  }
  public async clear() {
    // An explicit erase also works for an unreadable record. Ordinary reads preserve future schemas.
    try {
      await this.lock(() => {
        const store = this.storage(), raw = store.getItem(JOURNEY_KEY);
        if (raw === null) return;
        let journal: Journal;
        try { journal = decode(raw, this.clock()); }
        catch { store.removeItem(JOURNEY_KEY); return; }
        journal.entries = [];
        store.setItem(JOURNEY_KEY, JSON.stringify(journal));
      });
      this.unavailable = false;
      return true;
    } catch {
      this.unavailable = true;
      return false;
    }
  }
}
