import { expect, test, type Page } from '@playwright/test';

const voice = (page: Page) => page.evaluate(() => window.__SKIMMER_SCRAPER__!.snapshot().voice);
const requestLog = 'modelWorkerRequests';

const setup = async (page: Page, unavailable = false) => {
  await page.addInitScript(({ unavailable, requestLog }) => {
    localStorage.setItem('skimmer-scraper.companions.v3', JSON.stringify({ count: 3 }));
    const workers: string[] = [];
    Object.defineProperty(window, requestLog, { value: workers });
    window.Worker = new Proxy(window.Worker, {
      construct(target, args) {
        if (args[1]?.name !== 'Skimmer Kokoro') return Reflect.construct(target, args);
        const events = new EventTarget();
        let closed = false;
        return Object.assign(events, {
          postMessage(data: { id: number; type: 'prepare' | 'generate'; voice?: string }) {
            workers.push(data.type === 'prepare' ? 'prepare' : data.voice!);
            setTimeout(() => {
              if (closed) return;
              const base = { id: data.id, backend: 'webgpu' };
              if (data.type === 'prepare') {
                events.dispatchEvent(new MessageEvent('message', { data: unavailable
                  ? { ...base, type: 'error', code: 'kokoro-download', detail: 'Fixture: download unavailable' }
                  : { ...base, type: 'ready', loadMs: 20, device: 'Fixture WebGPU' } }));
              } else {
                const length = data.voice === 'zf_006' ? 96_000 : 24_000;
                const samples = Float32Array.from({ length }, (_, i) => Math.sin(i / 15) * 0.08);
                events.dispatchEvent(new MessageEvent('message', { data: { ...base, type: 'audio', sampleRate: 24000, inferenceMs: 25, samples } }));
              }
            }, 45);
          },
          terminate() { closed = true; workers.push('terminated'); },
        });
      },
    });
  }, { unavailable, requestLog });
  await page.goto('/?seed=334458&gen=3');
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().ready);
  await page.locator('#start-button').click();
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().mode === 'running');
  await page.keyboard.press('f');
  await page.locator('#advanced-flight-settings > summary').click();
  await page.locator('.voice-settings > summary').click();
};

const calls = (page: Page) => page.evaluate(key => (window as unknown as Record<string, string[]>)[key], requestLog);

test('Kokoro opt-in lazily opens one worker and previews through cancellable Web Audio', async ({ page }) => {
  test.setTimeout(165_000);
  const downloads: string[] = [];
  const stop = (request: { url(): string }) => {
    if (/\/KokoroVoice-|\/kokoro\.worker-|ort-wasm|huggingface/.test(request.url())) downloads.push(request.url());
  };
  page.on('request', stop);
  await setup(page);
  expect((await voice(page)).kokoro).toBeNull();
  expect(await calls(page)).toEqual([]);
  expect(downloads).toEqual([]);

  await page.locator('#voice-output').selectOption('high-quality');
  await expect.poll(async () => (await voice(page)).kokoro?.phase).toBe('ready');
  expect(downloads).toHaveLength(1);
  expect(downloads[0]).toContain('/KokoroVoice-');
  await page.locator('#voice-preview-agent').selectOption('2');
  await page.locator('#voice-preview').click();
  await expect.poll(async () => (await voice(page)).preview.phase).toBe('completed');
  expect((await voice(page)).preview.speech).toMatchObject({ provider: 'high-quality', voiceId: 'zm_010' });

  await page.locator('#voice-preview-agent').selectOption('3');
  await page.locator('#voice-preview').click();
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__!.snapshot().voice.preview.phase === 'playing');
  await expect(page.locator('#voice-preview')).toHaveText('取消试听');
  await page.locator('#voice-preview').press('Enter');
  await expect.poll(async () => (await voice(page)).preview.phase).toBe('cancelled');
  await page.locator('#voice-unload').click();
  expect((await voice(page)).kokoro?.resident).toBe(false);
  expect(await calls(page)).toEqual(['prepare', 'zm_010', 'zf_006', 'terminated']);

  const volume = page.locator('#voice-volume');
  await volume.focus();
  await volume.press('End');
  expect((await voice(page)).volume).toBe(1);
  await volume.press('Home');
  expect((await voice(page)).volume).toBe(0);
  await expect(page.locator('#voice-preview')).toBeDisabled();
  expect((await voice(page)).input).toBe('off');
  expect((await voice(page)).cloud.ttsRequests).toBe(0);
});

test('a failed model download releases the worker and preserves flight and subtitles', async ({ page }) => {
  test.setTimeout(150_000);
  await setup(page, true);
  await page.locator('#voice-output').selectOption('high-quality');
  await page.locator('#voice-fallback').uncheck();
  await expect(page.locator('#voice-output-status')).toContainText('模型下载失败');
  expect((await voice(page)).kokoro).toMatchObject({ error: 'kokoro-download', resident: false, generated: 0 });
  await page.locator('#rules-close').click();
  await page.keyboard.press('t');
  await page.locator('#radio-input').fill('二号，你是谁？');
  await page.locator('#radio-input').press('Enter');
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__!.snapshot().cooperation.radio.history.some(line =>
    line.agent === 2 && line.text.includes('KITE-2')));
  const state = await page.evaluate(() => window.__SKIMMER_SCRAPER__!.snapshot());
  expect(state.mode).toBe('running');
  expect(state.voice.speaking).toBeNull();
  expect(state.voice.queuedSpeech).toBe(0);
  expect(state.voice.cloud.asrRequests + state.voice.cloud.ttsRequests).toBe(0);
});
