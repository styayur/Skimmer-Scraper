# Companion missions and Journey Memory qualification

The companion implementation under test was `9742234faec2728fe7238146ca4c5ce570042550`, based on Skimmer v0.10.0 (`991138b8c67c188bd47731d6c193142750225818`). The first City replay used `298fd0c41256a163f45485d315f863a23431565e`, and the corrected replay used `27903a224f3256c61f42fac5a683ec83b04936a6`. Both City revisions have the same production world source tree, `506630d041f609e6dd9976940cd7f5232c04085a`.

| Evidence | Setup | Observed result |
| --- | --- | --- |
| [steering.json](steering.json) | Real wingmate steering and imported-mesh BVHs, 120 Hz, three independent roles | Parallel glide survey, escape check, branch scout and landmark guidance all completed and returned. All three impact counts were zero. |
| [browser-missions.json](browser-missions.json) and [flight capture](survey-flight.png) | Packaged Web client, Chromium with SwiftShader, a player-imported binary glTF and a stationary pilot | The wingmates selected and completed all three role missions locally. The test observed three mission journal entries, zero impacts, zero model requests and zero external requests. |
| [journal-lifecycle.json](journal-lifecycle.json) and [settings capture](journal-settings.png) | Fresh isolated Chromium profile, real flight, explicit radio-contact marker, page reload and settings UI | The key was initially absent. The visit and contact survived reload. The contact contained no pilot words. Disabling cleared model consent. Deleting one kept the visit, and Clear all emptied the journal. |
| [first City run](kinetic-city-initial.json) | Stable City spawn, seeds 17 and 334458, pilot held, 55 seconds per seed | The guardian and explorer completed missions. The navigator stayed idle because no authored strip qualified. Seed 334458 also registered one wingmate impact. |
| [corrected City run](kinetic-city.json) | Same City code, seeds, spawns, pilot pose and 120 Hz input | The navigator could take the measured local strip when authored suggestions failed. On both seeds all three wingmates completed their first assignments and regrouped with zero impacts. The explorer had started its next patrol at the fixed cutoff. |

The two-chunk regression uses separate live BVHs. KITE-1 crosses their seam, returns, and drops a later target when the neighboring chunk is evicted and rebuilt twenty metres lower. Lease replacement, declared IDs, obstructed thin-wall shortcuts, an absent landmark, world changes, model wire consent and invalid memory records have separate assertions. The optional provider transport is intercepted in unit tests so its exact request body can be inspected.

## Reproduction

Run from the companion worktree with its locked npm dependencies. `SKIMMER_TEST_PORT` may be set to an available preview port on a shared host.

```powershell
npm ci
npm run typecheck
$env:SKIMMER_SEMANTIC_EVIDENCE = (Join-Path $pwd 'acceptance/v011/companions/steering.json')
npm test -- --maxWorkers 1 tests/unit/semanticMissions.test.ts tests/unit/journeyMemory.test.ts tests/unit/companionMissions.test.ts tests/unit/companions.test.ts tests/unit/importedWorld.test.ts tests/unit/ai.test.ts tests/unit/radioDialogue.test.ts tests/unit/voiceRadio.test.ts
npm run build
$env:SKIMMER_JOURNEY_EVIDENCE = '1'
npm run test:e2e -- tests/e2e/journey-memory.spec.ts tests/e2e/semantic-missions.spec.ts
node acceptance/v011/companions/replay-city.mjs ../Skimmer-KineticCity acceptance/v011/companions/kinetic-city.json
```

The final command accepts a separate checkout of the pinned City implementation. Once integrated, pass the current checkout instead. It runs the production streaming and steering modules together in Node and asserts each first mission's measured outcome. The browser run checks the real GLB import and UI paths. The Windows upgrade/rollback matrix and device performance qualification are separate workstreams.
