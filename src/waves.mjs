export const WAVE_WIDTH=10, WAVE_HEIGHT=4, MAX_DISPLACEMENT=1.65;
export const WAVE_COMPONENTS=[{x:.7,y:.3,speed:.48,base:.16,gain:.3},{x:1.35,y:-.4,speed:.8,base:.12,gain:.25},{x:2.1,y:.8,speed:-.62,base:.08,gain:.18},{x:3.1,y:-1.2,speed:1.05,base:.04,gain:.12}];
export function sampleWave(x,y,time,bands,sensitivity=1.2){const gain=Math.max(0,Math.min(2,sensitivity));const edge=Math.max(0,1-(x/5)**2)*Math.max(0,1-(y/2)**2);let z=0;for(let i=0;i<4;i++){const c=WAVE_COMPONENTS[i],energy=Math.max(0,Math.min(1,bands[i]||0));z+=(c.base+c.gain*energy*gain/2)*Math.sin(x*c.x+y*c.y+time*c.speed+i*.8);}return z*edge;}
export function sampleNormal(x,y,time,bands,sensitivity=1.2){
  const gain=Math.max(0,Math.min(2,sensitivity)),ex=Math.max(0,1-x*x/25),ey=Math.max(0,1-y*y/4);
  let z=0,dx=0,dy=0;
  for(let i=0;i<4;i++){const c=WAVE_COMPONENTS[i],a=c.base+c.gain*Math.max(0,Math.min(1,bands[i]||0))*gain/2,p=x*c.x+y*c.y+time*c.speed+i*.8;z+=a*Math.sin(p);dx+=a*Math.cos(p)*c.x;dy+=a*Math.cos(p)*c.y;}
  dx=dx*ex*ey-z*2*x/25*ey;dy=dy*ex*ey-z*ex*y/2;
  const length=Math.hypot(dx,dy,1);return [-dx/length,-dy/length,1/length];
}
