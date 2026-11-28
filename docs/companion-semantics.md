# Companion world semantics v1

A glTF node can publish a candidate in its extras. This example marks a surface for a wingmate's parallel survey.

```json
{"motionSemantic":{"version":1,"id":"deck-west","kind":"surface","capabilities":["glide","observe"]}}
```

Kinds are `surface`, `route`, `landmark`, `socket`, and `escape`. Capabilities are `glide`, `guide`, `scout`, `release`, and `observe`. IDs start with an ASCII letter or digit and allow letters, digits, dot, slash, colon, hyphen and underscore up to 128 characters. Duplicate IDs, unknown enums, duplicate capabilities and unsupported versions are ignored. Raw IDs and additional fields stay outside model requests and journal entries. A mesh uses its local top-center for a surface or landmark. A marker node uses its transformed origin. Markers should be on the intended surface or in clear air on the intended centerline. The importer honors the collision role overrides and omits detached markers in grouped variants. The existing entry/exit socket extras can also supply candidates.

A streaming provider exposes `semanticCandidates(position)` in absolute simulation metres. Each candidate carries `semantic`, an anchor `position` and a collision-ready activation `lease`. Retiring a chunk removes its candidates. Reloading or regeneration changes the lease. World replacement or Sky Inversion cancels all live assignments. Each perception examines at most twelve nearby declarations and holds at most six verified sites. Sixteen outstanding perceptions and three active assignments bound retained state.

The local verifier checks collision coverage, the swept approach and stand-off clearance. At a low socket it measures the actual deck and tests a climb to a parallel wingmate lane 26 metres above the surface. A glide survey samples the flyable surface every four metres along a forty-metre tangent, checks normal continuity, and flies the wingmate along a parallel path. A branch requires two diverging clear chords. A release requires a clear rising corridor and a 22-metre clear terminal volume. A landmark guide must reach the stand-off and meet the pilot there. Untagged assets retain geometric perception, local search and the existing mission commands.

A new assignment can use only a target published for its current request and epoch. An active wingmate rechecks its feature and geometry at five Hz. On lease loss it clears the steering target immediately at the next mission tick and allows two seconds for a fresh nearby resolution of the same feature. A blocked path, a changed feature, or a missed deadline ends the mission. Surveying an eligible route reports an observation only after a wingmate reaches its measured waypoints and returns to formation. It does not certify a player Surface Glide run.

In Independent follow, offline wingmates can select their own verified authored missions. The navigator explores a glide route, the guardian tests escape space, and the explorer scouts a branch. Pilot commands take priority. Both languages support explicit assignments outside Independent follow. See the in-game Wingmates guide for example commands.
