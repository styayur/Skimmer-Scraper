import { clamp } from '../core/math';
import type { FlightInput } from './flightModel';

export interface ControlSettings {
  profile: 'classic' | 'precision';
  sensitivity: number;
  curve: number;
  deadZone: number;
  invertPitch: boolean;
  invertRoll: boolean;
  invertYaw: boolean;
  autoCoordinate: boolean;
  levelAssist: number;
  pitchAxis: number;
  rollAxis: number;
  yawAxis: number;
  boostButton: number;
  cameraButton: number;
  pauseButton: number;
  retryButton: number;
}
export const DEFAULT_CONTROLS: Readonly<ControlSettings> = Object.freeze({
  profile: 'precision', sensitivity: 1, curve: 1.4, deadZone: 0.14,
  invertPitch: false, invertRoll: false, invertYaw: false,
  autoCoordinate: true, levelAssist: 1,
  pitchAxis: 1, rollAxis: 0, yawAxis: 2, boostButton: 7,
  cameraButton: 3, pauseButton: 9, retryButton: 2,
});
export const normalizeControls = (value: Partial<ControlSettings> = {}): ControlSettings => {
  const result = { ...DEFAULT_CONTROLS };
  const numeric = (key: keyof ControlSettings, min: number, max: number): void => {
    const n = value[key];
    if (typeof n === 'number' && Number.isFinite(n)) (result as unknown as Record<string, unknown>)[key] = clamp(n, min, max);
  };
  numeric('sensitivity', 0.2, 2); numeric('curve', 1, 3); numeric('deadZone', 0, 0.4);
  numeric('levelAssist', 0, 2);
  for (const key of ['pitchAxis','rollAxis','yawAxis','boostButton','cameraButton','pauseButton','retryButton'] as const) {
    numeric(key, 0, key.endsWith('Axis') ? 7 : 31); result[key] = Math.round(result[key]);
  }
  for (const key of ['invertPitch','invertRoll','invertYaw','autoCoordinate'] as const) {
    if (typeof value[key] === 'boolean') result[key] = value[key]!;
  }
  result.profile = value.profile === 'classic' ? 'classic' : 'precision';
  return result;
};
export const shapeAxis = (raw: number, deadZone: number, curve: number, sensitivity: number): number => {
  if (!Number.isFinite(raw) || Math.abs(raw) <= deadZone) return 0;
  return Math.sign(raw) * clamp(((Math.abs(raw) - deadZone) / (1 - deadZone)) ** curve * sensitivity, 0, 1);
};
export const shapeInput = (input: FlightInput, settings: ControlSettings, gamepad = false): FlightInput => {
  const axis = (value: number, inverted: boolean): number => shapeAxis(value,
    gamepad ? settings.deadZone : 0, settings.curve, settings.sensitivity) * (inverted ? -1 : 1);
  return { pitch: axis(input.pitch, settings.invertPitch), roll: axis(input.roll, settings.invertRoll),
    yaw: axis(input.yaw, settings.invertYaw), boost: input.boost };
};
const KEY = 'skimmer-scraper.controls.v3';
export const loadControls = (): ControlSettings => {
  try { return normalizeControls(JSON.parse(localStorage.getItem(KEY) ?? '{}')); } catch { return normalizeControls(); }
};
export const saveControls = (settings: ControlSettings): void => {
  try { localStorage.setItem(KEY, JSON.stringify(normalizeControls(settings))); } catch { /* optional */ }
};
