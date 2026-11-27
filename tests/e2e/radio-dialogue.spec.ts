import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const output = 'evidence/v0.5/pr7-radio';
const snapshot = (page: Page) => page.evaluate(() => window.__SKIMMER_SCRAPER__!.snapshot());
const startClearFlight = async (page: Page) => {
  await page.goto('/?autostart=1&seed=334458&gen=3');
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().mode === 'running');
  await page.evaluate(async () => {
    const game = window.__SKIMMER_SCRAPER__!;
    game.pause();
    await game.setPose({ x: 0, y: 270, z: 120 }, { yaw: 0, pitch: 0, roll: 0 });
    game.resume();
  });
};
const send = async (page: Page, message: string) => {
  await page.keyboard.press('t');
  const text = page.locator('#radio-input');
  await expect(text).toBeFocused();
  await text.fill(message);
  await text.press('Enter');
  await expect(page.locator('#radio-panel')).toBeHidden();
};

test('local radio responds to text, changes a scout route and keeps concise muted history', async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  const outbound: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (r.url().startsWith('https:')) outbound.push(r.url()); });
  await startClearFlight(page);
  const before = await snapshot(page);
  await page.keyboard.press('t');
  const input = page.locator('#radio-input');
  await expect(input).toBeFocused();
  await input.pressSequentially('CFGRM');
  expect((await snapshot(page)).cameraMode).toBe(before.cameraMode);
  expect((await snapshot(page)).mode).toBe('paused');
  await input.fill('二号去侦察左侧');
  await input.press('Enter');
  await expect.poll(async () => (await snapshot(page)).cooperation.lastPlan?.orders[0]?.action).toBe('SCOUT');
  await expect(page.locator('#radio-subtitle')).toContainText('护航员');
  await expect(page.locator('#radio-subtitle')).toContainText('收到，护航开始行动。');
  mkdirSync(output, { recursive: true });
  await page.screenshot({ path: `${output}/radio-subtitle.png`, animations: 'disabled' });
  const after = await page.evaluate(() => window.__SKIMMER_SCRAPER__!.advance(2));
  expect(after.companions[1]!.position.x).toBeLessThan(before.companions[1]!.position.x - 15);
  expect(after.cooperation.trace.some(entry => entry.event === 'radio-outcome')).toBe(true);
  expect(after.cooperation.model.requests).toBe(0);
  await page.keyboard.press('t');
  await expect(page.locator('#radio-history')).toContainText('二号去侦察左侧');
  await expect(page.locator('#radio-history')).toContainText('已飞行');
  await page.screenshot({ path: `${output}/radio-history.png`, animations: 'disabled' });
  await page.locator('#radio-mute').check();
  await page.locator('[data-radio-command="一号领航"]').click();
  await expect.poll(async () => (await snapshot(page)).cooperation.lastPlan?.orders[0]?.action).toBe('LEAD');
  await expect(page.locator('#radio-subtitle')).toBeHidden();
  await page.keyboard.press('t');
  await expect(page.locator('#radio-history')).toContainText('指令收到。');
  const muted = await snapshot(page);
  expect(muted.cooperation.radio.muted).toBe(true);
  expect(errors).toEqual([]);
  expect(outbound).toEqual([]);
  writeFileSync(`${output}/offline-radio.json`, JSON.stringify({
    before: before.companions, after: after.companions, radio: after.cooperation.radio,
    outcomes: after.cooperation.trace.filter(event => event.event.startsWith('radio-')), muted: muted.cooperation.radio, errors, outbound,
  }, null, 2));
});

test('a delayed character clip enters history before the audible subtitle and clears it on completion', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 640, height: 360 });
  await page.addInitScript(() => {
    // Saving voice settings selects the returning-pilot setup, including its saved wingmate count.
    localStorage.setItem('skimmer-scraper.rules.v3', JSON.stringify({ mode: 'free' }));
    localStorage.setItem('skimmer-scraper.companions.v3', JSON.stringify({ count: 2 }));
    localStorage.setItem('skimmer-scraper.voice.v1', JSON.stringify({ output: 'local', language: 'en-US' }));
  });
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/radio/en-US/2-command.opus', async route => { await gate; await route.continue(); });
  await startClearFlight(page);
  const subtitle = page.locator('#radio-subtitle');
  const expected = 'Copy. Guardian moving.';
  try {
    await Promise.all([page.waitForRequest('**/radio/en-US/2-command.opus'), send(page, '二号去侦察左侧')]);
    const history = (await snapshot(page)).cooperation.radio.history;
    expect(history.find(line => line.catalog?.catalogId === '2-command')).toMatchObject({ text: expected, locale: 'en-US' });
    await expect(subtitle).toBeHidden();
  } finally { release(); }
  await expect(subtitle).toContainText(expected);
  await expect.poll(async () => (await snapshot(page)).voice.lastCompleted?.voiceId).toBe('2-command');
  await expect(subtitle).not.toContainText(expected);
});

test('a mocked model validates orders, disconnect restores local radio, and reconnect resumes model orders', async ({ page }) => {
  test.setTimeout(150_000);
  const credential = 'synthetic-radio-credential';
  const replacement = 'synthetic-radio-reconnected';
  let transmitted = 0;
  let firstRequestAt = 0;
  await page.route('https://api.deepseek.com/chat/completions', async route => {
    const expectedKey = transmitted === 0 ? credential : replacement;
    expect((await route.request().allHeaders()).authorization).toBe(`Bearer ${expectedKey}`);
    const payload = route.request().postDataJSON();
    expect(JSON.stringify(payload)).not.toContain(credential);
    expect(JSON.stringify(payload)).not.toContain(replacement);
    const input = JSON.parse(payload.messages[1].content);
    expect(input.message).toBe('一号领航');
    expect(input.profiles).toHaveLength(3);
    const p = input.perception;
    if (transmitted === 0) firstRequestAt = performance.now();
    transmitted++;
    await route.fulfill({ json: { choices: [{ message: { content: JSON.stringify({
      plan: { requestId: p.requestId, epoch: p.epoch, ttl: 12, risk: 0.2, formation: 'wedge',
        orders: [{ agents: [1], action: 'LEAD', targetId: 'route-ahead' }], reason: 'Validated mock report' },
      reply: { agentId: 1, text: '一号收到，领航路线已选定。' },
    }) } }], usage: { prompt_tokens: 102, completion_tokens: 39, total_tokens: 141 } } });
  });
  await startClearFlight(page);
  await page.keyboard.press('f');
  await page.locator('#advanced-flight-settings > summary').click();
  await page.locator('.model-settings summary').click();
  await page.locator('#ai-budget').fill('2');
  await page.locator('#ai-interval').fill('60');
  await page.locator('#ai-key').fill(credential);
  await page.locator('#ai-connect').click();
  await send(page, '一号领航');
  await expect.poll(async () => (await snapshot(page)).cooperation.radio.history.find(line => line.source === 'model')?.agent).toBe(1);
  const accepted = await snapshot(page);
  expect(accepted.cooperation.lastPlan?.orders[0]).toEqual({ agents: [1], action: 'LEAD', targetId: 'route-ahead' });
  expect(accepted.cooperation.model.usage.total).toBe(141);
  expect(transmitted).toBe(1);
  expect(JSON.stringify(accepted)).not.toContain(credential);
  await page.keyboard.press('f');
  await page.locator('#ai-disconnect').click();
  await send(page, '全体集合');
  await expect.poll(async () => (await snapshot(page)).cooperation.lastPlan?.orders[0]?.action).toBe('REGROUP');
  const local = await snapshot(page);
  expect(local.cooperation.model.connected).toBe(false);
  expect(transmitted).toBe(1);
  expect(local.cooperation.lastPlan?.orders[0]?.agents).toEqual([1, 2, 3]);
  expect(local.cooperation.radio.history.at(-1)?.source).toBe('local');

  await page.keyboard.press('f');
  await page.locator('#ai-key').fill(replacement);
  await page.locator('#ai-connect').click();
  await expect(page.locator('#ai-key')).toHaveValue('');
  await expect.poll(() => performance.now() - firstRequestAt).toBeGreaterThan(650);
  await send(page, '一号领航');
  await expect.poll(async () => (await snapshot(page)).cooperation.model.successes).toBe(2);
  const reconnected = await snapshot(page);
  expect(reconnected.cooperation.lastPlan?.orders[0]?.action).toBe('LEAD');
  expect(reconnected.cooperation.radio.history.at(-1)?.source).toBe('model');
  expect(reconnected.cooperation.model.usage.total).toBe(282);
  expect(transmitted).toBe(2);
  expect(JSON.stringify(reconnected)).not.toContain(replacement);
});
