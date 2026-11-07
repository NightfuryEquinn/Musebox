const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const x = clamp(value); return x*x*(3-2*x); };

// Precompute in audio time, never in the rendering loop: seeking stays exact.
export function ambientEnvelopes(frames, fps = 60) {
  const result = new Float32Array(frames.length);
  const attack = 1-Math.exp(-1/fps), release = 1-Math.exp(-1/(3*fps));
  for (let band=0; band<7; band++) {
    let value=0;
    for (let i=band; i<frames.length; i+=7) {
      const target=clamp(frames[i]);
      value+=(target-value)*(target>value ? attack : release);
      result[i]=value;
    }
  }
  return result;
}

export function ambientOverlayOpacity(time, duration) {
  if (!(duration>0) || time<0 || time>duration) return 0;
  const window=Math.min(8,duration/3), fade=Math.min(1.5,window/4);
  const opening=smooth(time/fade)*smooth((window-time)/fade);
  const closing=smooth((time-duration+window)/fade)*smooth((duration-time)/fade);
  return Math.max(opening,closing);
}

export function ambientMotion(time, motion, energy) {
  const phase=time*motion*.35;
  return { phase, mood: .62+.14*clamp(energy)+.035*Math.sin(phase*.19)+.025*Math.sin(phase*.31) };
}
