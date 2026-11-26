import { expect, test } from '@playwright/test';

test('streams a seeded WorldForge flight, plays local music and releases it on pause', async ({page},info) => {
  test.setTimeout(120000);
  const responses:string[]=[];
  page.on('response',r=>{if(r.url().includes('/music/')&&r.ok())responses.push(r.url());});
  await page.goto('/?theme=worldforge&seed=amber');
  await page.waitForFunction(()=>window.__SKIMMER_SCRAPER__?.snapshot().ready);
  expect(responses).toHaveLength(0);
  await page.getByRole('button',{name:/开始游戏/}).click();
  await page.waitForFunction(()=>window.__SKIMMER_SCRAPER__?.snapshot().mode==='running');
  await page.keyboard.press('f');
  await page.locator('#bgm-enabled').evaluate(input=>{
    for(let p=input.parentElement;p;p=p.parentElement) if(p instanceof HTMLDetailsElement)p.open=true;
  });
  await page.locator('#bgm-enabled').check();
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>{
    const s=window.__SKIMMER_SCRAPER__?.snapshot();
    return s?.mode==='running' && s.music.world==='forge' && s.music.playing && s.music.mediaTime>.25;
  });
  const first=await page.evaluate(()=>window.__SKIMMER_SCRAPER__!.snapshot());
  expect(first.world.collisionTriangles).toBeGreaterThan(1000);
  await page.screenshot({path:info.outputPath('worldforge-chase.png')});
  await page.keyboard.press('f');
  await page.waitForFunction(()=>!window.__SKIMMER_SCRAPER__!.snapshot().music.playing);
  await page.locator('#bgm-next').click();
  await page.keyboard.press('Escape');
  await page.waitForFunction(id=>{
    const m=window.__SKIMMER_SCRAPER__!.snapshot().music;
    return m.selected!==id && m.playing && m.mediaTime>.25;
  },first.music.selected);
  expect(new Set(responses.map(u=>new URL(u).pathname)).size).toBe(2);
});
