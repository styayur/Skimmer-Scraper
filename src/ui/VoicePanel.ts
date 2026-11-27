import { localizeDiagnostic } from '../i18n/diagnostics';
import { t, wingmateName } from '../i18n';
import type { GameAction } from '../flight/input';
import { COMPANION_PROFILES, type RadioLanguage } from '../ai/radioDialogue';
import { prepareLocalSpeech } from '../voice/browserSpeech';
import type { VoiceRadio } from '../voice/VoiceRadio';
import type { VoiceInput, VoiceOutput } from '../voice/voiceContracts';

const inputModes = `<option value="off">${t('ui.off')}</option><option value="local">${t('voicePanel.onDeviceRecognition')}</option><option value="deepseek">DeepSeek</option>`;
const status = document.getElementById('voice-status')!;
let dismiss = 0;

export const showVoiceStatus = (phase: string, message: string): void => {
  window.clearTimeout(dismiss);
  status.dataset.phase = phase;
  status.textContent = localizeDiagnostic(message);
  status.hidden = !message;
  if (phase === 'idle' && message) dismiss = window.setTimeout(() => { status.hidden = true; }, 4500);
};

export const bindVoicePanel = (voice: VoiceRadio, action: (action: GameAction) => boolean,
  changeLanguage: (language: RadioLanguage | undefined) => void) => {
  const panel = document.createElement('details');
  panel.className = 'voice-settings';
  panel.innerHTML = `<summary>${t('voicePanel.voiceRadio')}</summary>
    <div class="setting-heading"><label>${t('voicePanel.voiceInput')} <select id="voice-input">${inputModes}</select></label><button class="setting-help" type="button" aria-label="${t('voicePanel.voiceRadioHelp')}" data-help-section="guide-voice">?</button></div>
    <label>${t('voicePanel.wingmateSpeech')} <select id="voice-output"><option value="off">${t('ui.off')}</option><option value="local">${t('voicePanel.characterRadio')}</option>
      <option value="deepseek">DeepSeek</option></select></label>
    <label>${t('voicePanel.speechVolume')} <input id="voice-volume" type="range" min="0" max="100" step="1"></label>
    <label>${t('voicePanel.voiceLanguage')} <select id="voice-language"><option value="zh-CN">${t('voicePanel.mandarin')}</option><option value="en-US">English</option></select></label>
    <div id="voice-preview-row">
      <label>${t('voicePanel.previewWingmate')} <select id="voice-preview-agent">${COMPANION_PROFILES.map(({ id }) =>
        `<option value="${id}">${wingmateName(id)}</option>`).join('')}</select></label>
      <button id="voice-preview" type="button" class="utility-button">${t('voicePanel.preview')}</button>
      <p id="voice-preview-status" class="setting-status" role="status"></p>
    </div>
    <div><button id="voice-language-prepare" class="utility-button" type="button">${t('voicePanel.prepareLocalLanguagePack')}</button></div>
    <p id="voice-language-status" class="setting-status" role="status"></p>
    <p id="voice-output-status" class="setting-status" role="status"></p><p id="voice-usage" class="setting-status" hidden></p>`;
  document.querySelector('#advanced-flight-settings')!.append(panel);
  const input = panel.querySelector<HTMLSelectElement>('#voice-input')!;
  const output = panel.querySelector<HTMLSelectElement>('#voice-output')!;
  const language = panel.querySelector<HTMLSelectElement>('#voice-language')!;
  const volume = panel.querySelector<HTMLInputElement>('#voice-volume')!;
  const previewRow = panel.querySelector<HTMLElement>('#voice-preview-row')!;
  const previewAgent = panel.querySelector<HTMLSelectElement>('#voice-preview-agent')!;
  const previewButton = panel.querySelector<HTMLButtonElement>('#voice-preview')!;
  const previewStatus = panel.querySelector<HTMLElement>('#voice-preview-status')!;
  const prepare = panel.querySelector<HTMLButtonElement>('#voice-language-prepare')!;
  const languageStatus = panel.querySelector('#voice-language-status')!;
  const outputStatus = panel.querySelector<HTMLElement>('#voice-output-status')!;
  const usage = panel.querySelector<HTMLElement>('#voice-usage')!;
  const initial = voice.preferences;
  input.value = initial.input;
  output.value = initial.output;
  language.value = initial.language;
  volume.valueAsNumber = Math.round(initial.volume * 100);
  const updateControls = () => {
    prepare.hidden = input.value !== 'local';
    volume.disabled = output.value === 'off';
    previewRow.hidden = output.value !== 'local';
    usage.hidden = input.value !== 'deepseek' && output.value !== 'deepseek';
  };
  const configure = () => {
    voice.configure({ input: input.value as VoiceInput, output: output.value as VoiceOutput,
      language: language.value as RadioLanguage, localFallback: true,
      volume: volume.valueAsNumber / 100 });
    changeLanguage(voice.preferredLanguage);
    updateControls();
  };
  for (const field of [input, output, language, volume]) field.addEventListener('change', () => configure());
  previewButton.addEventListener('click', () => { void voice.previewVoice(Number(previewAgent.value)); });
  previewAgent.addEventListener('change', () => voice.cancelPreview());
  panel.addEventListener('toggle', () => { if (!panel.open) voice.cancelPreview(); });
  updateControls();
  changeLanguage(voice.preferredLanguage);
  prepare.addEventListener('click', async () => {
    const selected = language.value as RadioLanguage;
    prepare.disabled = true;
    languageStatus.textContent = t('voicePanel.checkingOrDownloadingTheLocalLanguagePack');
    try {
      const available = await prepareLocalSpeech(selected);
      if (selected === language.value) languageStatus.textContent = available ? t('voicePanel.localLanguagePackReady') : t('voicePanel.localLanguagePackUnavailablePressTTo');
    } catch { if (selected === language.value) languageStatus.textContent = t('voicePanel.languagePackInstallationFailed'); }
    finally { prepare.disabled = false; }
  });

  const button = document.querySelector<HTMLButtonElement>('#voice-ptt')!;
  let pointer = -1;
  button.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || !action('voice-start')) return;
    event.preventDefault();
    pointer = event.pointerId;
    button.setPointerCapture(pointer);
  });
  const release = (event: PointerEvent, send: boolean) => {
    if (event.pointerId !== pointer) return;
    pointer = -1;
    action(send ? 'voice-stop' : 'voice-cancel');
  };
  button.addEventListener('pointerup', event => release(event, true));
  button.addEventListener('pointercancel', event => release(event, false));
  button.addEventListener('lostpointercapture', event => release(event, false));
  button.addEventListener('contextmenu', event => event.preventDefault());

  return (inFlight: boolean) => {
    const hidden = !inFlight || voice.inputMode === 'off';
    if (button.hidden !== hidden) button.hidden = hidden;
    if (!inFlight && !status.hidden) showVoiceStatus('idle', '');
    if (!panel.open || !panel.getClientRects().length) { voice.cancelPreview(); return; }
    const { cloud, limits, lastOutputError, lastOutputFallback, preview } = voice.snapshot();
    const isPreparing = preview.phase === 'preparing';
    const isPlaying = preview.phase === 'playing';
    const previewLabel = isPreparing || isPlaying ? t('voicePanel.cancelPreview') : t('voicePanel.preview');
    if (previewButton.textContent !== previewLabel) previewButton.textContent = previewLabel;
    previewButton.disabled = volume.valueAsNumber === 0;
    const previewMessage = preview.error ? `${t('voicePanel.previewFailedTryAgain')} ${preview.text ?? ''}`
      : isPreparing ? t('voicePanel.preparingPreview') : isPlaying ? preview.text ?? '' : preview.phase === 'completed' ? t('voicePanel.previewComplete')
      : preview.phase === 'cancelled' ? t('voicePanel.previewCancelled') : '';
    if (previewStatus.textContent !== previewMessage) previewStatus.textContent = previewMessage;
    const message = lastOutputFallback ? t('voicePanel.playedALocalEventClip') : lastOutputError ? t('voicePanel.seeRadioSubtitles') : '';
    if (outputStatus.textContent !== message) outputStatus.textContent = message;
    if (usage.hidden) return;
    const text = t('voicePanel.deepSeekUsage', { asrRequests: cloud.asrRequests, maxAsrRequests: limits.asrRequests, asrSeconds: cloud.asrSeconds, maxAsrSeconds: limits.asrSeconds, ttsRequests: cloud.ttsRequests, maxTtsRequests: limits.ttsRequests, ttsCharacters: cloud.ttsCharacters, maxTtsCharacters: limits.ttsCharacters });
    if (usage.textContent !== text) usage.textContent = text;
  };
};
