import type * as THREE from 'three';
import {
  loadAircraftGlb,
  readAndInspectGlb,
  type NormalizedAircraft,
} from './glb';
import { ModelStore, type StoredAircraftModel } from './modelStore';

export const BUILT_IN_AIRCRAFT_ID = 'procedural';
const SELECTED_KEY = 'skimmer-scraper.selected-model.v1';
const MAX_LOCAL_MODELS = 24;

export interface AircraftOption {
  id: string;
  name: string;
  meta: string;
  tag: string;
}

const saveSelected = (id: string): void => {
  try {
    localStorage.setItem(SELECTED_KEY, id);
  } catch {
    // Selection persistence is optional.
  }
};

const loadSelected = (): string => {
  try {
    return localStorage.getItem(SELECTED_KEY) ?? BUILT_IN_AIRCRAFT_ID;
  } catch {
    return BUILT_IN_AIRCRAFT_ID;
  }
};

const formatBytes = (bytes: number): string => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

const makeId = (): string =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `glb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

const cleanName = (fileName: string): string => {
  const name = fileName.replace(/\.glb$/i, '').trim();
  return (name || 'Imported aircraft').slice(0, 48);
};

export class AircraftLibrary {
  private records: StoredAircraftModel[] = [];
  private selectedId = BUILT_IN_AIRCRAFT_ID;

  public constructor(private readonly store = new ModelStore()) {}

  public async initialize(): Promise<AircraftOption[]> {
    this.records = await this.store.list();
    const remembered = loadSelected();
    this.selectedId = remembered === BUILT_IN_AIRCRAFT_ID || this.records.some((record) => record.id === remembered)
      ? remembered
      : BUILT_IN_AIRCRAFT_ID;
    return this.options();
  }

  public options(): AircraftOption[] {
    return [
      {
        id: BUILT_IN_AIRCRAFT_ID,
        name: 'KITE-07',
        meta: '程序化 · 8 m · 内置',
        tag: 'BUILT-IN',
      },
      ...this.records.map((record) => ({
        id: record.id,
        name: record.name,
        meta: `${formatBytes(record.byteLength)} · ${Math.round(record.triangles / 1000)}k tris · 本地`,
        tag: 'LOCAL GLB',
      })),
    ];
  }

  public getSelectedId(): string {
    return this.selectedId;
  }

  public getSelectedRecord(): StoredAircraftModel | null {
    return this.records.find((record) => record.id === this.selectedId) ?? null;
  }

  public select(id: string): void {
    if (id !== BUILT_IN_AIRCRAFT_ID && !this.records.some((record) => record.id === id)) {
      throw new Error('Aircraft model is not present in local storage.');
    }
    this.selectedId = id;
    saveSelected(id);
  }

  public async importFile(file: File): Promise<AircraftOption[]> {
    if (this.records.length >= MAX_LOCAL_MODELS) {
      throw new Error(`本地机库最多保存 ${MAX_LOCAL_MODELS} 个 GLB 模型。`);
    }
    const { buffer, inspection } = await readAndInspectGlb(file);
    const record: StoredAircraftModel = {
      id: makeId(),
      name: cleanName(file.name),
      fileName: file.name,
      byteLength: buffer.byteLength,
      triangles: inspection.triangles,
      importedAt: Date.now(),
      yawOffset: Math.PI,
      data: buffer,
    };
    await this.store.put(record);
    this.records = [record, ...this.records];
    this.select(record.id);
    return this.options();
  }

  public async load(id = this.selectedId): Promise<NormalizedAircraft | null> {
    if (id === BUILT_IN_AIRCRAFT_ID) return null;
    const record = await this.store.get(id);
    if (!record) throw new Error('Aircraft model data is missing from local storage.');
    return loadAircraftGlb(record.data, record.yawOffset);
  }

  public async rotate(id: string): Promise<number> {
    const record = await this.store.get(id);
    if (!record) throw new Error('Aircraft model data is missing from local storage.');
    record.yawOffset += Math.PI;
    await this.store.put(record);
    this.records = this.records.map((entry) => entry.id === id ? record : entry);
    return record.yawOffset;
  }

  public async remove(id: string): Promise<AircraftOption[]> {
    if (id === BUILT_IN_AIRCRAFT_ID) throw new Error('内置机型不可移除。');
    const record = await this.store.get(id);
    if (record) await this.store.delete(id);
    this.records = this.records.filter((entry) => entry.id !== id);
    if (this.selectedId === id) this.select(BUILT_IN_AIRCRAFT_ID);
    return this.options();
  }

  public dispose(): void {
    this.store.close();
  }
}

export type LoadedAircraftRoot = THREE.Group;
