import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import authored from '../../art/radio/lines.json';
import assets from '../../acceptance/v090/bilingual-radio.json';
import { DEFAULT_MODEL_CONFIG } from '../../src/ai/contracts';
import { ModelClient } from '../../src/ai/modelClient';
import { RadioDialogue, type RadioLine, type RadioLanguage } from '../../src/ai/radioDialogue';
import { radioCatalog } from '../../src/voice/radioCatalog';
import { VoiceRadio } from '../../src/voice/VoiceRadio';

it('resolves every authored event to the text used by the renderers and the verified recording in that locale', () => {
  expect(new Set(authored.map(item => item.agent + '-' + item.event)).size).toBe(authored.length);
  expect(assets.clips).toHaveLength(authored.length * 2);
  for (const item of authored) {
    for (const locale of ['en-US', 'zh-CN'] as const) {
      const radio = new RadioDialogue();
      radio.reportFixed(item.agent, item.event, locale, 'notice', 0);
      const line = radio.current()!;
      const clip = line.catalog!;
      expect(line.text).toBe(item.text[locale]);
      expect(Object.isFrozen(line) && Object.isFrozen(clip)).toBe(true);
      const name = `${item.agent}-${item.event}.opus`;
      expect(clip.clip).toBe(`radio/${locale}/${name}`);
      expect(createHash('sha256').update(readFileSync('public/' + clip.clip)).digest('hex'))
        .toBe(assets.clips.find(entry => entry.locale === locale && entry.name === name)?.sha256);
    }
  }
  expect(radioCatalog.resolve(1, 'dragon', 'en-US')).toBeUndefined();
  const radio = new RadioDialogue();
  radio.reportFixed(3, 'dragon', 'zh-CN', 'notice', 0, 1);
  expect(radio.current()).toMatchObject({ agent: 1, text: '发现巨龙，保持净空。', catalog: undefined });
});

class Source extends EventTarget {
  buffer?: AudioBuffer;
  playbackRate = { value: 1 };
  onended: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  connect = vi.fn(node => node);
  disconnect = vi.fn();
  end() { this.onended?.(); this.dispatchEvent(new Event('ended')); }
}

const effect = () => ({
  frequency: {}, Q: {}, threshold: {}, knee: {}, ratio: {}, attack: {}, release: {}, gain: {}, pan: {},
  connect: (node: unknown) => node, disconnect: vi.fn(),
});

function setup(output: 'local' | 'deepseek' | 'off' = 'local', transport?: typeof fetch) {
  vi.useFakeTimers();
  const sources: Source[] = [];
  const decoded = vi.fn(async () => ({ duration: 1 }));
  const clips = vi.fn<typeof fetch>(async () => new Response(new Uint8Array([1])));
  class Audio {
    state = 'running';
    currentTime = 10;
    createBiquadFilter = effect;
    createGain = effect;
    createStereoPanner = effect;
    createDynamicsCompressor = effect;
    decodeAudioData = decoded;
    createBufferSource() { const source = new Source(); sources.push(source); return source; }
    createBuffer(_channels: number, frames: number, rate: number) {
      return { duration: frames / rate, getChannelData: () => new Float32Array(frames) };
    }
    close = async () => {};
  }
  vi.stubGlobal('AudioContext', Audio);
  vi.stubGlobal('window', { setTimeout, clearTimeout, localStorage: { getItem: () => null, setItem: vi.fn() } });
  vi.stubGlobal('document', { baseURI: 'https://example.invalid/game/' });
  vi.stubGlobal('fetch', clips);
  const model = new ModelClient(transport);
  if (transport) model.connect(DEFAULT_MODEL_CONFIG, 'test-radio-synthetic');
  const voice = new VoiceRadio(model, { available: () => true, send: () => true, status: vi.fn() });
  voice.configure({ ...voice.preferences, output });
  voice.unlock();
  const radio = new RadioDialogue();
  function fixed(agent = 1, event = 'command', locale: RadioLanguage = 'en-US', priority: RadioLine['priority'] = 'reply') {
    radio.reportFixed(agent, event, locale, priority, 0);
    const line = radio.snapshot().history.at(-1)!;
    voice.update(true, line);
    return line;
  }
  const phases = (line: RadioLine) => voice.snapshot().playbackEvents.filter(e => e.eventId === line.id).map(e => e.phase);
  return { voice, radio, sources, clips, decoded, fixed, phases };
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('radio subtitles and provider playback', () => {
  it.each(['en-US', 'zh-CN'] as const)('waits for decode and ends the exact %s caption on the source ended event', async locale => {
    const { voice, radio, sources, clips, decoded, fixed, phases } = setup();
    let ready!: (buffer: { duration: number }) => void;
    decoded.mockImplementationOnce(() => new Promise(resolve => { ready = resolve; }));
    const line = fixed(2, 'command', locale);
    await vi.advanceTimersByTimeAsync(0);
    expect(String(clips.mock.calls[0]![0])).toBe(`https://example.invalid/game/radio/${locale}/2-command.opus`);
    expect(radio.snapshot().history).toEqual([line]);
    expect(phases(line)).toEqual(['queued', 'preparing']);
    expect(voice.subtitle).toBeNull();
    ready({ duration: 1 });
    await vi.advanceTimersByTimeAsync(0);
    expect(sources[0]!.start).toHaveBeenCalledOnce();
    expect(voice.spokenLine).toBe(line);
    expect(voice.subtitle?.line?.text).toBe(locale === 'en-US' ? 'Copy. Guardian moving.' : '收到，护航开始行动。');
    sources[0]!.end();
    await vi.advanceTimersByTimeAsync(0);
    expect(voice.subtitle).toBeNull();
    voice.update(true, line);
    expect(voice.subtitle).toBeNull();
    expect(phases(line)).toEqual(['queued', 'preparing', 'playing', 'completed']);
    const repeat = fixed(2, 'command', locale);
    await vi.advanceTimersByTimeAsync(0);
    expect(voice.subtitle?.line).toBe(repeat);
    expect(voice.snapshot().activeSpeech?.playbackId).not.toBe(voice.snapshot().lastCompleted?.playbackId);
    voice.dispose();
  });

  it('preempts playback synchronously and ignores old ended and decode callbacks across resets', async () => {
    const { voice, sources, fixed, phases, decoded } = setup();
    const old = fixed();
    await vi.advanceTimersByTimeAsync(0);
    const oldEnded = sources[0]!.onended!;
    const risk = fixed(2, 'risk', 'zh-CN', 'risk');
    expect(sources[0]!.stop).toHaveBeenCalledOnce();
    expect(voice.subtitle).toBeNull();
    await vi.advanceTimersByTimeAsync(0);
    oldEnded();
    expect(voice.subtitle?.line).toBe(risk);
    expect(phases(old).at(-1)).toBe('cancelled');
    voice.update(false, risk);
    expect(voice.subtitle).toBeNull();
    voice.update(true, risk);
    expect(voice.snapshot().queuedSpeech).toBe(0);
    let decode!: (buffer: { duration: number }) => void;
    decoded.mockImplementationOnce(() => new Promise(resolve => { decode = resolve; }));
    const interrupted = fixed();
    fixed(2, 'command');
    await vi.advanceTimersByTimeAsync(0);
    voice.reset();
    expect(voice.snapshot().queuedSpeech).toBe(0);
    const next = fixed(3);
    await vi.advanceTimersByTimeAsync(0);
    decode({ duration: 1 });
    await vi.advanceTimersByTimeAsync(0);
    expect(voice.subtitle?.line).toBe(next);
    expect(phases(interrupted)).toEqual(['queued', 'preparing', 'cancelled']);
    voice.dispose();
  });

  it('retains text on mute and missing clips, without requesting the other language', async () => {
    const { voice, sources, clips, fixed, phases } = setup();
    const line = fixed();
    await vi.advanceTimersByTimeAsync(0);
    voice.update(true, line, true);
    await vi.advanceTimersByTimeAsync(0);
    expect(sources[0]!.stop).toHaveBeenCalledOnce();
    expect(voice.spokenLine).toBeNull();
    expect(voice.subtitle?.line).toBe(line);
    expect(phases(line).slice(-2)).toEqual(['cancelled', 'text-only']);
    await vi.advanceTimersByTimeAsync(6000);
    expect(voice.subtitle).toBeNull();
    clips.mockResolvedValueOnce(new Response(null, { status: 404 }));
    const missing = fixed(2, 'command', 'zh-CN');
    await vi.advanceTimersByTimeAsync(0);
    expect(phases(missing)).toEqual(['queued', 'preparing', 'failed', 'text-only']);
    expect(voice.subtitle?.line).toBe(missing);
    expect(clips).toHaveBeenCalledTimes(2);
    voice.dispose();
  });

  it('leaves dynamic speech as text on cloud failure, even with an event name matching a recording', async () => {
    const transport = vi.fn<typeof fetch>(async () => new Response(null, { status: 503 }));
    const { voice, radio, clips, phases } = setup('deepseek', transport);
    radio.report(1, 'A different flight plan.', 'model', 'reply', 0, 'en-US');
    const line = { ...radio.current()!, event: 'command' };
    voice.update(true, line);
    await vi.advanceTimersByTimeAsync(0);
    expect(JSON.parse(String(transport.mock.calls[0]![1]?.body)).text).toBe(line.text);
    expect(clips).not.toHaveBeenCalled();
    expect(phases(line)).toEqual(['queued', 'preparing', 'failed', 'text-only']);
    expect(voice.subtitle?.line).toBe(line);
    voice.dispose();
  });

  it('uses text immediately with output off and preserves the authored line in history', async () => {
    const { voice, radio, clips, fixed, phases } = setup('off');
    const line = fixed(1, 'launch', 'zh-CN', 'notice');
    expect(voice.subtitle?.line).toBe(line);
    expect(phases(line)).toEqual(['queued', 'text-only']);
    expect(voice.ducking).toBe(false);
    await vi.advanceTimersByTimeAsync(6000);
    expect(voice.subtitle).toBeNull();
    expect(radio.snapshot().history).toEqual([line]);
    expect(clips).not.toHaveBeenCalled();
    voice.dispose();
  });

  it('falls back from unstarted cloud speech only to the resolved recording in the requested locale', async () => {
    const { voice, sources, fixed, phases, clips } = setup('deepseek', async () => new Response(null, { status: 503 }));
    const line = fixed(1, 'launch', 'zh-CN', 'notice');
    await vi.advanceTimersByTimeAsync(0);
    expect(phases(line)).toEqual(['queued', 'preparing', 'failed', 'playing']);
    expect(String(clips.mock.calls[0]![0])).toContain('/zh-CN/1-launch.opus');
    expect(voice.subtitle?.line).toBe(line);
    sources[0]!.end();
    await vi.advanceTimersByTimeAsync(0);
    expect(voice.snapshot()).toMatchObject({ lastOutputFallback: 'local', lastCompleted: { id: line.id, voiceId: '1-launch' } });
    voice.dispose();
  });

  it('starts streaming subtitles with the first scheduled PCM buffer and completes at the last ended event', async () => {
    let pcm!: ReadableStreamDefaultController<Uint8Array>;
    const { voice, radio, sources } = setup('deepseek', async () => new Response(
      new ReadableStream<Uint8Array>({ start(controller) { pcm = controller; } }), { headers: { 'content-type': 'audio/pcm' } }));
    radio.report(3, 'Checking the river.', 'model', 'reply', 0, 'en-US');
    const line = radio.current()!;
    voice.update(true, line);
    await vi.advanceTimersByTimeAsync(0);
    pcm.enqueue(new Uint8Array(300));
    await vi.advanceTimersByTimeAsync(0);
    expect(voice.subtitle).toBeNull();
    pcm.enqueue(new Uint8Array(4700));
    await vi.advanceTimersByTimeAsync(0);
    expect(sources[0]!.start).toHaveBeenCalledWith(10);
    expect(voice.subtitle?.line).toBe(line);
    pcm.close();
    await vi.advanceTimersByTimeAsync(0);
    sources[0]!.end();
    expect(voice.subtitle?.line).toBe(line);
    sources[1]!.end();
    await vi.advanceTimersByTimeAsync(0);
    expect(voice.subtitle).toBeNull();
    expect(voice.snapshot().lastCompleted?.stream?.audioBytes).toBe(5000);
    voice.dispose();
  });

  it('clears the subtitle during a stalled stream and resumes the same playback when more audio arrives', async () => {
    let pcm!: ReadableStreamDefaultController<Uint8Array>;
    const { voice, radio, sources } = setup('deepseek', async () => new Response(
      new ReadableStream<Uint8Array>({ start(controller) { pcm = controller; } }), { headers: { 'content-type': 'audio/pcm' } }));
    radio.report(3, 'Checking the river.', 'model', 'reply', 0, 'en-US');
    voice.update(true, radio.current());
    await vi.advanceTimersByTimeAsync(0);
    pcm.enqueue(new Uint8Array(4800));
    await vi.advanceTimersByTimeAsync(0);
    const playback = voice.subtitle!;
    sources[0]!.end();
    expect(voice.subtitle).toBeNull();
    expect(voice.ducking).toBe(false);
    pcm.enqueue(new Uint8Array(4800));
    await vi.advanceTimersByTimeAsync(0);
    expect(voice.subtitle).toEqual(playback);
    sources[1]!.end();
    expect(voice.subtitle).toBeNull();
    pcm.close();
    await vi.advanceTimersByTimeAsync(0);
    expect(voice.snapshot()).toMatchObject({ played: 1, completed: 1 });
    voice.dispose();
  });
});
