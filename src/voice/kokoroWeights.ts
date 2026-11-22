import { KOKORO_MODEL, KOKORO_REVISION } from './kokoroProtocol';

export const KOKORO_CACHE = 'skimmer-kokoro-zh-mixed-v1';
const url = `https://huggingface.co/${KOKORO_MODEL}/resolve/${KOKORO_REVISION}/onnx/model_fp16.onnx`;
const size = 177_437_791;
const sha256 = '165c7c730c7d75ef0b563f3af690eda32d385eb7386eb613f3b5e6fe02dcc60d';
const rangeSize = 4 * 1024 * 1024;

const requestRange = (start: number, signal: AbortSignal): Promise<Response> =>
  fetch(url, {
    cache: 'no-store',
    headers: { Range: `bytes=${start}-${Math.min(start + rangeSize, size) - 1}` },
    signal: AbortSignal.any([signal, AbortSignal.timeout(75_000)]),
  });

const readPart = async (response: Response, start: number, target: Uint8Array<ArrayBuffer>): Promise<number> => {
  if (response.status !== 206) {
    await response.body?.cancel();
    throw new Error('Kokoro download returned an invalid range');
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength !== Math.min(rangeSize, size - start)) throw new Error('Kokoro download returned an invalid length');
  target.set(bytes, start);
  return bytes.byteLength;
};

/** Download the immutable weights in bounded ranges before Transformers.js opens its cached file. */
export const cacheKokoroWeights = async (progress: (percent: number) => void): Promise<void> => {
  if (typeof caches === 'undefined' || !crypto.subtle) return;
  const cache = await caches.open(KOKORO_CACHE).catch(() => null);
  if (!cache || await cache.match(url)) return;
  const controller = new AbortController();
  const { signal } = controller;
  try {
    const first = await requestRange(0, signal);
    if (first.status === 200) {
      await first.body?.cancel();
      return; // A server that doesn't support ranges can still use the library's standard fetch.
    }
    const weights = new Uint8Array(size);
    let downloaded = await readPart(first, 0, weights);
    let next = rangeSize;
    progress(Math.floor(downloaded * 100 / size));
    const lane = async (): Promise<void> => {
      while (next < size) {
        const start = next;
        next += rangeSize;
        let bytes: number;
        try {
          bytes = await readPart(await requestRange(start, signal), start, weights);
        } catch {
          signal.throwIfAborted();
          bytes = await readPart(await requestRange(start, signal), start, weights);
        }
        downloaded += bytes;
        progress(Math.floor(downloaded * 100 / size));
      }
    };
    await Promise.all(Array.from({ length: 6 }, lane));
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', weights)),
      byte => byte.toString(16).padStart(2, '0')).join('');
    if (digest !== sha256) throw new Error('Kokoro download checksum mismatch');
    await cache.put(url, new Response(weights, { headers: { 'Content-Length': String(size) } }));
  } finally {
    controller.abort();
  }
};
