import type { GameAction } from '../flight/input';
import type { RadioLanguage } from '../ai/radioDialogue';
import { prepareLocalSpeech } from '../voice/browserSpeech';
import type { VoiceMode, VoiceRadio } from '../voice/VoiceRadio';

const modes = '<option value="off">关闭</option><option value="local">本机</option><option value="deepseek">DeepSeek</option>';
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
    <div class="setting-heading"><label>语音输入 <select id="voice-input">${modes}</select></label><button class="setting-help" type="button" aria-label="语音电台帮助" data-help-section="guide-voice">?</button></div>
    <label>伴机播报 <select id="voice-output">${modes}</select></label>
    <label>语言 <select id="voice-language"><option value="zh-CN">中文</option><option value="en-US">English</option></select></label>
    <label><input type="checkbox" id="voice-fallback" checked> DeepSeek 播报失败时使用本机语音</label>
    <div><button id="voice-language-prepare" class="utility-button" type="button">准备本机语言包</button></div>
    <p id="voice-language-status" class="setting-status" role="status"></p><p id="voice-usage" class="setting-status" hidden></p>`;
  document.querySelector('#advanced-flight-settings')!.append(panel);
  const input = panel.querySelector<HTMLSelectElement>('#voice-input')!;
  const output = panel.querySelector<HTMLSelectElement>('#voice-output')!;
  const language = panel.querySelector<HTMLSelectElement>('#voice-language')!;
  const fallback = panel.querySelector<HTMLInputElement>('#voice-fallback')!;
  const prepare = panel.querySelector<HTMLButtonElement>('#voice-language-prepare')!;
  const languageStatus = panel.querySelector('#voice-language-status')!;
  const usage = panel.querySelector<HTMLElement>('#voice-usage')!;
  const configure = () => {
    voice.configure({ input: input.value as VoiceMode, output: output.value as VoiceMode,
      language: language.value as RadioLanguage, localFallback: fallback.checked });
    changeLanguage(voice.preferredLanguage);
    usage.hidden = input.value !== 'deepseek' && output.value !== 'deepseek';
  };
  for (const field of [input, output, language, fallback]) field.addEventListener('change', configure);
  language.addEventListener('change', () => { languageStatus.textContent = ''; });
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
    if (usage.hidden || !panel.open || !panel.getClientRects().length) return;
    const { cloud, limits } = voice.snapshot();
    const text = `本页 DeepSeek 用量 · 转写 ${cloud.asrRequests}/${limits.asrRequests} 次，${cloud.asrSeconds}/${limits.asrSeconds} 秒 · 播报 ${cloud.ttsRequests}/${limits.ttsRequests} 次，${cloud.ttsCharacters}/${limits.ttsCharacters} 计费字符`;
    if (usage.textContent !== text) usage.textContent = text;
  };
};
