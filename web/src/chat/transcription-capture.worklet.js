const FRAME_SAMPLES = 960;

class VeykorVoiceCapture extends AudioWorkletProcessor {
  constructor(options) {
    super();

    const processorOptions =
      options === undefined || options === null
        ? {}
        : (options.processorOptions ?? {});

    const source = Number(processorOptions.sourceSampleRate);
    const target = Number(processorOptions.targetSampleRate);

    this.ratio =
      Number.isFinite(source) && Number.isFinite(target) && target > 0
        ? source / target
        : 1;

    this.remnant = new Float32Array(0);
    this.position = 0;
    this.pending = [];
  }

  downmix(inputs) {
    const input = inputs[0];

    if (input === undefined || input.length === 0) {
      return new Float32Array(128);
    }

    if (input.length === 1) {
      return input[0];
    }

    const length = input[0].length;
    const mixed = new Float32Array(length);

    for (let i = 0; i < length; i += 1) {
      let sum = 0;

      for (const channel of input) {
        sum += channel[i] ?? 0;
      }

      mixed[i] = sum / input.length;
    }

    return mixed;
  }

  process(inputs) {
    const block = this.downmix(inputs);
    const joined = new Float32Array(this.remnant.length + block.length);

    joined.set(this.remnant, 0);
    joined.set(block, this.remnant.length);

    let position = this.position;

    while (position + 1 < joined.length) {
      const index = Math.floor(position);
      const fraction = position - index;

      this.pending.push(
        joined[index] * (1 - fraction) + joined[index + 1] * fraction,
      );

      position += this.ratio;
    }

    const consumed = Math.min(Math.floor(position), joined.length);

    this.remnant = joined.slice(consumed);
    this.position = position - consumed;

    while (this.pending.length >= FRAME_SAMPLES) {
      const chunk = this.pending.splice(0, FRAME_SAMPLES);
      const pcm = new Int16Array(FRAME_SAMPLES);

      for (let i = 0; i < FRAME_SAMPLES; i += 1) {
        const clamped = Math.max(-1, Math.min(1, chunk[i]));

        pcm[i] =
          clamped < 0
            ? Math.round(clamped * 32768)
            : Math.round(clamped * 32767);
      }

      this.port.postMessage(pcm.buffer, [pcm.buffer]);
    }

    return true;
  }
}

registerProcessor("veykor-voice-capture", VeykorVoiceCapture);
