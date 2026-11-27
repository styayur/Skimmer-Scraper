import { t } from '../i18n';
import type { Vec3 } from '../core/math';
import {
  saveCameraAnchor, validCameraAnchor, type AnchorPreset, type CameraAnchorSetting, type RecommendedAnchorPreset,
} from '../model/cameraAnchors';

interface Hooks {
  aircraft(): string;
  current(): CameraAnchorSetting;
  recommend(preset: RecommendedAnchorPreset): Vec3;
  preview(anchor: Vec3 | null): void;
  apply(): void;
}

export const bindCameraAnchorSettings = (hooks: Hooks): void => {
  const panel = document.querySelector<HTMLElement>('#rules-panel')!;
  const advanced = document.querySelector<HTMLDetailsElement>('#advanced-flight-settings')!;
  const details = document.querySelector<HTMLDetailsElement>('#camera-anchor-settings')!;
  const preset = document.querySelector<HTMLSelectElement>('#anchor-preset')!;
  const preview = document.querySelector<HTMLInputElement>('#anchor-preview')!;
  const message = document.querySelector<HTMLElement>('#anchor-message')!;
  const coordinates = document.querySelector<HTMLElement>('#anchor-coordinates')!;
  const x = document.querySelector<HTMLInputElement>('#anchor-x')!;
  const y = document.querySelector<HTMLInputElement>('#anchor-y')!;
  const z = document.querySelector<HTMLInputElement>('#anchor-z')!;
  const read = (): Vec3 => ({ x: x.valueAsNumber, y: y.valueAsNumber, z: z.valueAsNumber });
  const refreshPreview = (): void => {
    const anchor = read();
    hooks.preview(!panel.hidden && advanced.open && details.open && preview.checked && validCameraAnchor(anchor) ? anchor : null);
  };
  const show = (setting: CameraAnchorSetting): void => {
    preset.value = setting.preset;
    x.value = String(setting.anchor.x);
    y.value = String(setting.anchor.y);
    z.value = String(setting.anchor.z);
    coordinates.hidden = setting.preset !== 'custom';
    refreshPreview();
  };
  panel.addEventListener('skimmer:open', () => {
    message.textContent = '';
    show(hooks.current());
  });
  panel.addEventListener('skimmer:close', () => {
    preview.checked = false;
    hooks.preview(null);
  });
  panel.addEventListener('skimmer:suspend', () => hooks.preview(null));
  panel.addEventListener('skimmer:restore', refreshPreview);
  advanced.addEventListener('toggle', refreshPreview);
  details.addEventListener('toggle', refreshPreview);
  preview.addEventListener('change', refreshPreview);
  preset.addEventListener('change', () => {
    const next = preset.value as AnchorPreset;
    show({ preset: next, anchor: next === 'custom' ? read() : hooks.recommend(next) });
  });
  document.querySelector('#anchor-recommend')!.addEventListener('click', () => {
    show({ preset: 'standard', anchor: hooks.recommend('standard') });
    message.textContent = t('cameraAnchorSettings.recommendedPositionLoadedSaveToApplyIt');
  });
  document.querySelector('#anchor-save')!.addEventListener('click', () => {
    const anchor = read();
    if (!validCameraAnchor(anchor)) {
      message.textContent = t('cameraAnchorSettings.enterAValueFrom8To8');
      return;
    }
    if (!saveCameraAnchor(hooks.aircraft(), { preset: preset.value as AnchorPreset, anchor })) {
      message.textContent = t('cameraAnchorSettings.theBrowserCouldNotSaveTheCockpit');
      return;
    }
    hooks.apply();
    refreshPreview();
    message.textContent = t('cameraAnchorSettings.cockpitPositionSavedForThisAircraft');
  });
  for (const field of [x, y, z]) field.addEventListener('input', refreshPreview);
};
