import { defineConfig } from 'vite';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import packageInfo from './package.json' with { type: 'json' };
const { version } = packageInfo;

// Build provenance is a separate asset: documentation/evidence commits do not
// alter the flight bundle. Never import or spread process.env into client code.
const git = (...args: string[]): string => execFileSync('git', args, { encoding: 'utf8' }).trim();
interface Revision { sourceCommit: string; sourceCommitTime: string; dirty: boolean }
const revision: Revision = existsSync('.git')
  ? { sourceCommit: git('rev-parse', 'HEAD'), sourceCommitTime: git('show', '-s', '--format=%cI', 'HEAD'), dirty: spawnSync('git', ['diff', '--quiet', 'HEAD']).status !== 0 }
  : JSON.parse(readFileSync('SOURCE_REVISION.json', 'utf8')) as Revision;
const { sourceCommit, sourceCommitTime, dirty } = revision;
const buildInfo = { version, sourceCommit, sourceCommitTime, dirty,
  sourceUrl: `https://github.com/styayur/Skimmer-Scraper/tree/${sourceCommit}`,
  toolchain: { node: process.version, platform: process.platform, architecture: process.arch },
};

export default defineConfig({
  base: './',
  plugins: [{
    name: 'release-provenance-and-notices',
    transformIndexHtml: html => html.replaceAll('%SKIMMER_VERSION%', version).replaceAll('%SKIMMER_SOURCE_URL%', buildInfo.sourceUrl),
    generateBundle() {
      for (const file of ['LICENSE', 'CREDITS.md', ...readdirSync('licenses').sort().map(name => `licenses/${name}`)]) {
        this.emitFile({ type: 'asset', fileName: file, source: readFileSync(file) });
      }
      this.emitFile({ type: 'asset', fileName: 'build-info.json', source: `${JSON.stringify(buildInfo, null, 2)}\n` });
    },
  }],
  // The complete source is linked above. Asset modules can emit different
  // synthetic references in their source maps across identical builds.
  build: { target: 'es2022', sourcemap: false },
});
