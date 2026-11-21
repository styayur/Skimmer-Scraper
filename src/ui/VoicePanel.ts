import type { GameAction } from '../flight/input';
import { prepareLocalSpeech, type RadioLanguage } from '../voice/browserSpeech';
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

export const bindVoicePanel = (voice: VoiceRadio, action: (action: GameAction) => boolean) => {
  const panel = document.createElement('details');
  panel.className = 'voice-settings';
  panel.innerHTML = `<summary>语音电台</summary>
    <p>启用输入后，按住 V 或手柄指定键讲话，松开发送，Esc 取消。单次最多 12 秒，录音仅用于本次转写。</p>
    <p>DeepSeek 模式使用模型协作中的 Key。音频或播报文本直接发往 DeepSeek，服务商可能收费。本机识别和播报由设备处理。</p>
    <label>语音输入 <select id="voice-input">${modes}</select></label>
    <label>伴机语音播报 <select id="voice-output">${modes}</select></label>
    <label>本机输入语言 <select id="voice-language"><option value="zh-CN">中文</option><option value="en-US">English</option></select></label>
    <label><input type="checkbox" id="voice-fallback" checked> DeepSeek 播报失败时使用本机语音</label>
    <div><button id="voice-language-prepare" type="button">准备本机语言包</button></div>
    <p id="voice-language-status" role="status"></p><p id="voice-usage"></p>`;
  document.querySelector('#advanced-flight-settings')!.append(panel);
  const input = panel.querySelector<HTMLSelectElement>('#voice-input')!;
  const output = panel.querySelector<HTMLSelectElement>('#voice-output')!;
  const language = panel.querySelector<HTMLSelectElement>('#voice-language')!;
  const fallback = panel.querySelector<HTMLInputElement>('#voice-fallback')!;
  const prepare = panel.querySelector<HTMLButtonElement>('#voice-language-prepare')!;
  const languageStatus = panel.querySelector('#voice-language-status')!;
  const usage = panel.querySelector('#voice-usage')!;
  const configure = () => voice.configure({ input: input.value as VoiceMode, output: output.value as VoiceMode,
    language: language.value as RadioLanguage, localFallback: fallback.checked });
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
    if (!panel.open || !panel.getClientRects().length) return;
    const { cloud, limits } = voice.snapshot();
    const text = `本页 DeepSeek 用量 · 转写 ${cloud.asrRequests}/${limits.asrRequests} 次，${cloud.asrSeconds}/${limits.asrSeconds} 秒 · 播报 ${cloud.ttsRequests}/${limits.ttsRequests} 次，${cloud.ttsCharacters}/${limits.ttsCharacters} 计费字符`;
    if (usage.textContent !== text) usage.textContent = text;
  };
};
