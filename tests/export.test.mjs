import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { frameCount, featuresAt } from '../src/audio-dsp.mjs';

// Exercise the real export loop with deterministic encoder and filesystem boundaries.
const source = ts.transpileModule(readFileSync(new URL('../src/export.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

class TestAudioBuffer {
  constructor({numberOfChannels=1,sampleRate=48000,length=7200}={}) {
    Object.assign(this,{numberOfChannels,sampleRate,length,duration:length/sampleRate});
    this.channels=Array.from({length:numberOfChannels},()=>new Float32Array(length));
  }
  getChannelData(channel){return this.channels[channel];}
  copyToChannel(samples,channel){this.channels[channel].set(samples);}
}

function fixture({abortAt,failWrite=false,ambient=false}={}) {
  const controller=new AbortController(),progress=[],frames=[],sizes=[],renderInputs=[];
  let committed=false,aborted=false;
  const writable={write:async()=>{if(failWrite)throw new Error('Disk full');},close:async()=>{committed=true;},abort:async()=>{aborted=true;}};
  const handle={createWritable:async()=>writable};
  const canvas={width:960,height:540};
  const scene={renderer:{domElement:canvas},setSize:(w,h)=>{canvas.width=w;canvas.height=h;sizes.push([w,h]);},render:(time,settings,features)=>{renderInputs.push({time,settings,features});frames.push({time,width:canvas.width,height:canvas.height});}};
  let writer;
  class Output {
    constructor(options){writer=options.target.stream.getWriter();}
    addVideoTrack(){} addAudioTrack(){} async start(){}
    async finalize(){await writer.close();}
    async cancel(){await writer.abort();}
  }
  class CanvasSource {
    async add(time,duration){
      assert.ok(duration>0 && duration<=1/60);
      await writer.write(new Uint8Array([0]));
      if(frames.length===abortAt)controller.abort();
    }
    close(){}
  }
  class AudioBufferSource {async add(){} close(){}}
  class StreamTarget {constructor(stream){this.stream=stream;}}
  class Empty {}
  const library={Output,CanvasSource,AudioBufferSource,StreamTarget,Mp4OutputFormat:Empty,WebMOutputFormat:Empty,Quality:Empty,canEncodeVideo:async()=>true,canEncodeAudio:async()=>true};
  const module={};
  new Function('require','exports',source)(name=>name==='mediabunny'?library:{featuresAt,frameCount},module);
  const buffer=new TestAudioBuffer();
  const track={buffer,analysis:{frames:new Float32Array(9*7),waveform:[],duration:.15,fps:60}};
  const settings=ambient ? {atmosphere:.5} : {};
  if(ambient)track.analysis.ambientFrames=new Float32Array(9*7).fill(.4);
  return {renderInputs,track,settings,run:()=>module.exportVideo({scene,track,settings,format:'mp4',handle,filename:'test.mp4',signal:controller.signal,onProgress:p=>progress.push(p)}),progress,frames,sizes,canvas,committed:()=>committed,aborted:()=>aborted};
}

test('export renders exact 1080p60 frames, commits, and restores preview dimensions',async()=>{
  const original=globalThis.AudioBuffer;globalThis.AudioBuffer=TestAudioBuffer;
  try {
    const f=fixture();await f.run();
    assert.equal(f.frames.length,9);
    f.frames.forEach((frame,i)=>assert.deepEqual(frame,{time:i/60,width:1920,height:1080}));
    assert.deepEqual(f.sizes,[[1920,1080],[960,540]]);
    assert.equal(f.committed(),true);
    assert.equal(f.aborted(),false);
    assert.equal(f.progress.at(-1).phase,'complete');
    assert.equal(f.progress.at(-1).frames,9);
    assert.equal(f.progress.at(-1).fraction,1);
    assert.ok(f.progress.every((p,i)=>p.elapsed>=0 && (!i || p.fraction>=f.progress[i-1].fraction)));
  }finally{globalThis.AudioBuffer=original;}
});
test('cancel and disk failures abort the file and restore the preview for retry',async()=>{
  const original=globalThis.AudioBuffer;globalThis.AudioBuffer=TestAudioBuffer;
  try {
    for(const options of [{abortAt:3},{failWrite:true}]){
      const f=fixture(options);
      await assert.rejects(f.run(),options.abortAt?{name:'AbortError'}:/Disk full/);
      assert.equal(f.committed(),false);assert.equal(f.aborted(),true);
      assert.deepEqual(f.sizes.at(-1),[960,540]);
      assert.ok(!f.progress.some(p=>p.phase==='complete'));
    }
    const retry=fixture();await retry.run();assert.equal(retry.committed(),true);
  }finally{globalThis.AudioBuffer=original;}
});


test('export forwards atmosphere settings and the same time-sampled features as preview',async()=>{
  const original=globalThis.AudioBuffer;globalThis.AudioBuffer=TestAudioBuffer;
  try {
    const f=fixture({ambient:true});await f.run();
    for(const input of f.renderInputs){
      assert.deepEqual(input.settings,{atmosphere:.5});
      assert.deepEqual(input.features,featuresAt(f.track.analysis,input.time));
      assert.equal(input.features.duration,.15);
      assert.ok(input.features.ambientBands.every(v=>Math.abs(v-.4)<1e-6));
    }
  }finally{globalThis.AudioBuffer=original;}
});
