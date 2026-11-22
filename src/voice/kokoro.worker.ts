import { KokoroTTS } from '@uzen/kokoro-js';
import { env, type ProgressInfo } from '@huggingface/transformers';
import ortFactory from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url';
import ortWasm from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';
import { cacheKokoroWeights, KOKORO_CACHE } from './kokoroWeights';
import {
  KOKORO_MODEL, KOKORO_REVISION, KOKORO_VOICES, KOKORO_VOICE_PATH, usableKokoroAudio,
  type KokoroBackend, type KokoroReply, type KokoroRequest,
} from './kokoroProtocol';

const worker = globalThis as unknown as {
  addEventListener(event: 'message', listener: (event: MessageEvent<KokoroRequest>) => void): void;
  postMessage(message: KokoroReply, transfer?: Transferable[]): void;
};
type WebGpu = {
  requestAdapter(options: { powerPreference: 'high-performance' }): Promise<{
    features: ReadonlySet<string>;
    info?: { vendor?: string; architecture?: string; description?: string; isFallbackAdapter?: boolean };
  } | null>;
};
const device = navigator as Navigator & { gpu?: WebGpu };
let model: KokoroTTS | undefined;
let backend: KokoroBackend | null = null;
let busy = false;
let deviceName = '';
const cacheVoices = async (): Promise<void> => {
  if (typeof caches === 'undefined') return;
  // The pinned Kokoro package reads embeddings from this cache before using fetch.
  const cache = await caches.open('kokoro-voices');
  await Promise.all(Object.values(KOKORO_VOICES).map(async voice => {
    const url = `${KOKORO_VOICE_PATH}/${voice}.bin`;
    if (await cache.match(url)) return;
    const result = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!result.ok) return;
    const bytes = await result.arrayBuffer();
    if (bytes.byteLength === 522_240) await cache.put(url, new Response(bytes));
  }));
};

const fail = (id: number, code: string, error?: unknown): void => {
  const detail = error instanceof Error ? error.message.slice(0, 230) : '';
  worker.postMessage({ type: 'error', id, backend, code, detail });
};

const prepare = async (request: Extract<KokoroRequest, { type: 'prepare' }>): Promise<void> => {
  if (backend && model) {
    worker.postMessage({ type: 'ready', id: request.id, backend, loadMs: 0, device: deviceName });
    return;
  }
  const started = performance.now();
  // The ONNX Runtime WebGPU provider does not support Firefox on Windows.
  if (device.userAgent.includes('Windows NT') && device.userAgent.includes('Firefox/')) {
    fail(request.id, 'kokoro-device');
    return;
  }
  let gpu: Awaited<ReturnType<WebGpu['requestAdapter']>> = null;
  try { gpu = await device.gpu?.requestAdapter({ powerPreference: 'high-performance' }) ?? null; } catch { /* Use the system fallback. */ }
  if (!gpu?.features.has('shader-f16') || gpu.info?.isFallbackAdapter) {
    fail(request.id, 'kokoro-device');
    return;
  }
  backend = 'webgpu';
  deviceName = gpu.info?.description || [gpu.info?.vendor, gpu.info?.architecture].filter(Boolean).join(' ') || 'WebGPU';
  env.allowLocalModels = false;
  env.remoteHost = 'https://huggingface.co/';
  env.remotePathTemplate = `{model}/resolve/${KOKORO_REVISION}/`;
  env.useBrowserCache = typeof caches !== 'undefined';
  env.cacheKey = KOKORO_CACHE;
  env.useWasmCache = false;
  if (env.backends.onnx.wasm) {
    env.backends.onnx.wasm.numThreads = 1;
    env.backends.onnx.wasm.proxy = false;
    env.backends.onnx.wasm.wasmPaths = { mjs: new URL(ortFactory, location.href).href, wasm: new URL(ortWasm, location.href).href };
  }
  worker.postMessage({ type: 'progress', id: request.id, backend, percent: null });
  let lastUpdate = -Infinity;
  let lastPercent = 0;
  const modelBackend = backend;
  const reportProgress = (percent: number): void => {
    lastPercent = Math.max(lastPercent, Math.min(100, Math.round(percent)));
    worker.postMessage({ type: 'progress', id: request.id, backend: modelBackend, percent: lastPercent });
  };
  const progress_callback = (progress: ProgressInfo) => {
    if (progress.status !== 'progress' || !progress.file.endsWith('.onnx') || !Number.isFinite(progress.progress)
        || performance.now() - lastUpdate < 220) return;
    lastUpdate = performance.now();
    reportProgress(progress.progress);
  };
  try {
    const loadModel = async () => {
      try {
        await cacheKokoroWeights(reportProgress);
      } catch (error) {
        throw new Error(`Kokoro download: ${error instanceof Error ? error.message : 'asset unavailable'}`);
      }
      return KokoroTTS.from_pretrained(KOKORO_MODEL, {
        device: modelBackend, dtype: 'fp16', voicePath: KOKORO_VOICE_PATH, progress_callback,
      });
    };
    const [loaded] = await Promise.all([loadModel(), cacheVoices().catch(() => { /* An uncached voice can load on demand. */ })]);
    model = loaded;
    worker.postMessage({ type: 'ready', id: request.id, backend, loadMs: performance.now() - started, device: deviceName });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const unavailable = /fetch|network|HTTP|404|403|download|not found.*\.onnx/i.test(message);
    fail(request.id, unavailable ? 'kokoro-download' : 'kokoro-backend', error);
  }
};

const generate = async (request: Extract<KokoroRequest, { type: 'generate' }>): Promise<void> => {
  if (!model || !backend) { fail(request.id, 'kokoro-backend'); return; }
  if (!Object.values(KOKORO_VOICES).includes(request.voice) || Array.from(request.text).length > 92) {
    fail(request.id, 'kokoro-sentence-limit');
    return;
  }
  const started = performance.now();
  try {
    const result = await model.generate(request.text, { voice: request.voice, speed: request.speed });
    const { audio, sampling_rate: sampleRate } = result;
    if (!(audio instanceof Float32Array) || !usableKokoroAudio(audio, sampleRate)) {
      throw new Error('audio-format');
    }
    const samples = new Float32Array(audio);
    worker.postMessage({ type: 'audio', id: request.id, inferenceMs: performance.now() - started, backend,
      sampleRate, samples }, [samples.buffer]);
  } catch (error) {
    fail(request.id, error instanceof Error && error.message === 'kokoro-language' ? 'kokoro-language' : 'kokoro-inference', error);
  }
};

worker.addEventListener('message', ({ data }) => {
  if (busy) { fail(data.id, 'kokoro-busy'); return; }
  busy = true;
  const operation = data.type === 'prepare' ? prepare(data) : generate(data);
  void operation.catch(error => fail(data.id, 'kokoro-backend', error)).finally(() => { busy = false; });
});
