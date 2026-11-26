import type { GameAction } from '../flight/input';
import { COMPANION_PROFILES, type RadioLanguage } from '../ai/radioDialogue';
import { prepareLocalSpeech } from '../voice/browserSpeech';
import type { VoiceRadio } from '../voice/VoiceRadio';
import type { VoiceInput, VoiceOutput } from '../voice/voiceContracts';

const inputModes = '<option value="off">关闭</option><option value="local">本机识别</option><option value="deepseek">DeepSeek</option>';
const status = document.getElementById('voice-status')!;
let dismiss = 0;

export const showVoiceStatus = (phase: string, message: string): void => {
  window.clearTimeout(dismiss);
  status.dataset.phase = phase;
  status.textContent = message;
  status.hidden = !message;
  if (phase === 'idle' && message) dismiss = window.setTimeout(() => { status.hidden = true; }, 4500);
};

export const bindVoicePanel = (voice: VoiceRadio, action: (action: GameAction) => boolean,
  changeLanguage: (language: RadioLanguage | undefined) => void) => {
  const panel = document.createElement('details');
  panel.className = 'voice-settings';
  panel.innerHTML = `<summary>语音电台</summary>
    <div class="setting-heading"><label>语音输入 <select id="voice-input">${inputModes}</select></label><button class="setting-help" type="button" aria-label="语音电台帮助" data-help-section="guide-voice">?</button></div>
    <label>伴机播报 <select id="voice-output"><option value="off">关闭</option><option value="local">角色电台 · 英语短句</option>
      <option value="deepseek">DeepSeek</option></select></label>
    <label>发言音量 <input id="voice-volume" type="range" min="0" max="100" step="1"></label>
    <label>语言 <select id="voice-language"><option value="zh-CN">中文</option><option value="en-US">English</option></select></label>
    <div id="voice-preview-row">
      <label>试听伴机 <select id="voice-preview-agent">${COMPANION_PROFILES.map(({ id, callsign }) =>
        `<option value="${id}">${callsign}</option>`).join('')}</select></label>
      <button id="voice-preview" type="button" class="utility-button">试听</button>
      <p id="voice-preview-status" class="setting-status" role="status"></p>
    </div>
    <div><button id="voice-language-prepare" class="utility-button" type="button">准备本机语言包</button></div>
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
      volume: volume.valueAsNumber / 100, voices: {} });
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
    languageStatus.textContent = '正在检查或下载本机语言包…';
    try {
      const available = await prepareLocalSpeech(selected);
      if (selected === language.value) languageStatus.textContent = available ? '本机语言包已就绪。' : '本机语言包不可用。可以按 T 输入文字。';
    } catch { if (selected === language.value) languageStatus.textContent = '语言包安装失败。'; }
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
    const previewLabel = isPreparing || isPlaying ? '取消试听' : '试听';
    if (previewButton.textContent !== previewLabel) previewButton.textContent = previewLabel;
    previewButton.disabled = volume.valueAsNumber === 0;
    const previewMessage = preview.error ? '试听失败，请重试。'
      : isPreparing ? '正在准备试听…' : isPlaying ? '正在试听…' : preview.phase === 'completed' ? '试听完成。'
      : preview.phase === 'cancelled' ? '已取消试听。' : '';
    if (previewStatus.textContent !== previewMessage) previewStatus.textContent = previewMessage;
    const message = lastOutputFallback ? '已播放本地事件短句。' : lastOutputError ? '请查看电台字幕。' : '';
    if (outputStatus.textContent !== message) outputStatus.textContent = message;
    if (usage.hidden) return;
    const text = `本页 DeepSeek 用量 · 转写 ${cloud.asrRequests}/${limits.asrRequests} 次，${cloud.asrSeconds}/${limits.asrSeconds} 秒 · 播报 ${cloud.ttsRequests}/${limits.ttsRequests} 次，${cloud.ttsCharacters}/${limits.ttsCharacters} 计费字符`;
    if (usage.textContent !== text) usage.textContent = text;
  };
};
