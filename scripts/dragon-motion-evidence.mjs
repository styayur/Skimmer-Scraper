import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const [base, output] = process.argv.slice(2);
await mkdir(output, { recursive: true });
const url = new URL(base);
url.search = '?theme=dragon&seed=334458&gen=4&autostart=1';
const browser = await chromium.launch({
  channel: 'msedge',
  headless: false,
  args: ['--use-angle=d3d11', '--disable-software-rasterizer'],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  await page.addInitScript(() => {
    localStorage.setItem(
      'skimmer-scraper.rules.v3',
      JSON.stringify({ mode: 'free', shield: true }),
    );
  });
  await page.goto(url.href);
  await page.waitForFunction(() =>
    window.__SKIMMER_SCRAPER__
      ?.snapshot()
      .dynamicStructures.some((a) => a.id === 'bronze-crest'),
  );
  const info = await page.evaluate(async () => {
    const gl = document.querySelector('canvas').getContext('webgl2');
    return {
      build: await (await fetch('./build-info.json')).json(),
      gpu: gl.getParameter(
        gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL,
      ),
    };
  });
  assert.match(info.gpu, /780M/);
  await page.evaluate(() => window.__SKIMMER_SCRAPER__.pause());
  const frames = [];
  for (const step of [
    9, 0.22, 0.22, 0.22, 0.22, 0.22, 0.22, 0.22, 12, 21, 11, 6, 8,
  ]) {
    const sample = await page.evaluate(async (seconds) => {
      const g = window.__SKIMMER_SCRAPER__;
      g.resume();
      await g.advance(seconds, { holdPosition: true });
      g.pause();
      const dragon = g
        .snapshot()
        .dynamicStructures.find((a) => a.id === 'bronze-crest');
      await g.setPose(
        {
          x: dragon.position.x,
          y: dragon.position.y + 3,
          z: dragon.position.z + 40,
        },
        { yaw: 0, pitch: -0.03, roll: 0 },
      );
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      return { dragon, runTime: g.snapshot().runTime };
    }, step);
    const filename =
      'dragon-' + String(frames.length).padStart(2, '0') + '.jpg';
    await page.screenshot({
      path: path.join(output, filename),
      type: 'jpeg',
      quality: 86,
    });
    frames.push({ filename, ...sample });
  }
  await writeFile(
    path.join(output, 'motion.json'),
    JSON.stringify(
      {
        ...info,
        method:
          'Headed Edge, deterministic fixed-step simulation with a camera pose placed behind the dragon for each frame. Unequal intervals include several behaviors.',
        frames,
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  await browser.close();
}
