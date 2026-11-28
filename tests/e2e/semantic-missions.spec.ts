import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { semanticDistrict } from '../fixtures/semanticDistrict';

test('flies three independent local missions from an imported semantic GLB', async ({ page, browser }) => {
  test.setTimeout(150_000);
  const external: string[] = [], errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', req => { if (req.url().startsWith('https:')) external.push(new URL(req.url()).hostname); });
  await page.goto('/?seed=42&gen=3');
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().ready);
  await page.keyboard.press('f');
  await page.locator('#companion-count').selectOption('3');
  await page.locator('#advanced-flight-settings > summary').click();
  await page.locator('summary[data-i18n="ui.autonomousWingmates"]').click();
  await page.locator('#companion-behavior').selectOption('independent');
  await page.locator('#journey-memory-settings > summary').click();
  await page.locator('#journey-memory-enabled').check();
  await expect(page.locator('#journey-memory-share')).toBeEnabled();
  await page.keyboard.press('Escape');
  await page.keyboard.press('g');
  const library = page.locator('#local-world-library');
  if (!await library.evaluate((el: HTMLDetailsElement) => el.open)) await library.locator(':scope > summary').click();
  await page.locator('#local-world-file').setInputFiles({
    name: 'survey-deck.glb', mimeType: 'model/gltf-binary', buffer: semanticDistrict(),
  });
  await page.locator('#local-world-analyze').click();
  await expect(page.locator('#local-world-config')).toBeVisible();
  await page.locator('#local-world-save').uncheck();
  await page.locator('#local-world-apply').click();
  await expect.poll(() => page.evaluate(() => window.__SKIMMER_SCRAPER__!.snapshot().localWorld?.manifest.name)).toBe('survey-deck');
  const data = await page.evaluate(async () => {
    const game = window.__SKIMMER_SCRAPER__!;
    game.start();
    while (game.snapshot().mode !== 'running') await new Promise(r => setTimeout(r, 10));
    await game.advance(0.1, { holdPosition: true });
    const before = game.snapshot();
    const picture = game.aiPerception()!;
    const result = await game.advance(38, { holdPosition: true });
    return { targets: picture.targets.filter(t => t.semanticKind), missions: result.cooperation.missions,
      from: before.companions.map(a => a.position), to: result.companions.map(a => a.position),
      impacts: result.companions.map(a => a.impacts), requests: result.cooperation.model.requests,
      entries: JSON.parse(localStorage.getItem('skimmer.journey-memory.v1')!).entries.map((e: { event: string; detail: string }) => [e.event, e.detail]),
      worldFingerprint: result.worldFingerprint };
  });
  const missions = [...data.missions].sort((a, b) => a.agentId - b.agentId);
  expect(missions.map(m => [m.type, m.observed, m.priority, m.outcome])).toEqual([
    ['FIND_GLIDE_ROUTE', 'glide-route', 'local', 'completed'], ['FIND_ESCAPE', 'escape', 'local', 'completed'],
    ['SCOUT_BRANCH', 'branch', 'local', 'completed'],
  ]);
  expect(data.entries.filter(([event]: string[]) => event === 'mission')).toHaveLength(3);
  expect(data.impacts).toEqual([0,0,0]);
  expect(data.requests).toBe(0);
  expect(JSON.stringify(data)).not.toMatch(/private-|bogus-floating-label/);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
  if (process.env.SKIMMER_JOURNEY_EVIDENCE) {
    const output = 'acceptance/v011/companions';
    mkdirSync(output, { recursive: true });
    writeFileSync(output + '/browser-missions.json', JSON.stringify({ browser: browser.version(), fixedHz: 120,
      command: 'npm run test:e2e -- tests/e2e/semantic-missions.spec.ts', seconds: 38, pilotHeld: true,
      ...data, externalRequests: external, pageErrors: errors }, null, 2) + '\n');
    await page.screenshot({ path: output + '/survey-flight.png', animations: 'disabled' });
  }
});
