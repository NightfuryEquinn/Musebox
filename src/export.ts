import { Output, Mp4OutputFormat, WebMOutputFormat, StreamTarget, CanvasSource, AudioBufferSource, canEncodeVideo, canEncodeAudio, Quality } from 'mediabunny';
import type { VisualScene } from './scene';
import type { Settings, Track, ExportProgress } from './types';
import { featuresAt, frameCount } from './audio-dsp.mjs';
export type ExportSupport = { format: 'mp4' | 'webm' | null; reason?: string };
const videoQuality = new Quality({ bitrate: 20_000_000 });
const audioQuality = new Quality({ bitrate: 320_000 });
export async function detectExportSupport(): Promise<ExportSupport> {
  if (!window.isSecureContext || !('VideoEncoder' in window) || !('AudioEncoder' in window)) return { format: null, reason: 'Export needs WebCodecs. Open this site in desktop Chrome or Edge.' };
  if (!('showSaveFilePicker' in window) && !navigator.storage?.getDirectory) return { format: null, reason: 'Local file storage is unavailable. Use desktop Chrome or Edge.' };
  const video = { width: 1920, height: 1080, frameRate: 60, quality: videoQuality };
  const audio = { numberOfChannels: 2, sampleRate: 48000, quality: audioQuality };
  if (await canEncodeVideo('avc', video) && await canEncodeAudio('aac', audio)) return { format: 'mp4' };
  if (await canEncodeVideo('vp9', video) && await canEncodeAudio('opus', audio)) return { format: 'webm' };
  return { format: null, reason: '1080p60 encoding is unavailable on this device. Try desktop Chrome or Edge with hardware acceleration enabled.' };
}
type ExportOptions = { scene: VisualScene; track: Track; settings: Settings; format: 'mp4' | 'webm'; handle?: FileSystemFileHandle; filename: string; signal: AbortSignal; onProgress: (p: ExportProgress) => void };
export async function exportVideo({ scene, track, settings, format, handle, filename, signal, onProgress }: ExportOptions) {
  const width = scene.renderer.domElement.width, height = scene.renderer.domElement.height;
  const { buffer } = track;
  const audioCodec = format === 'mp4' ? 'aac' : 'opus';
  if (!await canEncodeAudio(audioCodec, { numberOfChannels: buffer.numberOfChannels, sampleRate: buffer.sampleRate, quality: audioQuality })) throw new Error('The audio encoder does not support this track. Try a stereo WAV file.');
  let temporaryDirectory: FileSystemDirectoryHandle | undefined, temporaryName: string | undefined;
  let writable: FileSystemWritableFileStream | undefined, output: Output | undefined;
  let failed = false, finalized = false;
  try {
    signal.throwIfAborted();
    if (!handle) {
      const estimate = await navigator.storage.estimate();
      const expectedBytes = buffer.duration * (20_000_000 + 320_000) / 8 * 1.2;
      if (estimate.quota && expectedBytes > estimate.quota - (estimate.usage || 0)) throw new Error('Not enough browser storage for this video. Use desktop Chrome or Edge to save directly to disk.');
      temporaryDirectory = await navigator.storage.getDirectory();
      temporaryName = `musebox-${crypto.randomUUID()}.${format}`;
      handle = await temporaryDirectory.getFileHandle(temporaryName, { create: true });
    }
    writable = await handle.createWritable();
    // Explicit close/abort handling prevents cancellation from committing a partial file.
    const stream = new WritableStream({
      write: chunk => writable!.write(chunk),
      close: () => failed || signal.aborted ? writable!.abort() : writable!.close(),
      abort: reason => writable!.abort(reason),
    });
    const target = new StreamTarget(stream, { chunked: true, chunkSize: 4 * 1024 * 1024 });
    output = new Output({ format: format === 'mp4' ? new Mp4OutputFormat({ fastStart: 'fragmented', minimumFragmentDuration: 2 }) : new WebMOutputFormat(), target });
    scene.setSize(1920, 1080);
    const video = new CanvasSource(scene.renderer.domElement, { codec: format === 'mp4' ? 'avc' : 'vp9', quality: videoQuality, keyFrameInterval: 2 });
    const audio = new AudioBufferSource({ codec: audioCodec, quality: audioQuality });
    output.addVideoTrack(video, { frameRate: 60 }); output.addAudioTrack(audio);
    await output.start();
    const total = frameCount(buffer.duration), started = performance.now();
    let audioCursor = 0;
    for (let frame = 0; frame < total; frame++) {
      signal.throwIfAborted();
      const time = frame / 60;
      scene.render(time, settings, featuresAt(track.analysis, time));
      await video.add(time, Math.min(1 / 60, buffer.duration - time));
      // Interleave one second of audio at a time to bound muxer buffering.
      if (audioCursor / buffer.sampleRate <= time && audioCursor < buffer.length) {
        const length = Math.min(buffer.sampleRate, buffer.length - audioCursor);
        const slice = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, sampleRate: buffer.sampleRate, length });
        for (let c = 0; c < buffer.numberOfChannels; c++) slice.copyToChannel(buffer.getChannelData(c).subarray(audioCursor, audioCursor + length), c);
        await audio.add(slice); audioCursor += length;
      }
      if (frame % 12 === 0) {
        const fraction = (frame + 1) / total;
        onProgress({ stage: 'Rendering video', fraction: fraction * .98, remaining: frame > 120 ? (performance.now() - started) / 1000 / fraction * (1 - fraction) : undefined });
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    signal.throwIfAborted();
    video.close(); audio.close(); onProgress({ stage: 'Finalizing file', fraction: .99 });
    await output.finalize(); finalized = true;
    signal.throwIfAborted();
    if (temporaryDirectory) {
      const file = await handle.getFile();
      const url = URL.createObjectURL(file);
      const link = document.createElement('a'); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
      const directory = temporaryDirectory, name = temporaryName!;
      setTimeout(() => { URL.revokeObjectURL(url); directory.removeEntry(name).catch(() => {}); }, 60_000);
      temporaryName = undefined;
    }
    onProgress({ stage: 'Complete', fraction: 1 });
  } catch (error) {
    failed = true;
    if (output && !finalized) await output.cancel().catch(() => {});
    if (writable) await writable.abort().catch(() => {});
    throw error;
  } finally {
    scene.setSize(width, height);
    if (temporaryDirectory && temporaryName) await temporaryDirectory.removeEntry(temporaryName).catch(() => {});
  }
}
