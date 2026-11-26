import { expect, test } from '@playwright/test';
import { bestStorageKey, defaultScoreContext } from '../../src/game/storage';

test('an attached Challenge run saves to its glide category after detach and resets on retry', async ({page}) => {
  const standard = bestStorageKey(defaultScoreContext);
  const assisted = bestStorageKey({...defaultScoreContext, surfaceGlide: true});
  await page.addInitScript(({standard}) => {
    localStorage.setItem('skimmer-scraper.companions.v3', JSON.stringify({count:0}));
    localStorage.setItem('skimmer-scraper.rules.v3', JSON.stringify({mode:'challenge'}));
    localStorage.setItem(standard, '37.25');
  }, {standard});
  await page.goto('/?seed=334458&gen=2');
  await page.locator('#start-button').click();
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().mode === 'running');
  await page.evaluate(async () => {
    const game = window.__SKIMMER_SCRAPER__!;
    game.pause();
    await game.setPose({x:6,y:6,z:34},{pitch:0,yaw:0,roll:0});
    game.resume();
    await game.advance(3 / 120);
  });
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__!.snapshot().glide.phase === 'GLIDING');
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__!.snapshot().glide.phase === 'FLIGHT');
  expect(await page.evaluate(() => window.__SKIMMER_SCRAPER__!.snapshot().surfaceGlideAssisted)).toBe(true);
  // Penetrate the physical ground to end the run through the normal scoring path.
  await page.evaluate(() => window.__SKIMMER_SCRAPER__!.setPose({x:6,y:1,z:0}));
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__!.snapshot().mode === 'failed');
  expect(await page.evaluate(key => Number(localStorage.getItem(key)), assisted)).toBeGreaterThan(0);
  expect(await page.evaluate(key => localStorage.getItem(key), standard)).toBe('37.25');
  await page.keyboard.press('r');
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__!.snapshot().mode === 'running');
  expect(await page.evaluate(() => window.__SKIMMER_SCRAPER__!.snapshot().surfaceGlideAssisted)).toBe(false);
});
