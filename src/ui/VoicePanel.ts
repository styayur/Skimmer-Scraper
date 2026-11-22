import type { GameAction } from '../flight/input';
import { COMPANION_PROFILES, type RadioLanguage } from '../ai/radioDialogue';
import { listSystemVoices, prepareLocalSpeech } from '../voice/browserSpeech';
import type { VoiceRadio } from '../voice/VoiceRadio';
import type { VoiceInput, VoiceOutput, VoiceOverrides } from '../voice/voiceContracts';

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
    <label>伴机播报 <select id="voice-output"><option value="off">关闭</option><option value="local">系统语音</option>
      ${voice.hasHighQuality ? '<option value="high-quality">本地高质量语音</option>' : ''}
      <option value="deepseek">DeepSeek</option></select></label>
    <label>语言 <select id="voice-language"><option value="zh-CN">中文</option><option value="en-US">English</option></select></label>
    <label id="voice-fallback-row"><input type="checkbox" id="voice-fallback" checked> 播报失败时使用系统语音</label>
    <details id="voice-identities"><summary>伴机声线</summary>
      ${COMPANION_PROFILES.map(profile => `<label>${profile.callsign} <select id="voice-agent-${profile.id}"></select></label>`).join('')}
    </details>
    <div><button id="voice-language-prepare" class="utility-button" type="button">准备本机语言包</button></div>
    <p id="voice-language-status" class="setting-status" role="status"></p>
    <p id="voice-output-status" class="setting-status" role="status"></p><p id="voice-usage" class="setting-status" hidden></p>`;
  document.querySelector('#advanced-flight-settings')!.append(panel);
  const input = panel.querySelector<HTMLSelectElement>('#voice-input')!;
  const output = panel.querySelector<HTMLSelectElement>('#voice-output')!;
  const language = panel.querySelector<HTMLSelectElement>('#voice-language')!;
  const fallback = panel.querySelector<HTMLInputElement>('#voice-fallback')!;
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
    panel.querySelector<HTMLElement>('#voice-fallback-row')!.hidden = output.value === 'off' || output.value === 'local';
    usage.hidden = input.value !== 'deepseek' && output.value !== 'deepseek';
  };
  const configure = (voices: VoiceOverrides = voice.preferences.voices) => {
    voice.configure({ input: input.value as VoiceInput, output: output.value as VoiceOutput,
      language: language.value as RadioLanguage, localFallback: fallback.checked, voices });
    changeLanguage(voice.preferredLanguage);
    updateControls();
  };
  for (const field of [input, output, language, fallback]) field.addEventListener('change', () => configure());
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
    if (!panel.open || !panel.getClientRects().length) return;
    const { cloud, limits, lastOutputError, lastOutputFallback } = voice.snapshot();
    const message = lastOutputError === 'local-tts-unavailable' ? '系统缺少可用的本机音色。'
      : lastOutputFallback === 'local' ? '已切换到系统语音。'
      : lastOutputError ? '播报暂不可用，请查看字幕。' : '';
    if (outputStatus.textContent !== message) outputStatus.textContent = message;
    if (usage.hidden) return;
    const text = `本页 DeepSeek 用量 · 转写 ${cloud.asrRequests}/${limits.asrRequests} 次，${cloud.asrSeconds}/${limits.asrSeconds} 秒 · 播报 ${cloud.ttsRequests}/${limits.ttsRequests} 次，${cloud.ttsCharacters}/${limits.ttsCharacters} 计费字符`;
    if (usage.textContent !== text) usage.textContent = text;
  };
};
