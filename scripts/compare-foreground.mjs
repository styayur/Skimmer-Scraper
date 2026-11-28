import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { controlledSchedule, cpuSummary, verifyKineticBudget } from './qualification/flight.mjs';

const [mode, left, right] = process.argv.slice(2);
assert(left && (mode === '--inspect' ? !right : right && ['--parity', '--budget', '--regression'].includes(mode)),
  'Use --inspect FLIGHT, --parity WEB WINDOWS, --budget KINETIC_WEB KINETIC_WINDOWS, or --regression BASELINE CANDIDATE');

function telemetry(rows) {
  const phaseSamples = {}, seedSamples = {}, resources = {};
  for (const row of rows) {
    phaseSamples[row.phase] = (phaseSamples[row.phase] ?? 0) + 1;
    seedSamples[row.seed] = (seedSamples[row.seed] ?? 0) + 1;
  }
  for (const key of ['gpuMs','triangles','calls','residentGeometry','collisionTriangles','heap','activeChunks','bvh','dynamic']) {
    const values = rows.map(row => row[key]).filter(Number.isFinite).sort((a,b) => a-b);
    if (values.length) resources[key] = { median: values[Math.ceil(values.length*.5)-1], p95: values[Math.ceil(values.length*.95)-1] };
  }
  return { phaseSamples, seedSamples, resources };
}

function seedTiming(samples, intervals, wallMs) {
  // Apply the most recent world observation to each animation-frame endpoint.
  // The uncertainty at a transition is one world sampling interval.
  const worlds = new Map();
  for (const [index, row] of samples.entries()) {
    if (!worlds.has(row.seed)) worlds.set(row.seed, { rows: [], intervals: [], dwellMs: 0 });
    const world = worlds.get(row.seed);
    const until = samples[index + 1]?.wallMs ?? wallMs;
    const from = index === 0 ? 0 : row.wallMs;
    assert(until >= from, 'World observations must be chronological');
    world.dwellMs += until - from;
    world.rows.push(row);
  }
  let elapsed = 0;
  let observation = 0;
  for (const interval of intervals) {
    elapsed += interval;
    while (observation + 1 < samples.length && samples[observation + 1].wallMs <= elapsed) observation++;
    worlds.get(samples[observation].seed).intervals.push(interval);
  }
  return Array.from(worlds, ([seed, world]) => {
    const frames = world.intervals.length;
    const duration = world.intervals.reduce((sum, value) => sum + value, 0);
    const sorted = world.intervals.sort((a, b) => a - b);
    return { seed, worldSamples: world.rows.length, approximateDwellSeconds: world.dwellMs / 1000, frames,
      meanFps: frames ? 1000 * frames / duration : null, p95Ms: sorted[Math.ceil(frames * 0.95) - 1] ?? null,
      resources: telemetry(world.rows).resources };
  });
}

const drawFields = ['seed', 'phase', 'triangles', 'calls', 'activeChunks', 'bvh', 'dynamic'];

function drawGroups(samples) {
  const groups = new Map();
  for (const row of samples) {
    if (!(row.gpuMs > 0 && Number.isFinite(row.gpuMs))) continue;
    if (drawFields.some(field => row[field] == null)) continue;
    const key = JSON.stringify(drawFields.map(field => row[field]));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row.gpuMs);
  }
  return groups;
}

function matchedDrawTimers(stock, candidate) {
  const percentile = (sorted, fraction) => sorted[Math.ceil(sorted.length * fraction) - 1] ?? null;
  const ratios = [];
  let stockSamples = 0;
  let candidateSamples = 0;
  for (const [key, first] of stock) {
    const second = candidate.get(key);
    if (!second) continue;
    const stockMedian = percentile(first.sort((a, b) => a - b), 0.5);
    const candidateMedian = percentile(second.sort((a, b) => a - b), 0.5);
    ratios.push(candidateMedian / stockMedian);
    stockSamples += first.length;
    candidateSamples += second.length;
  }
  ratios.sort((a, b) => a - b);
  return { fields: drawFields, groups: ratios.length, stockSamples, candidateSamples,
    gpuTimerRatio: { p25: percentile(ratios, 0.25), median: percentile(ratios, 0.5), p75: percentile(ratios, 0.75) } };
}

async function verified(directory) {
  const report = JSON.parse(await readFile(path.join(directory, 'result.json'), 'utf8'));
  const raw = await readFile(path.join(directory, 'samples.json.gz'));
  assert.equal(createHash('sha256').update(raw).digest('hex'), report.rawSha256);
  const { samples, frameIntervalsMs, hostCpu } = JSON.parse(gunzipSync(raw));
  assert.equal(report.status, 'passed');
  if (mode === '--budget' || (mode === '--inspect' && report.world === 'kinetic-city')) {
    assert(report.seconds >= 180 && report.kineticStart?.selectedTheme === 'kinetic-city', 'Expected a Kinetic City resource flight of at least 180 seconds');
    assert.equal(report.world, 'kinetic-city');
    verifyKineticBudget(samples);
  } else {
    assert(report.enduranceQualified && report.seconds >= 901);
  }
  assert.equal(report.sourceCommit, report.identity.build.sourceCommit);
  assert.deepEqual(report.settings.buffer, [1920, 1080]);
  assert.deepEqual(report.settings.viewport, [1920, 1080]);
  assert.equal(report.settings.dpr, 1);
  assert(report.flightSeconds >= report.seconds && report.wallMs >= report.seconds * 1000);
  assert(!report.focus.lost && report.focus.samples > 0 && report.identity.profileVerified);
  assert.equal(report.scriptedCrossings, 2);
  assert.equal(report.naturalCrossings, report.crossings - report.startCrossings - report.scriptedCrossings);
  assert.equal(report.transitions.length, report.scriptedCrossings);
  if (report.controlledRoute) {
    const schedule = controlledSchedule(report.seconds);
    assert.equal(report.runner.sha256, createHash('sha256').update(JSON.stringify(report.runner.files)).digest('hex'));
    assert.deepEqual(report.controlledRoute.schedule, schedule);
    assert.deepEqual(report.controlledRoute.circuits.map(item => item.scheduled), schedule.circuits);
    assert.deepEqual([report.startSeed,...report.transitions.map(item=>item.after.seed)], schedule.seeds);
    assert.equal(report.naturalCrossings, 0);
    assert.deepEqual(report.measuredCpu, cpuSummary(hostCpu));
    const idle = JSON.parse(await readFile(path.join(directory,'idle-cpu.json'),'utf8'));
    assert.deepEqual(report.idleCpu, cpuSummary(idle.samples));
    assert(report.idleCpu.count===60 && report.idleCpu.medianPercent<=15 && report.idleCpu.p95Percent<=25);
  }
  for (const {before, after} of report.transitions) {
    assert.equal(after.index, before.index + 1);
    assert.equal(after.release.seed, before.seed);
    assert.notEqual(after.seed, before.seed);
    for (const field of ['bvhAfter', 'dynamicBvhAfter', 'rootChildrenAfter']) assert.equal(after.release[field], 0);
  }
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
  for (const [field, bounds] of Object.entries(report.resources)) {
    const values = samples.map(row => row[field]).filter(Number.isFinite);
    assert.deepEqual(bounds, { min: Math.min(...values), max: Math.max(...values), last: values.at(-1) }, field);
  }
  report.telemetry = telemetry(samples);
  if (report.controlledRoute) report.perSeed = seedTiming(samples, frameIntervalsMs, report.wallMs);
  if (report.controlledRoute && mode === '--regression') report.drawGroups = drawGroups(samples);
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
      p95Ms: frames[Math.ceil(frames.length * 0.95) - 1], telemetry: telemetry(samples.filter(row=>row.wallMs<=duration)) };
  }
  return report;
}

const summary = r => ({ platform: r.platform, source: r.sourceCommit, wallSeconds: r.wallMs / 1000,
  frames: r.frames, meanFps: r.meanFps, p95Ms: r.frameMs.p95, scriptedCrossings: r.scriptedCrossings,
  naturalCrossings: r.naturalCrossings, initialWorld240s: r.initialWorld240s, resources: r.resources,
  telemetry: r.telemetry, perSeed: r.perSeed, idleCpu: r.idleCpu, measuredCpu: r.measuredCpu, rendererThreadCpu: r.rendererThreadCpu });
if (mode === '--inspect') {
  console.log(JSON.stringify({ mode, flight: summary(await verified(left)) }, null, 2));
} else {
  const [a, b] = await Promise.all([verified(left), verified(right)]);
  assert.deepEqual(a.settings, b.settings, 'Measured flight settings differ');
  assert.equal(a.world ?? 'city', b.world ?? 'city');
  assert.equal(a.identity.renderer, b.identity.renderer, 'GPU or graphics backend differs');
  if (a.controlledRoute || b.controlledRoute) assert.deepEqual(a.runner, b.runner, 'The controlled flights used different runner bytes');
  for (const key of ['seconds', 'startSeed', 'quality', 'route']) assert.deepEqual(a[key], b[key], key);
  if (mode !== '--regression') {
    assert.equal(a.platform, 'web');
    assert.equal(b.platform, 'windows');
    assert.equal(a.sourceCommit, b.sourceCommit);
    assert.equal(a.identity.build.version, b.identity.build.version);
    if (mode === '--budget') assert.deepEqual(a.kineticStart.fingerprint, b.kineticStart.fingerprint, 'Initial Kinetic worlds differ');
  } else {
    assert.equal(a.platform, b.platform);
    assert.notEqual(a.sourceCommit, b.sourceCommit);
    if (a.controlledRoute) {
      assert.equal(a.identity.browserVersion, b.identity.browserVersion, 'Browser runtime versions differ');
      assert.equal(a.identity.edgeSha256, b.identity.edgeSha256, 'Installed Edge executable digests differ');
    }
  }
  const fpsChange = b.meanFps / a.meanFps - 1;
  const p95Change = b.frameMs.p95 / a.frameMs.p95 - 1;
  const limits = mode === '--regression' ? { fpsPassed: fpsChange >= -0.05, p95Passed: p95Change <= 0.10 } : undefined;
  const matchedDraws = a.drawGroups && b.drawGroups && matchedDrawTimers(a.drawGroups, b.drawGroups);
  const changes = mode === '--budget' ? {} : { fpsChange, p95Change, limits, matchedDraws };
  console.log(JSON.stringify({ mode, left: summary(a), right: summary(b), ...changes }, null, 2));
  if (limits && (!limits.fpsPassed || !limits.p95Passed)) process.exitCode = 1;
}
