import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, normalizePath } from 'vite';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const city = resolve(process.argv[2] ?? root);
const evidence = process.argv[3];
const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();
const report = { companionSource: git(root, 'rev-parse', 'HEAD'), citySource: git(city, 'rev-parse', 'HEAD'),
  fixedHz: 120, seconds: 55, simulator: 'WorldStreamer with inline collision chunks, CompanionTeam and SymbiosisRuntime', runs: [] };
const server = await createServer({ root, configFile: false, appType: 'custom',
  server: { middlewareMode: true, fs: { allow: [root, city] } }, logLevel: 'error' });
try {
  const read = (base, path) => server.ssrLoadModule('/@fs/' + normalizePath(resolve(base, 'src', path)));
  const [{ WorldStreamer }, { worldSettingsFromSearch }, { CompanionTeam }, { SymbiosisRuntime },
    { createFlightState }, { createRunRules }] = await Promise.all([
    read(city, 'world/worldStreamer.ts'), read(city, 'world/worldConfig.ts'), read(root, 'companions/AgentController.ts'),
    read(root, 'ai/SymbiosisRuntime.ts'), read(root, 'flight/flightModel.ts'), read(root, 'game/runRules.ts'),
  ]);
  for (const seed of [17, 334458]) {
    const stream = new WorldStreamer(worldSettingsFromSearch('?theme=kinetic-city&seed=' + seed), { maxLoadedChunks: 25 });
    try {
      const spawn = stream.getDefaultSpawn(), player = createFlightState(spawn);
      await stream.prime(player.position);
      const team = new CompanionTeam();
      team.configure({ count: 3, formation: 'wedge', behavior: 'independent' });
      team.reset(player, stream);
      const radio = new SymbiosisRuntime(team), rules = createRunRules({ mode: 'free', assisted: true });
      const candidates = stream.semanticCandidates(player.position);
      const contacts = [];
      let verified;
      for (let frame = 0; frame < 120*55; frame++) {
        if (frame % 120 === 0) {
          stream.setCompanionPositions(team.agents.filter(a => a.deployed).map(a => a.flight.position));
          stream.update(player.position, player.velocity, { inFlight: false });
          await new Promise(r => setTimeout(r, 0));
        }
        team.step(player, stream, 1/120);
        radio.step(player, rules, stream, seed, 1/120);
        for (const event of team.events.slice(-3)) {
          if (event.event === 'impact' && !contacts.some(c => c.time === event.time && c.agent === event.agent)) {
            const mission = radio.snapshot().missions.find(m => m.agentId === event.agent && m.outcome === 'running');
            contacts.push({ ...event, mission: mission?.type ?? null });
          }
        }
        if (frame === 119) verified = radio.perception()?.targets.filter(t => t.semanticKind);
      }
      report.runs.push({ seed, spawn, pilotHeld: true, localCandidates: candidates.map(c => c.semantic.kind),
        verified, missions: radio.snapshot().missions, contacts, impacts: team.agents.map(a => a.impacts),
        deployed: team.agents.map(a => a.deployed), activeBvhs: stream.getAdapterStats().bvhCount });
    } finally { stream.dispose(); }
    assert.equal(stream.getAdapterStats().bvhCount, 0);
  }
  const json = JSON.stringify(report, null, 2) + '\n';
  if (evidence) writeFileSync(evidence, json);
  else process.stdout.write(json);
  for (const run of report.runs) {
    const first = [1, 2, 3].map(id => run.missions.find(m => m.agentId === id));
    assert.deepEqual(first.map(m => m?.observed), ['glide-route', 'escape', 'branch']);
    assert.ok(first.every(m => m?.outcome === 'completed' && m.reason === 'returned'));
    assert.deepEqual(run.impacts, [0, 0, 0]);
  }
} finally { await server.close(); }
