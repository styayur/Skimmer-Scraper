import { expect, test, type Frame, type Page } from '@playwright/test';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { zh } from '../../src/i18n/zh-CN';

test.use({ locale: 'zh-CN' });
test.describe.configure({ timeout: 120_000 });

async function embed(page: Page, baseURL: string, allowed: boolean): Promise<Frame> {
  const permissions = allowed ? 'allow="fullscreen; gamepad"' : 'allow="fullscreen \'none\'; gamepad \'none\'"';
  const host = createServer((_request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end(`<button id="outside">Host control</button>
      <iframe name="flight" width="840" height="580" ${permissions}
        sandbox="allow-scripts allow-same-origin ${allowed ? 'allow-pointer-lock' : ''}"
        src="${baseURL}/?seed=334458"></iframe>`);
  });
  host.listen(0, '127.0.0.1');
  await once(host, 'listening');
  try {
    await page.goto(`http://127.0.0.1:${(host.address() as AddressInfo).port}/`);
  } finally {
    host.close();
    host.closeAllConnections();
  }
  const frame = page.frame({ name: 'flight' })!;
  await frame.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().ready);
  return frame;
}

const mode = (frame: Frame) => frame.evaluate(() => window.__SKIMMER_SCRAPER__!.snapshot().mode);
const fullscreen = (frame: Frame) => frame.evaluate(() => document.fullscreenElement === document.documentElement);

test('top-level flight survives a rejected request and stays paused after visibility returns', async ({ page }) => {
  await page.goto('/?seed=334458');
  await page.locator('#start-button').click();
  const frame = page.mainFrame();
  await expect.poll(() => mode(frame)).toBe('running');
  await page.evaluate(() => {
    document.documentElement.requestFullscreen = () => Promise.reject(new TypeError('Rejected request'));
  });
  await page.keyboard.press('Alt+Enter');
  await expect(page.locator('#toast')).toHaveText(zh['platform.fullscreenUnavailable']);
  expect(await mode(frame)).toBe('running');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    Reflect.deleteProperty(document, 'visibilityState');
    document.dispatchEvent(new Event('visibilitychange'));
    Reflect.deleteProperty(document.documentElement, 'requestFullscreen');
  });
  await expect(page.locator('#pause-panel')).toBeVisible();
  await page.keyboard.press('Alt+Enter');
  await expect.poll(() => fullscreen(frame)).toBe(true);
  expect(await mode(frame)).toBe('paused');
  await page.locator('#pause-resume').click();
  await expect.poll(() => mode(frame)).toBe('running');
});

test('delegated iframe enters fullscreen, preserves the paused run, and pauses on mouse release', async ({ page, baseURL }) => {
  const frame = await embed(page, baseURL!, true);
  expect(await fullscreen(frame)).toBe(false);
  await frame.locator('#start-button').focus();
  await page.keyboard.press('Alt+Enter');
  await expect.poll(() => fullscreen(frame)).toBe(true);
  expect(await mode(frame)).toBe('title');
  await frame.locator('#start-button').click();
  await expect.poll(() => mode(frame)).toBe('running');
  const canvas = frame.locator('#game-canvas');
  const originalCanvas = await canvas.elementHandle();
  await canvas.click({ position: { x: 150, y: 100 }, force: true });
  await frame.waitForFunction(() => document.pointerLockElement?.id === 'game-canvas');
  await frame.evaluate(() => document.exitPointerLock());
  await expect(frame.locator('#pause-panel')).toBeVisible();
  const pose = () => frame.evaluate(() => window.__SKIMMER_SCRAPER__!.snapshot().position);
  const paused = await pose();
  await page.keyboard.press('Alt+Enter');
  await expect.poll(() => fullscreen(frame)).toBe(false);
  expect(await originalCanvas!.evaluate(node => node === document.querySelector('canvas'))).toBe(true);
  expect(await pose()).toEqual(paused);
  await expect(frame.locator('#pause-quit')).toBeHidden();
  await frame.locator('#pause-panel').screenshot({ path: test.info().outputPath('iframe-pause.png') });
  await frame.locator('#pause-resume').click();
  await expect.poll(() => mode(frame)).toBe('running');
  await page.keyboard.press('Alt+Enter');
  await expect.poll(() => fullscreen(frame)).toBe(true);
  await frame.evaluate(() => document.exitFullscreen());
  await expect(frame.locator('#pause-panel')).toBeVisible();
});

test('restricted iframe keeps flying with the keyboard and clears held input on host focus', async ({ page, baseURL }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const frame = await embed(page, baseURL!, false);
  await frame.locator('#start-button').click();
  await expect.poll(() => mode(frame)).toBe('running');
  await page.keyboard.press('Alt+Enter');
  await expect(frame.locator('#toast')).toHaveText(zh['platform.fullscreenUnavailable']);
  expect(await fullscreen(frame)).toBe(false);
  await frame.locator('#game-canvas').click({ position: { x: 150, y: 100 }, force: true });
  await expect(frame.locator('#toast')).toHaveText(zh['platform.pointerLockUnavailable']);
  expect(await frame.evaluate(() => document.pointerLockElement)).toBeNull();
  const roll = () => frame.evaluate(() => window.__SKIMMER_SCRAPER__!.snapshot().control.roll);
  await page.keyboard.down('a');
  await expect.poll(roll).toBeGreaterThan(0.3);
  await page.locator('#outside').click();
  await expect(frame.locator('#pause-panel')).toBeVisible();
  await page.keyboard.up('a');
  await frame.locator('#pause-resume').click();
  await expect.poll(roll).toBeLessThan(0.1);
  await page.keyboard.press('Escape');
  await expect(frame.locator('#pause-panel')).toBeVisible();
  expect(errors).toEqual([]);
});
