import assert from 'node:assert/strict';

// The Python sampler's clock and the game page both use Unix milliseconds.
export function measuredPeaks(raw, segments) {
  const samples = raw.toString('utf8').trim().split('\n').map(line => JSON.parse(line));
  for (const row of samples) {
    const [time, sessions, peak] = row;
    assert(row.length === 3 && Number.isSafeInteger(time) && Number.isInteger(sessions) && sessions >= 0
      && Number.isFinite(peak) && peak >= 0 && peak <= 1, 'Invalid Windows session sample');
  }
  for (const segment of segments) {
    const owned = samples.filter(([time, sessions]) => time >= segment.start && time <= segment.end && sessions > 0);
    segment.samples = owned.length;
    segment.peak = Math.max(0, ...owned.map(row => row[2]));
    assert(owned.filter(row => row[2] > 0.0001).length >= 2,
      'Missing audible owned-session samples for ' + (segment.voiceId ?? 'default music'));
  }
  return samples.length;
}
