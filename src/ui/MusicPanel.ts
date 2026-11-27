import { localizeDiagnostic } from '../i18n/diagnostics';
import { t } from '../i18n';
import type { MusicSession } from '../audio/musicSession';

export function bindMusicPanel(session:MusicSession) {
  const panel=document.createElement('details');
  panel.innerHTML=`<summary>${t('musicPanel.backgroundMusic')}</summary>
    <label><input type="checkbox" id="bgm-enabled"> ${t('musicPanel.flightSoundtrack')}</label>
    <fieldset hidden>
      <label>${t('musicPanel.musicVolume')} <input id="bgm-volume" type="range" min="0" max="100" value="35"></label>
      <button type="button" id="bgm-next">${t('musicPanel.nextTrack')}</button>
      <details><summary>${t('musicPanel.sourcesAndCredits')}</summary><p>${t('musicPanel.originalWorldScoresBySkimmerScraper')}</p>
        <label>${t('musicPanel.localTracks')} <input type="file" accept="audio/*" multiple></label></details>
      <p role="status"></p>
    </fieldset>`;
  document.querySelector('#advanced-flight-settings')!.append(panel);
  const enabled=panel.querySelector<HTMLInputElement>('#bgm-enabled')!;
  const controls=panel.querySelector('fieldset')!;
  const volume=panel.querySelector<HTMLInputElement>('#bgm-volume')!;
  const files=panel.querySelector<HTMLInputElement>('input[type=file]')!;
  const status=panel.querySelector('[role=status]')!;
  enabled.onchange=()=>{session.setEnabled(enabled.checked);controls.hidden=!enabled.checked;};
  volume.oninput=()=>session.setVolume(volume.valueAsNumber/100);
  files.onchange=()=>session.setFiles(Array.from(files.files??[]));
  panel.querySelector<HTMLButtonElement>('#bgm-next')!.onclick=()=>session.next();
  return () => {
    if (!panel.open) return;
    const message = localizeDiagnostic(session.status);
    if (status.textContent !== message) status.textContent = message;
  };
}
