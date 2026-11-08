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
  3: [],
  4: [],
  5: [],
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
try {
  const parsed = JSON.parse(readFileSync(vitestJson, 'utf8'));
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

const deliverables = (deliverablesByPhase[phase] ?? []).map((path) => ({
  path,
  exists: existsSync(join(root, path)),
}));
const evidence = readdirSync(evidenceDir)
  .filter((file) => file.startsWith(`phase-${phase}-`) && /\.(png|json)$/.test(file))
  .sort()
  .map((file) => {
    const bytes = readFileSync(join(evidenceDir, file));
    return {
      path: `evidence/v0.2/${file}`,
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
  deliverables.every((deliverable) => deliverable.exists);

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
for (const file of [vitestJson, playwrightJson]) {
  if (existsSync(file)) rmSync(file);
}
console.log(`v0.2 phase ${phase} (${stageNames[phase]}): ${report.status}`);
process.exit(report.status === 'pass' ? 0 : 1);
