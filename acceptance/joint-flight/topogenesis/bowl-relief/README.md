# Neutral departure from a cruise bowl

The initial twenty-seed study recorded a shield strike after a successful active release on cruise seed 79757. The aircraft cleared the surface at first. Its measured center clearance fell from 5.91 m on the first DETACHING sample to 3.27 m before the shield fired at 3.97 s. The existing curvature rule reserved a 0.55 s neutral departure interval. The pilot stayed in neutral flight for sixteen 64 ms sampling intervals after the release request.

This experiment changes one authored field in the revision 2 WorldIR fixture. Reducing `kineticRecipe.relief` from 1 to 0.4 scales the longitudinal bowl and its transverse loft together. The generator, controller, spawn, wingmate count, approach, LB release interval, rendering setup and pilot input schedule stay fixed. The recorded plan specifies three previously unused seeds. The original twenty-seed matrix retains its original results.

At seed 79757, the full-relief bowl registered one shield strike. The shallower bowl completed 166.2 m of uninterrupted observed glide and returned to free flight after the second LB press, with zero impacts. Each of the three additional seeds also struck the original bowl once, then completed the shallower version with zero shield impacts. Each pair uses the stock v0.10.0 game. The program generated new geometry from each seed. These runs cover one centered cruise approach and one release time.

The example subdirectory contains the exact shallow WorldIR and GLB at seed 79757 with the V2Wpro MIT license. The game harness and raw observations are Skimmer-Scraper material under AGPL-3.0-only. The summary links each complete observation by filename and includes its SHA-256, the GLB fingerprint and sampled metrics. [Frozen local trial plan](plan.json) · [Results](results.json) · [Original twenty-seed experiment](../README.md)

To repeat all eight flights, install the locked dependencies of the V2Wpro source revision named in the plan, serve the v0.10.0 game locally and select a new output directory.

```sh
python scripts/run-bowl-departures.py ../V2Wpro http://127.0.0.1:4173 new-bowl-observations
```
