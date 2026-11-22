import { expect, test, type Page } from '@playwright/test';

interface SpeechEvent {
  phase: 'start' | 'end' | 'cancel';
  voice: string;
  text: string;
  rate: number;
  pitch: number;
}

interface SpeechProbe { active: boolean; events: SpeechEvent[]; overlaps: number; finish(): void }
const probe = (page: Page) => page.evaluate(() => {
  const { active, events, overlaps } = (window as unknown as { speechProbe: SpeechProbe }).speechProbe;
  return { active, events, overlaps };
});
const state = (page: Page) => page.evaluate(() => window.__SKIMMER_SCRAPER__!.snapshot());

const installProbe = (page: Page, local: boolean) => page.addInitScript(local => {
  class Utterance {
    public voice: { voiceURI: string } | null = null;
    public rate = 1;
    public pitch = 1;
    public onstart: (() => void) | null = null;
    public onend: (() => void) | null = null;
    public constructor(public readonly text: string) {}
  }
  const voices = [
    { voiceURI: 'cloud-only', name: 'Network voice', lang: 'zh-CN', localService: false },
    ...['alpha', 'bravo', 'charlie', 'delta'].map(name => ({
      voiceURI: `fixture-${name}`, name, lang: 'zh-CN', localService: local,
    })),
  ];
  let active: Utterance | null = null;
  let overlaps = 0;
  const events: SpeechEvent[] = [];
  const add = (phase: SpeechEvent['phase'], item: Utterance) =>
    events.push({ phase, voice: item.voice?.voiceURI ?? '', text: item.text, rate: item.rate, pitch: item.pitch });
  const finish = () => {
    const completed = active;
    if (!completed) return;
    active = null;
    add('end', completed);
    completed.onend?.();
  };
  const synth = Object.assign(new EventTarget(), {
    getVoices: () => voices,
    speak(item: Utterance) {
      if (active) overlaps++;
      active = item;
      queueMicrotask(() => {
        if (active !== item) return;
        add('start', item);
        item.onstart?.();
      });
    },
    cancel() {
      if (active) add('cancel', active);
      active = null;
    },
  });
  Object.defineProperty(window, 'speechSynthesis', { value: synth });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: Utterance });
  Object.assign(window, { speechProbe: { get active() { return !!active; }, get overlaps() { return overlaps; }, events, finish } });
}, local);

const start = async (page: Page) => {
  await page.goto('/?seed=334458&gen=3');
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().ready);
  await page.locator('#start-button').click();
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().mode === 'running');
};

const reply = async (page: Page, message: string) => {
  await page.keyboard.press('t');
  await page.locator('#radio-input').fill(message);
  await page.locator('#radio-input').press('Enter');
};

const expectSpeaking = async (page: Page, agent: number, role: string, voice: string) => {
  await expect.poll(async () => (await state(page)).voice.speaking).toBe(agent);
  const current = await state(page);
  expect(current.voice.activeSpeech).toMatchObject({ provider: 'local', voiceId: voice });
  const activeLine = current.cooperation.radio.history.find(line => line.id === current.voice.activeSpeech?.id);
  expect(activeLine?.agent).toBe(agent);
  await expect(page.locator('#radio-subtitle')).toContainText(role);
  await expect(page.locator('#radio-subtitle')).toContainText(activeLine!.text);
};

const openSettings = async (page: Page) => {
  await page.keyboard.press('f');
  await page.locator('#advanced-flight-settings > summary').click();
  await page.locator('.voice-settings > summary').click();
};

test('default offline companion speech follows the actual speaker and cancels on pause or device changes', async ({ page }) => {
  test.setTimeout(210_000);
  const remote: string[] = [];
  const errors: string[] = [];
  page.on('request', request => { if (request.url().startsWith('https:')) remote.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await installProbe(page, true);
  await start(page);
  await expectSpeaking(page, 1, 'Navigator', 'fixture-alpha');
  expect((await state(page)).voice.input).toBe('off');
  await page.keyboard.press('Escape');
  expect(await probe(page)).toMatchObject({ active: false, overlaps: 0 });
  expect((await probe(page)).events.map(event => event.phase)).toEqual(['start', 'cancel']);
  await page.keyboard.press('Escape');
  await page.evaluate(async () => window.__SKIMMER_SCRAPER__!.setPose({ x: 0, y: 410, z: 120 }, { yaw: 0, pitch: 0, roll: 0 }));

  await reply(page, '二号，你是谁？');
  await expectSpeaking(page, 2, 'Guardian', 'fixture-bravo');
  await page.evaluate(() => window.__SKIMMER_SCRAPER__!.advance(4, { holdPosition: true }));
  await expectSpeaking(page, 2, 'Guardian', 'fixture-bravo');
  await page.evaluate(() => (window as unknown as { speechProbe: SpeechProbe }).speechProbe.finish());
  await expect.poll(async () => (await state(page)).voice.lastCompleted?.agent).toBe(2);
  await reply(page, '三号，你是谁？');
  await expectSpeaking(page, 3, 'Explorer', 'fixture-charlie');
  await page.evaluate(() => navigator.mediaDevices.dispatchEvent(new Event('devicechange')));
  await expect.poll(async () => (await state(page)).voice.speaking).toBeNull();
  const made = (await probe(page)).events.filter(event => event.phase === 'start');
  expect(made.map(item => item.voice)).toEqual(['fixture-alpha', 'fixture-bravo', 'fixture-charlie']);
  expect(new Set(made.map(item => item.rate)).size).toBe(3);
  expect(new Set(made.map(item => item.pitch)).size).toBe(3);
  expect(await probe(page)).toMatchObject({ active: false, overlaps: 0 });
  expect((await state(page)).cooperation.model.requests).toBe(0);

  await openSettings(page);
  await page.locator('#voice-identities > summary').click();
  await page.locator('#voice-agent-3').selectOption('fixture-delta');
  await page.locator('#rules-close').click();
  await page.reload();
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().ready);
  expect((await state(page)).voice.voices[3]).toBe('fixture-delta');
  await page.locator('#start-button').click();
  await expectSpeaking(page, 1, 'Navigator', 'fixture-alpha');
  await page.evaluate(() => (window as unknown as { speechProbe: SpeechProbe }).speechProbe.finish());
  await page.evaluate(async () => window.__SKIMMER_SCRAPER__!.setPose({ x: 0, y: 410, z: 120 }, { yaw: 0, pitch: 0, roll: 0 }));
  await reply(page, '三号，你是谁？');
  await expectSpeaking(page, 3, 'Explorer', 'fixture-delta');
  await page.keyboard.press('r');
  await expect.poll(async () => (await probe(page)).events.some(event => event.phase === 'cancel' && event.voice === 'fixture-delta')).toBe(true);
  await expectSpeaking(page, 1, 'Navigator', 'fixture-alpha');
  await page.evaluate(() => window.__SKIMMER_SCRAPER__!.setPose({ x: 0, y: 519.5, z: 120 }, { yaw: 0, pitch: 0.75, roll: 0 }));
  await expect.poll(async () => (await state(page)).journey.active).toBe(true);
  await expect.poll(async () => (await state(page)).voice.speaking).toBeNull();
  expect(await probe(page)).toMatchObject({ active: false, overlaps: 0 });
  expect((await probe(page)).events.at(-1)).toMatchObject({ phase: 'cancel', voice: 'fixture-alpha' });
  await expect.poll(async () => (await state(page)).journey.crossings, { timeout: 45_000 }).toBe(1);
  expect((await probe(page)).overlaps).toBe(0);
  expect(errors).toEqual([]);
  expect(remote).toEqual([]);
});

test('system voices require local availability and an explicit off choice survives a reload', async ({ page }) => {
  test.setTimeout(100_000);
  await installProbe(page, false);
  await start(page);
  await expect.poll(async () => (await state(page)).voice.lastOutputError).toBe('local-tts-unavailable');
  await expect(page.locator('#radio-subtitle')).toContainText('Navigator');
  expect(await probe(page)).toMatchObject({ active: false, events: [] });
  await openSettings(page);
  await expect(page.locator('#voice-output')).toHaveValue('local');
  await expect(page.locator('#voice-output-status')).toContainText('系统缺少可用的本机音色');
  await page.locator('#voice-output').selectOption('off');
  await page.reload();
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().ready);
  expect((await state(page)).voice).toMatchObject({ input: 'off', output: 'off', played: 0 });
  await page.locator('#start-button').click();
  await expect(page.locator('#radio-subtitle')).toContainText('Navigator');
  expect(await probe(page)).toMatchObject({ active: false, events: [] });
});
