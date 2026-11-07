import { useEffect, useRef, useState } from 'react';
import { Check, Expand, Pause, Play, RotateCcw, SkipBack, Volume2, VolumeX, X } from 'lucide-react';
import type { VisualScene } from './scene';
import { PreviewQuality } from './preview-quality.mjs';
import { DEFAULT_SETTINGS, PALETTE_NAMES, PALETTES, waveColors, type WaveColors, type ExportProgress, type Settings, type Track } from './types';
import { ColorControl } from './ColorControl';
import { Dropdown } from './Dropdown';
import { loadTrack, timeLabel } from './audio';
import { featuresAt, frameCount } from './audio-dsp.mjs';
import { detectExportSupport, exportVideo, type ExportSupport } from './export';

type Screen = 'sources' | 'studio' | 'export';
const BAND_NAMES = ['SUB', 'BASS', 'LOW-MID', 'MID', 'UPPER', 'HIGH'];
const BAND_RANGES = ['20–60 Hz', '60–250 Hz', '250–500 Hz', '0.5–2 kHz', '2–6 kHz', '6–20 kHz'];
const BAND_ROLES = ['broad swell', 'rolling folds', 'traveling waves', 'surface detail', 'filament light', 'soft shimmer'];

export default function App() {
  const [screen, setScreen] = useState<Screen>('sources');
  const [opened, setOpened] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [track, setTrack] = useState<Track | null>(null);
  const [cover, setCover] = useState<HTMLImageElement | null>(null);
  const [coverName, setCoverName] = useState('');
  const [loading, setLoading] = useState(false);
  const [coverLoading, setCoverLoading] = useState(false);
  const [picking, setPicking] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [position, setPosition] = useState(0);
  const [previewWidth, setPreviewWidth] = useState(1920);
  const [error, setError] = useState('');
  const [sceneError, setSceneError] = useState('');
  const [sceneReady, setSceneReady] = useState(false);
  const [support, setSupport] = useState<ExportSupport | null>(null);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [lastProgress, setLastProgress] = useState<ExportProgress | null>(null);
  const [completed, setCompleted] = useState('');
  const [filename, setFilename] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null), viewport = useRef<HTMLDivElement>(null), audio = useRef<HTMLAudioElement>(null);
  const scene = useRef<VisualScene | null>(null), fileInput = useRef<HTMLInputElement>(null), coverInput = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null), help = useRef<HTMLDialogElement>(null);
  const cancel = useRef<AbortController | null>(null), exporting = useRef(false);
  const invalidate = useRef<() => void>(() => {});
  const quality = useRef(new PreviewQuality());
  const live = useRef({ settings, track, cover, screen, playing, position });
  live.current = { settings, track, cover, screen, playing, position };
  const busy = loading || coverLoading || picking || !!progress;

  useEffect(() => { detectExportSupport().then(setSupport).catch(() => setSupport({ format: null, reason: 'Export is unavailable. Try desktop Chrome or Edge.' })); }, []);
  useEffect(() => {
    if (!opened || !canvas.current) return;
    const element = canvas.current;
    let disposed = false, engine: VisualScene | undefined, frame = 0, previous = 0, lastUi = 0;
    const request = () => { if (!disposed && !frame) frame = requestAnimationFrame(animate); };
    const animate = (now: number) => {
      frame = 0;
      const state = live.current;
      if (!engine || exporting.current || state.screen === 'sources' || document.hidden || !state.track) { previous = 0; return; }
      if (state.playing && previous && quality.current.sample(now - previous)) {
        const width = quality.current.width;
        engine.setSize(width, width * 9 / 16);
        setPreviewWidth(width);
      }
      previous = state.playing ? now : 0;
      const time = audio.current?.currentTime ?? state.position;
      engine.render(time, state.settings, featuresAt(state.track.analysis, time));
      if (now - lastUi >= 100) { setPosition(time); lastUi = now; }
      if (state.playing) request();
    };
    const reset = () => { previous = 0; quality.current.reset(); request(); };
    const lost = (event: Event) => { event.preventDefault(); cancel.current?.abort(); setSceneReady(false); setSceneError('The graphics connection was interrupted. Reload to restore the preview.'); };
    invalidate.current = request;
    element.addEventListener('webglcontextlost', lost);
    document.addEventListener('visibilitychange', reset);
    import('./scene').then(({ VisualScene }) => {
      if (disposed) return;
      try { engine = new VisualScene(element); scene.current = engine; engine.setCover(live.current.cover); setSceneReady(true); request(); }
      catch { setSceneError('The preview needs WebGL 2. Enable hardware acceleration and reload.'); }
    }).catch(() => setSceneError('The visual engine could not load. Reload and try again.'));
    document.fonts.ready.then(() => { if (!disposed) request(); });
    return () => {
      disposed = true; cancelAnimationFrame(frame); invalidate.current = () => {};
      element.removeEventListener('webglcontextlost', lost); document.removeEventListener('visibilitychange', reset);
      engine?.dispose(); scene.current = null;
    };
  }, [opened]);
  useEffect(() => { scene.current?.setCover(cover); invalidate.current(); }, [cover]);
  useEffect(() => { invalidate.current(); }, [settings, position, playing, screen, progress]);
  useEffect(() => { quality.current.reset(); }, [track, screen, playing, progress, loading]);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [screen]);
  useEffect(() => () => { if (track) URL.revokeObjectURL(track.url); }, [track]);
  useEffect(() => () => { if (cover) URL.revokeObjectURL(cover.src); }, [cover]);
  useEffect(() => {
    if (!progress) return;
    const guard = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [!!progress]);

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => { setCompleted(''); setSettings(s => ({ ...s, [key]: value })); };
  function selectPalette(palette: number) {
    setCompleted('');
    setSettings(s => ({ ...s, palette, customColors: null }));
  }
  function updateColor(index: number, value: string) {
    setCompleted('');
    setSettings(s => {
      const colors: WaveColors = [...waveColors(s)];
      colors[index] = value;
      return { ...s, customColors: colors };
    });
  }
  function navigate(next: Screen) {
    if (busy) return;
    audio.current?.pause();
    if (next === 'studio') setOpened(true);
    setScreen(next);
  }
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
    if (file.size > 20 * 1024 * 1024) { setError('Choose artwork under 20 MB.'); return; }
    setCoverLoading(true);
    const image = new Image(), url = URL.createObjectURL(file);
    try {
      image.src = url; await image.decode();
      if (image.naturalWidth > 8192 || image.naturalHeight > 8192) throw new Error('Choose artwork no larger than 8192 pixels on either side.');
      setCover(image); setCoverName(file.name);
    } catch (e) { URL.revokeObjectURL(url); setError((e as Error).message || 'This image could not be opened.'); }
    finally { setCoverLoading(false); if (coverInput.current) coverInput.current.value = ''; }
  }
  async function togglePlayback() {
    if (!audio.current || !track) return;
    if (playing) audio.current.pause();
    else try { await audio.current.play(); } catch { setError('Playback could not start. Select your audio again.'); }
  }
  function seek(value: number) {
    if (audio.current) audio.current.currentTime = value;
    setPosition(value); invalidate.current();
  }
  async function startExport() {
    if (busy || !track || !cover || !scene.current || !support?.format || !sceneReady) return;
    setError(''); setCompleted(''); audio.current?.pause(); setPlaying(false); setPicking(true);
    exporting.current = true;
    const controller = new AbortController(); cancel.current = controller;
    const savedPosition = audio.current?.currentTime ?? position;
    const snapshot: Settings = { ...settings, customColors: settings.customColors ? [...settings.customColors] : null };
    const name = `${settings.title.trim() || track.file.name.replace(/\.[^.]+$/, '')}-afterglow.${support.format}`.replace(/[<>:"/\\|?*]/g, '-');
    setFilename(name);
    let began = false;
    try {
      const picker = (window as unknown as { showSaveFilePicker?: (o: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker;
      const handle = picker ? await picker({ suggestedName: name, types: [{ description: `${support.format.toUpperCase()} video`, accept: { [support.format === 'mp4' ? 'video/mp4' : 'video/webm']: [`.${support.format}`] } }] }) : undefined;
      const initial: ExportProgress = { phase: 'prepare', stage: 'Preparing video', fraction: 0, frames: 0, totalFrames: frameCount(track.buffer.duration), elapsed: 0 };
      setProgress(initial); setLastProgress(initial); setScreen('export'); began = true;
      await document.fonts.ready;
      await exportVideo({ scene: scene.current, track, settings: snapshot, format: support.format, handle, filename: name, signal: controller.signal, onProgress: p => { setProgress(p); setLastProgress(p); } });
      setCompleted(handle ? `Saved ${name}` : 'Your video is ready. Download started.');
    } catch (e) {
      if ((e as Error).name === 'AbortError') { if (began) setScreen('studio'); }
      else { setError(`Export failed: ${(e as Error).message}`); if (!began) setScreen('studio'); }
    } finally {
      exporting.current = false; setPicking(false); setProgress(null); cancel.current = null;
      if (audio.current) audio.current.currentTime = savedPosition;
      setPosition(savedPosition);
      quality.current.reset(); invalidate.current();
    }
  }

  const duration = track?.buffer.duration ?? 0;
  const features = track ? featuresAt(track.analysis, position) : null;
  const exportView = screen === 'export';
  const status = progress ?? lastProgress;
  const codec = support?.format === 'mp4' ? 'H.264 + AAC' : 'VP9 + Opus';
  const exportDisabled = !track || !cover || !support?.format || busy || !sceneReady || !!sceneError;
  const slider = (key: 'sensitivity' | 'motion' | 'glow' | 'coverSize' | 'atmosphere', label: string, max = 1) =>
    <label className="slider-row"><span>{label}<output>{settings[key].toFixed(2)}</output></span><input disabled={busy} aria-label={label} type="range" min="0" max={max} step="0.01" value={settings[key]} onChange={e => update(key, +e.target.value)} style={{ '--fill': `${settings[key]/max*100}%` } as React.CSSProperties}/></label>;
  const exportButton = <button className="primary" disabled={exportDisabled} onClick={startExport}>{picking ? 'Preparing…' : `Export .${support?.format ?? 'video'} →`}</button>;

  return <div className={`app-shell screen-${screen}`}>
    <header className="topbar">
      <button className="brand" disabled={busy} onClick={() => navigate('sources')} aria-label="Afterglow sources">AFTERGLOW<span>_</span></button>
      <span className="location">{screen === 'sources' ? '01 / SOURCES' : exportView ? '03 / EXPORT' : '02 / STUDIO'}</span>
      <div className="header-actions">{screen === 'sources' ? <span className="local-only">LOCAL ONLY — NOTHING LEAVES YOUR BROWSER</span> : <><button className="text-button" disabled={busy} onClick={() => navigate(exportView ? 'studio' : 'sources')}>[ {exportView ? '← STUDIO' : 'SOURCES'} ]</button>{!exportView && exportButton}</>}</div>
    </header>
    <input ref={fileInput} aria-label="Audio file" type="file" accept=".mp3,.wav" hidden onChange={e => importAudio(e.target.files?.[0])}/>
    <input ref={coverInput} aria-label="Cover image" type="file" accept=".jpg,.jpeg,.png,.webp" hidden onChange={e => importCover(e.target.files?.[0])}/>
    <main>
      <section className="sources-screen" hidden={screen !== 'sources'} aria-label="Sources">
        <div className="source-grid">
          <div className="source-intro"><span className="eyebrow accent">STEP 01 OF 03</span><h1 ref={screen === 'sources' ? heading : undefined} tabIndex={-1}>Sound,<br/><em>made visible.</em></h1><p>Drop a track and its cover. Six frequency bands drive<br className="desktop-break"/> light, motion and bloom. Your next music video,<br className="desktop-break"/> made entirely in your browser.</p><span className="intro-index">AUDIO IN. AFTERGLOW OUT.</span></div>
          <div className="source-files">
            <button className={`drop-zone ${track ? 'loaded' : ''}`} disabled={busy} onClick={() => fileInput.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); importAudio(e.dataTransfer.files[0]); }}>
              <span className="drop-heading"><span>A — AUDIO</span><span>.WAV / .MP3</span></span>
              <span className="drop-title">{loading ? 'Reading your sound…' : track ? 'Track ready' : 'Drop track'} <span className="accent">{track ? '✓' : '+'}</span></span>
              {track && <span className="selected-file">{track.file.name} <span>{timeLabel(duration)}</span></span>}
              <span className="drop-bottom"><span className="browse">{track ? 'REPLACE TRACK' : 'OR BROWSE FILES'}</span><span>15 MIN / 400 MB MAX</span></span>
            </button>
            <button className={`drop-zone ${cover ? 'loaded' : ''}`} disabled={busy} onClick={() => coverInput.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); importCover(e.dataTransfer.files[0]); }}>
              <span className="drop-heading"><span>B — COVER</span><span>.JPG / .PNG / .WEBP</span></span>
              <span className="artwork-drop">{cover && <img src={cover.src} alt="Selected cover"/>}<span className="drop-title">{coverLoading ? 'Opening artwork…' : cover ? 'Artwork ready' : 'Drop artwork'} <span className="accent">{cover ? '✓' : '+'}</span></span></span>
              {cover && <span className="selected-file">{coverName}</span>}
              <span className="drop-bottom"><span className="browse">{cover ? 'REPLACE ARTWORK' : 'OR BROWSE FILES'}</span><span>20 MB MAX</span></span>
            </button>
          </div>
        </div>
        <div className="source-details">
          <label><span className="eyebrow">C — ARTIST <span className="optional">OPTIONAL</span></span><input disabled={busy} maxLength={70} placeholder="[Artist]" value={settings.artist} onChange={e => update('artist',e.target.value)}/></label>
          <label><span className="eyebrow">D — TITLE <span className="optional">OPTIONAL</span></span><input disabled={busy} maxLength={70} placeholder="[Track title]" value={settings.title} onChange={e => update('title',e.target.value)}/></label>
          <div className="open-studio"><button className="primary" disabled={!track || !cover || busy} onClick={() => navigate('studio')}>Open studio →</button><span>{loading ? 'Analyzing six frequency bands…' : !track || !cover ? 'ADD AUDIO + ARTWORK TO BEGIN' : 'YOUR SESSION IS READY'}</span></div>
        </div>
      </section>

      <section className="editor" hidden={screen === 'sources'} aria-label={exportView ? 'Export' : 'Studio'}>
        <div className="track-heading" hidden={exportView}><h1 ref={screen === 'studio' ? heading : undefined} tabIndex={-1}><em>{settings.title || 'Untitled track'}</em></h1><span>BY {settings.artist || '[ARTIST]'} — {timeLabel(duration)} — 48 KHZ</span><span className="session-note">SIX BANDS. ONE FLOW.</span></div>
        <div className={`workspace ${exportView ? 'export-workspace' : ''}`}>
          <aside className="left-panel" hidden={exportView}>
            <section className="control-section"><h2>01 — SOURCES</h2><button className="asset-row" disabled={busy} onClick={() => navigate('sources')}><span>{track?.file.name}</span><small>{timeLabel(duration)}</small></button><button className="asset-row" disabled={busy} onClick={() => navigate('sources')}><span>{coverName}</span><small>{cover?.naturalWidth} × {cover?.naturalHeight}</small></button></section>
            <section className="control-section"><h2>02 — FREQUENCIES <span>6 BANDS</span></h2><div className="bands">{BAND_NAMES.map((name,i) => <div className={`band band-${i}`} key={name}><div><strong>{name}</strong><span>{BAND_RANGES[i]}</span><output>{Math.round((features?.bands?.[i] ?? 0)*100)}%</output></div><meter aria-label={`${name} energy`} min="0" max="1" value={features?.bands?.[i] ?? 0}/><small>→ {BAND_ROLES[i]}</small></div>)}</div></section>
            <section className="control-section"><h2>03 — BLOOM</h2>{slider('glow','Strength')}<p className="muted">Light follows the waves.<br/>Artwork stays crisp.</p><span className="check-note"><Check size={14}/> Anti-aliasing enabled</span></section>
          </aside>
          <div className="center-panel">
            <div className="export-summary" hidden={!exportView}><h1 ref={exportView ? heading : undefined} tabIndex={-1}>{Math.floor((status?.fraction ?? 0)*100)}<em>%</em></h1><div role="status"><strong>{completed ? 'YOUR AFTERGLOW IS READY' : error ? 'RENDER INTERRUPTED' : status?.stage.toUpperCase()}</strong><span>{status?.frames.toLocaleString()} / {status?.totalFrames.toLocaleString()} FRAMES</span><span>ELAPSED {timeLabel(status?.elapsed ?? 0)} {status?.remaining ? `— ~${timeLabel(status.remaining)} LEFT` : ''}</span></div><progress aria-label="Export progress" max="1" value={status?.fraction ?? 0}/></div>
            <div className="preview-wrap">
              <div className="viewport" ref={viewport}><canvas ref={canvas} aria-label="Audio-reactive layered waves"/><div className="viewport-meta"><span><i/>{progress ? 'RENDERING' : 'AFTERGLOW / LIVE'}</span><span>{progress ? '1920 × 1080' : `${previewWidth} × ${previewWidth*9/16}`} / {progress ? '60 FPS' : 'PREVIEW'}</span></div>{(sceneError || !sceneReady) && <div className="scene-error" role="status">{sceneError || 'Preparing the visual engine…'}</div>}</div>
              <div className="transport" hidden={exportView}><button className="play-button" disabled={busy || !sceneReady} onClick={togglePlayback} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={17}/> : <Play size={17}/>}</button><span>{timeLabel(position)}</span><div className="waveform"><div className="wave-bars">{track?.analysis.waveform.map((v,i) => <i key={i} className={i/160 <= position/(duration || 1) ? 'played' : ''} style={{height: `${Math.max(8,v*100)}%`}}/>)}</div><input aria-label="Seek track" type="range" min="0" max={duration || 1} step=".01" disabled={busy} value={position} onChange={e => seek(+e.target.value)}/></div><span className="muted">{timeLabel(duration)}</span></div>
              <div className="preview-tools" hidden={exportView}><span>16:9 <span className="separator">/</span> {['Drift','Gather','Lift','Settle'][features?.choreography?.formation ?? 0]}</span><div><button disabled={busy} aria-label="Restart track" onClick={() => seek(0)}><SkipBack size={15}/></button><button aria-label={muted ? 'Unmute' : 'Mute'} onClick={() => setMuted(!muted)}>{muted ? <VolumeX size={15}/> : <Volume2 size={15}/>}</button><button aria-label="Expand preview" onClick={() => viewport.current?.requestFullscreen().catch(() => setError('Fullscreen is unavailable.'))}><Expand size={15}/></button></div></div>
              <div className="export-caption" hidden={!exportView}>1920 × 1080 <span>60 FPS</span><span>{codec} / 20 MBPS VIDEO</span><span>FRAME-ACCURATE</span></div>
            </div>
            <div className="studio-note" hidden={exportView}><span className="eyebrow">SOUND → SIGHT</span><p>Every frequency leaves a trace.</p><span>PLAY YOUR TRACK. FIND YOUR AFTERGLOW.</span></div>
          </div>
          <aside className="right-panel">
            <div hidden={exportView}>
              <section className="control-section"><h2>04 — SCENE <button aria-label="Reset visual settings" disabled={busy} onClick={() => setSettings(s => ({...DEFAULT_SETTINGS,title:s.title,artist:s.artist}))}><RotateCcw size={13}/></button></h2>{slider('atmosphere','Atmosphere')}<p className="muted">Expressive waves, soft atmosphere.<br/>Artwork appears at the opening and closing.</p><Dropdown label="Color palette" disabled={busy} value={settings.customColors ? 'custom' : String(settings.palette)} options={[...(settings.customColors ? [{value:'custom',label:'Custom colors'}] : []), ...PALETTE_NAMES.map((label,i) => ({value:String(i),label}))]} onChange={value => { if (value !== 'custom') selectPalette(+value); }}/><div className="palette-swatches">{PALETTES.map((p,i) => <button aria-label={`${PALETTE_NAMES[i]} palette`} aria-pressed={!settings.customColors && settings.palette===i} disabled={busy} key={i} onClick={() => selectPalette(i)} style={{background:`linear-gradient(135deg,${p[0]},${p[1]},${p[2]})`}}>{!settings.customColors && settings.palette===i && <Check size={14}/>}</button>)}</div><fieldset className="custom-colors" disabled={busy}><legend>Customize colors</legend>{['Lower waves', 'Middle waves', 'Upper waves'].map((label,i) => <ColorControl key={label} label={label} value={waveColors(settings)[i]} disabled={busy} onChange={value => updateColor(i,value)}/>)}</fieldset>{slider('sensitivity','Audio sensitivity',2)}{slider('motion','Flow speed',2)}{slider('coverSize','Cover size')}<p className="muted">Aurora sheet / 56 filaments<br/>Driven by your sound.</p></section>
              <section className="control-section"><h2>05 — OUTPUT</h2><dl className="output-spec"><dt>Resolution</dt><dd>1920 × 1080</dd><dt>Frame rate</dt><dd>60 fps</dd><dt>Codec</dt><dd>{support?.format ? codec : 'Checking support…'}</dd><dt>Video bitrate</dt><dd>20 Mbps</dd><dt>Render</dt><dd>Frame-accurate / local</dd></dl><p className="frame-estimate">{frameCount(duration).toLocaleString()} FRAMES / {timeLabel(duration)}</p>{exportButton}<p className="muted">{support && !support.format ? support.reason : 'Full track. No watermark.'}</p></section>
            </div>
            <div className="export-sidebar" hidden={!exportView}>
              <section className="control-section"><h2>PIPELINE</h2><ol className="pipeline"><li className="done"><span>01</span><div>DECODE AUDIO <Check size={12}/><small>48 kHz / original sound</small></div></li><li className="done"><span>02</span><div>ANALYZE SIX BANDS <Check size={12}/><small>Every frequency, in motion</small></div></li><li className={status?.phase === 'render' || status?.phase === 'prepare' ? 'active' : 'done'}><span>03</span><div>RENDER + ENCODE<small>{status?.frames.toLocaleString()} frames / {codec}</small></div></li><li className={status?.phase === 'finalize' ? 'active' : completed ? 'done' : ''}><span>04</span><div>FINALIZE FILE<small>Prepare your .{support?.format} video</small></div></li></ol></section>
              <section className="control-section"><h2>YOUR OUTPUT</h2><p className="output-name">{filename}</p><p className="muted">1080p / 60 fps / {timeLabel(duration)}</p>{progress ? <><p className="muted">Keep this tab open while rendering.</p><button className="cancel-button" onClick={() => cancel.current?.abort()}>Cancel render</button></> : completed ? <><p className="completion" role="status"><Check size={16}/>{completed}</p><button className="outline-button" onClick={() => navigate('studio')}>← Back to studio</button></> : <><p className="muted">Your session is intact. Try the export again.</p><button className="primary" disabled={exportDisabled} onClick={startExport}>Retry export →</button><button className="cancel-button" onClick={() => navigate('studio')}>Back to studio</button></>}</section>
            </div>
          </aside>
        </div>
      </section>
    </main>
    {error && <div className="notice" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError('')}><X size={18}/></button></div>}
    <footer><span>AFTERGLOW<span className="accent">_</span> <span className="footer-tagline">SOUND, MADE VISIBLE.</span></span><div><span>PRIVATE BY DESIGN</span><button onClick={() => help.current?.showModal()}>HOW IT WORKS ↗</button></div></footer>
    <audio ref={audio} src={track?.url} muted={muted} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setPosition(duration); }}/>
    <dialog ref={help} className="help-dialog"><button className="dialog-close" aria-label="Close help" onClick={() => help.current?.close()}><X size={20}/></button><span className="eyebrow accent">FROM SOUND TO SIGHT</span><h2>Leave an <em>afterglow.</em></h2><ol><li><strong>Bring your sound.</strong><p>Add an MP3 or WAV up to 15 minutes, plus JPG, PNG or WebP artwork.</p></li><li><strong>Find your flow.</strong><p>Play your track. Adjust the colors, movement, and bloom.</p></li><li><strong>Make it yours.</strong><p>Export the full track at 1080p, 60 fps. Keep the tab open until it finishes.</p></li></ol><p className="muted">Files stay in your browser. Sessions are not saved between visits. Desktop Chrome or Edge recommended.</p><button className="primary" onClick={() => help.current?.close()}>Let's create →</button></dialog>
  </div>;
}
