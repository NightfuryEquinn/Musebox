import { ambientEnvelopes } from './ambient.mjs';
import { choreograph, choreographyAt } from './choreography.mjs';
export const BANDS = [[20,60],[60,250],[250,500],[500,2000],[2000,6000],[6000,20000]];
export function analyzeSamples(input, sampleRate) {
 const channels=Array.isArray(input)?input:[input], length=channels[0].length, fps=60,duration=length/sampleRate,N=8192;
 const frames=new Float32Array(Math.ceil(duration*fps)*7),waveform=new Array(160).fill(0), re=new Float64Array(N),im=new Float64Array(N),window=Float64Array.from({length:N},(_,i)=>.5-.5*Math.cos(2*Math.PI*i/(N-1)));
 const bins=Int8Array.from({length:N/2},(_,k)=>BANDS.findIndex(([lo,hi])=>k*sampleRate/N>=lo&&k*sampleRate/N<hi));
 for(let f=0;f<frames.length/7;f++){
  const energies=new Float64Array(6);let total=0;
  for(const samples of channels){
   const start=Math.round(f*sampleRate/fps)-N/2;im.fill(0);
   for(let i=0;i<N;i++)re[i]=(samples[start+i]||0)*window[i];
   for(let i=1,j=0;i<N;i++){let bit=N>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j)[re[i],re[j]]=[re[j],re[i]];}
   for(let size=2;size<=N;size*=2){const angle=-2*Math.PI/size,wr=Math.cos(angle),wi=Math.sin(angle);for(let base=0;base<N;base+=size){let ar=1,ai=0;for(let j=0;j<size/2;j++){const x=base+j,y=x+size/2,tr=ar*re[y]-ai*im[y],ti=ar*im[y]+ai*re[y];re[y]=re[x]-tr;im[y]=im[x]-ti;re[x]+=tr;im[x]+=ti;const next=ar*wr-ai*wi;ai=ar*wi+ai*wr;ar=next;}}}
   for(let k=1;k<N/2;k++){const energy=(re[k]*re[k]+im[k]*im[k])/(N*N*channels.length);if(bins[k]>=0)energies[bins[k]]+=energy;total+=energy;}
  }
  for(let b=0;b<6;b++)frames[f*7+b]=Math.sqrt(energies[b]);frames[f*7+6]=Math.sqrt(total);
 }
 let peak=.05;for(let i=6;i<frames.length;i+=7)peak=Math.max(peak,frames[i]);
 for(let b=0;b<7;b++){let sm=0;for(let i=b;i<frames.length;i+=7){const v=Math.log1p(9*frames[i]/peak)/Math.log(10);sm+=(v-sm)*(v>sm?.65:.14);frames[i]=Math.min(1,sm);}}
 for(const samples of channels)for(let i=0;i<length;i++) {const w=Math.min(159,Math.floor(i/length*160));waveform[w]=Math.max(waveform[w],Math.abs(samples[i]));}
 const transients=new Float32Array(frames.length/7);let lastEnergy=0;
 for(let f=0;f<transients.length;f++){let sum=0;const center=Math.round(f*sampleRate/fps);for(const channel of channels)for(let j=-512;j<512;j++){const v=channel[center+j]||0;sum+=v*v;}const energy=Math.sqrt(sum/(1024*channels.length));transients[f]=Math.max(0,energy-lastEnergy);lastEnergy=energy;}
 const result={frames,waveform,duration,fps,transients};return {...result,ambientFrames:ambientEnvelopes(frames,fps),choreography:choreograph(result)};
}
export function featuresAt(a,time){const p=Math.max(0,Math.min(a.frames.length/7-1,time*a.fps)),lo=Math.floor(p),hi=Math.min(lo+1,a.frames.length/7-1),m=p-lo;const v=i=>(a.frames[lo*7+i]*(1-m)+a.frames[hi*7+i]*m)||0;const bands=/** @type {[number,number,number,number,number,number]} */ ([v(0),v(1),v(2),v(3),v(4),v(5)]);const ambient=i=>a.ambientFrames ? (a.ambientFrames[lo*7+i]*(1-m)+a.ambientFrames[hi*7+i]*m)||0 : v(i);return {duration:a.duration,ambientBands:/** @type {[number,number,number,number,number,number]} */ ([ambient(0),ambient(1),ambient(2),ambient(3),ambient(4),ambient(5)]),ambientEnergy:ambient(6),choreography:choreographyAt(a,time),bands,bass:Math.max(bands[0],bands[1]),mid:Math.max(bands[2],bands[3]),high:Math.max(bands[4],bands[5]),amplitude:v(6)};}
export function frameCount(duration,fps=60){return Math.ceil(duration*fps);}
