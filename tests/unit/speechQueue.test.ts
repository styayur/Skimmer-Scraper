import { expect, it } from 'vitest';
import type { RadioLine, RadioPriority } from '../../src/ai/radioDialogue';
import { SpeechQueue } from '../../src/voice/SpeechQueue';
import { resolveVoiceIdentity } from '../../src/voice/voiceContracts';
import { loadVoicePreferences, saveVoicePreferences } from '../../src/voice/voicePreferences';
import { selectedLocale } from '../../src/i18n/locale';

const line = (id: number, priority: RadioPriority = 'notice', text = `call ${id}`, agent = 1): RadioLine =>
  ({ id, agent, text, source: 'local', priority, locale: 'en-US' });

const setup = () => {
  let time = 0;
  const started: number[] = [];
  const cancelled: number[] = [];
  const active = new Map<number, () => void>();
  const speech = new SpeechQueue((current, signal) => new Promise(resolve => {
    expect(active.size).toBe(0);
    started.push(current.id);
    const finish = () => { active.delete(current.id); resolve(); };
    active.set(current.id, finish);
    signal.addEventListener('abort', () => { cancelled.push(current.id); finish(); }, { once: true });
  }), () => time);
  return { speech, started, cancelled, setTime: (value: number) => { time = value; },
    finish: async (id: number) => { active.get(id)?.(); await Promise.resolve(); } };
};

it('bounds waiting speech and gives threats the channel without overlapping or resurrecting a stopped job', async () => {
  const { speech, started, cancelled, finish } = setup();
  speech.enqueue(line(1));
  for (let id = 2; id < 8; id++) speech.enqueue(line(id));
  expect(started).toEqual([1]);
  expect(speech.count).toBe(3);
  speech.enqueue(line(8, 'reply'));
  speech.enqueue(line(9, 'risk', 'Avoid the tower', 2));
  expect(started).toEqual([1, 8, 9]);
  expect(cancelled).toEqual([1, 8]);
  expect(speech.count).toBe(0);
  speech.enqueue(line(10, 'reply'));
  await finish(9);
  expect(started).toEqual([1, 8, 9, 10]);
  expect(speech.clear()).toBe(true);
  expect(speech.clear()).toBe(false);
  expect(cancelled).toEqual([1, 8, 10]);
  expect(speech.current).toBeNull();
  expect(speech.count).toBe(0);
});

it('drops expired and duplicate notices while allowing a new explicit reply', async () => {
  const { speech, started, setTime, finish } = setup();
  speech.enqueue(line(1, 'notice', 'Formation ready.'));
  speech.enqueue(line(2, 'notice', 'Formation ready.'));
  speech.enqueue(line(3, 'notice', 'Old update.'));
  expect(speech.count).toBe(1);
  setTime(7000);
  await finish(1);
  expect(started).toEqual([1]);
  speech.enqueue(line(4, 'reply', 'Formation ready.'));
  await finish(4);
  setTime(15000);
  speech.enqueue(line(5, 'notice', 'Formation ready.'));
  expect(started).toEqual([1, 4, 5]);
  speech.reset();
});

it('ties distinct profiles and saved preferences to the real companion identity while keeping input opt-in', () => {
  let stored: string | undefined;
  const storage = {
    getItem: () => stored ?? null,
    setItem: (_key: string, value: string) => { stored = value; },
  };
  const settings = loadVoicePreferences(storage);
  expect(settings).toMatchObject({ input: 'off', output: 'off', language: selectedLocale });
  const profiles = [1, 2, 3].map(id => resolveVoiceIdentity(id)!);
  expect(profiles.map(item => item.callsign)).toEqual(['KITE-1', 'KITE-2', 'KITE-3']);
  expect(new Set(profiles.map(item => item.rate)).size).toBe(3);
  expect(new Set(profiles.map(item => item.pitch)).size).toBe(3);
  expect(profiles[1]!.cloudVoice).toBe('tide');
  expect(resolveVoiceIdentity(null)).toBeNull();
  saveVoicePreferences(storage, { ...settings, input: 'deepseek', output: 'deepseek' });
  expect(loadVoicePreferences(storage)).toMatchObject({ input: 'off', output: 'off' });
  saveVoicePreferences(storage, { ...settings, output: 'local' });
  expect(loadVoicePreferences(storage)).toMatchObject({ input: 'off', output: 'local' });
  expect(stored).not.toContain('deepseek');
  stored = JSON.stringify({ output: 'high-quality', volume: 0.48, localFallback: false });
  expect(loadVoicePreferences(storage)).toMatchObject({ input: 'off', output: 'local', volume: 0.48, localFallback: false });
  expect(resolveVoiceIdentity(1, 0)?.volume).toBe(0);
});
