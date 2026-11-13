import type { CameraMode, VisualStimulation } from '../config/experience';
export type { CameraMode } from '../config/experience';

export interface GamePreferences {
  cameraMode: CameraMode;
  visualStimulation: VisualStimulation;
  recordingHintDismissed: boolean;
}

const KEY = 'skimmer-scraper.preferences.v2';

export const DEFAULT_PREFERENCES: GamePreferences = Object.freeze({
  cameraMode: 'chase',
  visualStimulation: 'standard',
  recordingHintDismissed: false,
});

export const loadPreferences = (storage: Storage = window.localStorage): GamePreferences => {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    const parsed = JSON.parse(raw) as Partial<GamePreferences>;
    return {
      cameraMode: parsed.cameraMode === 'cockpit' ? 'cockpit' : 'chase',
      visualStimulation: parsed.visualStimulation === 'reduced' ? 'reduced' : 'standard',
      recordingHintDismissed: parsed.recordingHintDismissed === true,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
};

export const savePreferences = (
  preferences: GamePreferences,
  storage: Storage = window.localStorage,
): void => {
  try {
    storage.setItem(KEY, JSON.stringify(preferences));
  } catch {
    // Preferences are optional and must never prevent play.
  }
};

