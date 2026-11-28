import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [mode, dist, source, manifestPath] = process.argv.slice(2);
assert(['--record', '--verify'].includes(mode) && dist && /^[a-f0-9]{40}$/.test(source) && manifestPath,
  'Use --record or --verify followed by DIST, FULL_SOURCE_SHA and MANIFEST_FILE');
const root = await realpath(dist);
const manifestFile = path.resolve(manifestPath);
const readJson = async file => JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
const build = await readJson(path.join(root, 'build-info.json'));
assert.equal(build.sourceCommit, source);
assert.equal(build.dirty, false);
assert.equal(build.sourceUrl, 'https://github.com/styayur/Skimmer-Scraper/tree/' + source);

const files = [];
async function collect(relative) {
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    const name = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) {
      await collect(name);
    } else {
      assert(entry.isFile(), 'Expected a regular distribution file at ' + name);
      files.push(name);
    }
  }
}
await collect('');
const digests = Object.create(null);
for (const name of files.sort()) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path.join(root, name))) digest.update(chunk);
  digests[name] = digest.digest('hex');
}
const treeSha256 = createHash('sha256').update(JSON.stringify(digests)).digest('hex');
if (mode === '--record') {
  const relative = path.relative(root, manifestFile);
  assert(relative.startsWith('..' + path.sep) || path.isAbsolute(relative), 'Place the manifest outside the frozen distribution');
  await mkdir(path.dirname(manifestFile), { recursive: true });
  await writeFile(manifestFile, JSON.stringify({ source, treeSha256, files: digests }, null, 2) + '\n', { flag: 'wx' });
} else {
  const expected = await readJson(manifestFile);
  assert.equal(expected.source, source);
  assert.equal(treeSha256, expected.treeSha256, 'The distribution tree digest differs');
  assert.deepEqual({ ...digests }, expected.files, 'The distribution file inventory differs');
}
console.log(JSON.stringify({ source, files: files.length, treeSha256 }));
