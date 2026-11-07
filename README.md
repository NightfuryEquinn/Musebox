# Afterglow

Sound, made visible. A browser-local music video studio with audio-reactive wave filaments, bloom, and frame-accurate 1920 × 1080 / 60 fps export.

## Development

Requires Node.js 22.12+ or 24+. On Windows, use `npm.cmd` if PowerShell disables the `npm.ps1` shim.

```sh
npm ci
npm run dev
npm run build
npm test
```

The app uses React, TypeScript, Vite, Three.js/WebGL 2, worker-based audio analysis, and Mediabunny/WebCodecs. Serve `dist` as static assets after building. No server, account, API key, or environment variables are needed.

## Workflow

1. **Sources:** import MP3/WAV audio and JPG/PNG/WebP artwork. Artist and title are optional. Both media assets are required to open Studio.
2. **Studio:** play and seek your track; adjust palette, sensitivity, flow speed, bloom, and artwork size. Six frequency meters describe how the audio shapes the scene. Return to Sources to replace media or edit metadata without losing the session.
3. **Export:** save the full track at 1080p60. The export screen reports frames, elapsed time, estimated remaining time, and finalization. Cancel returns to Studio; failed exports can be retried. Preview dimensions and playback position are restored afterward.

The reference-inspired interface uses a black background, ivory serif typography, monospace controls, and lime accents. Cormorant Garamond and IBM Plex Mono are self-hosted; their licenses are in `public/fonts`. No fonts or media are fetched from third parties at runtime.

Audio limit: 15 minutes, 400 MB, mono or stereo. Artwork limit: 20 MB, 8192 pixels per side. Long decoded tracks can require hundreds of megabytes of memory. Projects last for the current browser session and are not persisted.

## Waves and atmosphere

Studio has one combined scene: the original wave amplitude, six-band audio response and flow speed, together with two faint background wave layers and procedural aurora haze in the selected palette. The camera stays fixed. **Atmosphere** controls the added layers and haze (50% by default); zero removes them without changing the main waves. Palette, sensitivity, bloom and cover size still apply.

The background layers use slow overlapping motion at 35% of the main flow rate. Their audio envelopes are precomputed at 60 Hz with one-second attack and three-second release time constants, softening percussion while following sustained energy. Main filaments retain their original audio response and choreography. All movement is derived from track time, so seeking and export reproduce the same scene. Silence keeps gentle baseline motion without false audio pulses.

Cover artwork, title and artist fade in and out during the first and last eight seconds. Short tracks use one-third of their duration for each window. The middle is an uninterrupted landscape. The audio and track duration are unchanged; this is not an audio looping feature.

## Rendering and performance

- One 256 × 96 surface generates 56 anti-aliased filaments in its shader. Four audio bands drive bounded displacement; the upper two drive illumination and shimmer. Height and analytic derivatives share a single evaluation of each wave component.
- Five working palettes include the default lime/ivory/pink Afterglow palette. Customize the lower, middle, and upper wave colors with color pickers or six-digit hex codes; edits update the paused/live preview and export. The artist label follows the middle color. Choosing a preset replaces custom colors, and Reset restores Afterglow. There are no particles or editable keyframes.
- A fixed orthographic camera looks across the waves at a low 12-degree elevation. Vertical displacement is emphasized by 2.4×, with real depth between rows so peaks and troughs are easier to distinguish. Framing contains the full displacement envelope and stays steady as audio energy changes.
- Wave rendering uses bloom, SMAA, then tone mapping/output conversion. Artwork and labels are rendered afterward, outside bloom; their opacity fades at the opening and closing.
- The visual engine loads when Studio first opens. Sources, hidden tabs, and paused scenes do not continuously render; seeking or changing settings redraws paused previews.
- Preview starts at 1920 × 1080 with pixel ratio 1. Sustained slow rendering steps down through 1600 × 900, 1280 × 720, 960 × 540, and 640 × 360, keeping bloom and SMAA enabled. Rolling frame timing, a five-second cooldown, and separate recovery thresholds avoid rapid resizing.
- Export always renders at 1920 × 1080 and explicit `frame / 60` timestamps. Export speed is independent of output frame rate and preview resolution.
- Six-band audio analysis uses an 8192-point Hann-window FFT at 60 Hz. Stereo energies are averaged to avoid phase cancellation. Seeking and export share deterministic motion.
- MP4/H.264/AAC is preferred, with WebM/VP9/Opus fallback. Support checks use actual 1080p60 settings. Video targets 20 Mbps; audio is resampled to 48 kHz and encoded at 320 kbps.
- Encoded audio is interleaved in one-second chunks with backpressure. Desktop Chrome/Edge can stream directly to a chosen file. Other supported browsers use temporary origin-private storage and download, with quota checks and cleanup.

## Verification

`npm test` covers audio bands, silence, stereo phase inversion, deterministic seeking, wave bounds and analytic normals, preview quality hysteresis, and the real export loop with mocked codec/filesystem boundaries. Export regression tests check 1080p60 frame timestamps, progress, commit/abort behavior, failure/retry, and preview dimension restoration.

The production build performs strict TypeScript checks. The suite includes ambient smoothing, short-track overlay timing, deterministic seeking, bounded motion, and ambient export-input parity. All 22 tests and the production build pass.

**Browser verification is still required:** no browser was connected in the implementation environment, including for the combined wave and atmosphere scene. Screenshots, GPU performance, and actual encoded video output have not been verified. No universal 60 fps claim is made.

Browser acceptance checklist:
- Compare Sources, Studio, and Export with `refs/` at 1440px and 1920px; check tablet/mobile layout, keyboard access, and focus.
- Import MP3 and WAV, portrait/landscape artwork, and replacement files. Check playback, seeking, palettes, bloom, reset, fullscreen, navigation, and errors.
- Export a short clip and a long track. Inspect 1920 × 1080 dimensions, 60 fps, duration, synchronization, smooth wave edges, and bloom. Cancel midway, retry, and test unsupported codecs and rejected writes.
- Inspect the combined scene on quiet/percussive tracks, every palette, portrait/landscape artwork and maximum settings. Verify the middle has no labels, opening/closing fades are smooth, and setting Atmosphere to zero hides the haze and background layers without affecting main-wave amplitude. Check a short encoded clip for matching fades and synchronization.
- Profile a warmed-up 60-second preview in Chrome/Edge; record GPU/device, frame timings, and preview tier. Verify resolution adaptation on slower hardware.

## Deployment

Work remains in this local checkout. No deployment is performed automatically. For static hosting such as Vercel, use the repository root, build command `npm run build`, and output directory `dist`.

The former Sites hosting manifest was already removed. This local redesign does not modify or unpublish any previously hosted copy.
