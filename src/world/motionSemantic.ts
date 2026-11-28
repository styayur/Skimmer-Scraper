import type { Vec3 } from '../core/math';

const kinds = ['surface', 'route', 'landmark', 'socket', 'escape'] as const;
const capabilities = ['glide', 'guide', 'scout', 'release', 'observe'] as const;
export type SemanticKind = (typeof kinds)[number];
export type SemanticCapability = (typeof capabilities)[number];
export interface MotionSemantic {
  version: 1;
  id: string;
  kind: SemanticKind;
  capabilities: readonly SemanticCapability[];
}
export interface MotionSemanticCandidate {
  semantic: MotionSemantic;
  position: Vec3;
  lease: string;
}

/** Only this projection of glTF extras enters local planning. IDs stay on-device. */
export function readMotionSemantic(raw: unknown): MotionSemantic | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
  const value = raw as Record<string, unknown>;
  const kind = kinds.find(k => k === value.kind);
  if (value.version !== 1 || !kind || typeof value.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_./:-]{0,127}$/.test(value.id)
    || !Array.isArray(value.capabilities) || !value.capabilities.length || value.capabilities.length > capabilities.length) return;
  const accepted = capabilities.filter(cap => (value.capabilities as unknown[]).includes(cap));
  if (accepted.length !== value.capabilities.length) return;
  return { version: 1, id: value.id, kind, capabilities: accepted };
}
