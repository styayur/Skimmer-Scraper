import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { platform, release } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const phase = process.argv[2];
if (!phase) {
  console.error('Usage: node scripts/run-acceptance.mjs <phase-number>');
  process.exit(2);
}

const npm = 'npm';
const npx = 'npx';
const root = resolve('.');
const tempDir = join(root, 'test-results');
mkdirSync(tempDir, { recursive: true });
mkdirSync(join(root, 'acceptance'), { recursive: true });
mkdirSync(join(root, 'evidence'), { recursive: true });
const vitestJson = join(root, 'acceptance', `vitest-phase-${phase}.json`);
const playwrightJson = join(tempDir, `playwright-phase-${phase}.json`);

const deliverablesByPhase = {
  '1': [
    'AGENTS.md',
    '.github/workflows/ci.yml',
    '.github/workflows/deploy-cloudflare-pages.yml',
    'wrangler.toml',
    'src/flight/flightModel.ts',
    'src/world/proceduralCity.ts',
    'src/render/GameRenderer.ts',
    'tests/unit/flightModel.test.ts',
    'tests/e2e/flight.spec.ts',
  ],
  '2': [
    'src/world/chunkedWorldAdapter.ts',
    'src/game/runRules.ts',
    'src/core/fixedStep.ts',
    'tests/unit/chunkedWorldAdapter.test.ts',
    'tests/unit/runRules.test.ts',
    'tests/e2e/proximity.spec.ts',
  ],
  '3': [
    'src/model/modelLibrary.ts',
    'src/model/glbLoader.ts',
    'src/render/audio.ts',
    'tests/unit/modelLibrary.test.ts',
    'tests/e2e/model-import.spec.ts',
  ],
  '4': [
    'README.md',
    'docs/ACCEPTANCE.md',
    'docs/DEPLOYMENT.md',
    'acceptance/v0.1.0.json',
    'tests/e2e/release.spec.ts',
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

let unitSummary = { passed: 0, failed: 0, total: 0 };
try {
  const parsed = JSON.parse(readFileSync(vitestJson, 'utf8'));
  unitSummary = {
    passed: Number(parsed.numPassedTests ?? 0),
    failed: Number(parsed.numFailedTests ?? 0),
    total: Number(parsed.numTotalTests ?? 0),
  };
} catch {}

let browserSummary = { passed: 0, failed: 0, skipped: 0, durationMs: 0 };
try {
  const parsed = JSON.parse(readFileSync(playwrightJson, 'utf8'));
  browserSummary = {
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

const evidence = readdirSync(join(root, 'evidence'))
  .filter((file) => file.startsWith(`phase-${phase}-`) && file.endsWith('.png'))
  .sort()
  .map((file) => {
    const bytes = readFileSync(join(root, 'evidence', file));
    return {
      path: `evidence/${file}`,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  });

const revisionResult = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8', shell: platform() === 'win32' });
const dirtyResult = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8', shell: platform() === 'win32' });
const browserVersionResult = spawnSync(npx, ['playwright', '--version'], { cwd: root, encoding: 'utf8', shell: platform() === 'win32' });
const nodeVersionResult = spawnSync('node', ['--version'], { cwd: root, encoding: 'utf8', shell: platform() === 'win32' });

const passed = commands.every((command) => command.status === 'pass') &&
  deliverables.every((item) => item.exists);

const report = {
  schemaVersion: 1,
  product: 'Skimmer-Scraper',
  version: '0.1.0',
  phase: Number(phase),
  generatedAt: new Date().toISOString(),
  sourceRevision: revisionResult.stdout?.trim() || null,
  worktreeDirty: Boolean(dirtyResult.stdout?.trim()),
  status: passed ? 'pass' : 'fail',
  commands,
  unitTests: unitSummary,
  browserTests: browserSummary,
  deliverables,
  evidence,
  environment: {
    os: `${platform()} ${release()}`,
    node: nodeVersionResult.stdout?.trim() ?? 'unknown',
    playwright: browserVersionResult.stdout?.trim() ?? 'unknown',
    browser: 'Chromium headless',
  },
  caveats: [
    'Browser tests use headless Chromium and may run on SwiftShader/software rendering.',
    'This report is correctness and browser-integration evidence, not a real-GPU performance certification.',
    'Cloudflare Pages publication is not claimed unless a separate live deployment URL is recorded.',
  ],
};

writeFileSync(join(root, 'acceptance', `phase-${phase}.json`), `${JSON.stringify(report, null, 2)}\n`);
for (const file of [vitestJson, playwrightJson]) {
  if (existsSync(file)) rmSync(file);
}

console.log(`\nAcceptance phase ${phase}: ${report.status}`);
process.exit(report.status === 'pass' ? 0 : 1);




