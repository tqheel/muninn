// Forwards raw microphone samples (mono, first channel) to the main thread.
class Capture extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel) this.port.postMessage(channel.slice(0));
    return true;
  }
}
registerProcessor('capture', Capture);
