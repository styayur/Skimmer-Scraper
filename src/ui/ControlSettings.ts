import { loadControls, normalizeControls, saveControls, type ControlSettings } from '../flight/controlSettings';

export const bindControlSettings = (change: (settings: ControlSettings) => void): void => {
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
};
