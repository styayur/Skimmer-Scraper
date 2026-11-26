import type { MusicSession } from '../audio/musicSession';

export function bindMusicPanel(session:MusicSession) {
  const panel=document.createElement('details');
  panel.innerHTML=`<summary>背景音乐</summary>
    <label><input type="checkbox" id="bgm-enabled"> 飞行配乐</label>
    <fieldset hidden>
      <label>音乐音量 <input id="bgm-volume" type="range" min="0" max="100" value="35"></label>
      <button type="button" id="bgm-next">下一首</button>
      <details><summary>音源与署名</summary><p>世界配乐由 Skimmer-Scraper 原创。</p>
        <label>本地曲目 <input type="file" accept="audio/*" multiple></label></details>
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
  return ()=>{if(panel.open && status.textContent!==session.status)status.textContent=session.status;};
}
