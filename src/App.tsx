import { useEffect, useRef, useState } from 'react';
import { AudioLines, ArrowDownToLine, ArrowUpRight, Check, ChevronDown, CircleHelp, Disc3, Expand, FileAudio, ImagePlus, Layers3, LoaderCircle, LockKeyhole, Music2, Pause, Play, RotateCcw, Settings2, ShieldCheck, SkipBack, Sparkles, Upload, Volume2, VolumeX, X } from 'lucide-react';
import { VisualScene } from './scene';
import { DEFAULT_SETTINGS, PALETTES, type ExportProgress, type Settings, type Track } from './types';
import { loadTrack, timeLabel } from './audio';
import { featuresAt } from './audio-dsp.mjs';
import { detectExportSupport, exportVideo, type ExportSupport } from './export';

const PRESETS = [{id:'aurora',title:'Aurora Flow',detail:'Six bands',shape:'wave'}] as const;
export default function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [track, setTrack] = useState<Track | null>(null);
  const [cover, setCover] = useState<HTMLImageElement | null>(null);
  const [coverName, setCoverName] = useState('');
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [position, setPosition] = useState(0);
  const [error, setError] = useState('');
  const [sceneError, setSceneError] = useState('');
  const [help, setHelp] = useState(false);
  const [tab, setTab] = useState('Scene');
  const [support, setSupport] = useState<ExportSupport | null>(null);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [completed, setCompleted] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null), viewport = useRef<HTMLDivElement>(null), audio = useRef<HTMLAudioElement>(null);
  const scene = useRef<VisualScene | null>(null), fileInput = useRef<HTMLInputElement>(null), coverInput = useRef<HTMLInputElement>(null);
  const cancel = useRef<AbortController | null>(null), live = useRef({ settings, track, playing, progress });
  live.current = { settings, track, playing, progress };
  const busy = loading || !!progress;
  useEffect(() => { detectExportSupport().then(setSupport).catch(() => setSupport({ format: null, reason: 'Your browser cannot encode this video. Use desktop Chrome or Edge.' })); }, []);
  useEffect(() => {
    if (!canvas.current) return;
    let engine: VisualScene;
    try { engine = new VisualScene(canvas.current); scene.current = engine; }
    catch { setSceneError('The 3D preview needs WebGL 2. Enable hardware acceleration in your browser and reload.'); return; }
    let frame = 0, lastUi = 0, previous = 0, slow = 0, fast = 0, previewWidth = 1280;
    const animate = (now: number) => {
      const state = live.current;
      const elapsed=previous ? now-previous : 16.7; previous=now;
      if (!state.progress && document.visibilityState==='visible') {
        slow=elapsed>22 ? slow+1 : Math.max(0,slow-1);
        fast=elapsed<18 ? fast+1 : 0;
        if(slow>90 && previewWidth>640){previewWidth-=320;engine.setSize(previewWidth,previewWidth*9/16);slow=0;fast=0;}
        if(fast>300 && previewWidth<1280){previewWidth+=320;engine.setSize(previewWidth,previewWidth*9/16);fast=0;}
      }
      if (!state.progress) {
        const t = state.track ? audio.current?.currentTime || 0 : now / 1000;
        const features = state.track ? featuresAt(state.track.analysis, t) : { bass: .12 + Math.sin(t * 1.6) * .07, mid: .2, high: .15, amplitude: .2 };
        engine.render(t, state.settings, features, !state.track);
        if (now - lastUi > 100 && state.track) { setPosition(t); lastUi = now; }
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    const lost = (e: Event) => { e.preventDefault(); cancel.current?.abort(); setSceneError('The graphics connection was interrupted. Reload the page to restore the scene.'); };
    canvas.current.addEventListener('webglcontextlost', lost);
    const el = canvas.current;
    return () => { cancelAnimationFrame(frame); el.removeEventListener('webglcontextlost', lost); engine.dispose(); scene.current = null; };
  }, []);
  useEffect(() => { scene.current?.setCover(cover); }, [cover]);
  useEffect(() => () => { if (track) URL.revokeObjectURL(track.url); }, [track]);
  useEffect(() => () => { if (cover) URL.revokeObjectURL(cover.src); }, [cover]);
  useEffect(() => {
    if (!progress) return;
    const guard = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard);
  }, [!!progress]);
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => { setCompleted(''); setSettings(s => ({ ...s, [key]: value })); };
  async function importAudio(file?: File) {
    if (!file || busy) return;
    setError(''); setLoading(true); setCompleted(''); audio.current?.pause(); setPlaying(false);
    try { const result = await loadTrack(file); setTrack(result); setPosition(0); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); if (fileInput.current) fileInput.current.value = ''; }
  }
  async function importCover(file?: File) {
    if (!file || busy) return;
    setError(''); setCompleted('');
    if (!/\.(jpe?g|png|webp)$/i.test(file.name)) { setError('Choose a JPG, PNG, or WebP cover image.'); return; }
    if (file.size > 20 * 1024 * 1024) { setError('Choose a cover image under 20 MB.'); return; }
    const image = new Image(), url = URL.createObjectURL(file);
    image.onload = () => { if (image.naturalWidth > 8192 || image.naturalHeight > 8192) { URL.revokeObjectURL(url); setError('Choose an image no larger than 8192 pixels on either side.'); return; } setCover(image); setCoverName(file.name); };
    image.onerror = () => { URL.revokeObjectURL(url); setError('This image could not be opened. Try another JPG or PNG.'); };
    image.src = url;
    if (coverInput.current) coverInput.current.value = '';
  }
  async function togglePlayback() {
    if (!audio.current || !track) return;
    if (playing) audio.current.pause(); else { try { await audio.current.play(); } catch { setError('Playback could not start. Please select your audio again.'); } }
  }
  async function startExport() {
    if (!track || !cover || !scene.current || !support?.format) return;
    setError(''); setCompleted(''); audio.current?.pause(); setPlaying(false);
    const controller = new AbortController(); cancel.current = controller;
    try {
      // The picker must open directly from the user's click before any async work.
      const name = `${settings.title.trim() || track.file.name.replace(/\.[^.]+$/, '')}-musebox.${support.format}`.replace(/[<>:"/\\|?*]/g, '-');
      const picker = (window as unknown as { showSaveFilePicker?: (o: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker;
      const handle = picker ? await picker({ suggestedName: name, types: [{ description: `${support.format.toUpperCase()} video`, accept: { [support.format === 'mp4' ? 'video/mp4' : 'video/webm']: [`.${support.format}`] } }] }) : undefined;
      setProgress({ stage: 'Preparing video', fraction: 0 });
      await exportVideo({ scene: scene.current, track, settings: { ...settings }, format: support.format, handle, filename: name, signal: controller.signal, onProgress: setProgress });
      setCompleted(handle ? `Saved ${name}` : `Your video is ready. Download started.`);
    } catch (e) { if ((e as Error).name !== 'AbortError') setError(`Export failed: ${(e as Error).message}`); }
    finally { setProgress(null); cancel.current = null; }
  }
  const waveform = track?.analysis.waveform || Array.from({ length: 160 }, (_, i) => .12 + Math.abs(Math.sin(i * .61) * Math.cos(i * .17)) * .72);
  const slider = (key: 'sensitivity' | 'motion' | 'glow' | 'particles' | 'coverSize', label: string, max = 1) => <label className="slider-row"><span>{label}<output>{Math.round(settings[key] / max * 100)}%</output></span><input disabled={busy} aria-label={label} type="range" min="0" max={max} step="0.01" value={settings[key]} onChange={e => update(key, +e.target.value)} style={{ '--fill': `${settings[key] / max * 100}%` } as React.CSSProperties}/></label>;
  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="/" aria-label="Musebox home"><span className="brand-icon"><AudioLines size={21}/></span>musebox<span className="beta">STUDIO</span></a><nav><span className="nav-active"><Layers3 size={14}/> Create</span><button onClick={() => setHelp(true)}><CircleHelp size={15}/> How it works</button></nav><div className="local-status"><span className="status-dot"/> Local rendering <span className="avatar">M</span></div></header>
    <main>
      <div className="page-heading"><div><div className="eyebrow">SOUND INTO SIGHT</div><h1>Sound, in flow<span>.</span></h1><p>Six frequencies. One flowing aurora.</p></div><span className="private-badge"><ShieldCheck size={15}/> Your files stay yours</span></div>
      <div className="workspace">
        <aside className="assets-panel panel"><div className="panel-title"><span><Upload size={15}/> Your assets</span><span className="step-label">01</span></div><div className="assets-body">
          <div className="field-heading"><span>Audio track</span><span>Required</span></div>
          <input ref={fileInput} type="file" accept=".mp3,.wav" hidden onChange={e => importAudio(e.target.files?.[0])}/>
          <button disabled={busy} className={`upload-zone ${track ? 'has-file' : ''}`} onClick={() => fileInput.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); importAudio(e.dataTransfer.files[0]); }}>
            <span className="upload-icon">{loading ? <LoaderCircle className="spin" size={24}/> : track ? <FileAudio size={24}/> : <Music2 size={24}/>}</span>
            <strong>{loading ? 'Analyzing your sound…' : track ? track.file.name : 'Drop your track here'}</strong><span>{track ? `${timeLabel(track.buffer.duration)} · ${(track.file.size / 1048576).toFixed(1)} MB · Click to replace` : <>or <b>browse files</b></>}</span><small>MP3, WAV · Up to 15 minutes · 400 MB max</small>
          </button>
          <div className="field-heading cover-heading"><span>Cover artwork</span><span>Required</span></div>
          <input ref={coverInput} type="file" accept=".jpg,.jpeg,.png,.webp" hidden onChange={e => importCover(e.target.files?.[0])}/>
          <button disabled={busy} className={`cover-upload ${cover ? 'has-cover' : ''}`} onClick={() => coverInput.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); importCover(e.dataTransfer.files[0]); }}>
            {cover ? <img src={cover.src} alt="Your selected cover artwork"/> : <><span className="art-placeholder"><ImagePlus size={25}/></span><strong>Add cover artwork</strong><span>Drop an image or browse</span></>}
            {cover && <span className="replace-cover">Replace artwork</span>}
          </button><p className="file-hint">{cover ? coverName : 'JPG, PNG, WebP · Up to 20 MB'}</p>
          <div className="divider"/><div className="field-heading"><span>Track details</span><span>Optional</span></div>
          <label className="text-label">Track title<input disabled={busy} maxLength={70} placeholder="Name your sound" value={settings.title} onChange={e => update('title', e.target.value)}/></label>
          <label className="text-label">Artist name<input disabled={busy} maxLength={70} placeholder="Who’s behind the music?" value={settings.artist} onChange={e => update('artist', e.target.value)}/></label>
          <div className="privacy-note"><LockKeyhole size={14}/><p>Made on your machine.<br/><span>Nothing is uploaded to a server.</span></p></div>
        </div></aside>
        <section className="center-column"><div className="preview-panel panel"><div className="panel-title"><span><span className="tiny-dot"/> {track ? 'Live preview' : 'Demo preview'}</span><div className="preview-meta">16:9 <span/> 1080p <button aria-label="Expand preview" onClick={() => { viewport.current?.requestFullscreen().catch(() => setError('Fullscreen is unavailable in this browser.')); }}><Expand size={14}/></button></div></div>
          <div className="viewport" ref={viewport}><canvas ref={canvas} aria-label="Fluid audio-reactive aurora sheet"/><div className="viewport-top"><span className="scene-tag"><span/> {PRESETS.find(p => p.id === settings.preset)?.title}</span><span className="canvas-corner">M / VISUAL ENGINE</span></div>{sceneError && <div className="scene-error">{sceneError}</div>}{!track && <div className="demo-tag"><Sparkles size={11}/> PROCEDURAL DEMO · ADD YOUR TRACK TO BEGIN</div>}</div>
          <div className="transport"><div className="play-controls"><button disabled={!track || busy} aria-label="Restart track" onClick={() => { if (audio.current) audio.current.currentTime = 0; }}><SkipBack size={16}/></button><button className="play-button" disabled={!track || busy} aria-label={playing ? 'Pause' : 'Play'} onClick={togglePlayback}>{playing ? <Pause size={16} fill="currentColor"/> : <Play size={16} fill="currentColor"/>}</button><span className="time">{timeLabel(position)} <span>/ {timeLabel(track?.buffer.duration || 0)}</span></span></div><div className="transport-right"><span className="reactive-status"><AudioLines size={13}/> Audio reactive</span><button disabled={!track} aria-label={muted ? 'Unmute' : 'Mute'} onClick={() => setMuted(!muted)}>{muted ? <VolumeX size={16}/> : <Volume2 size={16}/>}</button></div></div>
          <div className="timeline"><div className={`waveform ${track ? 'loaded' : ''}`}>{waveform.map((v, i) => <i key={i} style={{ height: `${Math.max(6, v * 90)}%`, background: track && i / 160 <= position / track.buffer.duration ? '#bba4ff' : undefined }}/>)}</div><input aria-label="Seek track" type="range" min="0" max={track?.buffer.duration || 1} step="0.01" value={position} disabled={!track || busy} onChange={e => { if (audio.current) audio.current.currentTime = +e.target.value; setPosition(+e.target.value); }}/><div className="timeline-labels">{[0, 1, 2, 3, 4].map(x => <span key={x}>{timeLabel((track?.buffer.duration || 0) * x / 4)}</span>)}</div></div>
        </div>
        <div className="frequency-legend"><div className="section-heading"><h2>Frequency / Spectrum</h2><span>{track ? ['Drift','Gather','Lift','Settle'][featuresAt(track.analysis,position).choreography.formation] : 'Procedural choreography'}</span></div><div className="band-grid">{['20-60 Hz','60-250 Hz','250-500 Hz','500-2,000 Hz','2-6 kHz','6-20 kHz'].map((band,i)=><div key={band}><span>0{i+1}</span><strong>{band}</strong><meter min="0" max="1" value={track ? featuresAt(track.analysis,position).bands?.[i] || 0 : 0}/></div>)}</div></div>
        <div className="tip"><Sparkles size={14}/><span>Every beat becomes movement. Every track creates something different.</span></div>
        </section>
        <aside className="settings-panel panel"><div className="panel-title"><span><Settings2 size={15}/> Make it yours</span><button aria-label="Reset visual settings" disabled={busy} onClick={() => setSettings(s => ({ ...DEFAULT_SETTINGS, title: s.title, artist: s.artist }))}><RotateCcw size={13}/></button></div><div className="settings-tabs">{['Scene', 'Artwork'].map(t => <button className={tab === t ? 'active' : ''} onClick={() => setTab(t)} key={t}>{t}</button>)}</div><div className="settings-body">
          {tab === 'Scene' ? <><div className="field-heading"><span>Color palette</span></div><div className="palette-grid">{PALETTES.map((p, i) => <button aria-label={['Ultraviolet palette', 'Cyber mint palette', 'Solar flare palette', 'Moonlight palette'][i]} aria-pressed={settings.palette === i} disabled={busy} className={settings.palette === i ? 'active' : ''} style={{ background: `linear-gradient(135deg, ${p[0]}, ${p[1]}, ${p[2]})` }} key={i} onClick={() => update('palette', i)}>{settings.palette === i && <Check size={15}/>}</button>)}</div><div className="palette-name">{['Ultraviolet', 'Cyber mint', 'Solar flare', 'Moonlight'][settings.palette]}<span>● ● ●</span></div><div className="divider"/>{slider('sensitivity', 'Audio sensitivity', 2)}{slider('motion', 'Flow speed', 2)}{slider('glow', 'Bloom')}{slider('particles', 'Particle density')}<div className="audio-note"><AudioLines size={15}/><span>Bass shapes the waves.<br/>Highs bring the details to life.</span></div></> : <><div className="field-heading"><span>Cover artwork</span></div><p className="artwork-info">Your artwork stays fixed in the lower-left of the scene, with its original proportions intact.</p>{slider('coverSize', 'Cover size')}<p className="artwork-info">Add a title and artist in Your assets to include them in the video.</p></>}
        </div><div className="export-section"><div className="export-heading"><span><Disc3 size={14}/> Video output</span><span className="youtube-label">YouTube ready</span></div><div className="output-box"><span>Full HD <b>1920 × 1080</b></span><span>60 fps <ChevronDown size={13}/></span></div><div className="export-spec"><span>{support?.format ? `${support.format.toUpperCase()} · ${support.format === 'mp4' ? 'H.264 + AAC' : 'VP9 + Opus'}` : 'Checking browser support…'}</span><span>16:9</span></div>
          {progress ? <div className="render-progress" role="status"><div><LoaderCircle size={14} className="spin"/><strong>{progress.stage}</strong><span>{Math.round(progress.fraction * 100)}%</span></div><progress value={progress.fraction} max="1"/><small>{progress.remaining ? `About ${timeLabel(progress.remaining)} remaining` : 'Keep this tab open while rendering'}</small><button onClick={() => cancel.current?.abort()}>Cancel render</button></div> : <button className="export-button" disabled={!track || !cover || !support?.format || busy || !!sceneError} onClick={startExport}><ArrowDownToLine size={16}/> Export video <ArrowUpRight size={15}/></button>}
          <p className="export-hint">{support && !support.format ? support.reason : !track || !cover ? 'Add your audio and artwork to get started' : 'Full track · No watermark · Rendered locally'}</p></div></aside>
      </div>
      {error && <div className="notice error" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError('')}><X size={16}/></button></div>}{completed && <div className="notice success" role="status"><Check size={18}/><span>{completed}</span><button aria-label="Dismiss message" onClick={() => setCompleted('')}><X size={16}/></button></div>}
      <footer><span><span className="footer-mark">m</span> Built for the sound you haven't seen yet.</span><span><span className="status-dot"/> Private by design <span className="footer-dot">·</span> Powered by your imagination</span></footer>
    </main>
    <audio ref={audio} src={track?.url} muted={muted} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}/>
    {help && <div className="modal-scrim" onClick={() => setHelp(false)}><section className="help-modal" role="dialog" aria-modal="true" aria-label="How Musebox works" onClick={e => e.stopPropagation()}><button className="modal-close" aria-label="Close help" autoFocus onClick={() => setHelp(false)}><X size={20}/></button><span className="eyebrow">FROM AUDIO TO ATMOSPHERE</span><h2>Your next music video,<br/>in three steps.</h2><ol><li><strong>Bring your sound.</strong><p>Add an MP3 or WAV up to 15 minutes, plus a JPG, PNG, or WebP cover.</p></li><li><strong>Find your world.</strong><p>Explore the fluid aurora, tune its movement and glow, then play your track to preview.</p></li><li><strong>Make it move.</strong><p>Export a 1080p, 60 fps video and upload it to YouTube. Keep this tab open until rendering finishes.</p></li></ol><div className="privacy-note"><ShieldCheck size={18}/><p>Everything runs on your computer.<br/><span>Desktop Chrome or Edge recommended. Project files are not saved between visits.</span></p></div><button className="export-button" onClick={() => setHelp(false)}>Let’s create <ArrowUpRight size={15}/></button></section></div>}
  </div>;
}
