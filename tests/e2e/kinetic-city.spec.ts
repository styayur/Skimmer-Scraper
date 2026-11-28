import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { boundarySocket, junctionRow, kineticLayout } from '../../src/world/kinetic/recipe';

test('selects Kinetic City, flies a shared opening, evicts and restores the district, then inverts', async ({page}, info) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const seed = 334458, row = junctionRow(seed,0);
  const portal = boundarySocket(seed,'N',0,row+1);
  await page.goto('/?seed='+seed+'&gen=4');
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().ready);
  await page.keyboard.press('g');
  await page.locator('#world-theme').selectOption('kinetic-city');
  await page.locator('#world-form button[type=submit]').click();
  await expect(page).toHaveURL(/theme=kinetic-city/);
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().streaming?.workerBuildP95Ms != null);
  await page.locator('#start-button').click();
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().mode === 'running');
  const flight = await page.evaluate(async p => {
    const game = window.__SKIMMER_SCRAPER__!;
    game.pause();
    const initial = await game.setPose({x:p.x,y:p.y+9,z:p.z+18},{yaw:0,pitch:0,roll:0});
    const wall = game.glideSurface({x:p.x,y:p.y+1,z:p.z},3);
    const forwardDeck = game.glideSurface({x:p.x,y:p.y+1,z:p.z-0.5},3);
    const rearDeck = game.glideSurface({x:p.x,y:p.y+1,z:p.z+0.5},3);
    const opening = game.surface({x:p.x,y:p.y+6,z:p.z},2);
    game.resume();
    const crossed = await game.advance(0.75);
    game.pause();
    return {initial,crossed,opening,wall,forwardDeck,rearDeck};
  }, portal);
  expect(flight.opening).toBeNull();
  expect(flight.wall?.distance).toBeCloseTo(1,1);
  expect(flight.forwardDeck?.contact?.logicalSurfaceId).toBe('kinetic-grid-1.'+seed+'.spine.0');
  expect(flight.rearDeck?.contact?.logicalSurfaceId).toBe(flight.forwardDeck?.contact?.logicalSurfaceId);
  expect(flight.rearDeck?.chunkId).not.toBe(flight.forwardDeck?.chunkId);
  expect(flight.crossed.position.z).toBeLessThan(portal.z-10);
  expect(flight.crossed.shieldImpacts).toBe(flight.initial.shieldImpacts);
  const key = '0:'+row;
  const first = flight.crossed.chunkStates.find(c => c.key === key)!;
  expect(first.layout).toBe('junction');
  await page.evaluate(() => window.__SKIMMER_SCRAPER__!.setPose({x:15100,y:240,z:-15100}));
  await page.waitForFunction(k => !window.__SKIMMER_SCRAPER__!.snapshot().chunkStates.some(c => c.key === k),key);
  const restored = await page.evaluate(p => window.__SKIMMER_SCRAPER__!.setPose({ ...p, y:p.y+9 }),portal);
  expect(restored.chunkStates.find(c => c.key === key)?.fingerprint).toBe(first.fingerprint);
  expect(restored.streaming!.rebaseCount).toBeGreaterThan(0);
  // Frame a real generated helix and its neighbouring district in the gameplay camera.
  let helix: [number,number] | undefined;
  for (let z = 0; z < 4; z++) for (let x = 0; x < 4; x++) {
    if (kineticLayout(seed,x,z,0) === 'helix') helix = [x,z];
  }
  const north = boundarySocket(seed,'N',...helix!);
  await page.evaluate(p => window.__SKIMMER_SCRAPER__!.setPose({x:p.x+32,y:p.y+62,z:p.z+156},{yaw:0,pitch:-0.24,roll:0}),north);
  await page.evaluate(async () => { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });
  await page.screenshot({ path:info.outputPath('kinetic-helix.jpg'), quality:90 });
  const swapped = await page.evaluate(async p => {
    const g = window.__SKIMMER_SCRAPER__!;
    await g.setPose({...p,y:519},{pitch:1.15,yaw:0,roll:0});
    g.resume();
    return g.advance(5);
  },portal);
  expect(swapped.journey.crossings).toBe(1);
  expect(swapped.seed).not.toBe(seed);
  expect(swapped.chunkStates.some(c => c.layout)).toBe(true);
  expect(swapped.worldReleases.at(-1)).toMatchObject({ bvhAfter:0, rootChildrenAfter:0 });
  expect(swapped.streaming!.activeChunks).toBeLessThanOrEqual(41);
  expect(swapped.companions).toHaveLength(3);
  expect(errors).toEqual([]);
  const report = info.outputPath('kinetic-streaming.json');
  await writeFile(report,JSON.stringify({
    seed, portal, first, restored:restored.chunkStates.find(c => c.key === key), crossed:flight.crossed.position,
    inversion:{ seed:swapped.seed, crossings:swapped.journey.crossings, release:swapped.worldReleases.at(-1) },
    streaming:swapped.streaming,
  },null,2)+'\n');
  await info.attach('kinetic-streaming', {contentType:'application/json', path:report});
});
