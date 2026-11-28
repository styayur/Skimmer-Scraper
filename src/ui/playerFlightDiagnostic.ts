import type { Vec3 } from '../core/math';
import type { GlideState } from '../flight/surfaceGlide';
import type { WorldManifest } from '../world/imports/worldManifest';
import { version } from '../../package.json';

interface Observation {
  time: number;
  position: Vec3;
  velocity: Vec3;
  speed: number;
  phase: GlideState['phase'];
  normal: Vec3 | null;
  clearance: number | null;
  impacts: number;
  mode: string;
  failureReason?: string;
  deployed: number;
}

const stride = 8;
const capacity = 1801;

interface Provenance {
  version: string;
  sourceCommit: string | null;
  dirty?: boolean;
  binary?: { url: string; bytes: number; sha256: string } | null;
}

/** Two minutes at 15 Hz in volatile memory for the active imported world. */
export class PlayerFlightDiagnostic {
  private trace: Observation[] = [];
  private tick = 0;
  private truncated = false;
  private boost = false;

  public reset(): void {
    this.trace = [];
    this.tick = 0;
    this.truncated = this.boost = false;
  }

  public due(boost: boolean): boolean {
    this.boost ||= boost;
    if (this.tick++ % stride !== 0) return false;
    if (this.trace.length < capacity) return true;
    this.truncated = true;
    return false;
  }

  public add(sample: Observation): void { this.trace.push(sample); }
  public get available(): boolean { return this.trace.length >= 2; }

  public report(manifest: WorldManifest, spawn: Vec3, layoutSeed: string, reopened: boolean) {
    if (!this.available) return null;
    const provenance = document.querySelector<HTMLMetaElement>('meta[name="skimmer-flight-build"]');
    const { binary = null, ...build }: Provenance = provenance
      ? JSON.parse(provenance.content) : { version, sourceCommit: null };
    const imported = { id: manifest.id, spawn, variant: manifest.variant?.seed ?? 0,
      bounds: manifest.bounds, collisionTriangles: manifest.collisionTriangles };
    let minimum: number | null = null;
    let glideMeters = 0;
    this.trace.forEach((row, i) => {
      if (row.phase !== 'GLIDING') return;
      if (row.clearance !== null) minimum = Math.min(minimum ?? Infinity, row.clearance);
      const previous = this.trace[i - 1];
      if (previous?.phase === 'GLIDING') glideMeters += Math.hypot(row.position.x - previous.position.x,
        row.position.y - previous.position.y, row.position.z - previous.position.z);
    });
    return { format: 'flight-diagnostic-2', sha256: manifest.id, build, binary, browser: navigator.userAgent,
      world: { sha256: manifest.id, bytes: manifest.bytes, layoutSeed }, imported, replayed: reopened ? imported : null,
      recording: { kind: 'player', truncated: this.truncated }, experiment: null, returnedToBuiltin: false,
      outcome: 'player-observation', input: 'player controls', fixedHz: 120, sampleMs: stride * 1000 / 120,
      releaseTick: null, boost: this.boost, errors: [], trace: this.trace,
      metrics: { sampledGlideM: glideMeters, minimumSampledGlideClearanceM: minimum,
        shieldImpacts: this.trace.at(-1)!.impacts } };
  }
}
