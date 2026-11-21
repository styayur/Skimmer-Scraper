export const MIC_RATE = 16_000;
export const MAX_CLIP_SECONDS = 12;
export const MIN_CLIP_MS = 180;
export const MAX_MIC_SAMPLES = MIC_RATE * MAX_CLIP_SECONDS;

export interface WaveClip { wave: Blob; durationMs: number }

export const makeWave = (chunks: readonly Int16Array[]): WaveClip | null => {
  const count = Math.min(MAX_MIC_SAMPLES, chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  const durationMs = count / MIC_RATE * 1000;
  if (durationMs < MIN_CLIP_MS) return null;
  const data = new DataView(new ArrayBuffer(44 + 2 * count));
  const tag = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index++) data.setUint8(offset + index, value.charCodeAt(index));
  };
  tag(0, 'RIFF'); data.setUint32(4, data.byteLength - 8, true); tag(8, 'WAVE');
  tag(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true);
  data.setUint16(22, 1, true); data.setUint32(24, MIC_RATE, true); data.setUint32(28, MIC_RATE * 2, true);
  data.setUint16(32, 2, true); data.setUint16(34, 16, true); tag(36, 'data'); data.setUint32(40, count * 2, true);
  let offset = 44;
  for (const chunk of chunks) {
    for (let index = 0; index < chunk.length && offset < data.byteLength; index++, offset += 2) {
      data.setInt16(offset, chunk[index], true);
    }
  }
  return { wave: new Blob([data.buffer], { type: 'audio/wav' }), durationMs };
};
