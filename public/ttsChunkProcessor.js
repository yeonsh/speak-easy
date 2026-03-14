// public/ttsChunkProcessor.js
class TtsChunkProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferQueue = []; // Array of { samples: Float32Array, index: number }
    this.readOffset = 0;
    this.currentChunk = null;
    this.silenceRemaining = 0; // silence samples to insert between chunks
    this.silenceGap = 6000; // ~250ms at 24kHz
    this.fadeSamples = 480; // ~20ms fade-out/fade-in at 24kHz
    this.needsFadeIn = false; // apply fade-in to next chunk after silence

    this.port.onmessage = (event) => {
      if (event.data.type === "chunk") {
        this.bufferQueue.push({
          samples: event.data.samples,
          index: event.data.index,
        });
      } else if (event.data.type === "clear") {
        this.bufferQueue = [];
        this.currentChunk = null;
        this.readOffset = 0;
        this.silenceRemaining = 0;
      }
    };
  }

  process(inputs, outputs) {
    const output = outputs[0][0];
    if (!output) return true;

    let outIdx = 0;

    while (outIdx < output.length) {
      // Insert silence gap between chunks
      if (this.silenceRemaining > 0) {
        const silenceToCopy = Math.min(this.silenceRemaining, output.length - outIdx);
        for (let i = 0; i < silenceToCopy; i++) {
          output[outIdx++] = 0;
        }
        this.silenceRemaining -= silenceToCopy;
        continue;
      }

      // Load next chunk if needed
      if (!this.currentChunk && this.bufferQueue.length > 0) {
        this.currentChunk = this.bufferQueue.shift();
        this.readOffset = 0;
      }

      if (!this.currentChunk) {
        // No audio available — output silence
        while (outIdx < output.length) {
          output[outIdx++] = 0;
        }
        break;
      }

      // Copy samples from current chunk to output
      const remaining = this.currentChunk.samples.length - this.readOffset;
      const toCopy = Math.min(remaining, output.length - outIdx);
      const chunkStart = outIdx;

      for (let i = 0; i < toCopy; i++) {
        output[outIdx++] = this.currentChunk.samples[this.readOffset++];
      }

      // Apply fade-in at the start of a chunk after silence
      if (this.needsFadeIn) {
        const fadeLen = Math.min(this.fadeSamples, toCopy);
        for (let i = 0; i < fadeLen; i++) {
          output[chunkStart + i] *= i / fadeLen;
        }
        if (this.readOffset >= this.fadeSamples) {
          this.needsFadeIn = false;
        }
      }

      // Check if chunk is fully consumed
      if (this.readOffset >= this.currentChunk.samples.length) {
        // Apply fade-out to the last fadeSamples written into output
        const fadeLen = Math.min(this.fadeSamples, toCopy);
        const fadeStart = outIdx - fadeLen;
        for (let i = 0; i < fadeLen; i++) {
          output[fadeStart + i] *= (fadeLen - 1 - i) / fadeLen;
        }

        this.port.postMessage({
          type: "chunkDone",
          index: this.currentChunk.index,
        });
        this.currentChunk = null;
        this.readOffset = 0;
        // Insert silence before next chunk
        this.silenceRemaining = this.silenceGap;
        this.needsFadeIn = true;
      }
    }

    return true;
  }
}

registerProcessor("tts-chunk-processor", TtsChunkProcessor);
