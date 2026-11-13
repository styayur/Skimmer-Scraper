import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const phase = JSON.parse(readFileSync('acceptance/phase-4.json', 'utf8'));
const runtime = JSON.parse(readFileSync('evidence/phase-4-v0.1.0-runtime.json', 'utf8'));
const evidence = phase.evidence.map((item) => {
  const bytes = readFileSync(item.path);
  return {
    ...item,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
});

const final = {
  schemaVersion: 1,
  product: 'Skimmer-Scraper',
  version: '0.1.0',
  generatedAt: new Date().toISOString(),
  sourceRevisionAtAcceptance: phase.sourceRevision,
  acceptanceStatus: 'pass_with_external_blockers',
  releaseEligibility: 'eligible_for_v0.1.0_source_release',
  tests: {
    unitAndIntegration: phase.unitTests,
    browser: phase.browserTests,
    phaseReport: 'acceptance/phase-4.json',
    commands: phase.commands,
  },
  gameplayAcceptance: {
    closeSurfaceRule: 'pass',
    graceExpiry: 'pass',
    impactFailure: 'pass',
    instantRetry: 'pass',
    localPersonalBest: 'pass',
    localGlbImport: 'pass',
    noModelUpload: 'pass',
    fixedTimestepDeterminism: 'pass',
    webgl2Default: 'pass',
    webgl2UnavailableFallback: 'pass',
  },
  runtime: {
    evidence: 'evidence/phase-4-v0.1.0-runtime.json',
    webgl: runtime.webgl,
    world: runtime.snapshot.world,
    render: runtime.snapshot.render,
    caveat: runtime.caveat,
  },
  hosting: {
    githubPagesPreview: {
      url: 'https://styayur.github.io/Skimmer-Scraper/',
      status: 'configured_for_main_deployment',
      role: 'temporary public HTTPS preview',
    },
    cloudflarePages: {
      status: 'blocked',
      reason: 'Wrangler OAuth expired; no CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID or repository secrets were available.',
      configuredFiles: [
        '.github/workflows/deploy-cloudflare-pages.yml',
        'wrangler.toml',
      ],
      liveUrl: null,
    },
  },
  realGpuPerformance: {
    status: 'not_performed',
    reason: 'Available automated browser evidence uses headless Chromium with SwiftShader software rendering.',
  },
  evidence,
  deliverables: phase.deliverables,
  caveats: phase.caveats,
};

writeFileSync('acceptance/v0.1.0.json', `${JSON.stringify(final, null, 2)}\n`);
console.log('Wrote acceptance/v0.1.0.json');
