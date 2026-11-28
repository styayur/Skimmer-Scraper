import { createWorldFixture, encodeGlb } from './worldGlb';

/** One closed collision deck with four local markers. The embedded binary mesh is the stock box fixture. */
export function semanticDistrict() {
  const base = createWorldFixture('building');
  const length = base.readUInt32LE(12);
  const json = JSON.parse(base.toString('utf8', 20, 20 + length));
  const marker = (id: string, kind: string, capabilities: string[], translation: number[]) => ({
    translation, extras: { motionSemantic: { version: 1, id, kind, capabilities } },
  });
  json.nodes = [
    { mesh: 0, translation: [0, -1, 0], scale: [240, 2, 300], extras: { skimmerRole: 'SURFACE' } },
    marker('private-deck', 'surface', ['glide'], [0, 0, 30]),
    marker('private-landing', 'landmark', ['guide', 'observe'], [0, 0, 30]),
    marker('private-fork', 'socket', ['scout'], [-14, 6, 28]),
    marker('private-out', 'escape', ['release'], [14, 6, 28]),
    marker('bogus-floating-label', 'surface', ['glide'], [60, 100, 40]),
  ];
  json.scenes = [{ nodes: json.nodes.map((_: unknown, i: number) => i), extras: {
    flightEntry: { version: 1, position: [0, 33, 42], toward: [0, 33, 12] },
  } }];
  return encodeGlb(json, Buffer.from(base.subarray(28 + length)));
}
