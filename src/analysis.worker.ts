import { analyzeSamples } from './audio-dsp.mjs';
self.onmessage = (e: MessageEvent<{ samples: Float32Array[]; sampleRate: number }>) => {
  try { const result = analyzeSamples(e.data.samples, e.data.sampleRate); self.postMessage(result, { transfer: [result.frames.buffer] }); }
  catch { self.postMessage({ error: 'Audio analysis failed. Try a smaller file.' }); }
};
