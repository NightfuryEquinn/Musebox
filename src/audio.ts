import type { Analysis, Track } from './types';
export async function loadTrack(file: File): Promise<Track> {
  if (!/\.(mp3|wav)$/i.test(file.name)) throw new Error('Choose an MP3 or WAV audio file.');
  if (file.size > 400 * 1024 * 1024) throw new Error('This file is too large. Choose a file under 400 MB.');
  const context = new AudioContext({ sampleRate: 48000 });
  let buffer: AudioBuffer;
  try { buffer = await context.decodeAudioData(await file.arrayBuffer()); }
  catch { throw new Error('This audio could not be decoded. Try exporting it as a standard MP3 or PCM WAV.'); }
  finally { await context.close(); }
  if (buffer.duration > 900) throw new Error('Choose a track up to 15 minutes long.');
  if (buffer.duration < 0.1) throw new Error('This audio file is empty or too short.');
  if (buffer.numberOfChannels > 2) throw new Error('Choose a mono or stereo audio track.');
  const channels = Array.from({length:buffer.numberOfChannels},(_,c)=>buffer.getChannelData(c).slice());
  const analysis = await new Promise<Analysis>((resolve, reject) => {
    const worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = e => { worker.terminate(); e.data.error ? reject(new Error(e.data.error)) : resolve(e.data); };
    worker.onerror = () => { worker.terminate(); reject(new Error('Audio analysis failed. Please try again.')); };
    worker.postMessage({ samples: channels, sampleRate: buffer.sampleRate }, channels.map(c=>c.buffer));
  });
  return { file, buffer, analysis, url: URL.createObjectURL(file) };
}
export function timeLabel(value: number) { return `${Math.floor(value / 60)}:${Math.floor(value % 60).toString().padStart(2, '0')}`; }
