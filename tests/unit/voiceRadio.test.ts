import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_MODEL_CONFIG } from '../../src/ai/contracts';
import { ModelClient } from '../../src/ai/modelClient';
import { DEFAULT_CONTROLS, normalizeControls } from '../../src/flight/controlSettings';
import { GamepadInputSource } from '../../src/flight/gamepad';
import type { GameAction } from '../../src/flight/input';
import { DeepSeekVoice, VOICE_LIMITS } from '../../src/voice/deepSeekVoice';
import { makeWave, MAX_MIC_SAMPLES, MIC_RATE } from '../../src/voice/wave';

const credential = 'unit-synthetic-voice-credential';
const clip = () => makeWave([new Int16Array(MIC_RATE)])!;
const signal = () => new AbortController().signal;

describe('voice recording and provider contracts', () => {
  it('produces bounded 16-bit mono WAV with a complete header and signed samples', async () => {
    const chunks = [Int16Array.from([-32768, 0, 32767]), new Int16Array(MAX_MIC_SAMPLES)];
    const output = makeWave(chunks)!;
    const bytes = await output.wave.arrayBuffer();
    const view = new DataView(bytes);
    expect(output.durationMs).toBe(12_000);
    expect(output.wave.type).toBe('audio/wav');
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('RIFF');
    expect(view.getUint32(4, true)).toBe(bytes.byteLength - 8);
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(MAX_MIC_SAMPLES * 2);
    expect([44, 46, 48].map(offset => view.getInt16(offset, true))).toEqual([-32768, 0, 32767]);
    expect(makeWave([new Int16Array(1000)])).toBeNull();
  });

  it('sends one bounded multipart WAV directly and reserves request/duration budgets across reconnect', async () => {
    const transport = vi.fn<typeof fetch>(async (input, init) => {
      expect(input).toBe('https://api.deepseek.com/v1/tools/asr');
      expect(init?.headers).toEqual({ Authorization: `Bearer ${credential}` });
      expect(init?.redirect).toBe('error');
      expect(init?.credentials).toBe('omit');
      expect((init?.body as FormData).get('file')).toMatchObject({ name: 'radio.wav', size: 32_044, type: 'audio/wav' });
      return Response.json({ text: '\n 二号侦察左侧。 ', duration_ms: 995 });
    });
    const model = new ModelClient(transport);
    model.connect(DEFAULT_MODEL_CONFIG, credential);
    const voice = new DeepSeekVoice(model);
    for (let attempt = 0; attempt < VOICE_LIMITS.asrRequests; attempt++) {
      expect(await voice.transcribe(clip(), signal())).toBe('二号侦察左侧。');
    }
    model.disconnect();
    model.connect(DEFAULT_MODEL_CONFIG, credential);
    await expect(voice.transcribe(clip(), signal())).rejects.toThrow('asr-budget');
    expect(transport).toHaveBeenCalledTimes(VOICE_LIMITS.asrRequests);
    expect(voice.snapshot()).toMatchObject({ asrRequests: VOICE_LIMITS.asrRequests, asrSeconds: VOICE_LIMITS.asrRequests, lastAudioMs: 995 });
    expect(JSON.stringify(voice.snapshot())).not.toContain(credential);
  });

  it('consumes HTTP PCM incrementally and cancels the provider request on disconnect', async () => {
    let active: AbortSignal | null = null;
    const transport = vi.fn<typeof fetch>(async (endpoint, init) => {
      expect(endpoint).toBe('https://api.deepseek.com/v1/tools/tts');
      expect(init?.headers).toEqual({ 'Content-Type': 'application/json', Authorization: `Bearer ${credential}` });
      expect(JSON.parse(String(init?.body))).toEqual({ text: 'Scout ahead.', voice_id: 'stella', format: 'pcm', filter_markdown: true });
      active = init?.signal ?? null;
      const stream = new ReadableStream({ start(controller) {
        controller.enqueue(new Uint8Array(301));
        controller.enqueue(new Uint8Array(599));
        controller.close();
      } });
      return new Response(stream, { headers: { 'Content-Type': 'audio/pcm' } });
    });
    const model = new ModelClient(transport);
    model.connect(DEFAULT_MODEL_CONFIG, credential);
    const voice = new DeepSeekVoice(model);
    const received: number[] = [];
    await voice.speak('Scout ahead.', 'stella', signal(), async chunk => { received.push(chunk.byteLength); });
    expect(received).toEqual([301, 599]);
    expect(voice.snapshot()).toMatchObject({ ttsRequests: 1, lastTtsBytes: 900 });
    expect(active).toHaveProperty('aborted', false);
    model.disconnect();
    expect(active).toHaveProperty('aborted', true);
    await expect(voice.speak('Scout ahead.', 'stella', signal(), async () => {})).rejects.toThrow('voice-disconnected');
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('rejects ASR credential echoes and does not send speech or its authorization to another provider', async () => {
    const transport = vi.fn<typeof fetch>(async () => Response.json({ text: credential, duration_ms: 1000 }));
    const model = new ModelClient(transport);
    const voice = new DeepSeekVoice(model);
    model.connect(DEFAULT_MODEL_CONFIG, credential);
    await expect(voice.transcribe(clip(), signal())).rejects.toThrow('invalid-asr');
    await expect(voice.speak(credential, 'tide', signal(), async () => {})).rejects.toThrow('sensitive-response');
    model.connect({ ...DEFAULT_MODEL_CONFIG, provider: 'custom', endpoint: 'https://example.com/chat', trusted: true }, credential);
    await expect(voice.transcribe(clip(), signal())).rejects.toThrow('voice-disconnected');
    expect(transport).toHaveBeenCalledTimes(1);
  });
});

describe('configurable gamepad push-to-talk', () => {
  it('starts and stops on button edges, cancels on disconnect, and respects other control assignments', () => {
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
    let pad: Gamepad | null = { id: 'Standard Gamepad', index: 0, connected: true, mapping: 'standard', buttons, axes: [] } as unknown as Gamepad;
    const actions: GameAction[] = [];
    const device = new GamepadInputSource(() => [pad]);
    const settings = normalizeControls({ voiceButton: 4 });
    const poll = (options = settings, navigating = false) => device.poll(options, action => { actions.push(action); }, navigating);
    expect(normalizeControls().voiceButton).toBe(-1);
    buttons[4].pressed = true;
    poll();
    expect(actions).toEqual([]);
    buttons[4].pressed = false;
    poll();
    buttons[4].pressed = true;
    poll(); poll();
    buttons[4].pressed = false;
    poll();
    buttons[4].pressed = true;
    poll();
    pad = null;
    poll();
    expect(actions).toEqual(['voice-start', 'voice-stop', 'voice-start', 'voice-cancel']);
    pad = { id: 'Standard Gamepad', index: 0, connected: true, mapping: 'standard', buttons, axes: [] } as unknown as Gamepad;
    poll(normalizeControls({ voiceButton: DEFAULT_CONTROLS.pauseButton }));
    buttons[DEFAULT_CONTROLS.pauseButton].pressed = true;
    poll(normalizeControls({ voiceButton: DEFAULT_CONTROLS.pauseButton }));
    expect(actions.at(-1)).toBe('pause');
  });
});
