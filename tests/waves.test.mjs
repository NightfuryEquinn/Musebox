import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sampleWave,sampleNormal,WAVE_COMPONENTS,MAX_DISPLACEMENT} from '../src/waves.mjs';
test('analytic normals agree with numerical derivatives throughout the sheet',()=>{
  const e=1e-5,bands=[.7,.4,.9,.2,.8,.5];
  for(let x=-4.8;x<5;x+=.6)for(let y=-1.8;y<2;y+=.4){
    const dx=(sampleWave(x+e,y,13,bands)-sampleWave(x-e,y,13,bands))/(2*e);
    const dy=(sampleWave(x,y+e,13,bands)-sampleWave(x,y-e,13,bands))/(2*e);
    const length=Math.hypot(dx,dy,1),expected=[-dx/length,-dy/length,1/length];
    const actual=sampleNormal(x,y,13,bands);
    actual.forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<1e-7));
  }
});
test('analytic wave amplitude bound covers every supported band combination',()=>{assert.ok(WAVE_COMPONENTS.reduce((sum,c)=>sum+c.base+c.gain,0)<MAX_DISPLACEMENT);for(const bands of [[0,0,0,0,0,0],[1,1,1,1,1,1]])for(let x=-5;x<=5;x+=.25)for(let y=-2;y<=2;y+=.25){assert.ok(Math.abs(sampleWave(x,y,33,bands,2))<=MAX_DISPLACEMENT);const n=sampleNormal(x,y,33,bands,2);assert.ok(n.every(Number.isFinite));assert.ok(Math.abs(Math.hypot(...n)-1)<1e-9);}});
test('fifteen-minute timeline remains bounded with deterministic seeking',()=>{const bands=[1,1,1,1,1,1];for(let frame=0;frame<=54000;frame++){const t=frame/60;assert.ok(Math.abs(sampleWave(1.7,.6,t,bands,2))<MAX_DISPLACEMENT);}const a=sampleWave(2,.3,75.123,bands);sampleWave(2,.3,800,bands);assert.equal(sampleWave(2,.3,75.123,bands),a);});
test('displacement vanishes at boundaries and each motion band affects surface',()=>{for(const [x,y] of [[-5,0],[5,0],[0,-2],[0,2]])assert.ok(Math.abs(sampleWave(x,y,1,[1,1,1,1,1,1]))<1e-12);const quiet=sampleWave(1,.2,1,[0,0,0,0,0,0]);for(let i=0;i<4;i++){const bands=[0,0,0,0,0,0];bands[i]=1;assert.notEqual(sampleWave(1,.2,1,bands),quiet);}});
