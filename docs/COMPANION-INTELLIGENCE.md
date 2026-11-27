# Companion missions

Open the radio with **T**. In loaded airspace, try `KITE-1 find a passage, KITE-2 escort me and KITE-3 inspect the island`. The third assignment requires an observed floating garden. With just one wingmate, try `KITE-1 patrol`, then ask `KITE-1 mission status`. Mandarin commands use the same identifiers and accept forms such as `风筝一号寻找通道` and `风筝2等待3秒后归队`. A new order replaces the addressed wingmate’s mission. `KITE-2 cancel mission` cancels that wingmate’s orders.

## Execution

Typed and transcribed input enter `SymbiosisRuntime.sendDialogue`. Local interpretation, validation and execution work offline. A configured model can propose a plan for explicitly marked free-form assignments such as `Mission: KITE-2, keep an eye on my wing`. Ordinary conversation has zero flight authority. Recognized local orders retain their assigned agents, targets and parameters if the provider misunderstands them.

The executive advances at 0.2-second simulation intervals. It issues short steering leases to the existing 120 Hz companion controller. Avoidance, separation, loaded coverage, shield response and the existing Surface Relay rules remain authoritative. The game thread never awaits a network response.

| Mission | Steering and completion |
| --- | --- |
| FOLLOW, ESCORT | Track the pilot. Escort can report measured avoidance. At the deadline the executive checks safe formation proximity and at least one second of settled flight. |
| REGROUP | Return to the pilot and maintain safe proximity for 0.4 seconds. |
| FIND_PASSAGE | Check the pilot and wingmate approaches to a published route. Scout the waypoint, lead until the pilot reaches it, then regroup. |
| INSPECT_LANDMARK, FIND_GLIDE_SURFACE | Approach an observed surface, loiter within observation range with a clear line to the waypoint for one continuous second, record the observation, then return. |
| PATROL | Visit a published local route point, loiter, then return. |
| WAIT_AND_REGROUP | Hold near the wingmate’s starting position for a bounded simulation-time interval, then regroup. |
| SURFACE_RELAY | Recheck partner eligibility and call the existing finite-charge rescue or Free Flight training operation. |

Acceptance and completion produce separate radio messages. Completion depends on local measurements. A missing aircraft, lost target, blocked approach, phase timeout or overall deadline releases its steering lease. Other assignments continue. The snapshot holds one running record per assigned wingmate and the last 24 terminal records, including phase, progress, observed result and failure reason. Pausing freezes mission clocks and cancels network work. Sky Inversion cancels missions and clears all usable spatial references.

## Wire protocol

Legacy single-plan responses and short `FOLLOW`, `LEAD`, `REGROUP`, `SCOUT`, `PROTECT`, `RELAY` and `HOLD` orders retain the v1 validator and 1–12 second TTL. A v2 proposal uses the request ID and epoch issued with its perception. For example, given that request and two deployed wingmates, this assigns an escort and a timed wait.

```json
{
  "schemaVersion": 2,
  "requestId": "17-42",
  "epoch": 17,
  "dialogue": [],
  "missions": [
    { "agentIds": [2], "type": "ESCORT", "targetId": null, "timeoutSeconds": 60 },
    { "agentIds": [1], "type": "WAIT_AND_REGROUP", "targetId": null, "timeoutSeconds": 30, "waitSeconds": 4 }
  ]
}
```

Validation is atomic. The exact schema permits up to three missions and three dialogue lines. Each line has an active `agentId` and at most 140 characters of `text`. Each active agent can appear once. Each Relay requires one eligible surface partner. A spatial mission must reference a target in the original bounded perception with the required capability. Local checks revalidate current coverage, range and route clearance. The response expires after 12 simulation seconds. Accepted missions have independent deadlines of 2–120 seconds and non-stationary phases time out after 35 seconds. An explicit wait accepts 1–30 whole seconds, shorter than its deadline.

## Perception and memory

A perception contains up to three candidate routes, three measured partner surfaces and two observed structures. Geometry probes near and ahead of the pilot produce stand-off points. The procedural moving-garden identifier gives a floating island its classification. Unclassified collision geometry gets a generic structure label. Glide candidates require adjacent, similarly oriented glide contacts from the same surface. During approach and observation, missions recheck the surface identity, coverage and required glide continuity. Moving geometry that leaves its observation area can invalidate a task. The controller performs the final collision checks throughout flight.

| Callsign | Identity and local behavior |
| --- | --- |
| KITE-1 | A navigator who charted routes between vanished sky cities. Takes an advanced position in independent follow and defaults to passage finding. |
| KITE-2 | A search-and-rescue veteran. Holds a steady flank and is the preferred escort and Relay partner. |
| KITE-3 | An explorer of unfamiliar landforms. Sweeps a wider arc in clear air and defaults to inspection or patrol. |

The session retains ten dialogue turns, twenty-four episodic records and current working state. Ask about a wingmate’s background or request its last reply offline. The radio panel has a separate bounded display history. Model requests include only previous turns entered with model use enabled and a connected provider, with oldest turns dropped to fit the byte limit. Prior epochs are identified as historical. A restart clears session memory. Diagnostics record validated orders and outcomes without storing raw provider replies in the decision trace.

## Budgets and radio integration

Chat, explicit planning, autonomous planning, ASR and TTS have separate request counters under the configured page-wide ceiling. Each foreground text category can use up to 85% of the token budget and its rounded-up request allocation. Autonomous planning stops at 60% of the global allowance, rounded down for requests. The voice tools share a rounded-up 70% request allocation and retain their own duration and character limits. Text requests reserve serialized input bytes plus 768 units before dispatch. Failures, cancellations and reconnects retain the reservations. Ambient local radio costs zero model requests.

Dynamic mission acknowledgements, measured outcomes and model dialogue use `RadioDialogue.report` with an explicit locale. Existing fixed command and flight events use `reportFixed` and the radio catalog. The voice layer owns playback, timing and subtitles. The composition root already drives radio input and fixed stepping.

## Reproducing the simulated executive benchmark

```powershell
$env:SKIMMER_MISSION_BENCH = '1'
npm test -- tests/unit/companionMissions.test.ts --maxWorkers=1
```

The opt-in test writes `acceptance/v091/companion-mission-timing.json`. It runs the production executive and reactive controller against a synthetic loaded plane, with three independent missions, a fixed pilot pose and 120 Hz simulation. Eight runs warm up the worker. Another 128 four-second runs time executive calls that start with all three missions active, using a monotonic clock and worker-thread CPU samples. Mission setup, reactive physics and rendering are outside the timed interval. Windows CPU accounting is coarser than individual ticks, so the report gives aggregate CPU and separate elapsed-time percentiles. This fixture establishes a reproducible Node measurement. Browser streaming, GPU performance and real provider latency require separate qualification.
