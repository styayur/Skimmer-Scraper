import workletUrl from './micWorklet.js?url&no-inline';
import { makeWave, MAX_MIC_SAMPLES, MIC_RATE, type WaveClip } from './wave';

export interface MicSession {
  finish(): void;
  result: Promise<WaveClip | null>;
}

export const openMicrophone = async (signal: AbortSignal): Promise<MicSession> => {
  if (!navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === 'undefined') throw new Error('mic-unavailable');
  const context = new AudioContext();
  const ready = context.resume();
  void ready.catch(() => {});
  let stream: MediaStream | undefined;
  let node: AudioWorkletNode | undefined;
  let source: MediaStreamAudioSourceNode | undefined;
  const close = () => {
    stream?.getTracks().forEach(track => track.stop());
    source?.disconnect();
    node?.disconnect();
    node?.port.close();
    if (context.state !== 'closed') void context.close().catch(() => {});
  };
  signal.addEventListener('abort', close, { once: true });
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: {
      channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true,
    } });
    signal.throwIfAborted();
    await Promise.all([context.audioWorklet.addModule(workletUrl), ready]);
    signal.throwIfAborted();
    source = context.createMediaStreamSource(stream);
    node = new AudioWorkletNode(context, 'skimmer-radio-microphone', {
      numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
      processorOptions: { rate: MIC_RATE, maxSamples: MAX_MIC_SAMPLES },
    });
  } catch (error) {
    close();
    throw error;
  } finally { signal.removeEventListener('abort', close); }
  const chunks: Int16Array[] = [];
  let settled = false;
  let finishTimer = 0;
  let resolve!: (clip: WaveClip | null) => void;
  let reject!: (error: Error) => void;
  const result = new Promise<WaveClip | null>((yes, no) => { resolve = yes; reject = no; });
  const complete = (error?: Error) => {
    if (settled) return;
    settled = true;
    signal.removeEventListener('abort', abort);
    window.clearTimeout(finishTimer);
    close();
    if (error) reject(error);
    else resolve(makeWave(chunks));
    chunks.length = 0;
  };
  const abort = () => complete(new DOMException('Recording cancelled', 'AbortError'));
  signal.addEventListener('abort', abort, { once: true });
  for (const track of stream.getAudioTracks()) track.addEventListener('ended', () => complete(new Error('mic-revoked')), { once: true });
  node.port.onmessage = ({ data }: MessageEvent<Int16Array | null>) => {
    if (data === null) complete();
    else if (!settled) chunks.push(data);
  };
  node.onprocessorerror = () => complete(new Error('mic-capture'));
  source.connect(node);
  node.connect(context.destination);
  return { result, finish: () => {
    if (settled || finishTimer) return;
    // Release the physical input before asynchronous WAV finalization and upload.
    stream.getTracks().forEach(track => track.stop());
    node.port.postMessage('finish');
    finishTimer = window.setTimeout(() => complete(new Error('mic-capture')), 350);
  } };
};
