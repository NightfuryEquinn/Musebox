import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyzeSamples,featuresAt} from '../src/audio-dsp.mjs';
test('silence has no effect events',()=>{const a=analyzeSamples(new Float32Array(48000),48000);assert.equal(a.choreography.events.length,0);});
test('percussion emits bounded events and seeking reproduces choreography',()=>{const samples=new Float32Array(48000*3);for(let t=.25;t<3;t+=.5)for(let j=0;j<1800;j++)samples[Math.floor(t*48000)+j]=Math.sin(j*.3)*Math.exp(-j/500);const a=analyzeSamples(samples,48000);assert.ok(a.choreography.events.length>0);for(let i=1;i<a.choreography.events.length;i++)assert.ok(a.choreography.events[i].time-a.choreography.events[i-1].time>.22);const first=featuresAt(a,1.4);featuresAt(a,2.7);assert.deepEqual(featuresAt(a,1.4),first);});
