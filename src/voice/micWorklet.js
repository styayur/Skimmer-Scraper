/* Runs on the Web Audio rendering thread. The silent output keeps the input graph live. */
class RadioMicrophone extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.rate = options.processorOptions.rate;
    this.remaining = options.processorOptions.maxSamples;
    this.samples = new Int16Array(2048);
    this.offset = 0;
    this.sum = 0;
    this.count = 0;
    this.phase = 0;
    this.finished = false;
    this.port.onmessage = () => this.finish();
  }

  flush() {
    if (this.offset === 0) return;
    const samples = this.offset === this.samples.length ? this.samples : this.samples.slice(0, this.offset);
    this.port.postMessage(samples, [samples.buffer]);
    this.samples = new Int16Array(2048);
    this.offset = 0;
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    this.flush();
    this.port.postMessage(null);
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (this.finished || !channel) return !this.finished;
    for (const sample of channel) {
      this.sum += sample;
      this.count++;
      this.phase += this.rate;
      if (this.phase < sampleRate) continue;
      const value = Math.max(-1, Math.min(1, this.sum / this.count));
      this.sum = 0;
      this.count = 0;
      while (this.phase >= sampleRate && this.remaining > 0) {
        this.phase -= sampleRate;
        this.samples[this.offset++] = Math.round(value * (value < 0 ? 32768 : 32767));
        this.remaining--;
        if (this.offset === this.samples.length) this.flush();
      }
      if (this.remaining === 0) { this.finish(); return false; }
    }
    return true;
  }
}

registerProcessor('skimmer-radio-microphone', RadioMicrophone);
