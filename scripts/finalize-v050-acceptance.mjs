import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [destination, finalPr] = process.argv.slice(2);
assert(destination && /^[0-9]+$/.test(finalPr), 'Provide the release artifact directory and final PR number.');
const read = file => JSON.parse(readFileSync(file, 'utf8'));
const gh = args => JSON.parse(execFileSync('gh', args, { encoding: 'utf8' }));
const tag = 'v0.5.0';
const manifest = read(join(destination, 'release-manifest.json'));
const archives = read(join(destination, 'package-verification.json'));
const reproducibility = read(join(destination, 'package-reproduction.json'));
const live = read(join(destination, 'live-chrome.json'));
const integrated = read('acceptance/v0.5/pr9-integration.json');
const release = gh(['release', 'view', tag, '--json', 'url,tagName,isDraft,isPrerelease,assets']);
assert(release.tagName === tag && !release.isDraft && !release.isPrerelease);
const prs = [27, 28, 29, 30, 31, 32, 33, 34, Number(finalPr)].map(number => {
  const pr = gh(['pr', 'view', String(number), '--json', 'number,state,title,url,mergeCommit,statusCheckRollup']);
  assert.equal(pr.state, 'MERGED');
  assert(pr.mergeCommit?.oid && pr.statusCheckRollup.some(check => check.name === 'Typecheck, unit tests, build, browser tests' && check.conclusion === 'SUCCESS'));
  return { number: pr.number, title: pr.title, status: pr.state, url: pr.url, commit: pr.mergeCommit.oid };
});
const commit = prs.at(-1).commit;
assert(manifest.sourceCommit === commit && archives.sourceCommit === commit && reproducibility.sourceCommit === commit);
assert(manifest.version === '0.5.0' && archives.status === 'passed' && reproducibility.status === 'passed');
assert(live.status === 'passed' && live.build.sourceCommit === commit && live.build.version === manifest.version);
assert(manifest.assets.every(asset => release.assets.some(published => published.name === asset.name && published.size === asset.bytes)));

const runs = (workflow, selector) => gh(['run', 'list', '--workflow', workflow, '--commit', commit,
  '--limit', '12', '--json', 'databaseId,url,status,conclusion,event,headBranch']).find(run =>
  run.status === 'completed' && run.conclusion === 'success' && selector(run));
const main = runs('ci.yml', run => run.headBranch === 'main' && run.event === 'push');
const pages = runs('deploy-github-pages.yml', run => run.headBranch === tag && run.event === 'push');
assert(main && pages, 'Merged main CI and tag-triggered Pages must both succeed');
const historical = Object.fromEntries(['v0.1.0', 'v0.2.0', 'v0.3.0-rc.1'].map(tag => {
  const release = gh(['release', 'view', tag, '--json', 'tagName,url,isDraft,isPrerelease']);
  const reference = execFileSync('git', ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`, `refs/tags/${tag}^{}`], { encoding: 'utf8' }).trim();
  const commit = reference.split('\n').at(-1)?.split(/\s/)[0];
  assert(release.tagName === tag && !release.isDraft && /^[a-f0-9]{40}$/.test(commit));
  return [tag, { commit, url: release.url, prerelease: release.isPrerelease }];
}));

const report = {
  version: manifest.version,
  sourceCommit: commit,
  generatedAt: new Date().toISOString(),
  status: 'VERIFIED LIVE',
  pullRequests: prs,
  tests: integrated.tests,
  browsers: integrated.browsers,
  hardware: integrated.hardware,
  resourceStability: integrated.resourceStability,
  worldImport: integrated.worldImport,
  skyInversion: integrated.skyInversion,
  city: read('acceptance/v0.5/pr3-city.json'),
  motionCollision: read('acceptance/v0.5/pr6-motion.json'),
  dialogue: read('acceptance/v0.5/pr7-radio.json'),
  voice: read('acceptance/v0.5/pr8-voice.json'),
  privacy: archives,
  distribution: { manifest, reproducibility },
  github: { ciRun: main, deploymentRun: pages, release: release.url, tag, historical },
  production: { url: live.url, sourceCommit: live.build.sourceCommit, version: live.build.version,
    webgl: live.webgl, bundle: live.bundle, features: { defaults: live.defaults, voiceSettings: live.voiceSettings,
      radio: live.radio, skyInversion: live.journeys, worldImport: live.worldImports }, raw: 'live-chrome.json' },
  limitations: integrated.limitations,
};

mkdirSync(join(destination, 'acceptance'), { recursive: true });
writeFileSync(join(destination, 'acceptance', 'v0.5.0.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ version: report.version, commit, status: report.status, pages: pages.url, release: release.url }));
