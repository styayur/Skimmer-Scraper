import { KOKORO_MODEL, KOKORO_REVISION } from './kokoroProtocol';

export const KOKORO_CACHE = 'skimmer-kokoro-zh-mixed-v1';
const url = `https://huggingface.co/${KOKORO_MODEL}/resolve/${KOKORO_REVISION}/onnx/model_fp16.onnx`;
const size = 177_437_791;
const sha256 = '165c7c730c7d75ef0b563f3af690eda32d385eb7386eb613f3b5e6fe02dcc60d';
const rangeSize = 1024 * 1024;
const partialCache = `skimmer-kokoro-parts-${KOKORO_REVISION}`;

const requestRange = async (start: number, signal: AbortSignal, tries = 3): Promise<Uint8Array<ArrayBuffer> | null> => {
  try {
    const response = await fetch(`${url}?download=true`, {
      headers: { Range: `bytes=${start}-${Math.min(start + rangeSize, size) - 1}` },
      signal: AbortSignal.any([signal, AbortSignal.timeout(45_000)]),
    });
    if (response.status !== 206) {
      await response.body?.cancel();
      if (start === 0 && response.status === 200) return null;
      throw new Error('Kokoro download returned an invalid range');
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength !== Math.min(rangeSize, size - start)) throw new Error('Kokoro download returned an invalid length');
    return bytes;
  } catch (error) {
    signal.throwIfAborted();
    if (tries === 1) throw error;
    return requestRange(start, signal, tries - 1);
  }
};

const downloadPart = async (cache: Cache | null, start: number, signal: AbortSignal): Promise<Uint8Array<ArrayBuffer> | null> => {
  const key = `${url}?skimmer-part=${start}`;
  const cached = await cache?.match(key).then(item => item?.arrayBuffer()).catch(() => undefined);
  if (cached?.byteLength === Math.min(rangeSize, size - start)) return new Uint8Array(cached);
  const bytes = await requestRange(start, signal);
  if (bytes) await cache?.put(key, new Response(bytes)).catch(() => {});
  return bytes;
};

/** Download the immutable weights in bounded ranges before Transformers.js opens its cached file. */
export const cacheKokoroWeights = async (progress: (percent: number) => void): Promise<void> => {
  if (typeof caches === 'undefined' || !crypto.subtle) return;
  const cache = await caches.open(KOKORO_CACHE).catch(() => null);
  if (!cache || await cache.match(url)) return;
  const parts = await caches.open(partialCache).catch(() => null);
  const controller = new AbortController();
  const { signal } = controller;
  try {
    const first = await downloadPart(parts, 0, signal);
    if (!first) return; // A server without range support can use the library's standard fetch.
    const weights = new Uint8Array(size);
    weights.set(first);
    let downloaded = first.byteLength;
    let next = rangeSize;
    progress(Math.floor(downloaded * 100 / size));
    const lane = async (): Promise<void> => {
      while (next < size) {
        const start = next;
        next += rangeSize;
        const bytes = await downloadPart(parts, start, signal);
        if (!bytes) throw new Error('Kokoro download could not read a range');
        weights.set(bytes, start);
        downloaded += bytes.byteLength;
        progress(Math.floor(downloaded * 100 / size));
      }
    };
    await Promise.all(Array.from({ length: 6 }, lane));
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', weights)),
      byte => byte.toString(16).padStart(2, '0')).join('');
    if (digest !== sha256) {
      await caches.delete(partialCache);
      throw new Error('Kokoro download checksum mismatch');
    }
    const headers = { 'Content-Length': String(size) };
    try {
      await cache.put(url, new Response(weights, { headers }));
    } catch {
      await caches.delete(partialCache);
      await cache.put(url, new Response(weights, { headers }));
    }
    await caches.delete(partialCache);
  } finally {
    controller.abort();
  }
};
