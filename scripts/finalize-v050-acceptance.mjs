import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [destination, finalPr] = process.argv.slice(2);
assert(destination && /^[0-9]+$/.test(finalPr), 'Provide the release artifact directory and final PR number.');
const read = file => JSON.parse(readFileSync(file, 'utf8'));
const gh = args => JSON.parse(execFileSync('gh', args, { encoding: 'utf8' }));
const manifest = read(join(destination, 'release-manifest.json'));
assert(['0.5.0', '0.5.0-rc.1'].includes(manifest.version));
const tag = `v${manifest.version}`;
const candidate = manifest.version.endsWith('-rc.1');
const archives = read(join(destination, 'package-verification.json'));
const reproducibility = read(join(destination, 'package-reproduction.json'));
const browserEvidence = candidate ? 'candidate-chrome.json' : 'live-chrome.json';
const verified = read(join(destination, browserEvidence));
const integrated = read('acceptance/v0.5/pr9-integration.json');
const release = gh(['release', 'view', tag, '--json', 'url,tagName,isDraft,isPrerelease,assets']);
assert(release.tagName === tag && !release.isDraft && release.isPrerelease === candidate);
const prs = [27, 28, 29, 30, 31, 32, 33, 34, Number(finalPr)].map(number => {
  const pr = gh(['pr', 'view', String(number), '--json', 'number,state,title,url,mergeCommit,statusCheckRollup']);
  assert.equal(pr.state, 'MERGED');
  const required = ['Typecheck, unit tests, build, browser tests', 'security Actions CodeQL'];
  assert(pr.mergeCommit?.oid && required.every(requiredCheck => pr.statusCheckRollup.some(
    check => check.name === requiredCheck && check.conclusion === 'SUCCESS'
  )));
  return { number: pr.number, title: pr.title, status: pr.state, url: pr.url, commit: pr.mergeCommit.oid };
});
const commit = prs.at(-1).commit;
assert(manifest.sourceCommit === commit && archives.sourceCommit === commit && reproducibility.sourceCommit === commit);
assert(archives.status === 'passed' && reproducibility.status === 'passed');
assert(verified.status === 'passed' && verified.build.sourceCommit === commit && verified.build.version === manifest.version);
assert(manifest.assets.every(asset => release.assets.some(published => published.name === asset.name && published.size === asset.bytes)));

const runs = (workflow, selector) => gh(['run', 'list', '--workflow', workflow, '--commit', commit,
  '--limit', '12', '--json', 'databaseId,url,status,conclusion,event,headBranch']).find(run =>
  run.status === 'completed' && run.conclusion === 'success' && selector(run));
const main = runs('ci.yml', run => run.headBranch === 'main' && run.event === 'push');
const pages = runs('deploy-github-pages.yml', run => run.headBranch === tag && run.event === 'push');
assert(main, 'Merged main CI must succeed');
const publicUrl = 'https://styayur.github.io/Skimmer-Scraper/';
let production;
if (candidate) {
  production = read(join(destination, 'deployment-blocker.json'));
  assert(production.status === 'blocked' && production.observed.url === publicUrl);
  assert(production.observed.sourceCommit !== commit && production.tag === 'v0.5.0');
} else {
  assert(pages && verified.url.startsWith(publicUrl), 'Tag-triggered Pages and its public smoke must both succeed');
  production = { status: 'verified', url: verified.url, sourceCommit: verified.build.sourceCommit, version: verified.build.version };
}
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
  status: candidate ? 'VERIFIED RELEASE CANDIDATE' : 'VERIFIED LIVE',
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
  github: { ciRun: main, deploymentRun: pages ?? null, release: release.url, tag, historical },
  browserVerification: { url: verified.url, build: verified.build, webgl: verified.webgl, bundle: verified.bundle,
    features: { defaults: verified.defaults, voiceSettings: verified.voiceSettings, radio: verified.radio,
      skyInversion: verified.journeys, worldImport: verified.worldImports }, raw: browserEvidence },
  production,
  limitations: integrated.limitations,
};

mkdirSync(join(destination, 'acceptance'), { recursive: true });
writeFileSync(join(destination, 'acceptance', `${tag}.json`), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ version: report.version, commit, status: report.status, pages: pages?.url ?? null, release: release.url }));
