import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

const [mode, left, right] = process.argv.slice(2);
assert(['--parity', '--regression'].includes(mode) && left && right,
  'node scripts/compare-foreground.mjs --parity WEB WINDOWS, or --regression BASELINE CANDIDATE');

async function verified(directory) {
  const report = JSON.parse(await readFile(path.join(directory, 'result.json'), 'utf8'));
  const raw = await readFile(path.join(directory, 'samples.json.gz'));
  assert.equal(createHash('sha256').update(raw).digest('hex'), report.rawSha256);
  const { samples, frameIntervalsMs } = JSON.parse(gunzipSync(raw));
  assert(report.status === 'passed' && report.enduranceQualified && report.seconds >= 901);
  assert(report.flightSeconds >= report.seconds && report.wallMs >= report.seconds * 1000);
  assert(!report.focus.lost && report.focus.samples > 0 && report.identity.profileVerified);
  assert.equal(report.scriptedCrossings, 2);
  assert.equal(samples.length, report.sampleCount);
  assert.equal(frameIntervalsMs.length, report.frames);
  assert(samples.every(row => row.deployed === 3 && row.music.enabled));
  assert.equal(samples.filter(row => row.music.playing).length, report.musicPlayingSamples);
  assert(report.musicPlayingSamples > samples.length / 2);
  assert(frameIntervalsMs.every(ms => ms > 0 && Number.isFinite(ms)));
  const sorted = frameIntervalsMs.toSorted((a, b) => a - b);
  const fps = 1000 * sorted.length / sorted.reduce((sum, ms) => sum + ms, 0);
  assert(Math.abs(fps - report.meanFps) < 1e-8);
  assert.equal(sorted[Math.ceil(sorted.length * 0.95) - 1], report.frameMs.p95);
  // The reference flight stays on the initial seed until its first scheduled approach.
  const duration = 240000;
  if (samples.some(row => row.wallMs >= duration) &&
      samples.every(row => row.wallMs > duration || row.worldIndex === report.startCrossings)) {
    let elapsed = 0;
    const frames = [];
    for (const ms of frameIntervalsMs) {
      if (elapsed + ms > duration) break;
      elapsed += ms;
      frames.push(ms);
    }
    frames.sort((a, b) => a - b);
    report.initialWorld240s = { frames: frames.length, meanFps: 1000 * frames.length / elapsed,
      p95Ms: frames[Math.ceil(frames.length * 0.95) - 1] };
  }
  return report;
}

const [a, b] = await Promise.all([verified(left), verified(right)]);
assert.deepEqual(a.settings, b.settings, 'Measured flight settings differ');
assert.equal(a.world ?? 'city', b.world ?? 'city');
assert.equal(a.identity.renderer, b.identity.renderer, 'GPU or graphics backend differs');
for (const key of ['seconds', 'startSeed', 'quality', 'route']) assert.deepEqual(a[key], b[key], key);
if (mode === '--parity') {
  assert.equal(a.platform, 'web');
  assert.equal(b.platform, 'windows');
  assert.equal(a.sourceCommit, b.sourceCommit);
  assert.equal(a.identity.build.version, b.identity.build.version);
} else {
  assert.equal(a.platform, b.platform);
  assert.notEqual(a.sourceCommit, b.sourceCommit);
}
const fpsChange = b.meanFps / a.meanFps - 1;
const p95Change = b.frameMs.p95 / a.frameMs.p95 - 1;
const limits = mode === '--regression' ? { fpsPassed: fpsChange >= -0.05, p95Passed: p95Change <= 0.10 } : undefined;
const summary = r => ({ platform: r.platform, source: r.sourceCommit, wallSeconds: r.wallMs / 1000,
  frames: r.frames, meanFps: r.meanFps, p95Ms: r.frameMs.p95, scriptedCrossings: r.scriptedCrossings,
  naturalCrossings: r.naturalCrossings, initialWorld240s: r.initialWorld240s, resources: r.resources });
console.log(JSON.stringify({ mode, left: summary(a), right: summary(b), fpsChange, p95Change, limits }, null, 2));
if (limits && (!limits.fpsPassed || !limits.p95Passed)) process.exitCode = 1;
