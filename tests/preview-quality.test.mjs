import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PreviewQuality } from '../src/preview-quality.mjs';

function run(quality, frameTime, seconds) {
  for (let i = 0; i < seconds * 1000 / frameTime; i++) quality.sample(frameTime);
}
test('60 fps stays at 1080p; isolated long frames do not lower quality', () => {
  const quality = new PreviewQuality();
  run(quality, 1000 / 60, 60);
  assert.equal(quality.width, 1920);
  quality.sample(100);
  run(quality, 1000 / 60, 10);
  assert.equal(quality.width, 1920);
});
test('sustained slow rendering steps down, observes cooldown, then recovers', () => {
  const quality = new PreviewQuality();
  run(quality, 33.3, 3);
  assert.equal(quality.width, 1600);
  run(quality, 33.3, 2);
  assert.equal(quality.width, 1600);
  run(quality, 33.3, 25);
  assert.equal(quality.width, 640);
  run(quality, 16.67, 30);
  assert.equal(quality.width, 1920);
});
test('interruptions clear stale slow samples without discarding the current tier', () => {
  const quality = new PreviewQuality();
  run(quality, 33.3, 3);
  quality.reset();
  const width = quality.width;
  for (const invalid of [NaN, Infinity, -1, 0]) assert.equal(quality.sample(invalid), false);
  run(quality, 33.3, 2);
  assert.equal(quality.width, width);
});
