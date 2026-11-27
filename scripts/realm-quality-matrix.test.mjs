import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { matrixScenarios, pairedMatrix, selectIndices, withMatrixPack } from './realm-quality-matrix.mjs';

const catalog = matrixScenarios({ expanded: true, realm: 'dragonspine' });
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const write = (file, value) => writeFile(file, JSON.stringify(value));
const helper = fileURLToPath(new URL('./compare-flight-matrices.py', import.meta.url));
const mkFixture = async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'skimmer-matrix-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
};

test('indexed selection retains original catalog order and distinguishes ordinary and glide-off rows', () => {
  assert.equal(catalog.length, 35);
  assert.deepEqual(selectIndices('34,0,33,4', catalog.length), [0, 4, 33, 34]);
  assert.equal(catalog[0].glide, undefined);
  assert.equal(catalog[33].glide, false);
  assert.equal(catalog[34].glide, true);
  for (const invalid of ['', '1,1', '-1', '35', '1.5', '0,']) assert.throws(() => selectIndices(invalid, 35));
});

test('fixed AB/BA, original retention, median, incomplete campaign and identity rejection', async t => {
  const dir = await mkFixture(t);
  const campaign = path.join(dir, 'reruns');
  const baseline = path.join(dir, 'baseline.json'), candidate = path.join(dir, 'candidate.json');
  const urls = { baseline: 'http://base.invalid/', candidate: 'http://candidate.invalid/' };
  const device = side => ({ native: false, renderer: 'test-only', userAgent: 'test browser',
    build: { sourceCommit: side, version: side === 'baseline' ? '0.9.0' : '0.9.1', dirty: false } });
  const row = (index, fps) => ({ ...catalog[index], canvas: [1920, 1080], averageFps: fps, p95Ms: 15, p99Ms: 17, worstMs: 21 });
  const seen = [];
  const fake = async (url, output, mode, options) => {
    const manifest = await json(path.join(campaign, 'paired-reruns.json'));
    const { pair, side } = options;
    assert.equal(url, urls[side]);
    seen.push([pair, side]);
    const indices = selectIndices(options.indices, 35);
    const fps = side === 'baseline' ? 100 : pair === 1 ? 120 : 99;
    await write(output, { device: device(side), seed: 334458, method: manifest.method,
      run: { pair, side, indices, id: pair + side, status: 'passed', catalogSize: 35, runnerSha256: manifest.runnerSha256,
        viewport: [1920, 1080], deviceScaleFactor: 1, sampling: manifest.sampling, profile: manifest.profile, requestedUrl: url },
      rows: indices.map(i => ({ scenarioIndex: i, ...row(i, fps), status: 'passed' })) });
  };
  await pairedMatrix(urls.baseline, urls.candidate, campaign, '34,10', 2, fake);
  assert.deepEqual(seen, [[1, 'baseline'], [1, 'candidate'], [2, 'candidate'], [2, 'baseline']]);
  await assert.rejects(pairedMatrix(urls.baseline, urls.candidate, campaign, '10', 2, fake), /EEXIST/);
  const manifest = await json(path.join(campaign, 'paired-reruns.json'));
  for (const [side, file] of [['baseline', baseline], ['candidate', candidate]]) {
    await write(file, { device: device(side), seed: 334458, method: manifest.method,
      rows: catalog.map((_, i) => row(i, side === 'candidate' && i === 10 ? 80 : 100)) });
  }
  const compare = name => spawnSync('python', [helper, baseline, candidate, path.join(dir, name), '--reruns', campaign], { encoding: 'utf8' });
  const original = await readFile(candidate, 'utf8');
  const result = compare('summary.json');
  assert.equal(result.status, 0, result.stderr);
  const summary = await json(path.join(dir, 'summary.json'));
  assert.equal(summary.originalOutsideTarget, 1);
  assert.equal(summary.outsideTarget, 0);
  assert.equal(summary.rows[10].attempts.length, 3);
  assert.equal(summary.rows[0].attempts.length, 1);
  assert.equal(summary.rows[10].median.candidate.averageFps, 99);
  assert(Math.abs(summary.rows[10].median.fpsChangePercent + 1) < 1e-7);
  assert.equal(summary.rows[10].original.candidate.averageFps, 80);
  assert.equal(summary.rows[10].candidate.averageFps, 99);
  assert.equal(await readFile(candidate, 'utf8'), original);
  const partial = await json(path.join(campaign, 'pair-2-candidate.json'));
  manifest.attempts[2].status = partial.run.status = 'failed';
  manifest.attempts[2].error = 'fixture failure';
  partial.rows.pop();
  await write(path.join(campaign, 'paired-reruns.json'), manifest);
  await write(path.join(campaign, 'pair-2-candidate.json'), partial);
  assert.equal(compare('partial.json').status, 2);
  const incomplete = await json(path.join(dir, 'partial.json'));
  assert.equal(incomplete.complete, false);
  assert.equal(incomplete.outsideTarget, null);
  assert.equal(incomplete.rows[34].attempts.at(-1).status, 'incomplete');
  partial.device.build.sourceCommit = 'different';
  await write(path.join(campaign, 'pair-2-candidate.json'), partial);
  assert.match(compare('wrong.json').stderr, /Wrong build/);
});

test('native pack cleanup restores selection, preserves existing packs and handles partial setup', async t => {
  const dir = await mkFixture(t);
  const id = 'ascendant-high-2-334458', manifest = { id, files: [{ sha256: 'fixture' }] };
  const key = 'skimmer-scraper.active-pack';
  const store = new Map([[key, 'personal-pack']]);
  const library = new Map([['personal-pack', { id: 'personal-pack' }]]);
  const removed = [];
  let imports = 0, failSetup = false;
  const localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) };
  const invoke = (cmd, args) => {
    if (cmd === 'pack_list') return [...library.values()];
    assert.equal(cmd, 'pack_remove');
    removed.push(args.id);
    library.delete(args.id);
  };
  const locator = { evaluate: async () => true, locator: () => locator, isVisible: async () => false,
    setInputFiles: async () => { imports++; library.set(id, manifest); } };
  const page = { keyboard: { press: async () => {} }, locator: () => locator,
    waitForFunction: async () => { if (failSetup) throw Error('setup timed out'); },
    evaluate: async (fn, arg) => structuredClone(await runInNewContext('(' + fn.toString() + ')(arg)', {
      arg, localStorage, window: { __TAURI__: { core: { invoke } } },
    })) };
  await write(path.join(dir, 'world-pack.json'), { id: 'wrong' });
  const measure = async () => { assert.equal(store.get(key), id); throw Error('measurement failed'); };
  await assert.rejects(withMatrixPack(page, id, dir, measure), /manifest/);
  assert.equal(imports, 0);
  await write(path.join(dir, 'world-pack.json'), manifest);
  await assert.rejects(withMatrixPack(page, id, dir, measure), /measurement failed/);
  assert.equal(store.get(key), 'personal-pack');
  assert.deepEqual(removed, [id]);
  failSetup = true;
  await assert.rejects(withMatrixPack(page, id, dir, measure), /setup timed out/);
  assert.deepEqual(removed, [id, id]);
  library.set(id, manifest);
  await write(path.join(dir, 'world-pack.json'), { id, files: [] });
  await assert.rejects(withMatrixPack(page, id, dir, measure), /differs from the supplied pack/);
  await assert.rejects(withMatrixPack(page, id, undefined, measure), /measurement failed/);
  await withMatrixPack(page, id, undefined, async metadata => {
    assert.deepEqual(metadata, { id, preinstalled: true, manifest });
    await assert.rejects(withMatrixPack(page, id, undefined, measure), /EADDRINUSE|EACCES/);
  });
  assert.equal(imports, 2);
  assert.equal(removed.length, 2);
  assert.equal(library.size, 2);
  assert.equal(store.get(key), 'personal-pack');
});
