# Musebox Studio

A browser-local music video studio. Upload MP3/WAV audio and JPG/PNG/WebP artwork, create a flowing, translucent aurora, and export a 1920 × 1080 video at 60 fps.

## Development

Requires Node.js 22.12+ or 24+. On Windows use `npm.cmd` if PowerShell disables the `npm.ps1` shim.

```sh
npm ci
npm run dev
npm run build
npm test
```

## Rendering

- React/TypeScript interface, Three.js/WebGL 2 scene, worker-based audio analysis, Mediabunny/WebCodecs encoder.
- Six band envelopes are computed at 60 Hz using an 8192-point Hann-window FFT, with stereo energies averaged to avoid phase cancellation. Preview and export share deterministic scene settings and time-based animation.
- Export renders every frame at an explicit timestamp; rendering speed is independent of output frame rate. Audio is interleaved in one-second chunks with backpressure. Original audio is resampled to 48 kHz on import and encoded at 320 kbps; target video bitrate is 20 Mbps.
- MP4 (H.264/AAC) is preferred; WebM (VP9/Opus) is selected if the browser cannot encode MP4. Runtime checks use the actual 1080p60 settings.
- Desktop Chrome/Edge can stream to a chosen file. Browsers without a save picker use temporary origin-private storage and a download; quota is checked first and temporary data is removed afterward.
- Audio limit: 15 minutes, 400 MB, mono or stereo. Artwork: 20 MB, maximum 8192 pixels per side. Long decoded tracks can still need hundreds of megabytes of RAM. Keep the tab open while exporting.
- Media files never leave the browser. Fonts load from Google Fonts; the app has no analytics or upload endpoints. Projects last for the current session only.

## Verification

Automated tests cover silence, frequency-band separation, deterministic seeking, bounds handling, exact 60 fps scheduling, and 15-minute analysis memory scaling. The production build performs strict TypeScript validation.

Browser QA still required when a browser is available: import MP3 and WAV plus portrait/landscape artwork; play and seek the aurora; export a short clip and a 15-minute song; inspect output resolution, frame rate, duration, sound, and synchronization; cancel mid-export and retry; exercise unsupported codecs and rejected disk writes. Confirm layout at desktop and mobile widths and keyboard access. No actual video export or visual screenshot verification was possible in the initial build environment because it had no connected browser.

## Local use and future deployment

Run from the Musebox repository root. Use `npm run dev` for local development, `npm run build` for production, and serve `dist` as static assets. For your future Vercel deployment, use the repository root as the application root, the build command `npm run build`, and output directory `dist`. No server, API keys, or environment variables are required. No deployment is performed automatically.

The former Sites hosting manifest has been removed. The previously published copy has NOT been deleted: the available connector has no delete/unpublish operation and no browser was connected. Remove it through your Sites management interface. Local source and Git history are preserved.

## Aurora Flow

A single translucent, tapered sheet replaces the orbital scene. A 256 x 96 segmented surface uses bounded shader displacement and surface-derived normals. Bass drives broad rolling waves, low mids add billowing, mids animate traveling folds, upper mids illuminate fine bands, and highs create gentle shimmer. Mint, cyan, and violet lighting follows the folds. Drift, Gather, Lift, and Settle smoothly modulate the surface's energy.

The surface retains its base-plane coordinates, so it cannot self-intersect. Motion is evaluated directly from audio time for deterministic seeking and export. The camera is fixed and frames the full displacement envelope. Only the aurora and particles animate; artwork and text stay stationary. Framing is recalculated only when viewport aspect changes. Flow speed replaces Orbit speed. Soft 4-pixel particles, bloom, SMAA, and 1080p60 export remain. Spectacle and Trails remain removed.

Tests cover displacement bounds, finite normals, per-band response, silence, transients, stereo phase inversion, deterministic sampling, and a fifteen-minute wave timeline. Actual visual quality, preview performance, and exported video still require browser verification. No deployment is performed.
