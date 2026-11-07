import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ambientEnvelopes, ambientOverlayOpacity, ambientMotion } from '../src/ambient.mjs';
import { featuresAt } from '../src/audio-dsp.mjs';

test('ambient envelopes soften transients, follow sustained energy and release slowly',()=>{
  const frames=new Float32Array(600*7);
  frames.fill(1,0,60*7);
  const envelopes=ambientEnvelopes(frames);
  assert.ok(envelopes[0]<.02);
  assert.ok(Math.abs(envelopes[59*7]-(1-Math.exp(-1)))<1e-6);
  assert.ok(Math.abs(envelopes[239*7]-envelopes[59*7]/Math.E)<1e-6);
  assert.ok(envelopes.every(v=>v>=0 && v<=1));
  assert.ok(ambientEnvelopes(new Float32Array(70)).every(v=>v===0));
});

test('ambient seeking and rendering order do not affect sampled state',()=>{
  const frames=Float32Array.from({length:600*7},(_,i)=>(Math.sin(i*.01)+1)/2);
  const analysis={frames,ambientFrames:ambientEnvelopes(frames),fps:60,duration:10};
  const first=featuresAt(analysis,3.141);
  featuresAt(analysis,8); featuresAt(analysis,0);
  assert.deepEqual(featuresAt(analysis,3.141),first);
  assert.equal(first.duration,10);
  assert.ok(first.ambientBands.every(v=>v>=0 && v<=1));
});

test('artwork appears only in bounded opening and closing windows, even on short tracks',()=>{
  for(const duration of [.1,1,10,24,180,900]) {
    const window=Math.min(8,duration/3);
    assert.equal(ambientOverlayOpacity(0,duration),0);
    assert.equal(ambientOverlayOpacity(duration,duration),0);
    assert.equal(ambientOverlayOpacity(duration/2,duration),0);
    assert.ok(ambientOverlayOpacity(window/2,duration)>.99);
    assert.ok(ambientOverlayOpacity(duration-window/2,duration)>.99);
    for(let i=0;i<=1000;i++) {
      const t=duration*i/1000, opacity=ambientOverlayOpacity(t,duration);
      assert.ok(opacity>=0 && opacity<=1);
      assert.ok(Math.abs(opacity-ambientOverlayOpacity(duration-t,duration))<1e-10);
      if(t>=window && t<=duration-window) assert.equal(opacity,0);
    }
  }
  assert.equal(ambientOverlayOpacity(0,0),0);
});

test('ambient motion stays within the existing displacement envelope over fifteen minutes',()=>{
  for(let frame=0;frame<=54000;frame++) {
    const t=frame/60, result=ambientMotion(t,2,1);
    assert.ok(result.mood>=.56 && result.mood<=.82);
    assert.equal(result.phase,t*2*.35);
  }
  assert.deepEqual(ambientMotion(3,0,0),ambientMotion(800,0,0));
});
