import type { GameAction } from '../flight/input';
import { COMPANION_PROFILES, type RadioLanguage } from '../ai/radioDialogue';
import { listSystemVoices, prepareLocalSpeech } from '../voice/browserSpeech';
import type { VoiceRadio } from '../voice/VoiceRadio';
import type { VoiceInput, VoiceOutput, VoiceOverrides } from '../voice/voiceContracts';

const inputModes = '<option value="off">关闭</option><option value="local">本机识别</option><option value="deepseek">DeepSeek</option>';
const kokoroErrors: Record<string, string> = {
  'kokoro-download': '模型下载失败，请检查网络后重试。',
  'kokoro-device': '当前设备资源不足。',
  'kokoro-backend': '当前浏览器无法运行本地模型。',
  'kokoro-inference': '本地模型合成失败。',
  'kokoro-slow': '本地模型合成超时。',
  'kokoro-language': '本地高质量语音目前支持中文。',
  'kokoro-sentence-limit': '这条播报超过了本地模型的句长上限。',
  'local-tts-unavailable': '系统缺少可用的本机音色。',
  'playback-blocked': '浏览器未允许播放声音，请再试一次。',
};
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
    <label>伴机播报 <select id="voice-output"><option value="off">关闭</option><option value="local">系统语音</option>
      <option value="high-quality">本地高质量语音（下载中文模型）</option>
      <option value="deepseek">DeepSeek</option></select></label>
    <label>发言音量 <input id="voice-volume" type="range" min="0" max="100" step="1"></label>
    <label>语言 <select id="voice-language"><option value="zh-CN">中文</option><option value="en-US">English</option></select></label>
    <label id="voice-fallback-row"><input type="checkbox" id="voice-fallback" checked> 播报失败时使用系统语音</label>
    <details id="voice-identities"><summary>系统声线</summary>
      ${COMPANION_PROFILES.map(profile => `<label>${profile.callsign} <select id="voice-agent-${profile.id}"></select></label>`).join('')}
    </details>
    <div id="voice-preview-row">
      <label>试听伴机 <select id="voice-preview-agent">${COMPANION_PROFILES.map(({ id, callsign }) =>
        `<option value="${id}">${callsign}</option>`).join('')}</select></label>
      <button id="voice-preview" type="button" class="utility-button">试听</button>
      <button id="voice-unload" type="button" class="utility-button">卸载模型</button>
      <p id="voice-preview-status" class="setting-status" role="status"></p>
    </div>
    <div><button id="voice-language-prepare" class="utility-button" type="button">准备本机语言包</button></div>
    <p id="voice-language-status" class="setting-status" role="status"></p>
    <p id="voice-output-status" class="setting-status" role="status"></p><p id="voice-usage" class="setting-status" hidden></p>`;
  document.querySelector('#advanced-flight-settings')!.append(panel);
  const input = panel.querySelector<HTMLSelectElement>('#voice-input')!;
  const output = panel.querySelector<HTMLSelectElement>('#voice-output')!;
  const language = panel.querySelector<HTMLSelectElement>('#voice-language')!;
  const fallback = panel.querySelector<HTMLInputElement>('#voice-fallback')!;
  const volume = panel.querySelector<HTMLInputElement>('#voice-volume')!;
  const previewRow = panel.querySelector<HTMLElement>('#voice-preview-row')!;
  const previewAgent = panel.querySelector<HTMLSelectElement>('#voice-preview-agent')!;
  const previewButton = panel.querySelector<HTMLButtonElement>('#voice-preview')!;
  const unload = panel.querySelector<HTMLButtonElement>('#voice-unload')!;
  const previewStatus = panel.querySelector<HTMLElement>('#voice-preview-status')!;
  const prepare = panel.querySelector<HTMLButtonElement>('#voice-language-prepare')!;
  const languageStatus = panel.querySelector('#voice-language-status')!;
  const outputStatus = panel.querySelector<HTMLElement>('#voice-output-status')!;
  const usage = panel.querySelector<HTMLElement>('#voice-usage')!;
  const identities = panel.querySelector<HTMLDetailsElement>('#voice-identities')!;
  const fields = COMPANION_PROFILES.map(({ id }) => [id, panel.querySelector<HTMLSelectElement>(`#voice-agent-${id}`)!] as const);
  const initial = voice.preferences;
  input.value = initial.input;
  output.value = initial.output;
  language.value = initial.language;
  fallback.checked = initial.localFallback;
  volume.valueAsNumber = Math.round(initial.volume * 100);
  const renderOptions = () => {
    const voices = listSystemVoices(language.value as RadioLanguage);
    const overrides = voice.preferences.voices;
    for (const [id, field] of fields) {
      field.replaceChildren(new Option('自动', ''), ...voices.map(item => new Option(item.name, item.voiceURI)));
      field.value = voices.some(item => item.voiceURI === overrides[id]) ? overrides[id]! : '';
    }
  };
  const updateControls = () => {
    prepare.hidden = input.value !== 'local';
    identities.hidden = output.value === 'off';
    volume.disabled = output.value === 'off';
    previewRow.hidden = output.value !== 'local' && output.value !== 'high-quality';
    unload.hidden = output.value !== 'high-quality';
    panel.querySelector<HTMLElement>('#voice-fallback-row')!.hidden = output.value === 'off' || output.value === 'local';
    usage.hidden = input.value !== 'deepseek' && output.value !== 'deepseek';
  };
  const configure = (voices: VoiceOverrides = voice.preferences.voices) => {
    voice.configure({ input: input.value as VoiceInput, output: output.value as VoiceOutput,
      language: language.value as RadioLanguage, localFallback: fallback.checked,
      volume: volume.valueAsNumber / 100, voices });
    changeLanguage(voice.preferredLanguage);
    updateControls();
  };
  for (const field of [input, output, language, fallback, volume]) field.addEventListener('change', () => configure());
  previewButton.addEventListener('click', () => { void voice.previewVoice(Number(previewAgent.value)); });
  unload.addEventListener('click', () => voice.releaseHighQuality());
  previewAgent.addEventListener('change', () => voice.cancelPreview());
  panel.addEventListener('toggle', () => { if (!panel.open) voice.cancelPreview(); });
  for (const [agent, field] of fields) field.addEventListener('change', () => {
    const overrides = voice.preferences.voices;
    if (field.value) overrides[agent] = field.value;
    else delete overrides[agent];
    configure(overrides);
  });
  language.addEventListener('change', () => { languageStatus.textContent = ''; renderOptions(); });
  window.speechSynthesis?.addEventListener?.('voiceschanged', renderOptions);
  renderOptions();
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
    const { cloud, limits, lastOutputError, lastOutputFallback, kokoro, preview } = voice.snapshot();
    const isPreparing = preview.phase === 'preparing';
    const isPlaying = preview.phase === 'playing';
    const previewLabel = isPreparing || isPlaying ? '取消试听' : '试听';
    if (previewButton.textContent !== previewLabel) previewButton.textContent = previewLabel;
    previewButton.disabled = volume.valueAsNumber === 0;
    unload.disabled = !kokoro?.resident;
    const previewMessage = preview.error ? kokoroErrors[preview.error] ?? '试听失败，请重试。'
      : isPreparing ? '正在准备试听…' : isPlaying ? '正在试听…' : preview.phase === 'completed' ? '试听完成。'
      : preview.phase === 'cancelled' ? '已取消试听。' : '';
    if (previewStatus.textContent !== previewMessage) previewStatus.textContent = previewMessage;
    const backend = kokoro?.backend === 'webgpu' ? 'WebGPU' : kokoro?.backend === 'wasm' ? 'WASM' : '';
    const pending = kokoro?.phase === 'loading' ? `正在准备中文模型${backend ? ` · ${backend}` : ''}${
      kokoro.percent !== null ? ` · ${kokoro.percent}%` : ''}…` : '';
    const engineError = kokoro?.phase === 'error' ? kokoro.error : null;
    const error = engineError ?? lastOutputError;
    const message = output.value === 'high-quality' && pending ? pending
      : lastOutputFallback === 'local' ? '已切换到系统语音。'
      : error ? kokoroErrors[error] ?? (error === 'kokoro-loading' ? '下条播报将重新检查本地模型。' : '播报暂不可用，请查看字幕。')
      : output.value === 'high-quality' && kokoro?.resident ? `本地模型已就绪 · ${backend}` : '';
    if (outputStatus.textContent !== message) outputStatus.textContent = message;
    if (usage.hidden) return;
    const text = `本页 DeepSeek 用量 · 转写 ${cloud.asrRequests}/${limits.asrRequests} 次，${cloud.asrSeconds}/${limits.asrSeconds} 秒 · 播报 ${cloud.ttsRequests}/${limits.ttsRequests} 次，${cloud.ttsCharacters}/${limits.ttsCharacters} 计费字符`;
    if (usage.textContent !== text) usage.textContent = text;
  };
};
