export const FORMATIONS=['Drift','Gather','Lift','Settle'];
export function choreograph(analysis){
 const count=analysis.frames.length/7,events=[],states=new Float32Array(count*3);let slow=0,fast=0,last=-100,lastChange=-10,state=0;
 for(let f=0;f<count;f++){const t=f/60,e=analysis.frames[f*7+6];fast+=(e-fast)*.4;slow+=(e-slow)*.012;const onset=analysis.transients ? analysis.transients[f] : Math.max(0,e-fast);if(onset>.035&&e>.08&&t-last>.22){events.push({time:t,strength:Math.min(1,onset*8),band:dominant(analysis.frames,f*7)});last=t;}
 let next=e<.08?0:fast>slow+.09?1:fast>.55?2:fast<slow-.08?3:state;
 if(t-lastChange>4&&next!==state){state=next;lastChange=t;}
 states[f*3]=state;states[f*3+1]=lastChange;states[f*3+2]=slow;
 }
 return {events,states};
}
function dominant(a,o){let b=0;for(let i=1;i<6;i++)if(a[o+i]>a[o+b])b=i;return b;}
export function choreographyAt(a,time){const c=a.choreography;if(!c)return {formation:0,previous:0,mix:1,energy:0,events:[]};const f=Math.max(0,Math.min(c.states.length/3-1,Math.floor(time*60))),formation=c.states[f*3],change=c.states[f*3+1],before=Math.max(0,Math.floor(change*60)-1);return {formation,previous:c.states[before*3]||0,mix:Math.max(0,Math.min(1,(time-change)/2)),energy:c.states[f*3+2],events:c.events.filter(e=>e.time<=time&&e.time>time-2).slice(-12)};}
