import { KokoroTTS } from '@uzen/kokoro-js';
import { env, type ProgressInfo } from '@huggingface/transformers';
import ortFactory from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url';
import ortWasm from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';
import {
  KOKORO_MODEL, KOKORO_REVISION, KOKORO_VOICES, type KokoroBackend, type KokoroReply, type KokoroRequest,
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
const device = navigator as Navigator & { gpu?: WebGpu; deviceMemory?: number };
let model: KokoroTTS | undefined;
let backend: KokoroBackend | null = null;
let busy = false;
let deviceName = '';
const voicePath = `https://huggingface.co/${KOKORO_MODEL}/resolve/${KOKORO_REVISION}/voices`;

const cacheVoices = async (): Promise<void> => {
  if (typeof caches === 'undefined') return;
  // The pinned Kokoro package reads embeddings from this cache before using fetch.
  const cache = await caches.open('kokoro-voices');
  await Promise.all(Object.values(KOKORO_VOICES).map(async voice => {
    const url = `${voicePath}/${voice}.bin`;
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
  let gpu: Awaited<ReturnType<WebGpu['requestAdapter']>> = null;
  if (!request.forceWasm && device.gpu) {
    try { gpu = await device.gpu.requestAdapter({ powerPreference: 'high-performance' }); } catch { /* Try WASM. */ }
  }
  backend = gpu?.features.has('shader-f16') && !gpu.info?.isFallbackAdapter ? 'webgpu' : 'wasm';
  if (backend === 'wasm' && (device.hardwareConcurrency < 4 || (device.deviceMemory ?? 4) < 4)) {
    fail(request.id, 'kokoro-device');
    return;
  }
  deviceName = backend === 'webgpu'
    ? gpu?.info?.description || [gpu?.info?.vendor, gpu?.info?.architecture].filter(Boolean).join(' ') || 'WebGPU'
    : `single-thread WASM · ${device.hardwareConcurrency} logical cores`;
  env.allowLocalModels = false;
  env.remoteHost = 'https://huggingface.co/';
  env.remotePathTemplate = `{model}/resolve/${KOKORO_REVISION}/`;
  env.useBrowserCache = typeof caches !== 'undefined';
  env.cacheKey = 'skimmer-kokoro-zh-v1';
  env.useWasmCache = false;
  if (env.backends.onnx.wasm) {
    env.backends.onnx.wasm.numThreads = 1;
    env.backends.onnx.wasm.proxy = false;
    env.backends.onnx.wasm.wasmPaths = { mjs: new URL(ortFactory, location.href).href, wasm: new URL(ortWasm, location.href).href };
  }
  worker.postMessage({ type: 'progress', id: request.id, backend, percent: null });
  let lastUpdate = -Infinity;
  const progress_callback = (progress: ProgressInfo) => {
    if (progress.status !== 'progress' || !progress.file.endsWith('.onnx') || performance.now() - lastUpdate < 220 || !backend) return;
    lastUpdate = performance.now();
    worker.postMessage({ type: 'progress', id: request.id, backend,
      percent: Number.isFinite(progress.progress) ? Math.min(100, Math.round(progress.progress)) : null });
  };
  try {
    const [loaded] = await Promise.all([KokoroTTS.from_pretrained(KOKORO_MODEL, {
      device: backend, dtype: backend === 'webgpu' ? 'q4f16' : 'q8',
      voicePath,
      progress_callback,
    }), cacheVoices().catch(() => { /* Kokoro can fetch an uncached voice on demand. */ })]);
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
    if (!(audio instanceof Float32Array) || sampleRate !== 24_000 || audio.length < 2400 || audio.length > sampleRate * 18) {
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
