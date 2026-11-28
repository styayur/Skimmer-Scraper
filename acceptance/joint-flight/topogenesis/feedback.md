# Paired rule feedback

All rows use the v0.10.0 entry bundle `91f1a9bcdb190878af05d6b93ebdc16c01fbbb5ffc898d70bf5fdb22e52687c8` with the route's authored spawn. The raw reports include each actual GLB digest, exact layout, observed velocity, solid distance and input schedule.

## Revision 0 → revision 1

At boost seed 8132 the bowl sustained 154.0 m of sampled contact and actively detached at 2.36 s. The aircraft returned to FLIGHT at 2.55 s and recorded a shield strike at 2.74 s. The sky arch held 234.6 m until the second LB press. DETACHING appeared at 3.12 s and the shield struck by 3.32 s. We asked the producer to reduce the vertical curvature across the bowl and arch departure envelope, then repeat the two boost inputs on the stock controller.

The helix at cruise seed 8131 held 127.3 m, entered REACQUIRE at 2.55 s, returned to FLIGHT at 2.87 s and struck the shield at 3.38 s, before the second LB pulse at 3.584 s. S-curve cruise and both ribbon-bridge profiles completed active release with zero strikes. Retain those as controls.

The full v2 sample for the producer reader is [s-curve-8131-cruise.json](r0/s-curve-8131-cruise.json).

## Revision 1 → revision 2

Producer `382a5c201b246849d5023a9eabdac5eef13e4d02` bounded longitudinal height on the bowl and arch. At boost seed 8132 the bowl and arch held 159.9 m and 237.5 m respectively, with active release and zero strikes. The original helix bytes reproduced the 2.55 s contact loss and 3.38 s shield strike. The unchanged ribbon control still held through release. We asked the producer to give the descending helix strand clearance from the stock neutral tangent after contact loss while retaining its loop and sockets. The six holdouts remained untouched through the revision-2 rule freeze.

The first two batches used the historical clock setup. Clock phase could move an input by one fixed step. The aligned batches start on a controlled animation frame and preserve the preliminary observations above.

One preliminary boost ribbon at revision 1 struck the shield on byte-identical control geometry. Its preliminary revision-0 counterpart completed the release. The controlled-frame alignment change addresses this input timing difference. Both raw outcomes are retained.

## Frozen revision 2

Producer `6522b42c9a020c96712a523e3492d8fc2377340a` moved the helix's descending strand away from the neutral flight tangent. On the aligned seed-8131 replay it retained 127.3 m of sampled glide. Minimum sampled solid distance rose from 3.56 m to 5.94 m and the shield strike disappeared. Contact loss remained. Under the same aligned input both earlier revisions struck the shield. The revision-1 boost bowl and arch clean releases also reproduced. The matrix and holdouts used these frozen rules. Cruise bowl exits and oblique S-curve recovery remain finite, reproducible follow-up cases.
