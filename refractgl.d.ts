// Type definitions for RefractGL

export type RefractGLMode = 'idle' | 'pending' | 'gpu' | 'unsupported';
export type RefractGLBackend = 'webgl2' | 'webgpu';
export type RefractGLCompositor = 'direct' | 'staging';

/** CSS colour string (`#rgb[a]`, `#rrggbb[aa]`, `rgb()/rgba()`, `hsl()`, named) or `[r, g, b, a?]` (0–1 or 0–255). */
export type RefractGLColor = string | [number, number, number] | [number, number, number, number];

/** Built-in material presets, see `RefractGL.PRESETS`. */
export type RefractGLPresetName =
  | 'ios' | 'iosClear' | 'iosTinted' | 'frosted' | 'visionos'
  | 'smoked' | 'ice' | 'crystal' | 'lens' | 'bubble';

/** Every visual option. All are optional in `setOptions`; missing keys keep their value. */
export interface RefractGLOptions {
  /**
   * Expand a built-in preset first: every option except `radius` and `thickness` is set from it,
   * then the other keys of this object override it.
   */
  preset?: RefractGLPresetName;

  // Shape
  /**
   * `'auto'` reads `border-radius` from CSS (the largest of the four corners; % of the shorter side;
   * the first value of an elliptical corner); number in CSS px (0–400). A number is also written to the
   * element's inline `border-radius` (restored on `'auto'` and `destroy()`), so CSS such as
   * `border-radius: 50%` can no longer clip the glass to a circle.
   */
  radius?: 'auto' | number;
  /** Bevel width in CSS px, 0–120. Default 24. */
  thickness?: number;
  /** Bevel profile, 1–8: 1 straight chamfer, 2 arc, 4+ flat centre. Default 4. */
  bevelCurve?: number;

  // Optics
  /** Refraction strength, −3–3. Default 1. Positive: the rim shows the backdrop from inside the shape; negative: from outside, pressed to the rim (iOS presets). */
  refraction?: number;
  /** Index of refraction, 1–2.5. Default 1.5. */
  ior?: number;
  /** Chromatic dispersion between R, G and B, 0–1. Default 0.35. */
  dispersion?: number;
  /** Magnification of the backdrop under the glass, 0.5–2. Default 1. */
  zoom?: number;

  // Blur
  /** Blur in the flat centre, CSS px, 0–64. Default 6. */
  blur?: number;
  /** Blur at the rim, CSS px, 0–64. Default 1.5. */
  edgeBlur?: number;
  /** Width of the rim-to-centre blur transition in bevel widths, 0.25–4. Default 1.5. */
  blurFalloff?: number;

  // Colour
  /** Tint colour; its alpha is the tint density. Default `'rgba(255,255,255,0.08)'`. */
  tint?: RefractGLColor;
  /** 0–3. Default 1.25. */
  saturation?: number;
  /** 0–2. Default 1.03. */
  brightness?: number;
  /** 0–2. Default 1. */
  contrast?: number;
  /** Hue shift in degrees, −180…180. Default 0. */
  hue?: number;
  /** Vibrancy, 0–1: the tint sets only the lightness and the backdrop keeps its own colour. Default 0. */
  vibrancy?: number;
  /**
   * Adaptive tone, 0–1: the tint lightness follows the mean lightness under the pane (light over light
   * backdrops, dark over dark), like iOS Liquid Glass. Text on such a pane should switch colour too. Default 0.
   */
  adaptive?: number;
  /** Opacity of the glass layer, 0–1. At 0 the pane is skipped and its layer cleared. Default 1. */
  opacity?: number;

  // Light
  /** Key-light specular strength, 0–2. Default 0.9. */
  specular?: number;
  /** Specular exponent, 8–256. Default 60. */
  shininess?: number;
  /** Light direction in degrees: 0° right, 90° up. Default 125. */
  lightAngle?: number;
  /** Default `'#ffffff'`. */
  lightColor?: RefractGLColor;
  /** Opposite bounce light relative to the key light, 0–1. Default 0.4. */
  bounce?: number;
  /** Fresnel reflection strength, 0–2. Default 0.8. */
  fresnel?: number;
  /** Rim light strength, 0–2. Default 0.5. */
  rim?: number;
  /** Rim line width, CSS px, 0.5–6. Default 1.1. */
  rimWidth?: number;
  /** 0: the rim glows all around, 1: only on the side facing the light (and its bounce). Default 0.78. */
  rimFocus?: number;
  /** Thin darker contour on the very edge (1 CSS px), the rim sits just inside it, 0–1. Default 0. */
  edgeLine?: number;
  /** Soft light band about 4 CSS px wide inside the contour, 0–1. Default 0. */
  edgeGlow?: number;
  /** Darkening near the edge, 0–1. Default 0.07. */
  innerShadow?: number;
}

/** Options with every key present (what `getOptions()` / `toJSON()` return). */
export type RefractGLResolvedOptions = Required<Omit<RefractGLOptions, 'preset'>>;

/** Options a preset sets: everything except the shape of the element. */
export type RefractGLMaterial = Omit<RefractGLResolvedOptions, 'radius' | 'thickness'>;

export interface RefractGLPreset {
  id: RefractGLPresetName;
  /** Display label for a UI (English; replace it to localise your UI). */
  label: string;
  /** Stable English name. */
  name: string;
  /** One-line display description (English). */
  description: string;
  /** Only the keys that differ from `RefractGL.DEFAULTS`. */
  options: Readonly<Partial<RefractGLMaterial>>;
}

export type RefractGLEasingName = 'linear' | 'in' | 'out' | 'inOut' | 'spring';
export interface RefractGLAnimateOptions {
  /** Milliseconds, default 300. */
  duration?: number;
  /** Easing name or a function of progress 0–1. Default `'out'`. */
  easing?: RefractGLEasingName | ((t: number) => number);
  /** `'reduce'` (default): with prefers-reduced-motion the values apply at once. `'ignore'` always tweens. */
  reducedMotion?: 'reduce' | 'ignore';
}

export interface RefractGLConfig {
  /** Default `'webgl2'`. `'auto'` tries WebGPU first, then WebGL2. */
  backend: 'webgl2' | 'webgpu' | 'auto';
  /**
   * How finished panes are copied into the page. `'direct'`: one copy per pane from the GL canvas.
   * `'staging'`: one read of the GL buffer per frame, then 2D copies (fast path for Firefox).
   * `'auto'` (default): staging in Gecko, direct elsewhere with an automatic switch when copies are slow.
   */
  compositor: 'auto' | RefractGLCompositor;
  /** Fraction of the device pixel ratio, 0.25–2. Default 1. Never changed by the library. */
  renderScale: number;
  /** DPR cap, 0.5–4. Default 2. */
  maxDpr: number;
  /** ms to wait for a WebGPU adapter before using WebGL2, 0–60000. Default 4000. */
  webgpuTimeout: number;
  /**
   * GPU hint for a new context: passed to `getContext('webgl2')` and to WebGPU `requestAdapter()`
   * (`'default'` leaves the key out there). Default `'high-performance'`. Changing it on a running
   * page re-creates the renderer. Browsers may ignore the hint.
   */
  powerPreference: 'high-performance' | 'low-power' | 'default';
  /** Mip levels in the shared blur pyramid, 1–12. Default 8. */
  blurLevels: number;
  /** Max backdrop texture side, 64–16384. Default 4096. */
  maxBackdropSize: number;
  /** Upload scale for the backdrop, 0.1–1. Use 0.5 for animated canvas/video backdrops. Default 1. */
  backdropScale: number;
  /** `false` = call `RefractGL.render()` from your own loop. Default true. */
  autoRender: boolean;
  /** ms between `'stats'` events, 100–60000. Default 1000. */
  statsInterval: number;
  /** Inject the small helper stylesheet. Default true. */
  injectStyles: boolean;
  /** CSP nonce for the injected `<style>`. */
  nonce: string | null;
  /** Log warnings for invalid options. Default false. */
  debug: boolean;
}

/** Config keys that are written to / read from JSON files. */
export type RefractGLPortableConfig = Partial<Pick<RefractGLConfig, 'backend' | 'compositor' | 'renderScale' | 'maxDpr'>>;

export interface RefractGLStats {
  mode: RefractGLMode;
  backend: RefractGLBackend | null;
  reason: string;
  /** GPU name reported by the browser ('' when hidden). */
  gpu: string;
  compositor: RefractGLCompositor;
  fps: number;
  /** Library CPU time per rendered frame, ms (smoothed). */
  cpuMs: number;
  panes: number;
  /** Panes redrawn in the last frame (0 when nothing changed). */
  rendered: number;
  drawCalls: number;
  uploads: number;
  /** Uploads that sent only the rectangle passed to `invalidateBackdrop(rect)` */
  partialUploads: number;
  /** Render scale actually used (DPR × renderScale). */
  renderScale: number;
  atlas: [number, number];
}

export interface RefractGLModeEvent { mode: RefractGLMode; backend: RefractGLBackend | null; reason: string; previous: RefractGLMode; }
export interface RefractGLCompositorEvent { compositor: RefractGLCompositor; reason: string; }
export interface RefractGLEvents { mode: RefractGLModeEvent; stats: RefractGLStats; compositor: RefractGLCompositorEvent; }

export interface RefractGLWarning { key: string; code: 'clamped' | 'invalid' | 'unknown'; message: string; }

/** On-disk JSON format (`format: 'refractgl'`, `version: 2`; `version` is the file format version, not the library version). */
export interface RefractGLDocument {
  format: 'refractgl';
  version: number;
  options?: RefractGLOptions;
  presets?: Record<string, RefractGLOptions>;
  config?: RefractGLPortableConfig;
}

/** Result of `parseJSON`: validated, clamped values plus what was dropped or adjusted. */
export interface RefractGLParsedDocument extends RefractGLDocument { warnings: RefractGLWarning[]; }

export type RefractGLErrorCode = 'invalid-json' | 'invalid-format' | 'unsupported-version' | 'empty' | 'preset-missing' | 'unknown-preset';
export declare class RefractGLError extends Error {
  readonly name: 'RefractGLError';
  readonly code: RefractGLErrorCode;
}

export interface RefractGLOptionSpec {
  key: keyof RefractGLResolvedOptions;
  group: 'shape' | 'optics' | 'blur' | 'color' | 'light';
  type: 'number' | 'length' | 'color';
  default: number | string;
  min: number;
  max: number;
  step: number;
  unit: string;
  /** Display label for a UI (English; replace it to localise your UI). */
  label: string;
  /** Stable English name. */
  name: string;
  /** Short display hint, or an empty string. */
  hint: string;
}
export interface RefractGLGroup { id: RefractGLOptionSpec['group']; label: string; name: string; }

export type DOMRectLike = { x: number; y: number; width: number; height: number };
export type RefractGLBackdropSource = HTMLCanvasElement | HTMLVideoElement | HTMLImageElement | ImageBitmap | OffscreenCanvas;
export interface RefractGLBackdropOptions {
  /** `true` re-uploads every frame; `'auto'` (default) does it for video and playing sources. */
  dynamic?: boolean | 'auto';
  /** Where the backdrop sits on screen: the source element box (default), the viewport, or a callback. */
  rect?: 'element' | 'viewport' | (() => DOMRectLike);
}

export declare class RefractGL {
  constructor(element: Element | string, options?: RefractGLOptions);

  readonly element: HTMLElement;
  /** Shared engine mode. */
  readonly mode: RefractGLMode;

  /** Validated, clamped and merged. Returns `this`. */
  setOptions(options: RefractGLOptions): this;
  /** Back to `RefractGL.DEFAULTS` (+ `RefractGL.defaults`). */
  resetOptions(): this;
  getOptions(): RefractGLResolvedOptions;
  /** Built-in preset the current options match (radius and thickness ignored), or `null`. */
  readonly preset: RefractGLPresetName | null;
  /** Switch to a preset; keeps radius and thickness unless `overrides` sets them. Throws `unknown-preset`. */
  applyPreset(name: RefractGLPresetName, overrides?: RefractGLOptions): this;
  /**
   * Tween numeric and colour options (other keys switch at once). Resolves `true` when finished,
   * `false` when a newer `animate()` took over its keys, `stopAnimation()` ran or the instance was disposed.
   */
  animate(options: RefractGLOptions, opts?: RefractGLAnimateOptions): Promise<boolean>;
  /** Stop running tweens where they are. */
  stopAnimation(): this;
  /** JSON-safe copy of all options. */
  toJSON(): RefractGLResolvedOptions;
  exportJSON(opts?: { pretty?: boolean }): string;
  /**
   * Apply `{ options }`, a bare options object, or one entry of `{ presets }`.
   * `merge: false` resets unspecified keys to defaults. Throws `RefractGLError`.
   */
  importJSON(input: string | object, opts?: { preset?: string; merge?: boolean }): RefractGLParsedDocument;
  /** Re-measure size and border-radius (automatic on resize). */
  refresh(): this;
  reinit(options?: RefractGLOptions): this;
  dispose(): void;

  static readonly FORMAT: 'refractgl';
  static readonly FORMAT_VERSION: number;
  static readonly SCHEMA: ReadonlyArray<Readonly<RefractGLOptionSpec>>;
  static readonly GROUPS: ReadonlyArray<Readonly<RefractGLGroup>>;
  static readonly DEFAULTS: Readonly<RefractGLResolvedOptions>;
  static readonly PRESETS: Readonly<Record<RefractGLPresetName, Readonly<RefractGLPreset>>>;
  static readonly EASINGS: Readonly<Record<RefractGLEasingName, (t: number) => number>>;
  /** Full material of a preset plus validated overrides. Throws `unknown-preset`. */
  static preset(name: RefractGLPresetName, overrides?: RefractGLOptions): RefractGLMaterial & RefractGLOptions;
  /** Built-in preset these options match (radius and thickness ignored), or `null`. */
  static matchPreset(options: RefractGLOptions): RefractGLPresetName | null;
  /** Project-wide overrides applied before per-instance options. */
  static defaults: RefractGLOptions;
  static readonly cssText: string;
  static readonly Error: typeof RefractGLError;
  static readonly instances: RefractGL[];
  static readonly mode: RefractGLMode;

  static configure(config?: Partial<RefractGLConfig>): RefractGLConfig;
  static getConfig(): RefractGLConfig;
  static setBackdrop(source: RefractGLBackdropSource | string | null, opts?: RefractGLBackdropOptions): void;
  /**
   * Re-upload a static backdrop on the next frame. With `rect` (source pixels) only that part is
   * uploaded; calls before the next frame merge, a call without `rect` forces a full upload.
   */
  static invalidateBackdrop(rect?: { x: number; y: number; width: number; height: number }): void;
  static onBeforeFrame(fn: (time: number) => void): () => void;
  static render(time?: number): void;
  static on<K extends keyof RefractGLEvents>(type: K, fn: (event: RefractGLEvents[K]) => void): () => void;
  static off<K extends keyof RefractGLEvents>(type: K, fn: (event: RefractGLEvents[K]) => void): void;
  static getStats(): RefractGLStats;
  static isSupported(): { webgl2: boolean; webgpu: boolean };
  static validateOptions(input: object): { options: RefractGLOptions; warnings: RefractGLWarning[] };
  static exportJSON(
    data: RefractGL | RefractGLOptions | { options?: RefractGL | RefractGLOptions; presets?: Record<string, RefractGL | RefractGLOptions>; config?: Partial<RefractGLConfig> },
    opts?: { pretty?: boolean }
  ): string;
  /** Throws `RefractGLError`. */
  static parseJSON(input: string | object): RefractGLParsedDocument;
  static parseColor(input: RefractGLColor): [number, number, number, number] | null;
  static from(selector: string | Iterable<Element>, options?: RefractGLOptions): RefractGL[];
  static disposeAll(): void;
}

export default RefractGL;

declare global {
  interface Window { RefractGL: typeof RefractGL; }
}
