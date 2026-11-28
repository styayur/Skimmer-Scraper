# Merged-release foreground repeat

The complete first Windows comparison remains a failed mean-FPS result for
`0a5272b`. This protocol was specified before receiving or measuring the
corrected merged release. It uses four new flights in a reserved desktop slot.

| Order | Client | Source |
| --- | --- | --- |
| 1 | Web | v0.10.0 stock |
| 2 | Web | Exact merged release |
| 3 | Windows | Exact merged release |
| 4 | Windows | v0.10.0 stock |

Use the official static release artifact and CI-installed executable for the
merged SHA. Verify the complete Web file manifest and native SHA-256. Keep
the same stock binaries from the original comparison. Run one client at a
time. Reserve about 70–75 minutes after the Exchange replay, resource probes
and local packaging have finished. Record a minute of idle total host CPU
before each launch. Admit a run when median idle-period CPU utilization is at
most 15% and p95 is at most 25%. Preserve a rejected start and reschedule it
if this check fails. Record total host CPU throughout each flight. Keep every
timed result, including slow intervals.

Use the Radeon 780M, D3D11, High quality, 1920 × 1080 at DPR 1, shielded Free
Flight, chase camera, three companions and default music. Hold the same yaw
and boost keys as the historical flight. Every 12 simulation seconds, return
to the original reference approach at `(0, 390, 120)` with neutral attitude.
These repeated circuits control the sampled scenery. At 300 and 600 simulation
seconds substitute the scripted Sky Inversion approach and verify all six
phases and old-world disposal. The required world sequence is `334458`,
`479568308`, `501763084`. Reject an unscheduled crossing or a different seed.
Keep both simulation and wall time at or above 901 seconds, including the
normal cost of the repeated approach placements and world transitions.

Compare stock and final within each platform. Apply the original full-run
limits of 5% mean FPS loss and 10% p95 frame-time increase. Publish all raw
frame intervals, ownership checks, per-seed dwell, host CPU and available GPU
timings and renderer resources. The original open-route measurements remain
available alongside this controlled-route comparison.

Run each invocation from the reproduction instructions with `--route controlled
--seconds 901` and a fresh output directory. The runner saves `idle-cpu.json`
and puts in-flight CPU readings beside the frame intervals in `samples.json.gz`.
On Chromium versions that expose thread-tick performance metrics, the result
also includes renderer main-thread CPU deltas for the measured flight.
