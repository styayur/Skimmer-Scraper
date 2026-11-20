import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';

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
    await expect(page.locator('#companion-status')).toContainText('Local Autonomous Controller');
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
    await page.locator('#rules-open').click();
    await page.locator('#rules-panel summary').filter({ hasText: '自主伴机' }).click();
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
      await expect(page.locator('#title-screen')).toBeVisible();await page.locator('#rules-open').click();
      await page.locator('#companion-count').selectOption('0');await page.locator('#rules-close').click();
      await page.locator('#start-button').click();
      await expect.poll(() => page.evaluate(() => window.__SKIMMER_SCRAPER__!.snapshot().companions.length)).toBe(0);
      expect(await page.evaluate(() => window.__SKIMMER_SCRAPER__!.snapshot().rules.assisted)).toBe(false);
      disabled = await page.evaluate(() => window.__SKIMMER_SCRAPER__!.snapshot());
    }
    writeFileSync(`evidence/v0.3/phase-3-${count}-companions.json`, JSON.stringify({ start, after, lead, rebased, final, disabled, errors },null,2));
  });
}
