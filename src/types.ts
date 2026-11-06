export type Preset = 'aurora';
export type Settings = { preset: Preset; palette: number; sensitivity: number; motion: number; glow: number; particles: number; coverSize: number; title: string; artist: string };
export type Features = { choreography?: {formation:number;previous:number;mix:number;energy:number;events:{time:number;strength:number;band:number}[]}; bands?: [number,number,number,number,number,number]; bass: number; mid: number; high: number; amplitude: number };
export type Analysis = { frames: Float32Array; waveform: number[]; duration: number; fps: number };
export type Track = { file: File; url: string; buffer: AudioBuffer; analysis: Analysis };
export type ExportProgress = { stage: string; fraction: number; remaining?: number };
export const DEFAULT_SETTINGS: Settings = { preset: 'aurora', palette: 0, sensitivity: 1.2, motion: 0.65, glow: 0.7, particles: 0.15, coverSize: 0.7, title: '', artist: '' };
export const PALETTES = [ ['#a58bff', '#ff56ad', '#72f8ed'], ['#32efd4', '#148dff', '#c8fff1'], ['#ff9353', '#f43787', '#ffe0a0'], ['#a79dff', '#5375ff', '#ede8ff'] ];
