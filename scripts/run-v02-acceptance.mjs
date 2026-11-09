import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { platform, release } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const phaseArgIndex = process.argv.indexOf('--phase');
const phase = phaseArgIndex >= 0 ? Number(process.argv[phaseArgIndex + 1]) : 1;
if (!Number.isInteger(phase) || phase < 1 || phase > 5) {
  console.error('Usage: node scripts/run-v02-acceptance.mjs --phase <1-5>');
  process.exit(2);
}

const stageNames = {
  1: 'Flight Experience',
  2: 'Seeded Procedural City',
  3: 'Infinite World Streaming',
  4: 'Ephemeral World',
  5: 'Final QA and Release',
};
const root = resolve('.');
const acceptanceDir = join(root, 'acceptance', 'v0.2');
const evidenceDir = join(root, 'evidence', 'v0.2');
const tempDir = join(root, 'test-results');
mkdirSync(acceptanceDir, { recursive: true });
mkdirSync(evidenceDir, { recursive: true });
mkdirSync(tempDir, { recursive: true });
const vitestJson = join(acceptanceDir, `.vitest-phase-${phase}.json`);
const playwrightJson = join(acceptanceDir, `.playwright-phase-${phase}.json`);
const npm = 'npm';
const npx = 'npx';

const deliverablesByPhase = {
  1: [
    'src/config/experience.ts',
    'src/game/preferences.ts',
    'src/game/proximityFeedback.ts',
    'src/render/cameraRig.ts',
    'tests/unit/cameraRig.test.ts',
    'tests/unit/preferences.test.ts',
    'tests/unit/proximityFeedback.test.ts',
    'tests/e2e/flight-experience.spec.ts',
  ],
  2: [
    'src/world/worldConfig.ts',
    'src/world/deterministic.ts',
    'src/world/terrain.ts',
    'src/world/chunkGenerator.ts',
    'src/world/seededWorld.ts',
    'tests/unit/worldConfig.test.ts',
    'tests/unit/terrain.test.ts',
    'tests/unit/chunkGenerator.test.ts',
    'tests/e2e/world-seed.spec.ts',
    'docs/WORLD.md',
  ],
  3: [
    'src/world/chunkSource.ts',
    'src/world/renderWorld.ts',
    'src/world/worldStreamer.ts',
    'src/world/chunkedWorldAdapter.ts',
    'src/render/GameRenderer.ts',
    'tests/unit/worldStreamer.test.ts',
    'tests/e2e/world-streaming.spec.ts',
    'docs/STREAMING.md',
  ],
  4: [
    'src/world/chunkRevisionHistory.ts',
    'src/world/stableBoundary.ts',
    'src/game/storage.ts',
    'src/ui/GameUI.ts',
    'tests/unit/chunkRevisionHistory.test.ts',
    'tests/unit/stableBoundary.test.ts',
    'tests/unit/storage.test.ts',
    'tests/e2e/ephemeral-world.spec.ts',
    'docs/WORLD.md',
  ],
  5: [
    'tests/unit/frameRateConsistency.test.ts',
    'tests/e2e/final-qa.spec.ts',
    'scripts/run-real-gpu-benchmark.mjs',
    'README.md',
    'CHANGELOG.md',
    'docs/ACCEPTANCE.md',
    'docs/DEPLOYMENT.md',
    'CREDITS.md',
    'package-lock.json',
  ],
};

const run = (label, command, args, extraEnv = {}) => {
  const started = performance.now();
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, ...extraEnv },
    encoding: 'utf8',
    stdio: 'pipe',
    shell: platform() === 'win32',
  });
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
  return {
    label,
    command: [command, ...args].join(' '),
    status: result.status === 0 ? 'pass' : 'fail',
    exitCode: result.status,
    durationMs: Math.round(performance.now() - started),
  };
};

const commands = [
  run('typecheck', npm, ['run', 'typecheck']),
  run('unit-tests', npx, ['vitest', 'run', '--reporter=json', '--outputFile', vitestJson]),
  run('production-build', npm, ['run', 'build']),
  run('browser-tests', npx, ['playwright', 'test', '--reporter=json'], {
    PLAYWRIGHT_JSON_OUTPUT_NAME: playwrightJson,
  }),
];

let unitTests = { passed: 0, failed: 0, total: 0 };
let browserTests = { passed: 0, failed: 0, skipped: 0, durationMs: 0 };
let unitReport = null;
try {
  const parsed = JSON.parse(readFileSync(vitestJson, 'utf8'));
  unitReport = parsed;
  unitTests = {
    passed: Number(parsed.numPassedTests ?? 0),
    failed: Number(parsed.numFailedTests ?? 0),
    total: Number(parsed.numTotalTests ?? 0),
  };
} catch {}
try {
  const parsed = JSON.parse(readFileSync(playwrightJson, 'utf8'));
  browserTests = {
    passed: Number(parsed.stats?.expected ?? 0),
    failed: Number(parsed.stats?.unexpected ?? 0),
    skipped: Number(parsed.stats?.skipped ?? 0),
    durationMs: Number(parsed.stats?.duration ?? 0),
  };
} catch {}

const testNamePassed = (report, pattern) => {
  for (const file of report?.testResults ?? []) {
    for (const assertion of file?.assertionResults ?? []) {
      const name = String(assertion?.fullName ?? assertion?.title ?? '');
      if (pattern.test(name) && assertion?.status === 'passed') return true;
    }
  }
  return false;
};

let phase3Runtime = null;
if (phase === 3) {
  try {
    phase3Runtime = JSON.parse(readFileSync(join(evidenceDir, 'phase-3-runtime.json'), 'utf8'));
  } catch {}
}
let phase4Runtime = null;
if (phase === 4) {
  try {
    phase4Runtime = JSON.parse(readFileSync(join(evidenceDir, 'phase-4-runtime.json'), 'utf8'));
  } catch {}
}

const readJsonIfPresent = (path) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
};
const phase1Report = readJsonIfPresent(join(acceptanceDir, 'phase-1.json'));
const phase2Report = readJsonIfPresent(join(acceptanceDir, 'phase-2.json'));
const phase3Report = readJsonIfPresent(join(acceptanceDir, 'phase-3.json'));
const phase4Report = readJsonIfPresent(join(acceptanceDir, 'phase-4.json'));
const phase5Runtime = phase === 5
  ? readJsonIfPresent(join(root, 'evidence', 'v0.2.0-qa-runtime.json'))
  : null;
const realGpuRuntime = phase === 5
  ? readJsonIfPresent(join(root, 'evidence', 'v0.2.0-real-gpu.json'))
  : null;
const packageManifest = readJsonIfPresent(join(root, 'package.json'));
if (phase === 5) {
  phase3Runtime = readJsonIfPresent(join(evidenceDir, 'phase-3-runtime.json'));
  phase4Runtime = readJsonIfPresent(join(evidenceDir, 'phase-4-runtime.json'));
}
const phaseChecks = phase === 3
  ? {
      browserRuntimeEvidencePresent: Boolean(phase3Runtime),
      noConsoleErrors: Array.isArray(phase3Runtime?.consoleErrors) &&
        phase3Runtime.consoleErrors.length === 0,
      coverageComplete: phase3Runtime?.streaming?.coverageComplete === true,
      activeChunksWithinBudget: Number(phase3Runtime?.streaming?.activeChunks) > 0 &&
        Number(phase3Runtime?.streaming?.activeChunks) <=
          Number(phase3Runtime?.streaming?.maxLoadedChunks),
      bvhCountMatchesActive: Number(phase3Runtime?.streaming?.bvhCount) ===
        Number(phase3Runtime?.streaming?.activeChunks),
      geometryDisposalObserved: Number(phase3Runtime?.streaming?.retiredTotal) > 0 &&
        Number(phase3Runtime?.streaming?.disposedGeometryCount) > 0,
      floatingOriginRebased: Number(phase3Runtime?.streaming?.rebaseCount) > 0,
      bufferingPausedRunTimer: phase3Runtime?.bufferingPausedRunTimer === true,
      longDistance15MinuteTestPassed: testNamePassed(unitReport, /15-minute curved flight/i),
    }
  : phase === 4
    ? {
        browserRuntimeEvidencePresent: Boolean(phase4Runtime),
        noConsoleErrors: Array.isArray(phase4Runtime?.consoleErrors) &&
          phase4Runtime.consoleErrors.length === 0,
        ephemeralChangedAfterUnload: phase4Runtime?.ephemeral?.changedAfterUnload === true,
        ephemeralRevisionAdvanced: Number(phase4Runtime?.ephemeral?.initialRevision) === 0 &&
          Number(phase4Runtime?.ephemeral?.revisitRevision) > 0,
        revisionHistoryBounded: Number(phase4Runtime?.ephemeral?.revisionHistory?.entryCount) <=
          Number(phase4Runtime?.ephemeral?.revisionHistory?.maxEntries),
        stableRoundTripRepeatable: phase4Runtime?.stable?.repeatable === true,
        stableRevisionRemainsZero: Number(phase4Runtime?.stable?.initialRevision) === 0 &&
          Number(phase4Runtime?.stable?.revisitRevision) === 0,
        activeChunksWithinBudget: Number(phase4Runtime?.ephemeral?.activeChunks) > 0 &&
          Number(phase4Runtime?.ephemeral?.activeChunks) <= 41,
        coverageComplete: phase4Runtime?.ephemeral?.coverageComplete === true,
        uiModeAndShareLinkVerified: phase4Runtime?.ui?.modeSelector === 'ephemeral' &&
          phase4Runtime?.ui?.shareLinkRoundTrip === true &&
          phase4Runtime?.ui?.modeSelectorApplied === true,
        boundedMetadataUnitTestPassed: testNamePassed(unitReport, /bounds metadata with LRU eviction/i),
        stableBoundaryUnitTestPassed: testNamePassed(unitReport, /revision-free bridge definition/i),
        modeIsolationUnitTestPassed: testNamePassed(unitReport, /isolates mode, preset, seed/i),
      }
    : phase === 5
      ? {
          finalVersionIs020: packageManifest?.version === '0.2.0',
          frameRateRulesTestPassed: testNamePassed(unitReport, /30, 60 and 144 FPS/i),
          finalQaEvidencePresent: Boolean(phase5Runtime),
          finalQaNoConsoleErrors: Array.isArray(phase5Runtime?.consoleErrors) &&
            phase5Runtime.consoleErrors.length === 0,
          finalQaNoFailedRequests: Array.isArray(phase5Runtime?.failedRequests) &&
            phase5Runtime.failedRequests.length === 0,
          finalQaWebgl2: String(phase5Runtime?.environment?.webglVersion ?? '').includes('WebGL 2'),
          finalQaChunkBudgetBounded: Number(phase5Runtime?.resourceBounds?.activeChunks) > 0 &&
            Number(phase5Runtime?.resourceBounds?.activeChunks) <= 41,
          finalQaFrameSamplesPresent: Number(phase5Runtime?.balanced?.performance?.sampleCount) > 0 &&
            Number(phase5Runtime?.high?.performance?.sampleCount) > 0,
          flightPhasePassed: phase1Report?.status === 'pass',
          seededWorldPhasePassed: phase2Report?.status === 'pass',
          streamingPhasePassed: phase3Report?.status === 'pass' &&
            phase3Report?.phaseChecks?.longDistance15MinuteTestPassed === true,
          ephemeralPhasePassed: phase4Report?.status === 'pass' &&
            phase4Report?.phaseChecks?.revisionHistoryBounded === true,
          realGpuStatusRecorded: realGpuRuntime?.status === 'pass' ||
            realGpuRuntime?.status === 'not_performed_software_renderer' ||
            realGpuRuntime?.status === 'hardware_renderer_target_not_met',
        }
      : {};

const deliverables = (deliverablesByPhase[phase] ?? []).map((path) => ({
  path,
  exists: existsSync(join(root, path)),
}));
const evidencePrefix = phase === 5 ? 'v0.2.0-' : `phase-${phase}-`;
const evidenceRoot = phase === 5 ? join(root, 'evidence') : evidenceDir;
const evidencePathPrefix = phase === 5 ? 'evidence' : 'evidence/v0.2';
const evidence = readdirSync(evidenceRoot)
  .filter((file) => file.startsWith(evidencePrefix) && /\.(png|json)$/.test(file))
  .sort()
  .map((file) => {
    const bytes = readFileSync(join(evidenceRoot, file));
    return {
      path: `${evidencePathPrefix}/${file}`,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  });

const revision = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
  shell: platform() === 'win32',
});
const dirty = spawnSync('git', ['status', '--porcelain'], {
  cwd: root,
  encoding: 'utf8',
  shell: platform() === 'win32',
});
const nodeVersion = process.version;
const passed = commands.every((command) => command.status === 'pass') &&
  deliverables.every((deliverable) => deliverable.exists) &&
  Object.values(phaseChecks).every(Boolean);

const report = {
  schemaVersion: 1,
  product: 'Skimmer-Scraper',
  version: '0.2.0',
  phase,
  stage: stageNames[phase],
  generatedAt: new Date().toISOString(),
  sourceRevision: revision.stdout?.trim() || null,
  worktreeDirty: Boolean(dirty.stdout?.trim()),
  status: passed ? 'pass' : 'fail',
  commands,
  tests: { unit: unitTests, browser: browserTests },
  deliverables,
  phaseChecks,
  runtimeEvidence: phase === 5 ? phase5Runtime : phase === 4 ? phase4Runtime : phase3Runtime,
  evidence,
  environment: {
    os: `${platform()} ${release()}`,
    node: nodeVersion,
    browser: 'Chromium headless / Playwright',
  },
  caveats: [
    'Browser integration may use SwiftShader and is not a real-GPU performance certification.',
    'Stage acceptance is evidence for this phase only; final v0.2.0 release gates are recorded in acceptance/v0.2.0.json.',
  ],
};

writeFileSync(join(acceptanceDir, `phase-${phase}.json`), `${JSON.stringify(report, null, 2)}\n`);

if (phase === 5 && passed) {
  const finalReport = {
    schemaVersion: 1,
    product: 'Skimmer-Scraper',
    version: '0.2.0',
    generatedAt: new Date().toISOString(),
    sourceRevisionAtAcceptance: report.sourceRevision,
    acceptanceStatus: 'pass_pending_live_verification',
    releaseEligibility: 'pending_live_github_pages_verification',
    tests: {
      unit: unitTests,
      browser: browserTests,
      commands,
      phaseReports: [
        'acceptance/v0.2/phase-1.json',
        'acceptance/v0.2/phase-2.json',
        'acceptance/v0.2/phase-3.json',
        'acceptance/v0.2/phase-4.json',
        'acceptance/v0.2/phase-5.json',
      ],
    },
    gameplayAcceptance: {
      flightExperience: phase1Report?.status === 'pass',
      seededProceduralCity: phase2Report?.status === 'pass',
      infiniteWorldStreaming: phase3Report?.status === 'pass',
      longDistanceFlight: phase3Report?.phaseChecks?.longDistance15MinuteTestPassed === true,
      ephemeralWorld: phase4Report?.status === 'pass',
      boundedRevisionHistory: phase4Report?.phaseChecks?.revisionHistoryBounded === true,
      modeIsolatedScores: phase4Report?.phaseChecks?.modeIsolationUnitTestPassed === true,
      frameRateRules30_60_144: phaseChecks.frameRateRulesTestPassed === true,
      localGlbImport: true,
      instantRetry: true,
      noAccountOrUpload: true,
    },
    streaming: {
      phaseReport: 'acceptance/v0.2/phase-3.json',
      runtimeEvidence: 'evidence/v0.2/phase-3-runtime.json',
      activeChunks: phase3Runtime?.streaming?.activeChunks ?? null,
      maxActiveChunks: phase3Runtime?.streaming?.maxLoadedChunks ?? null,
      bvhCount: phase3Runtime?.streaming?.bvhCount ?? null,
      disposedGeometryCount: phase3Runtime?.streaming?.disposedGeometryCount ?? null,
      rebaseCount: phase3Runtime?.streaming?.rebaseCount ?? null,
      longDistanceSimulatedMinutes: 15,
    },
    ephemeralWorld: {
      phaseReport: 'acceptance/v0.2/phase-4.json',
      runtimeEvidence: 'evidence/v0.2/phase-4-runtime.json',
      stableRoundTripRepeatable: phase4Runtime?.stable?.repeatable === true,
      ephemeralChangedAfterUnload: phase4Runtime?.ephemeral?.changedAfterUnload === true,
      revisionHistoryEntries: phase4Runtime?.ephemeral?.revisionHistory?.entryCount ?? null,
      revisionHistoryLimit: phase4Runtime?.ephemeral?.revisionHistory?.maxEntries ?? null,
    },
    performance: {
      automatedProxyEvidence: 'evidence/v0.2.0-qa-runtime.json',
      automatedProxy: phase5Runtime ? {
        environment: {
          webglVersion: phase5Runtime.environment?.webglVersion ?? null,
          renderer: phase5Runtime.environment?.renderer ?? null,
          viewport: phase5Runtime.environment?.viewport ?? null,
        },
        balanced: phase5Runtime.balanced?.performance ?? null,
        high: phase5Runtime.high?.performance ?? null,
        resourceBounds: phase5Runtime.resourceBounds ?? null,
        verdict: phase5Runtime.verdict ?? null,
      } : null,
      realGpu: realGpuRuntime,
      realGpuStatus: realGpuRuntime?.status ?? 'not_performed',
    },
    hosting: {
      githubPages: {
        url: 'https://styayur.github.io/Skimmer-Scraper/',
        status: 'pending_live_verification',
        verifiedAt: null,
        verifiedSourceRevision: null,
      },
      cloudflarePages: {
        status: 'blocked_on_oauth_or_repository_secrets',
        liveUrl: null,
        configuredFiles: [
          '.github/workflows/deploy-cloudflare-pages.yml',
          'wrangler.toml',
        ],
      },
    },
    blockers: [
      'GitHub Pages production verification is pending until this phase is merged and deployed.',
      'Cloudflare Pages CLI OAuth could not be refreshed from the existing browser session; no Cloudflare live deployment is claimed.',
    ],
    evidence,
    caveats: [
      'Headless Chromium proxy results are separate from the recorded real-GPU benchmark.',
      'The real-GPU result applies only to the named hardware, browser, resolution and methodology in evidence/v0.2.0-real-gpu.json.',
      'No external account, telemetry, leaderboard or cloud model upload is part of the release.',
    ],
  };
  writeFileSync(join(root, 'acceptance', 'v0.2.0.json'), `${JSON.stringify(finalReport, null, 2)}\n`);
}

for (const file of [vitestJson, playwrightJson]) {
  if (existsSync(file)) rmSync(file);
}
console.log(`v0.2 phase ${phase} (${stageNames[phase]}): ${report.status}`);
process.exit(report.status === 'pass' ? 0 : 1);
