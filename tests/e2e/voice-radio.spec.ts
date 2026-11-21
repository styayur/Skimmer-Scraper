import { expect, test, type Page } from '@playwright/test';

test.use({ channel: 'chromium', launchOptions: { args: [
  '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--use-fake-device-for-media-stream',
] } });

const api = 'https://api.deepseek.com';
const credential = 'synthetic-voice-browser-credential';
const state = (page: Page) => page.evaluate(() => window.__SKIMMER_SCRAPER__!.snapshot());

const openVoice = async (page: Page, mode: 'local' | 'deepseek') => {
  await page.keyboard.press('f');
  await page.locator('#advanced-flight-settings > summary').click();
  if (mode === 'deepseek') {
    await page.locator('.model-settings summary').click();
    await page.locator('#ai-interval').fill('60');
    await page.locator('#ai-budget').fill('4');
    await page.locator('#ai-key').fill(credential);
    await page.locator('#ai-connect').click();
  }
  await page.locator('.voice-settings summary').click();
  await page.locator('#voice-input').selectOption(mode);
  await page.locator('#voice-output').selectOption(mode);
  await page.locator('#rules-close').click();
};

const start = async (page: Page) => {
  await page.goto('/?autostart=1&seed=334458&gen=3');
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().mode === 'running');
  await page.evaluate(async () => {
    const game = window.__SKIMMER_SCRAPER__!;
    game.pause();
    await game.setPose({ x: 0, y: 320, z: 120 }, { yaw: 0, pitch: 0, roll: 0 });
    game.resume();
  });
};

const observeMicrophone = (page: Page) => page.addInitScript(() => {
  const media = navigator.mediaDevices;
  const open = media.getUserMedia.bind(media);
  const probe = { calls: 0, tracks: [] as MediaStreamTrack[] };
  Object.assign(window, { microphoneProbe: probe });
  media.getUserMedia = async constraints => {
    probe.calls++;
    const stream = await open(constraints);
    probe.tracks.push(...stream.getTracks());
    return stream;
  };
});
const microphone = (page: Page) => page.evaluate(() => {
  const { calls, tracks } = (window as unknown as { microphoneProbe: { calls: number; tracks: MediaStreamTrack[] } }).microphoneProbe;
  return { calls, states: tracks.map(track => track.readyState) };
});

test('real browser capture uploads a WAV to mocked DeepSeek, flies the scout order and plays streamed PCM', async ({ page, context }) => {
  test.setTimeout(160_000);
  await context.grantPermissions(['microphone']);
  await observeMicrophone(page);
  let uploads = 0;
  let modelCommands = 0;
  let tts = 0;
  await page.route(`${api}/v1/tools/asr`, async route => {
    const request = route.request();
    expect(await request.headerValue('authorization')).toBe(`Bearer ${credential}`);
    const body = request.postDataBuffer()!;
    expect(body.includes(credential)).toBe(false);
    const riff = body.indexOf(Buffer.from('RIFF'));
    expect(riff).toBeGreaterThan(0);
    expect(body.toString('ascii', riff + 8, riff + 12)).toBe('WAVE');
    expect(body.readUInt16LE(riff + 22)).toBe(1);
    expect(body.readUInt32LE(riff + 24)).toBe(16_000);
    expect(body.readUInt16LE(riff + 34)).toBe(16);
    expect(body.readUInt32LE(riff + 40)).toBeGreaterThan(5_760);
    uploads++;
    await route.fulfill({ json: { text: '二号去侦察左侧', duration_ms: 900 } });
  });
  await page.route(`${api}/chat/completions`, async route => {
    const request = route.request().postDataJSON();
    expect(request.safety_check.level).toBe('high');
    expect(request.response_format).toBeUndefined();
    const input = JSON.parse(request.messages[1].content);
    const perception = input.perception ?? input;
    const plan = { requestId: perception.requestId, epoch: perception.epoch, ttl: 12, risk: 0.18, formation: 'wedge',
      orders: [{ agents: input.message ? [2] : [1, 2, 3], action: input.message ? 'SCOUT' : 'FOLLOW', targetId: input.message ? 'route-left' : null }],
      reason: 'Synthetic browser test response' };
    if (input.message) { modelCommands++; expect(input.message).toBe('二号去侦察左侧'); }
    const content = input.message ? { plan, reply: { agentId: 2, text: '二号收到，开始侦察左侧。' } } : plan;
    await route.fulfill({ json: { choices: [{ message: { content: JSON.stringify(content) } }], usage: { total_tokens: 123 } } });
  });
  await page.route(`${api}/v1/tools/tts`, async route => {
    expect(await route.request().headerValue('authorization')).toBe(`Bearer ${credential}`);
    const request = route.request().postDataJSON();
    expect(request.format).toBe('pcm');
    if (request.text === '二号收到，开始侦察左侧。') { tts++; expect(request.voice_id).toBe('tide'); }
    const audio = Buffer.alloc(24_000 * 2);
    for (let frame = 0; frame < 24_000; frame++) audio.writeInt16LE(Math.round(Math.sin(frame / 20) * 100), frame * 2);
    await route.fulfill({ contentType: 'audio/pcm', body: audio });
  });
  await start(page);
  await page.keyboard.press('v');
  expect(await microphone(page)).toEqual({ calls: 0, states: [] });
  expect((await state(page)).voice.input).toBe('off');
  await openVoice(page, 'deepseek');

  await page.keyboard.down('v');
  await expect(page.locator('#voice-status')).toHaveAttribute('data-phase', 'recording');
  expect(await microphone(page)).toEqual({ calls: 1, states: ['live'] });
  await page.waitForTimeout(900);
  await page.keyboard.up('v');
  await expect.poll(async () => (await state(page)).voice.commands).toBe(1);
  expect(await microphone(page)).toEqual({ calls: 1, states: ['ended'] });
  await expect.poll(async () => (await state(page)).cooperation.lastPlan?.orders[0]?.action).toBe('SCOUT');
  const order = await state(page);
  const reply = order.cooperation.radio.history.find(line => line.source === 'model' && line.agent === 2)!;
  await expect.poll(async () => (await state(page)).voice.playbackHistory.some(line => line.id === reply.id && line.provider === 'deepseek'),
    { timeout: 20_000 }).toBe(true);
  await expect.poll(async () => (await state(page)).cooperation.trace.some(entry => entry.event === 'radio-outcome')).toBe(true);
  const after = await state(page);
  expect(after.runTime - order.runTime).toBeGreaterThan(1.2);
  expect(uploads).toBe(1);
  expect(modelCommands).toBe(1);
  expect(tts).toBe(1);
  expect(JSON.stringify(after)).not.toContain(credential);

  await page.keyboard.press('f');
  await page.locator('#ai-disconnect').click();
  await page.keyboard.press('t');
  await page.locator('#radio-input').fill('全体集合');
  await page.locator('#radio-input').press('Enter');
  await expect.poll(async () => (await state(page)).cooperation.lastPlan?.orders[0]?.action).toBe('REGROUP');
  expect((await state(page)).cooperation.model.connected).toBe(false);
  await page.reload();
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().mode === 'running');
  expect((await state(page)).voice.input).toBe('off');
  expect((await state(page)).cooperation.model.connected).toBe(false);
  const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  expect(storage).not.toContain(credential);
});

test('no-key mode requires on-device recognition and preserves typed input and subtitles', async ({ page }) => {
  test.setTimeout(120_000);
  const outbound: string[] = [];
  page.on('request', request => { if (request.url().startsWith('https:')) outbound.push(request.url()); });
  await page.addInitScript(() => {
    class MockLocalRecognition {
      public static async available() { return 'available'; }
      public static async install() { return true; }
      private local = false;
      public lang = '';
      public continuous = false;
      public onstart: (() => void) | null = null;
      public onend: (() => void) | null = null;
      public onresult: ((event: { results: string[][] | { transcript: string }[][] }) => void) | null = null;
      public get processLocally() { return this.local; }
      public set processLocally(value) { this.local = value; }
      public start() {
        if (!this.local || this.lang !== 'zh-CN') throw new Error('Network recognition is forbidden in this test');
        setTimeout(() => this.onstart?.(), 20);
      }
      public stop() { this.onresult?.({ results: [[{ transcript: '二号去侦察左侧' }]] }); this.onend?.(); }
      public abort() { this.onend?.(); }
    }
    class LocalUtterance { public onend: (() => void) | null = null; }
    Object.defineProperties(window, {
      SpeechRecognition: { value: MockLocalRecognition },
      SpeechSynthesisUtterance: { value: LocalUtterance },
      speechSynthesis: { value: {
        getVoices: () => [{ lang: 'zh-CN', localService: true }],
        speak: (value: LocalUtterance) => setTimeout(() => value.onend?.(), 30),
        cancel: () => {},
      } },
    });
  });
  await start(page);
  await openVoice(page, 'local');
  await page.keyboard.down('v');
  await expect(page.locator('#voice-status')).toHaveAttribute('data-phase', 'recording');
  await page.keyboard.up('v');
  await expect.poll(async () => (await state(page)).voice.commands).toBe(1);
  await expect.poll(async () => (await state(page)).cooperation.lastPlan?.orders[0]?.action).toBe('SCOUT');
  await expect.poll(async () => (await state(page)).voice.lastCompleted?.provider).toBe('local');
  await page.keyboard.press('t');
  await page.locator('#radio-input').press('v');
  expect(await page.locator('#radio-input').inputValue()).toBe('v');
  expect((await state(page)).voice.captures).toBe(1);
  await page.locator('#radio-input').fill('全体集合');
  await page.locator('#radio-input').press('Enter');
  await expect.poll(async () => (await state(page)).cooperation.lastPlan?.orders[0]?.action).toBe('REGROUP');
  expect((await state(page)).cooperation.model.requests).toBe(0);
  expect(outbound).toEqual([]);
});

test('Escape and leaving flight release the microphone without uploading or reusing a cancelled clip', async ({ page, context }) => {
  test.setTimeout(120_000);
  await context.grantPermissions(['microphone']);
  await observeMicrophone(page);
  let uploads = 0;
  await page.route(`${api}/**`, async route => {
    if (route.request().url().endsWith('/asr')) uploads++;
    await route.fulfill({ status: 503, body: '' });
  });
  await start(page);
  await openVoice(page, 'deepseek');
  await page.keyboard.down('v');
  await expect(page.locator('#voice-status')).toHaveAttribute('data-phase', 'recording');
  await page.keyboard.press('Escape');
  await page.keyboard.up('v');
  await expect.poll(async () => (await microphone(page)).states).toEqual(['ended']);
  expect((await state(page)).mode).toBe('running');
  await page.keyboard.down('v');
  await expect(page.locator('#voice-status')).toHaveAttribute('data-phase', 'recording');
  await page.keyboard.press('f');
  await page.keyboard.up('v');
  await expect.poll(async () => (await microphone(page)).states).toEqual(['ended', 'ended']);
  expect((await state(page)).mode).toBe('paused');
  expect((await state(page)).voice.commands).toBe(0);
  expect(uploads).toBe(0);
  await page.locator('#rules-close').click();
  await page.keyboard.down('v');
  await expect(page.locator('#voice-status')).toHaveAttribute('data-phase', 'recording');
  await context.clearPermissions();
  await expect.poll(async () => (await microphone(page)).states).toEqual(['ended', 'ended', 'ended']);
  await page.keyboard.up('v');
  expect((await state(page)).voice.lastError).toBe('mic-revoked');
  expect(uploads).toBe(0);
});
