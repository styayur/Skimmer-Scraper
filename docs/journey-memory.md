# Journey Memory v1

Flight Settings → Advanced → Journey Memory enables a journal in the current browser or Windows WebView profile. Pilots can inspect records, delete one or all, change retention (1–365 days) and capacity (1–128 entries). The defaults are 30 days and 64 entries. Disabling recording also revokes model sharing. Existing entries remain available for inspection or erasure until expiry. A fresh profile uses session radio only.

The origin-local Web Storage key is `skimmer.journey-memory.v1`. It is created when the pilot opts in. Windows rollback qualification should preserve this key in the existing WebView profile and re-open it on re-upgrade. The pilot settings export excludes it. The accepted v1 shape is illustrated below. `at` is Unix time in milliseconds. The historical realm and unsigned seed/layout fingerprint identify the visited world. The entry UUID is a deletion handle.

```json
{
  "version": 1,
  "enabled": true,
  "shareWithModel": false,
  "retentionDays": 30,
  "capacity": 64,
  "entries": [{
    "id": "61ae809f-2b7b-4e9a-88d6-21d853889029",
    "at": 1795824000000,
    "world": { "realm": "city", "seed": 42, "fingerprint": 123 },
    "event": "visit", "agent": 0, "detail": "visit"
  }]
}
```

Entries originate from launch, a verified local sighting, a captured glide or crossing, a completed mission, a successful survival relay or a pilot-requested radio-contact marker. Agent 0 denotes the team. The journal accepts only enumerated realms and event details. Import filenames, GLB labels, coordinates, model configuration, audio, prompt text and dialogue transcripts have no storage fields. Expired rows are removed at startup, when the panel opens and on mutation. Unsupported envelopes are preserved until explicit erasure.

“Remember this conversation” records a contact marker. “What do you remember from past flights?” recalls an entry locally. A separate switch allows a connected model to select one of up to six historical summaries only on that question. The request contains realm, event, wingmate and detail. The response can select an array index. The game renders the entry and keeps recall replies out of cloud speech, follow-up dialogue context and mission validation. Live navigation always uses current perception.
