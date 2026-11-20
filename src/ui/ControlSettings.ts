import { loadControls, normalizeControls, saveControls, type ControlSettings } from '../flight/controlSettings';
import { loadCameraAnchor, saveCameraAnchor } from '../model/cameraAnchors';
import type { Vec3 } from '../core/math';

export const bindControlSettings = (change: (settings: ControlSettings) => void,
  aircraft: () => string, anchorChanged: (anchor: Vec3) => void): void => {
  let settings = loadControls();
  const fields = document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-control]');
  fields.forEach(field => {
    const key = field.dataset.control as keyof ControlSettings;
    if (field instanceof HTMLInputElement && field.type === 'checkbox') field.checked = Boolean(settings[key]);
    else field.value = String(settings[key]);
    field.addEventListener('change', () => {
      const value = field instanceof HTMLInputElement && field.type === 'checkbox' ? field.checked
        : key === 'profile' ? field.value : Number(field.value);
      settings = normalizeControls({ ...settings, [key]: value }); saveControls(settings); change(settings);
    });
  });
  document.querySelector('#rules-open')!.addEventListener('click', () => {
    const anchor = loadCameraAnchor(aircraft()) ?? { x: 0, y: 0.72, z: -2.35 };
    for (const axis of ['x','y','z'] as const) (document.querySelector(`#anchor-${axis}`) as HTMLInputElement).value = String(anchor[axis]);
  });
  document.querySelector('#anchor-save')!.addEventListener('click', () => {
    const read = (axis: string): number => Number((document.querySelector(`#anchor-${axis}`) as HTMLInputElement).value);
    const anchor = { x: read('x'), y: read('y'), z: read('z') };
    saveCameraAnchor(aircraft(), anchor);
    const saved = loadCameraAnchor(aircraft()); if (saved) anchorChanged(saved);
  });
};
