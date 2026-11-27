import type { VoiceProvider } from './voiceContracts';

/** Every clip is selected by the originating game event and its actual speaker. */
export function clipRadio(context: () => AudioContext | null): VoiceProvider {
  return { async speak(line, identity, {signal, start}) {
    const clip = line.catalog;
    const audio = context();
    if (!clip?.clip || line.source !== 'local' || clip.agent !== identity.agent || clip.locale !== line.locale || clip.text !== line.text) {
      throw new Error('voice-caption');
    }
    if (audio?.state !== 'running') throw new Error('playback-blocked');
    const response = await fetch(new URL(clip.clip, document.baseURI), {signal});
    if (!response.ok) throw new Error('voice-clip-missing');
    const buffer = await audio.decodeAudioData(await response.arrayBuffer());
    signal.throwIfAborted();
    if (audio.state !== 'running') throw new Error('playback-blocked');
    const source = audio.createBufferSource();
    source.buffer = buffer;
    const filter = audio.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = [220, 145, 285][identity.agent - 1]!;
    const gain = audio.createGain();
    gain.gain.value = identity.volume;
    const pan = audio.createStereoPanner();
    pan.pan.value = identity.pan;
    source.connect(filter).connect(gain).connect(pan).connect(audio.destination);
    let stop: (() => void) | undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        stop = () => { source.stop(); reject(signal.reason); };
        source.onended = () => resolve();
        source.start();
        signal.addEventListener('abort', stop, { once: true });
        start({ provider: 'local', voiceId: clip.catalogId });
      });
    } finally {
      if (stop) signal.removeEventListener('abort', stop);
      source.onended = null;
      source.disconnect(); filter.disconnect(); gain.disconnect(); pan.disconnect();
    }
  } };
}
