import lines from '../../art/radio/lines.json';
import type { VoiceProvider } from './voiceContracts';

/** Every clip is selected by the originating game event and its actual speaker. */
export function clipRadio(context: () => AudioContext | null): VoiceProvider {
  return { async speak(line, language, identity, {signal, start}) {
    const clip = lines.find(item => item.agent === line.agent && item.event === line.event);
    const audio = context();
    if (!clip || line.source !== 'local') throw new Error('voice-caption');
    if (audio?.state !== 'running') throw new Error('playback-blocked');
    const id = clip.agent + '-' + clip.event;
    const locale = clip.spokenLanguages.includes(language) ? language : clip.spokenLanguages[0];
    const response = await fetch(new URL('./radio/' + locale + '/' + id + '.opus', document.baseURI), {signal});
    if (!response.ok) throw new Error('voice-clip-missing');
    const buffer = await audio.decodeAudioData(await response.arrayBuffer());
    signal.throwIfAborted();
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
    const stop = () => source.stop();
    try {
      await new Promise<void>(resolve => {
        source.onended = () => resolve();
        source.start();
        signal.addEventListener('abort', stop, { once: true });
        start({ provider: 'local', voiceId: id });
      });
    } finally {
      signal.removeEventListener('abort', stop);
      source.disconnect(); filter.disconnect(); gain.disconnect(); pan.disconnect();
    }
  } };
}
