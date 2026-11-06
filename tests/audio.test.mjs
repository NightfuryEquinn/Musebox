import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSamples, featuresAt, frameCount } from '../src/audio-dsp.mjs';
const rate = 48000;
const tone = (hz, seconds = 1) => Float32Array.from({ length: rate * seconds }, (_, i) => Math.sin(i / rate * Math.PI * 2 * hz) * .7);
test('silence produces no false audio reaction', () => {
  const result = analyzeSamples(new Float32Array(rate), rate);
  assert.ok(result.frames.every(v => v === 0));
  assert.ok(featuresAt(result,.5).bands.every(v=>v===0));
});
test('low, middle and high tones drive distinct frequency bands', () => {
  for (const [hz, expected] of [[60, 'bass'], [800, 'mid'], [10000, 'high']]) {
    const features = featuresAt(analyzeSamples(tone(hz), rate), .8);
    const bands = ['bass', 'mid', 'high'];
    assert.equal(bands.reduce((a, b) => features[a] > features[b] ? a : b), expected);
  }
});
test('seek sampling is deterministic and bounds-safe', () => {
  const result = analyzeSamples(tone(80, 2), rate);
  assert.deepEqual(featuresAt(result, .731), featuresAt(result, .731));
  for (const t of [-5, 0, 1.999, 10]) assert.ok(featuresAt(result, t).bands.every(Number.isFinite));
  assert.equal(result.waveform.length, 160);
  assert.equal(result.frames.length, 120 * 7);
});
test('60 fps schedule covers the full song without accumulating timing drift', () => {
  for (const duration of [.1, 1, 61.123, 900]) {
    const count = frameCount(duration);
    assert.ok((count - 1) / 60 < duration);
    assert.ok(count / 60 >= duration);
    assert.ok(count / 60 - duration < 1 / 60 + 1e-10);
  }
  assert.equal(frameCount(900), 54000);
});
test('all six frequency channels respond to their assigned bands',()=>{
 for(const [i,hz] of [35,120,350,1000,3500,12000].entries()){
  const bands=featuresAt(analyzeSamples(tone(hz),rate),.7).bands;
  assert.equal(bands.indexOf(Math.max(...bands)),i);
 }
});
test('stereo phase inversion does not cancel frequency energy',()=>{
 const left=tone(120),right=left.map(x=>-x);
 const stereo=featuresAt(analyzeSamples([left,right],rate),.7);
 assert.ok(stereo.bands[1]>.5);
});
