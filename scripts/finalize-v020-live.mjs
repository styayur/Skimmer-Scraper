import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const reportPath = 'acceptance/v0.2.0.json';
const liveEvidencePath = 'evidence/v0.2.0-live-pages-verification.json';
const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const live = JSON.parse(readFileSync(liveEvidencePath, 'utf8'));
const deployedSha = process.env.DEPLOYED_SHA ??
  spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout?.trim() ??
  null;

report.hosting.githubPages = {
  url: live.baseUrl,
  status: live.status,
  httpStatus: live.httpStatus,
  verifiedAt: live.generatedAt,
  verifiedSourceRevision: deployedSha,
  verifiedMode: live.runtime?.snapshot?.worldMode ?? null,
  webglVersion: live.runtime?.webglVersion ?? null,
  renderer: live.runtime?.renderer ?? null,
};
report.acceptanceStatus = live.status === 'pass' ? 'pass' : 'fail_live_verification';
report.releaseEligibility = live.status === 'pass' && report.performance?.realGpuStatus === 'pass'
  ? 'eligible_for_v0.2.0_release'
  : live.status === 'pass'
    ? 'eligible_with_unverified_real_gpu_performance'
    : 'not_eligible';
report.blockers = (report.blockers ?? []).filter((blocker) => !blocker.startsWith('GitHub Pages production verification'));
if (report.hosting.cloudflarePages?.status !== 'verified') {
  report.blockers.push('Cloudflare Pages remains blocked on OAuth or repository secrets; GitHub Pages is the verified release host.');
}
const bytes = readFileSync(liveEvidencePath);
const evidenceEntry = {
  path: liveEvidencePath,
  bytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'),
};
const existingIndex = report.evidence.findIndex((entry) => entry.path === liveEvidencePath);
if (existingIndex >= 0) report.evidence[existingIndex] = evidenceEntry;
else report.evidence.push(evidenceEntry);
report.liveFinalizedAt = new Date().toISOString();
report.generatedAt = report.liveFinalizedAt;
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}
`);
console.log(JSON.stringify({
  status: report.acceptanceStatus,
  releaseEligibility: report.releaseEligibility,
  githubPages: report.hosting.githubPages,
  blockers: report.blockers,
}, null, 2));
