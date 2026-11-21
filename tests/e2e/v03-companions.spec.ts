import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';

test('three companions retain shared geometry and recover during 120 seconds of boost', async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    localStorage.setItem('skimmer-scraper.rules.v3', JSON.stringify({ mode: 'free' }));
    localStorage.setItem('skimmer-scraper.companions.v3', JSON.stringify({ count: 3 }));
  });
  await page.goto('/?autostart=1&seed=334458');
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().mode === 'running');
  await page.keyboard.down('Shift');
  const states = [];
  for (let i = 0; i < 2; i++) states.push(await page.evaluate(() => window.__SKIMMER_SCRAPER__!.advance(60)));
  await page.keyboard.up('Shift');
  const final = states[1];
  // Boost/shield rebounds can now reach the sky. Journey time includes the legitimate
  // transition freezes; survival time intentionally excludes those cinematics.
  expect(final.mode).toBe('running');expect(final.journey.time).toBeGreaterThanOrEqual(119.99);
  expect(final.runTime).toBeLessThanOrEqual(final.journey.time+0.01);
  expect(final.companions.every(agent => agent.deployed && !agent.uncovered)).toBe(true);
  expect(final.streaming!.activeChunks).toBeLessThanOrEqual(41);
  for (const agent of final.companions) expect(Math.hypot(agent.position.x-final.position.x,agent.position.y-final.position.y,agent.position.z-final.position.z)).toBeLessThan(250);
  writeFileSync('evidence/v0.3/phase-3-boost-recovery.json',JSON.stringify({ method: '120 simulation seconds, deterministic keyboard boost, actual browser and shared streamed BVHs; not a real-time FPS benchmark', states },null,2));
});

for (const count of [1,2,3]) {
  test(`${count} local autonomous companions fly, regroup after rebase and release on retry`, async ({ page }) => {
    test.setTimeout(180_000);
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(n => {
      localStorage.setItem('skimmer-scraper.rules.v3', JSON.stringify({ mode: 'free' }));
      localStorage.setItem('skimmer-scraper.companions.v3', JSON.stringify({ count: n, formation: 'wedge' }));
    }, count);
    await page.goto('/?debug=1&seed=334458');
    await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().mode === 'running');
    await expect(page.locator('#companion-status')).toHaveAttribute('title', 'Local Autonomous Controller');
    const { start, after } = await page.evaluate(async () => {
      const game = window.__SKIMMER_SCRAPER__!;
      const start = game.snapshot();return { start, after: await game.advance(8) };
    });
    expect(after.runTime - start.runTime).toBeCloseTo(8, 4);
    expect(after.companions).toHaveLength(count); expect(after.rules.assisted).toBe(true);
    for (const [index, agent] of after.companions.entries()) {
      expect(agent.decisions).toBeGreaterThan(25);expect(agent.position).not.toEqual(start.companions[index].position);
      expect(Object.values(agent.position).every(Number.isFinite)).toBe(true);
    }
    await page.keyboard.press('f');
    await page.locator('#advanced-flight-settings > summary').click();
    await page.locator('#advanced-flight-settings > details > summary').filter({ hasText: '自主伴机' }).click();
    await page.locator('#companion-formation').selectOption('spread');
    await page.locator('#companion-behavior').selectOption('lead');
    await expect(page.locator('#companion-count')).toBeDisabled();
    await page.locator('#rules-close').click();
    const lead = await page.evaluate(() => window.__SKIMMER_SCRAPER__!.advance(1));
    expect(lead.companionSettings.behavior).toBe('lead');
    await page.evaluate(() => window.__SKIMMER_SCRAPER__!.setPose({ x: 13000, y: 80, z: -13000 }));
    await page.waitForFunction(() => window.__SKIMMER_SCRAPER__!.snapshot().companions.every(agent => !agent.uncovered));
    const rebased = await page.evaluate(() => window.__SKIMMER_SCRAPER__!.advance(2));
    expect(rebased.companions).toHaveLength(count);expect(rebased.streaming!.rebaseCount).toBeGreaterThan(0);
    expect(rebased.streaming!.bvhCount).toBeLessThanOrEqual(41);
    for (const agent of rebased.companions) expect(Math.hypot(agent.position.x-rebased.position.x,agent.position.y-rebased.position.y,agent.position.z-rebased.position.z)).toBeLessThan(220);
    for (let retry = 0; retry < 3; retry++) await page.evaluate(() => window.__SKIMMER_SCRAPER__!.retry());
    const final = await page.evaluate(() => window.__SKIMMER_SCRAPER__!.snapshot());
    expect(final.companions.map(agent => agent.id)).toEqual(Array.from({ length: count }, (_,i)=>i+1));
    expect(final.companionEvents.length).toBeLessThanOrEqual(32); expect(errors).toEqual([]);
    await page.screenshot({ path: `evidence/v0.3/phase-3-${count}-companions.png` });
    let disabled: typeof final | null = null;
    if (count === 3) {
      await page.keyboard.press('Escape'); await page.locator('#pause-menu').click();
      await expect(page.locator('#title-screen')).toBeVisible();await page.keyboard.press('f');
      await page.locator('#companion-count').selectOption('0');await page.locator('#rules-close').click();
      await page.locator('#start-button').click();
      await expect.poll(() => page.evaluate(() => window.__SKIMMER_SCRAPER__!.snapshot().companions.length)).toBe(0);
      expect(await page.evaluate(() => window.__SKIMMER_SCRAPER__!.snapshot().rules.assisted)).toBe(false);
      disabled = await page.evaluate(() => window.__SKIMMER_SCRAPER__!.snapshot());
    }
    writeFileSync(`evidence/v0.3/phase-3-${count}-companions.json`, JSON.stringify({ start, after, lead, rebased, final, disabled, errors },null,2));
  });
}
