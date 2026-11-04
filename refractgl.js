/*!
 * refractgl.js
 * RefractGL: shader-based liquid glass for existing DOM elements.
 * WebGL2 core, optional WebGPU path. No CSS fallback: without a GPU path nothing is drawn (mode 'unsupported').
 * Built-in material presets (RefractGL.PRESETS; the iOS ones calibrated against Apple's HIG renders)
 * and option tweens (instance.animate()).
 * MIT License.
 */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
    module.exports.default = api;
    module.exports.RefractGL = api;
  }
  if (root) root.RefractGL = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (global) {
  'use strict';

  const FORMAT = 'refractgl';
  const LEGACY_FORMAT = 'liquid-glass';   // settings files saved before the project was named RefractGL
  const FORMAT_VERSION = 2;
  const hasDOM = typeof document !== 'undefined';
  const now = () => (global.performance ? performance.now() : Date.now());
  const DEG = Math.PI / 180;
  const UA = (global.navigator && navigator.userAgent) || '';
  // Gecko snapshots (reads back) the whole WebGL drawing buffer on every drawImage() call.
  const IS_GECKO = /\bGecko\/\d/.test(UA) && !/like Gecko/i.test(UA);

  /* ------------------------------------------------------------------ */
  /* Option schema: single source of truth for defaults, validation, UI  */
  /* ------------------------------------------------------------------ */

  const GROUPS = Object.freeze([
    { id: 'shape', label: 'Shape', name: 'Shape' },
    { id: 'optics', label: 'Optics', name: 'Optics' },
    { id: 'blur', label: 'Blur', name: 'Blur' },
    { id: 'color', label: 'Colour', name: 'Color' },
    { id: 'light', label: 'Light', name: 'Light' },
  ].map(Object.freeze));

  const S = (key, group, type, def, min, max, step, unit, label, name, hint) =>
    Object.freeze({ key, group, type, default: def, min, max, step, unit: unit || '', label, name, hint: hint || '' });

  const SCHEMA = Object.freeze([
    S('radius', 'shape', 'length', 'auto', 0, 400, 1, 'px', 'Corner radius', 'Corner radius', "'auto' takes border-radius from CSS"),
    S('thickness', 'shape', 'number', 24, 0, 120, 1, 'px', 'Bevel width', 'Bevel width', 'The band near the edge where the surface curves'),
    S('bevelCurve', 'shape', 'number', 4, 1, 8, 0.1, '', 'Bevel profile', 'Bevel profile', '1 gives a straight chamfer, 2 an arc, 4 and above a flat centre'),
    S('refraction', 'optics', 'number', 1, -3, 3, 0.01, '', 'Refraction', 'Refraction', 'Above zero the rim shows the backdrop from inside, below zero from outside, pressed to the edge as in iOS'),
    S('ior', 'optics', 'number', 1.5, 1, 2.5, 0.01, '', 'Index of refraction', 'Index of refraction'),
    S('dispersion', 'optics', 'number', 0.35, 0, 1, 0.01, '', 'Dispersion', 'Dispersion', 'Spread of refraction between the R, G and B channels'),
    S('zoom', 'optics', 'number', 1, 0.5, 2, 0.01, '×', 'Magnification', 'Magnification'),
    S('blur', 'blur', 'number', 6, 0, 64, 0.5, 'px', 'Centre blur', 'Centre blur'),
    S('edgeBlur', 'blur', 'number', 1.5, 0, 64, 0.5, 'px', 'Edge blur', 'Edge blur'),
    S('blurFalloff', 'blur', 'number', 1.5, 0.25, 4, 0.05, '×', 'Blur falloff', 'Blur falloff', 'Width of the rim-to-centre transition, in bevel widths'),
    S('tint', 'color', 'color', 'rgba(255,255,255,0.08)', 0, 1, 0.01, '', 'Tint', 'Tint', 'The alpha of the colour sets the density'),
    S('saturation', 'color', 'number', 1.25, 0, 3, 0.01, '×', 'Saturation', 'Saturation'),
    S('brightness', 'color', 'number', 1.03, 0, 2, 0.01, '×', 'Brightness', 'Brightness'),
    S('contrast', 'color', 'number', 1, 0, 2, 0.01, '×', 'Contrast', 'Contrast'),
    S('hue', 'color', 'number', 0, -180, 180, 1, '°', 'Hue shift', 'Hue shift'),
    S('vibrancy', 'color', 'number', 0, 0, 1, 0.01, '', 'Vibrancy', 'Vibrancy', 'The tint changes only lightness, the backdrop keeps its colour'),
    S('adaptive', 'color', 'number', 0, 0, 1, 0.01, '', 'Adaptive tone', 'Adaptive tone', 'The glass lightens over a light backdrop and darkens over a dark one'),
    S('opacity', 'color', 'number', 1, 0, 1, 0.01, '', 'Opacity', 'Opacity'),
    S('specular', 'light', 'number', 0.9, 0, 2, 0.01, '', 'Specular', 'Specular'),
    S('shininess', 'light', 'number', 60, 8, 256, 1, '', 'Shininess', 'Shininess'),
    S('lightAngle', 'light', 'number', 125, 0, 360, 1, '°', 'Light angle', 'Light angle', '0° is right, 90° is up'),
    S('lightColor', 'light', 'color', '#ffffff', 0, 1, 0.01, '', 'Light colour', 'Light colour'),
    S('bounce', 'light', 'number', 0.4, 0, 1, 0.01, '', 'Bounce light', 'Bounce light'),
    S('fresnel', 'light', 'number', 0.8, 0, 2, 0.01, '', 'Fresnel', 'Fresnel'),
    S('rim', 'light', 'number', 0.5, 0, 2, 0.01, '', 'Rim light', 'Rim light'),
    S('rimWidth', 'light', 'number', 1.1, 0.5, 6, 0.1, 'px', 'Rim width', 'Rim width'),
    S('rimFocus', 'light', 'number', 0.78, 0, 1, 0.01, '', 'Rim focus', 'Rim focus', '0: the rim glows along the whole outline, 1: only on the light side'),
    S('edgeLine', 'light', 'number', 0, 0, 1, 0.01, '', 'Edge line', 'Edge line', 'A thin dark line on the very edge, like iOS glass'),
    S('edgeGlow', 'light', 'number', 0, 0, 1, 0.01, '', 'Edge glow', 'Edge glow', 'A soft light band along the inside of the outline'),
    S('innerShadow', 'light', 'number', 0.07, 0, 1, 0.01, '', 'Inner shadow', 'Inner shadow'),
  ]);

  const SCHEMA_MAP = Object.create(null);
  for (const s of SCHEMA) SCHEMA_MAP[s.key] = s;
  const DEFAULTS = Object.freeze(SCHEMA.reduce((o, s) => { o[s.key] = s.default; return o; }, {}));

  /* ------------------------------------------------------------------ */
  /* Built-in presets: materials. A preset sets every option except the   */
  /* shape of the element (radius, thickness), which depends on its size. */
  /* ------------------------------------------------------------------ */

  const SHAPE_KEYS = Object.freeze(['radius', 'thickness']);
  const EASINGS = Object.freeze({
    linear: (t) => t,
    in: (t) => t * t * t,
    out: (t) => 1 - Math.pow(1 - t, 4),
    inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    // damped spring, corrected so spring(1) === 1 exactly (no jump at the end of a tween)
    spring: (t) => 1 - Math.exp(-6 * t) * Math.cos(10 * t) + t * Math.exp(-6) * Math.cos(10),
  });
  const P_ = (id, label, name, description, options) => Object.freeze({ id, label, name, description, options: Object.freeze(options) });
  const PRESET_LIST = Object.freeze([
    // iOS presets pull the backdrop from outside the shape into the rim (negative refraction), as Apple's glass does.
    P_('ios', 'iOS Liquid Glass', 'iOS Liquid Glass', 'iOS 26 Liquid Glass: a clear lens with a light milky haze and slight magnification; at the rim the backdrop from outside is pressed against the edge, and the edge glows softly. Works best with a 14–18 px bevel.', {
      bevelCurve: 3.5, refraction: -2.6, ior: 1.5, dispersion: 0.05, zoom: 1.2, blur: 0.9, edgeBlur: 2.5, blurFalloff: 1,
      tint: 'rgba(255,255,255,0.2)', saturation: 0.9, brightness: 1, contrast: 1, specular: 0.2, shininess: 60,
      lightAngle: 125, bounce: 0.4, fresnel: 0.8, rim: 0.6, rimWidth: 1, rimFocus: 0.45, edgeLine: 0, edgeGlow: 0.25,
      innerShadow: 0.03,
    }),
    P_('iosClear', 'iOS Clear', 'iOS Clear', 'The Clear variant from iOS 26: almost no haze or blur, the backdrop shows through fully; edge and rim as on regular iOS glass.', {
      bevelCurve: 3.5, refraction: -2.8, dispersion: 0.08, zoom: 1.15, blur: 0.5, edgeBlur: 1.5, blurFalloff: 1,
      tint: 'rgba(255,255,255,0.07)', saturation: 1, brightness: 1, specular: 0.3, shininess: 60, lightAngle: 125,
      bounce: 0.6, fresnel: 0.9, rim: 0.8, rimWidth: 1, rimFocus: 0.6, edgeLine: 0, edgeGlow: 0.3, innerShadow: 0.02,
    }),
    P_('iosTinted', 'iOS Tinted', 'iOS Tinted', 'The Tinted mode from iOS 26.1: denser and more contrasty than regular glass; the base lightens over a light backdrop and darkens over a dark one.', {
      bevelCurve: 3.5, refraction: -2, dispersion: 0.05, zoom: 1.1, blur: 4, edgeBlur: 6, blurFalloff: 1,
      tint: 'rgba(128,128,128,0.45)', adaptive: 1, vibrancy: 0.4, saturation: 1.1, brightness: 1, contrast: 1.1,
      specular: 0.15, shininess: 60, lightAngle: 125, bounce: 0.4, fresnel: 0.6, rim: 0.5, rimWidth: 1, rimFocus: 0.45,
      edgeLine: 0.3, edgeGlow: 0.4, innerShadow: 0.03,
    }),
    P_('frosted', 'Frosted Glass', 'Frosted Glass', 'Frosted glass with a live lens at the rim: a blurred centre, crisp refraction at the edge, the backdrop keeps its colour.', {
      bevelCurve: 3, refraction: 0.8, dispersion: 0.1, blur: 22, edgeBlur: 3, blurFalloff: 0.9,
      tint: 'rgba(255,255,255,0.18)', vibrancy: 0.5, saturation: 1.5, brightness: 1.06, specular: 0.35,
      shininess: 40, lightAngle: 125, bounce: 0.6, fresnel: 0.35, rim: 0.45, rimWidth: 1, rimFocus: 0.4,
      edgeLine: 0.35, edgeGlow: 0.55, innerShadow: 0,
    }),
    P_('visionos', 'visionOS Glass', 'visionOS Glass', 'The grey glass of visionOS windows: heavy blur, muted contrast, a light rim on top and a glow along the edge.', {
      bevelCurve: 3, refraction: 0.5, dispersion: 0, blur: 36, edgeBlur: 4, blurFalloff: 1,
      tint: 'rgba(110,110,118,0.38)', vibrancy: 0.7, saturation: 1.3, contrast: 0.9, brightness: 1.08,
      specular: 0.25, shininess: 24, lightAngle: 90, bounce: 0.3, fresnel: 0.4, rim: 0.8, rimWidth: 1,
      rimFocus: 0.65, edgeLine: 0.25, edgeGlow: 0.6, innerShadow: 0,
    }),
    P_('smoked', 'Smoked Glass', 'Smoked Glass', 'Darkened glass: the backdrop is muted but keeps its colour; a crisp lens at the rim and soft highlights.', {
      bevelCurve: 3.5, refraction: 1, dispersion: 0.25, blur: 14, edgeBlur: 2.5, blurFalloff: 1,
      tint: 'rgba(12,12,16,0.55)', vibrancy: 0.6, saturation: 1.3, brightness: 0.9, contrast: 1.05, specular: 0.5,
      shininess: 50, lightAngle: 125, bounce: 0.5, fresnel: 0.5, rim: 0.55, rimWidth: 1, rimFocus: 0.5, edgeLine: 0,
      edgeGlow: 0.35, innerShadow: 0.06,
    }),
    P_('ice', 'Ice', 'Ice', 'Cool bluish glass: moderate blur, a bright rim, dispersion at the edge.', {
      bevelCurve: 3, refraction: 1.1, dispersion: 0.35, blur: 9, edgeBlur: 1.5, blurFalloff: 1,
      tint: 'rgba(205,232,255,0.22)', vibrancy: 0.25, saturation: 0.8, brightness: 1.1, hue: -6, specular: 1,
      shininess: 90, lightAngle: 125, bounce: 0.6, fresnel: 0.9, rim: 0.85, rimWidth: 1.2, rimFocus: 0.55,
      edgeLine: 0.2, edgeGlow: 0.7, innerShadow: 0,
    }),
    P_('crystal', 'Crystal', 'Crystal', 'Clear glass with maximum dispersion: a rainbow fringe along the edge.', {
      bevelCurve: 2, refraction: 1.6, ior: 1.9, dispersion: 1, blur: 0, edgeBlur: 0, tint: 'rgba(255,255,255,0.02)',
      saturation: 1.2, specular: 1.3, shininess: 120, fresnel: 1.1, rim: 0.8,
    }),
    P_('lens', 'Magnifier', 'Magnifier', 'A magnifying lens: the centre enlarges the backdrop 1.5 times.', {
      bevelCurve: 2.2, refraction: 1.3, dispersion: 0.25, zoom: 1.5, blur: 0, edgeBlur: 0.5, tint: 'rgba(255,255,255,0.03)',
      saturation: 1.1, specular: 1, shininess: 90, fresnel: 0.9, rim: 0.6, innerShadow: 0.12,
    }),
    P_('bubble', 'Bubble', 'Bubble', 'A thin sphere: a rounded profile, strong dispersion and a bright highlight.', {
      bevelCurve: 1.4, refraction: 1.8, ior: 1.33, dispersion: 0.8, zoom: 0.9, blur: 0, edgeBlur: 0,
      tint: 'rgba(255,255,255,0)', saturation: 1.25, brightness: 1.06, specular: 1.4, shininess: 160,
      bounce: 0.7, fresnel: 1.4, rim: 0.9, rimWidth: 1.4, innerShadow: 0,
    }),
  ]);
  const PRESETS = Object.freeze(PRESET_LIST.reduce((o, p) => { o[p.id] = p; return o; }, {}));

  /** Every non-shape option of a preset (missing keys come from DEFAULTS). */
  function presetValues(id) {
    const p = PRESETS[id];
    if (!p) return null;
    const out = {};
    for (const s of SCHEMA) if (SHAPE_KEYS.indexOf(s.key) < 0) out[s.key] = s.key in p.options ? p.options[s.key] : s.default;
    return out;
  }

  function sameValue(spec, a, b) {
    if (spec.type === 'color') {
      const ca = parseColor(a), cb = parseColor(b);
      return !!ca && !!cb && ca.every((v, i) => Math.abs(v - cb[i]) < 0.6 / 255);
    }
    if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-6;
    return a === b;
  }

  const CONFIG = {
    backend: 'webgl2',     // 'webgl2' | 'webgpu' | 'auto'
    compositor: 'auto',    // 'auto' | 'direct' | 'staging'
    renderScale: 1,        // fraction of the device pixel ratio
    maxDpr: 2,
    webgpuTimeout: 4000,
    blurLevels: 8,         // mip levels in the shared blur pyramid
    maxBackdropSize: 4096,
    backdropScale: 1,      // < 1 uploads a downscaled backdrop (cheaper for animated sources)
    autoRender: true,      // false = call RefractGL.render() from your own loop
    statsInterval: 1000,
    injectStyles: true,
    nonce: null,           // CSP nonce for the injected <style>
    powerPreference: 'high-performance',   // GPU hint for a new context: 'high-performance' | 'low-power' | 'default'
    debug: false,
  };

  const CONFIG_RULES = {
    backend: ['webgl2', 'webgpu', 'auto'],
    compositor: ['auto', 'direct', 'staging'],
    renderScale: [0.25, 2],
    maxDpr: [0.5, 4],
    webgpuTimeout: [0, 60000],
    blurLevels: [1, 12],
    maxBackdropSize: [64, 16384],
    backdropScale: [0.1, 1],
    statsInterval: [100, 60000],
    powerPreference: ['high-performance', 'low-power', 'default'],
  };
  const PORTABLE_CONFIG = ['backend', 'compositor', 'renderScale', 'maxDpr'];
  const MAX_RESTARTS = 6;      // quick failures in a row before mode 'unsupported'
  const STABLE_MS = 5000;      // a backend that lived this long resets the failure count

  const ATTRS = ['Atlas', 'Local', 'Rect', 'Shape', 'Optic', 'Blur', 'Color', 'Light', 'Misc', 'Tint', 'Lcol', 'Xtra'];
  const FLOATS = ATTRS.length * 4;  // 48 floats per pane instance
  const STRIDE = FLOATS * 4;        // bytes
  const VIS_OPTS = { opacityProperty: true, visibilityProperty: true, checkOpacity: true, checkVisibilityCSS: true };

  /* ------------------------------------------------------------------ */
  /* CSS (layout of the layer canvas only)                               */
  /* ------------------------------------------------------------------ */

  const CSS_TEXT = [
    '.rgl-host{isolation:isolate}',
    '.rgl-host>.rgl-layer{position:absolute;display:block;pointer-events:none;z-index:-1;left:0;top:0;width:100%;height:100%;margin:0;padding:0;border:0;max-width:none;max-height:none}',
    // Windows High Contrast / forced colours: system colours only, no imagery behind text.
    '@media (forced-colors:active){.rgl-host>.rgl-layer{display:none}}',
  ].join('\n');

  function injectStyles() {
    if (!hasDOM || !CONFIG.injectStyles || document.getElementById('refractgl-styles')) return;
    const s = document.createElement('style');
    s.id = 'refractgl-styles';
    if (CONFIG.nonce) s.nonce = CONFIG.nonce;
    s.textContent = CSS_TEXT;
    (document.head || document.documentElement).appendChild(s);
  }

  /* ------------------------------------------------------------------ */
  /* Utils                                                               */
  /* ------------------------------------------------------------------ */

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const roundUp = (v, m) => Math.ceil(v / m) * m;

  function hexToRgba(h) {
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    const n = parseInt(h, 16);
    if (!isFinite(n)) return null;
    if (h.length === 6) return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
    return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255, parseInt(h.slice(6, 8), 16) / 255];
  }

  let colorCtx = null;
  /** Parse a colour into linear-agnostic [r,g,b,a] in 0..1, or null when invalid. */
  function parseColor(input) {
    if (Array.isArray(input)) {
      if (input.length < 3 || input.some((v) => typeof v !== 'number' || !isFinite(v))) return null;
      let [r, g, b, a = 1] = input;
      if (r > 1 || g > 1 || b > 1) { r /= 255; g /= 255; b /= 255; }
      return [clamp(r, 0, 1), clamp(g, 0, 1), clamp(b, 0, 1), clamp(a, 0, 1)];
    }
    if (typeof input !== 'string') return null;
    const str = input.trim().toLowerCase();
    if (!str) return null;
    let m = /^#([0-9a-f]{3,8})$/.exec(str);
    if (m) return hexToRgba(m[1]);
    m = /^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(str);
    if (m) {
      const ch = (v) => (v.endsWith('%') ? parseFloat(v) / 100 : parseFloat(v) / 255);
      const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
      const out = [ch(m[1]), ch(m[2]), ch(m[3]), a];
      return out.every(isFinite) ? out.map((v) => clamp(v, 0, 1)) : null;
    }
    if (str === 'transparent') return [0, 0, 0, 0];
    if (!hasDOM) return null;
    // named colours, hsl(), color(): let the browser parse
    if (!colorCtx) colorCtx = document.createElement('canvas').getContext('2d');
    if (!colorCtx) return null;
    colorCtx.fillStyle = '#010203';
    colorCtx.fillStyle = str;
    const a = String(colorCtx.fillStyle);
    colorCtx.fillStyle = '#030201';
    colorCtx.fillStyle = str;
    const b = String(colorCtx.fillStyle);
    if (a !== b) return null;   // the browser rejected the value
    return a[0] === '#' ? hexToRgba(a.slice(1)) : parseColor(a);
  }

  function sourceSize(src) {
    if (!src) return [0, 0];
    if (typeof HTMLVideoElement !== 'undefined' && src instanceof HTMLVideoElement) return [src.videoWidth, src.videoHeight];
    if (typeof HTMLImageElement !== 'undefined' && src instanceof HTMLImageElement) return [src.naturalWidth, src.naturalHeight];
    if (typeof VideoFrame !== 'undefined' && src instanceof VideoFrame) return [src.displayWidth, src.displayHeight];
    return [src.width | 0, src.height | 0];
  }

  // Only a playing video counts as live. Canvases are static unless the caller opts in with
  // { dynamic: true } or calls invalidateBackdrop() after painting: re-uploading an unchanged
  // canvas every frame is the single most expensive thing this library can do (esp. in Firefox).
  function isLiveSource(src) {
    if (typeof HTMLVideoElement !== 'undefined' && src instanceof HTMLVideoElement) return !src.paused && !src.ended;
    return false;
  }

  function sourceReady(src) {
    if (typeof HTMLVideoElement !== 'undefined' && src instanceof HTMLVideoElement) return src.readyState >= 2;
    if (typeof HTMLImageElement !== 'undefined' && src instanceof HTMLImageElement) return src.complete && src.naturalWidth > 0;
    return true;
  }

  /** object-fit / object-position inside a content box. Returns [x, y, w, h] relative to the box. */
  function fitBox(bw, bh, sw, sh, fit, pos) {
    if (!sw || !sh || !fit || fit === 'fill') return [0, 0, bw, bh];
    let k;
    if (fit === 'contain') k = Math.min(bw / sw, bh / sh);
    else if (fit === 'cover') k = Math.max(bw / sw, bh / sh);
    else if (fit === 'none') k = 1;
    else if (fit === 'scale-down') k = Math.min(1, bw / sw, bh / sh);
    else return [0, 0, bw, bh];
    const w = sw * k, h = sh * k;
    const parts = String(pos || '50% 50%').trim().split(/\s+/);
    const one = (tok, free) => {
      const v = parseFloat(tok);
      if (!isFinite(v)) return free / 2;
      return tok.endsWith('%') ? (v / 100) * free : v;
    };
    return [one(parts[0] || '50%', bw - w), one(parts[1] || '50%', bh - h), w, h];
  }

  class RefractGLError extends Error {
    constructor(code, message) { super(message); this.name = 'RefractGLError'; this.code = code; }
  }

  /* ------------------------------------------------------------------ */
  /* Validation & JSON                                                   */
  /* ------------------------------------------------------------------ */

  function normalizeValue(spec, value, warnings, path) {
    const warn = (code, message) => { if (warnings) warnings.push({ key: path, code, message }); };
    if (spec.type === 'color') {
      const c = parseColor(value);
      if (!c) { warn('invalid', path + ': not a colour, default used'); return { ok: false, value: spec.default }; }
      return { ok: true, value: Array.isArray(value) ? 'rgba(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ',' + +c[3].toFixed(3) + ')' : String(value).trim() };
    }
    if (spec.type === 'length' && typeof value === 'string' && value.trim().toLowerCase() === 'auto') return { ok: true, value: 'auto' };
    if (spec.type === 'length' && value == null) return { ok: true, value: 'auto' };
    let n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    if (typeof n !== 'number' || !isFinite(n)) { warn('invalid', path + ': not a number, default used'); return { ok: false, value: spec.default }; }
    const c = clamp(n, spec.min, spec.max);
    if (c !== n) warn('clamped', path + ': clamped to ' + c);
    return { ok: true, value: c };
  }

  /** Validate a (partial) options object. Unknown keys are dropped, numbers are clamped. */
  function validateOptions(input, warnings, prefix) {
    const out = {};
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      if (warnings) warnings.push({ key: prefix || '', code: 'invalid', message: (prefix || 'options') + ': expected an object' });
      return out;
    }
    if ('preset' in input) {
      const base = presetValues(input.preset);
      if (base) Object.assign(out, base);
      else if (warnings) warnings.push({ key: (prefix || '') + 'preset', code: 'invalid', message: (prefix || '') + 'preset: unknown preset "' + input.preset + '", expected ' + Object.keys(PRESETS).join(' | ') });
    }
    for (const key of Object.keys(input)) {
      if (key === 'preset') continue;
      const spec = SCHEMA_MAP[key];
      const path = (prefix || '') + key;
      if (!spec) { if (warnings) warnings.push({ key: path, code: 'unknown', message: path + ': unknown option, ignored' }); continue; }
      const r = normalizeValue(spec, input[key], warnings, path);
      if (r.ok) out[key] = r.value;
    }
    return out;
  }

  function validateConfig(input, warnings, portableOnly) {
    const out = {};
    if (!input || typeof input !== 'object') return out;
    for (const key of Object.keys(input)) {
      const rule = CONFIG_RULES[key];
      const v = input[key];
      if (portableOnly && PORTABLE_CONFIG.indexOf(key) < 0) {
        if (warnings) warnings.push({ key: 'config.' + key, code: 'unknown', message: 'config.' + key + ': not portable, ignored' });
        continue;
      }
      if (!rule) {
        if (key in CONFIG) out[key] = v;
        else if (warnings) warnings.push({ key: 'config.' + key, code: 'unknown', message: 'config.' + key + ': unknown, ignored' });
        continue;
      }
      if (typeof rule[0] === 'string') {
        if (rule.indexOf(v) >= 0) out[key] = v;
        else if (warnings) warnings.push({ key: 'config.' + key, code: 'invalid', message: 'config.' + key + ': expected ' + rule.join(' | ') });
      } else {
        const n = Number(v);
        if (!isFinite(n)) { if (warnings) warnings.push({ key: 'config.' + key, code: 'invalid', message: 'config.' + key + ': not a number' }); continue; }
        const c = clamp(n, rule[0], rule[1]);
        if (c !== n && warnings) warnings.push({ key: 'config.' + key, code: 'clamped', message: 'config.' + key + ': clamped to ' + c });
        out[key] = c;
      }
    }
    return out;
  }

  function fullOptions(partial) {
    return Object.assign({}, DEFAULTS, validateOptions(RefractGL.defaults), validateOptions(partial));
  }

  function exportDoc(data) {
    const doc = { format: FORMAT, version: FORMAT_VERSION };
    const opts = (v) => (v instanceof RefractGL ? v.toJSON() : validateOptions(v));
    if (data && typeof data === 'object' && !(data instanceof RefractGL) && (data.presets || data.options || data.config)) {
      if (data.options) doc.options = opts(data.options);
      if (data.presets) {
        doc.presets = {};
        for (const name of Object.keys(data.presets)) doc.presets[name] = opts(data.presets[name]);
      }
      if (data.config) doc.config = validateConfig(data.config, null, true);
    } else {
      doc.options = opts(data || {});
    }
    return doc;
  }

  function parseDoc(input) {
    let doc = input;
    if (typeof input === 'string') {
      try { doc = JSON.parse(input); } catch (e) { throw new RefractGLError('invalid-json', 'Not valid JSON: ' + e.message); }
    }
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new RefractGLError('invalid-format', 'Expected a JSON object');
    const warnings = [];
    const tagged = 'format' in doc;
    if (tagged && doc.format !== FORMAT && doc.format !== LEGACY_FORMAT) throw new RefractGLError('invalid-format', 'Unknown format "' + doc.format + '", expected "' + FORMAT + '"');
    if ('version' in doc) {
      const v = doc.version;
      if (typeof v !== 'number' || !isFinite(v) || v < 1) throw new RefractGLError('invalid-format', 'Invalid version');
      if (v > FORMAT_VERSION) throw new RefractGLError('unsupported-version', 'File version ' + v + ' is newer than supported ' + FORMAT_VERSION);
    }
    const out = { format: FORMAT, version: FORMAT_VERSION, warnings };
    if (!tagged && !doc.options && !doc.presets) {
      out.options = validateOptions(doc, warnings, '');   // bare options object
    } else {
      if (doc.options !== undefined) out.options = validateOptions(doc.options, warnings, 'options.');
      if (doc.presets !== undefined) {
        if (!doc.presets || typeof doc.presets !== 'object' || Array.isArray(doc.presets)) {
          warnings.push({ key: 'presets', code: 'invalid', message: 'presets: expected an object' });
        } else {
          out.presets = {};
          for (const name of Object.keys(doc.presets)) out.presets[name] = validateOptions(doc.presets[name], warnings, 'presets.' + name + '.');
        }
      }
      if (doc.config !== undefined) out.config = validateConfig(doc.config, warnings, true);
    }
    const hasOpts = out.options && Object.keys(out.options).length;
    const hasPresets = out.presets && Object.keys(out.presets).length;
    if (!hasOpts && !hasPresets && !(out.config && Object.keys(out.config).length)) {
      throw new RefractGLError('empty', 'The file contains no known settings');
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Shaders: GLSL ES 3.00                                               */
  /* ------------------------------------------------------------------ */

  const V = ATTRS.slice(1);   // per-instance values forwarded to the fragment stage

  const PANE_VS = `#version 300 es
layout(location=0) in vec2 aCorner;
${ATTRS.map((n, i) => `layout(location=${i + 1}) in vec4 a${n};`).join('\n')}
uniform vec2 uAtlasSize;
out vec2 vEl;
${V.map((n) => `flat out vec4 v${n};`).join('\n')}
void main() {
  vec2 ap = aAtlas.xy + aCorner * aAtlas.zw;
  vEl = aLocal.xy + aCorner * aAtlas.zw;
  ${V.map((n) => `v${n} = a${n};`).join(' ')}
  vec2 c = ap / uAtlasSize * 2.0 - 1.0;
  gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
}`;

  // vLocal: i0, j0, CW, CH (element px)   vRect: on-screen rect (CSS px)
  // vShape: radius, thickness (element px), bevel exponent, zoom
  // vOptic: refraction, ior, dispersion, blur falloff
  // vBlur:  blur, edge blur (CSS px), shininess, light angle (rad)
  // vColor: saturation, brightness, contrast, hue (rad)
  // vLight: specular, fresnel, rim, rim width (CSS px)
  // vMisc:  inner shadow, bounce, opacity, edge glow
  // vTint:  rgba            vLcol: light colour rgb
  // vXtra:  vibrancy, adaptive, edge line, rim focus
  const PANE_FS = `#version 300 es
precision highp float;
in vec2 vEl;
${V.map((n) => `flat in vec4 v${n};`).join('\n')}
uniform sampler2D uTex;
uniform vec4 uBackdrop;  // backdrop rect, CSS px (viewport)
uniform vec4 uTexInfo;   // texW, texH, maxLod, 0
out vec4 outColor;

float sdBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
const vec3 W709 = vec3(0.2126, 0.7152, 0.0722);
vec2 toUV(vec2 css) { return (css - uBackdrop.xy) / uBackdrop.zw; }
vec3 tap(vec2 uv, float lod) {
  if (lod < 0.6) return textureLod(uTex, uv, lod).rgb;
  vec2 o = exp2(lod) / uTexInfo.xy;
  vec2 a = o * vec2(0.75, 0.25);
  vec2 b = o * vec2(-0.25, 0.75);
  return 0.25 * (textureLod(uTex, uv + a, lod).rgb + textureLod(uTex, uv - a, lod).rgb
               + textureLod(uTex, uv + b, lod).rgb + textureLod(uTex, uv - b, lod).rgb);
}
vec2 outward(vec2 p, vec2 hs, float rp) {
  vec2 g = vec2(sdBox(p + vec2(0.5, 0.0), hs, rp) - sdBox(p - vec2(0.5, 0.0), hs, rp),
                sdBox(p + vec2(0.0, 0.5), hs, rp) - sdBox(p - vec2(0.0, 0.5), hs, rp));
  float glen = length(g);
  return glen > 1e-5 ? g / glen : vec2(0.0);
}
// Share of a pixel (a unit square, half widths hw along the edge normal) lying less than x beyond
// its centre: the CDF of the sum of two uniforms. Exact area coverage for a straight edge at any angle.
// x is clamped to the pixel's reach first: far from the edge the squares would be large and their
// difference lose all precision in float32 (the deep interior would flicker below full coverage).
float sq0(float z) { float m = max(z, 0.0); return m * m; }
float pixCdf(float x, vec2 hw) {
  float s = hw.x + hw.y;
  x = clamp(x, -s, s);
  return clamp((sq0(x + s) - sq0(x + hw.x - hw.y) - sq0(x - hw.x + hw.y) + sq0(x - s)) / (8.0 * hw.x * hw.y), 0.0, 1.0);
}
// Shading at one point q of the pane (element px): refraction, colour, tint, inner shadow and
// Fresnel in rgb, the specular term in a. tc: the tint colour (adaptive lightness already applied).
vec4 shade(vec2 q, vec3 tc) {
  vec2 size = vLocal.zw;
  vec2 hs = size * 0.5;
  vec2 p = q - hs;
  float m0 = min(hs.x, hs.y);
  float r = min(vShape.x, m0);
  // Height field from the SDF: superellipse bevel h(s) = (1 - (1 - s)^k)^(1/k)
  float t = clamp(vShape.y, 1.0, max(m0, 1.0));
  float rp = min(max(r, t), m0);                     // smoothed SDF avoids creases
  float e = max(-sdBox(p, hs, rp), 0.0);
  float s = clamp(e / t, 0.0, 1.0);
  vec2 g = outward(p, hs, rp);                       // outward direction
  float slope = 0.0;
  if (s < 1.0 && vShape.y > 0.0) {
    float k = max(vShape.z, 1.0);
    float m = 1.0 - s;
    float mk1 = k > 1.001 ? pow(m, k - 1.0) : 1.0;
    slope = min(mk1 * pow(max(1.0 - mk1 * m, 1e-4), 1.0 / k - 1.0), 10.0);
  }
  vec3 n = normalize(vec3(g * slope, 1.0));

  vec2 cpp = vRect.zw / size;                        // CSS px per element px
  vec2 css = vRect.xy + q * cpp;
  vec2 ctr = vRect.xy + vRect.zw * 0.5;
  vec2 base = ctr + (css - ctr) / max(vShape.w, 0.05);
  float depth = t * vOptic.x;
  float ior = max(vOptic.y, 1.0001);
  float spread = vOptic.z * 0.12;

  // Adaptive blur: edge blur at the rim -> centre blur in the flat area
  float sb = smoothstep(0.0, 1.0, clamp(e / (t * max(vOptic.w, 0.05)), 0.0, 1.0));
  float blurCss = mix(vBlur.y, vBlur.x, sb);
  float texPerCss = uTexInfo.x / uBackdrop.z;
  float lod = clamp(log2(max(blurCss * texPerCss, 1.0)), 0.0, uTexInfo.z);

  // Snell refraction (+ per-channel IOR for dispersion)
  const vec3 I = vec3(0.0, 0.0, -1.0);
  vec3 Tg = refract(I, n, 1.0 / ior);
  vec2 offG = Tg.xy / max(-Tg.z, 0.2) * depth;
  vec3 col;
  // Flat interior (slope 0): every channel refracts by zero, so one tap is exact.
  if (spread > 0.0005 && slope > 0.0) {
    vec3 Tr = refract(I, n, 1.0 / max(ior - spread, 1.0001));
    vec3 Tb = refract(I, n, 1.0 / (ior + spread));
    vec2 offR = Tr.xy / max(-Tr.z, 0.2) * depth;
    vec2 offB = Tb.xy / max(-Tb.z, 0.2) * depth;
    col.r = tap(toUV(base + offR * cpp), lod).r;
    col.g = tap(toUV(base + offG * cpp), lod).g;
    col.b = tap(toUV(base + offB * cpp), lod).b;
  } else {
    col = tap(toUV(base + offG * cpp), lod);
  }

  // Colour: saturation, hue, contrast, brightness, tint, inner shadow
  float luma = dot(col, W709);
  col = mix(vec3(luma), col, vColor.x);
  if (abs(vColor.w) > 1e-4) {
    const vec3 K = vec3(0.57735027);
    float cH = cos(vColor.w), sH = sin(vColor.w);
    col = col * cH + cross(K, col) * sH + K * dot(K, col) * (1.0 - cH);
  }
  col = (col - 0.5) * vColor.z + 0.5;
  col = clamp(col * vColor.y, 0.0, 1.0);
  // Vibrancy: the backdrop keeps its own colour, the tint only sets the lightness.
  vec3 chroma = col - vec3(dot(col, W709));
  col = clamp(mix(col, tc, vTint.a) + chroma * (vTint.a * vXtra.x), 0.0, 1.0);
  col *= 1.0 - vMisc.x * (1.0 - sb);

  // Fresnel reflection of a blurred environment
  float f0 = pow((ior - 1.0) / (ior + 1.0), 2.0);
  float F = f0 + (1.0 - f0) * pow(1.0 - clamp(n.z, 0.0, 1.0), 5.0);
  vec3 R = reflect(I, n);
  vec2 envUv = toUV(base + R.xy * t * 2.0 * cpp);
  float envLod = min(lod + 2.5, uTexInfo.z);
  vec3 env = slope > 0.0 ? tap(envUv, envLod) : textureLod(uTex, envUv, envLod).rgb;
  env = mix(env, vLcol.rgb, 0.5);
  col = mix(col, env, clamp(F * vLight.y, 0.0, 1.0));

  // Directional specular (key light + opposite bounce)
  vec2 ld = vec2(cos(vBlur.w), -sin(vBlur.w));
  const vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 H1 = normalize(normalize(vec3(ld, 0.6)) + V);
  vec3 H2 = normalize(normalize(vec3(-ld, 0.6)) + V);
  float shin = max(vBlur.z, 1.0);
  float sp = pow(max(dot(n, H1), 0.0), shin) + vMisc.y * pow(max(dot(n, H2), 0.0), shin);
  return vec4(col, sp);
}
void main() {
  vec2 size = vLocal.zw;
  vec2 hs = size * 0.5;
  vec2 p = vEl - hs;
  float m0 = min(hs.x, hs.y);
  float r = min(vShape.x, m0);
  float d = sdBox(p, hs, r);                         // < 0 inside the glass
  if (d > 0.75) { outColor = vec4(0.0); return; }
  float u = -d;                                      // distance inside the edge (element px)
  vec2 gE = outward(p, hs, r);                       // edge normal
  vec2 hw = max(abs(gE) * 0.5, vec2(0.005));
  float cov = pixCdf(u, hw);                         // analytic AA: share of the pixel inside
  float alpha = cov * vMisc.z;                       // x opacity
  if (alpha <= 0.0) { outColor = vec4(0.0); return; }
  vec2 cpp = vRect.zw / size;

  // Tint. Adaptive: its lightness follows the mean lightness under the pane (logistic around 0.5).
  vec3 tc = vTint.rgb;
  if (vXtra.y > 0.0) {
    float texPerCss = uTexInfo.x / uBackdrop.z;
    float lodAvg = clamp(log2(max(min(vRect.z, vRect.w) * texPerCss, 1.0)), 0.0, uTexInfo.z);
    float Lm = dot(textureLod(uTex, toUV(vRect.xy + vRect.zw * 0.5), lodAvg).rgb, W709);
    float a = 1.0 / (1.0 + exp(-16.0 * (Lm - 0.42)));
    tc = clamp(tc + (mix(0.1, 0.94, a) - dot(tc, W709)) * vXtra.y, 0.0, 1.0);
  }

  float lineW = max(1.0, 1.0 / cpp.x);
  float inset = lineW * step(0.001, vXtra.z);
  float rimW = max(1.0, vLight.w / cpp.x);
  // The bevel turns steeply within the last pixels, so the edge band averages four rotated-grid
  // samples (those inside the glass): the bright Fresnel edge weighs the same at every phase.
  vec4 sh;
  if (u < max(inset + rimW, 2.0) + 1.0) {
    vec4 acc = vec4(0.0);
    float w = 0.0;
    vec2 o = vec2(0.125, 0.375);
    for (int i = 0; i < 4; i++) {
      if (sdBox(p + o, hs, r) < 0.0) { acc += shade(vEl + o, tc); w += 1.0; }
      o = vec2(-o.y, o.x);
    }
    sh = w > 0.0 ? acc / w : shade(vEl, tc);
  } else {
    sh = shade(vEl, tc);
  }
  vec3 col = sh.rgb;

  // Lines along the edge use the same pixel coverage: the share of the glass part of this pixel they
  // cover. A line of width w then adds up to w across the pixels at any sub-pixel position and angle,
  // so curves stay even instead of beading.
  float c0 = pixCdf(-u, hw), inv = 1.0 / max(cov, 1e-3);
  // Edge line: a darker contour on the very edge; the rim light sits just inside it.
  col *= 1.0 - vXtra.z * 0.25 * (pixCdf(lineW - u, hw) - c0) * inv;
  float rim = 0.45 * (pixCdf(inset + rimW - u, hw) - pixCdf(inset - u, hw)) * inv;
  vec2 ld = vec2(cos(vBlur.w), -sin(vBlur.w));
  float facing = dot(gE, ld);
  float rimL = rim * ((1.0 - vXtra.w) + vXtra.w * max(max(facing, 0.0), max(-facing, 0.0) * vMisc.y * 1.25));
  // The rim reflects its surroundings, so it picks up some of the backdrop colour.
  vec3 rimC = vLcol.rgb * mix(vec3(1.0), col / max(max(col.r, max(col.g, col.b)), 0.08), 0.5);
  // Edge glow: a soft light band (about 4 CSS px) just inside the contour, screen-blended.
  float gq = 1.0 - clamp((u - inset) * cpp.x / 4.0, 0.0, 1.0);
  float glow = (1.0 - pixCdf(inset - u, hw)) * inv;
  col += (vLcol.rgb - col) * clamp(vMisc.w * 0.32 * gq * gq * glow, 0.0, 1.0);
  col = min(col + vLcol.rgb * (vLight.x * sh.a * 0.9) + rimC * (vLight.z * rimL), vec3(1.0));
  outColor = vec4(col * alpha, alpha);
}`;

  const DOWN_VS = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

  // Dual-Kawase style downsample: level i-1 -> level i of the same texture
  const DOWN_FS = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
in vec2 vUv;
out vec4 o;
void main() {
  vec2 ts = 1.0 / vec2(textureSize(uSrc, 0));
  vec4 c = texture(uSrc, vUv) * 4.0;
  c += texture(uSrc, vUv + vec2(-ts.x, -ts.y));
  c += texture(uSrc, vUv + vec2( ts.x, -ts.y));
  c += texture(uSrc, vUv + vec2(-ts.x,  ts.y));
  c += texture(uSrc, vUv + vec2( ts.x,  ts.y));
  o = c / 8.0;
}`;

  /* ------------------------------------------------------------------ */
  /* Shaders: WGSL (WebGPU path, same math)                              */
  /* ------------------------------------------------------------------ */

  const PANE_WGSL = `
struct U { atlas: vec4f, backdrop: vec4f, texInfo: vec4f };
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var tex: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;
struct VIn {
  @location(0) corner: vec2f,
${ATTRS.map((n, i) => `  @location(${i + 1}) f${n}: vec4f,`).join('\n')}
};
struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) el: vec2f,
${V.map((n, i) => `  @location(${i + 1}) @interpolate(flat) f${n}: vec4f,`).join('\n')}
};
@vertex fn vs(i: VIn) -> VOut {
  var o: VOut;
  let ap = i.fAtlas.xy + i.corner * i.fAtlas.zw;
  o.el = i.fLocal.xy + i.corner * i.fAtlas.zw;
  let c = ap / u.atlas.xy * 2.0 - 1.0;
  o.pos = vec4f(c.x, -c.y, 0.0, 1.0);
  ${V.map((n) => `o.f${n} = i.f${n};`).join(' ')}
  return o;
}
fn sdBox(p: vec2f, b: vec2f, r: f32) -> f32 {
  let q = abs(p) - b + r;
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - r;
}
const W709 = vec3f(0.2126, 0.7152, 0.0722);
fn toUV(c: vec2f) -> vec2f { return (c - u.backdrop.xy) / u.backdrop.zw; }
fn tap(uv: vec2f, lod: f32) -> vec3f {
  if (lod < 0.6) { return textureSampleLevel(tex, samp, uv, lod).rgb; }
  let o = exp2(lod) / u.texInfo.xy;
  let a = o * vec2f(0.75, 0.25);
  let b = o * vec2f(-0.25, 0.75);
  return 0.25 * (textureSampleLevel(tex, samp, uv + a, lod).rgb + textureSampleLevel(tex, samp, uv - a, lod).rgb
               + textureSampleLevel(tex, samp, uv + b, lod).rgb + textureSampleLevel(tex, samp, uv - b, lod).rgb);
}
fn outward(p: vec2f, hs: vec2f, rp: f32) -> vec2f {
  let g = vec2f(sdBox(p + vec2f(0.5, 0.0), hs, rp) - sdBox(p - vec2f(0.5, 0.0), hs, rp),
                sdBox(p + vec2f(0.0, 0.5), hs, rp) - sdBox(p - vec2f(0.0, 0.5), hs, rp));
  let glen = length(g);
  return select(vec2f(0.0), g / max(glen, 1e-5), glen > 1e-5);
}
fn sq0(z: f32) -> f32 { let m = max(z, 0.0); return m * m; }
fn pixCdf(x0: f32, hw: vec2f) -> f32 {
  let s = hw.x + hw.y;
  let x = clamp(x0, -s, s);   // see the GLSL version: keeps float32 precision far from the edge
  return clamp((sq0(x + s) - sq0(x + hw.x - hw.y) - sq0(x - hw.x + hw.y) + sq0(x - s)) / (8.0 * hw.x * hw.y), 0.0, 1.0);
}
fn shade(v: VOut, q: vec2f, tc: vec3f) -> vec4f {
  let size = v.fLocal.zw;
  let hs = size * 0.5;
  let p = q - hs;
  let m0 = min(hs.x, hs.y);
  let r = min(v.fShape.x, m0);
  let t = clamp(v.fShape.y, 1.0, max(m0, 1.0));
  let rp = min(max(r, t), m0);
  let e = max(-sdBox(p, hs, rp), 0.0);
  let s = clamp(e / t, 0.0, 1.0);
  let g = outward(p, hs, rp);
  var slope = 0.0;
  if (s < 1.0 && v.fShape.y > 0.0) {
    let k = max(v.fShape.z, 1.0);
    let m = 1.0 - s;
    var mk1 = 1.0;
    if (k > 1.001) { mk1 = pow(m, k - 1.0); }
    slope = min(mk1 * pow(max(1.0 - mk1 * m, 1e-4), 1.0 / k - 1.0), 10.0);
  }
  let n = normalize(vec3f(g * slope, 1.0));
  let cpp = v.fRect.zw / size;
  let css = v.fRect.xy + q * cpp;
  let ctr = v.fRect.xy + v.fRect.zw * 0.5;
  let base = ctr + (css - ctr) / max(v.fShape.w, 0.05);
  let depth = t * v.fOptic.x;
  let ior = max(v.fOptic.y, 1.0001);
  let spread = v.fOptic.z * 0.12;
  let sb = smoothstep(0.0, 1.0, clamp(e / (t * max(v.fOptic.w, 0.05)), 0.0, 1.0));
  let blurCss = mix(v.fBlur.y, v.fBlur.x, sb);
  let texPerCss = u.texInfo.x / u.backdrop.z;
  let lod = clamp(log2(max(blurCss * texPerCss, 1.0)), 0.0, u.texInfo.z);
  let I = vec3f(0.0, 0.0, -1.0);
  let Tg = refract(I, n, 1.0 / ior);
  let offG = Tg.xy / max(-Tg.z, 0.2) * depth;
  var col: vec3f;
  if (spread > 0.0005 && slope > 0.0) {
    let Tr = refract(I, n, 1.0 / max(ior - spread, 1.0001));
    let Tb = refract(I, n, 1.0 / (ior + spread));
    col = vec3f(tap(toUV(base + Tr.xy / max(-Tr.z, 0.2) * depth * cpp), lod).r,
                tap(toUV(base + offG * cpp), lod).g,
                tap(toUV(base + Tb.xy / max(-Tb.z, 0.2) * depth * cpp), lod).b);
  } else {
    col = tap(toUV(base + offG * cpp), lod);
  }
  let luma = dot(col, W709);
  col = mix(vec3f(luma), col, v.fColor.x);
  if (abs(v.fColor.w) > 1e-4) {
    let K = vec3f(0.57735027);
    let cH = cos(v.fColor.w);
    let sH = sin(v.fColor.w);
    col = col * cH + cross(K, col) * sH + K * dot(K, col) * (1.0 - cH);
  }
  col = (col - 0.5) * v.fColor.z + 0.5;
  col = clamp(col * v.fColor.y, vec3f(0.0), vec3f(1.0));
  let chroma = col - vec3f(dot(col, W709));
  col = clamp(mix(col, tc, v.fTint.a) + chroma * (v.fTint.a * v.fXtra.x), vec3f(0.0), vec3f(1.0));
  col = col * (1.0 - v.fMisc.x * (1.0 - sb));
  let f0 = pow((ior - 1.0) / (ior + 1.0), 2.0);
  let F = f0 + (1.0 - f0) * pow(1.0 - clamp(n.z, 0.0, 1.0), 5.0);
  let R = reflect(I, n);
  let envUv = toUV(base + R.xy * t * 2.0 * cpp);
  let envLod = min(lod + 2.5, u.texInfo.z);
  var env: vec3f;
  if (slope > 0.0) { env = tap(envUv, envLod); } else { env = textureSampleLevel(tex, samp, envUv, envLod).rgb; }
  env = mix(env, v.fLcol.rgb, 0.5);
  col = mix(col, env, clamp(F * v.fLight.y, 0.0, 1.0));
  let ld = vec2f(cos(v.fBlur.w), -sin(v.fBlur.w));
  let Vw = vec3f(0.0, 0.0, 1.0);
  let H1 = normalize(normalize(vec3f(ld, 0.6)) + Vw);
  let H2 = normalize(normalize(vec3f(-ld, 0.6)) + Vw);
  let shin = max(v.fBlur.z, 1.0);
  let sp = pow(max(dot(n, H1), 0.0), shin) + v.fMisc.y * pow(max(dot(n, H2), 0.0), shin);
  return vec4f(col, sp);
}
@fragment fn fs(v: VOut) -> @location(0) vec4f {
  let size = v.fLocal.zw;
  let hs = size * 0.5;
  let p = v.el - hs;
  let m0 = min(hs.x, hs.y);
  let r = min(v.fShape.x, m0);
  let d = sdBox(p, hs, r);
  if (d > 0.75) { return vec4f(0.0); }
  let ui = -d;
  let gE = outward(p, hs, r);
  let hw = max(abs(gE) * 0.5, vec2f(0.005));
  let cov = pixCdf(ui, hw);
  let alpha = cov * v.fMisc.z;
  if (alpha <= 0.0) { return vec4f(0.0); }
  let cpp = v.fRect.zw / size;
  var tc = v.fTint.rgb;
  if (v.fXtra.y > 0.0) {
    let texPerCss = u.texInfo.x / u.backdrop.z;
    let lodAvg = clamp(log2(max(min(v.fRect.z, v.fRect.w) * texPerCss, 1.0)), 0.0, u.texInfo.z);
    let Lm = dot(textureSampleLevel(tex, samp, toUV(v.fRect.xy + v.fRect.zw * 0.5), lodAvg).rgb, W709);
    let a = 1.0 / (1.0 + exp(-16.0 * (Lm - 0.42)));
    tc = clamp(tc + (mix(0.1, 0.94, a) - dot(tc, W709)) * v.fXtra.y, vec3f(0.0), vec3f(1.0));
  }
  let lineW = max(1.0, 1.0 / cpp.x);
  let inset = lineW * step(0.001, v.fXtra.z);
  let rimW = max(1.0, v.fLight.w / cpp.x);
  var sh: vec4f;
  if (ui < max(inset + rimW, 2.0) + 1.0) {
    var acc = vec4f(0.0);
    var w = 0.0;
    var o = vec2f(0.125, 0.375);
    for (var i = 0; i < 4; i++) {
      if (sdBox(p + o, hs, r) < 0.0) { acc += shade(v, v.el + o, tc); w += 1.0; }
      o = vec2f(-o.y, o.x);
    }
    if (w > 0.0) { sh = acc / w; } else { sh = shade(v, v.el, tc); }
  } else {
    sh = shade(v, v.el, tc);
  }
  var col = sh.rgb;
  let c0 = pixCdf(-ui, hw);
  let inv = 1.0 / max(cov, 1e-3);
  col = col * (1.0 - v.fXtra.z * 0.25 * (pixCdf(lineW - ui, hw) - c0) * inv);
  let rim = 0.45 * (pixCdf(inset + rimW - ui, hw) - pixCdf(inset - ui, hw)) * inv;
  let ld = vec2f(cos(v.fBlur.w), -sin(v.fBlur.w));
  let facing = dot(gE, ld);
  let rimL = rim * ((1.0 - v.fXtra.w) + v.fXtra.w * max(max(facing, 0.0), max(-facing, 0.0) * v.fMisc.y * 1.25));
  let rimC = v.fLcol.rgb * mix(vec3f(1.0), col / max(max(col.r, max(col.g, col.b)), 0.08), 0.5);
  let gq = 1.0 - clamp((ui - inset) * cpp.x / 4.0, 0.0, 1.0);
  let glow = (1.0 - pixCdf(inset - ui, hw)) * inv;
  col = col + (v.fLcol.rgb - col) * clamp(v.fMisc.w * 0.32 * gq * gq * glow, 0.0, 1.0);
  col = min(col + v.fLcol.rgb * (v.fLight.x * sh.a * 0.9) + rimC * (v.fLight.z * rimL), vec3f(1.0));
  return vec4f(col * alpha, alpha);
}`;

  const DOWN_WGSL = `
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}
@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let ss = vec2f(textureDimensions(src, 0));
  let ds = max(floor(ss * 0.5), vec2f(1.0));
  let uv = pos.xy / ds;
  let ts = 1.0 / ss;
  var c = textureSampleLevel(src, samp, uv, 0.0) * 4.0;
  c += textureSampleLevel(src, samp, uv + vec2f(-ts.x, -ts.y), 0.0);
  c += textureSampleLevel(src, samp, uv + vec2f( ts.x, -ts.y), 0.0);
  c += textureSampleLevel(src, samp, uv + vec2f(-ts.x,  ts.y), 0.0);
  c += textureSampleLevel(src, samp, uv + vec2f( ts.x,  ts.y), 0.0);
  return c / 8.0;
}`;

  const PLACEHOLDER = new Uint8Array([28, 30, 40, 255]);
  const levelCount = (w, h) => Math.max(1, Math.min(CONFIG.blurLevels, Math.floor(Math.log2(Math.max(w, h))) + 1));

  /* ------------------------------------------------------------------ */
  /* WebGL2 backend                                                      */
  /* ------------------------------------------------------------------ */

  function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS) && !gl.isContextLost()) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error('RefractGL shader compile failed: ' + log);
    }
    return sh;
  }
  function program(gl, vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) {
      throw new Error('RefractGL program link failed: ' + gl.getProgramInfoLog(p));
    }
    return p;
  }

  class WebGL2Backend {
    constructor(engine) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const gl = canvas.getContext('webgl2', {
        alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
        preserveDrawingBuffer: false, powerPreference: CONFIG.powerPreference, desynchronized: false,
      });
      if (!gl) throw new Error('WebGL2 is not available');
      this.name = 'webgl2';
      this.canvas = canvas;
      this.gl = gl;
      this.drawCalls = 0;
      this.disposed = false;
      const vp = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
      this.maxSize = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), vp[0], vp[1]);
      this.gpuName = '';
      try {
        if (IS_GECKO) this.gpuName = String(gl.getParameter(gl.RENDERER) || '');
        else {
          const ext = gl.getExtension('WEBGL_debug_renderer_info');
          this.gpuName = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
        }
      } catch (e) { this.gpuName = ''; }

      this.pane = program(gl, PANE_VS, PANE_FS);
      this.down = program(gl, DOWN_VS, DOWN_FS);
      this.uPane = {
        atlas: gl.getUniformLocation(this.pane, 'uAtlasSize'),
        tex: gl.getUniformLocation(this.pane, 'uTex'),
        backdrop: gl.getUniformLocation(this.pane, 'uBackdrop'),
        texInfo: gl.getUniformLocation(this.pane, 'uTexInfo'),
      };
      this.uDownSrc = gl.getUniformLocation(this.down, 'uSrc');

      this.vao = gl.createVertexArray();
      gl.bindVertexArray(this.vao);
      const quad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      this.inst = gl.createBuffer();
      this.instBytes = 0;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.inst);
      for (let i = 0; i < ATTRS.length; i++) {
        gl.enableVertexAttribArray(1 + i);
        gl.vertexAttribPointer(1 + i, 4, gl.FLOAT, false, STRIDE, i * 16);
        gl.vertexAttribDivisor(1 + i, 1);
      }
      gl.bindVertexArray(null);
      this.emptyVao = gl.createVertexArray();
      this.fbo = gl.createFramebuffer();
      this.tex = null; this.texW = 0; this.texH = 0; this.levels = 1;
      this.placeholder();

      this._onLost = (e) => { e.preventDefault(); if (!this.disposed) engine._onLost(this, 'webgl context lost'); };
      canvas.addEventListener('webglcontextlost', this._onLost);
    }

    _alloc(w, h) {
      const gl = this.gl;
      if (this.tex) gl.deleteTexture(this.tex);
      const levels = levelCount(w, h);
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texStorage2D(gl.TEXTURE_2D, levels, gl.RGBA8, w, h);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.tex = tex; this.texW = w; this.texH = h; this.levels = levels;
    }

    placeholder() {
      const gl = this.gl;
      this._alloc(1, 1);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, PLACEHOLDER);
    }

    upload(source, w, h) {
      const gl = this.gl;
      if (!this.tex || w !== this.texW || h !== this.texH || this.levels !== levelCount(w, h)) this._alloc(w, h);
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
      this._pyramid();
    }

    // Re-upload one band of an unchanged-size source (UNPACK_SKIP_* picks the sub-rectangle).
    uploadRect(source, x, y, w, h) {
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, x);
      gl.pixelStorei(gl.UNPACK_SKIP_ROWS, y);
      try { gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, source); }
      finally { gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0); }
      this._pyramid();
    }

    _pyramid() {
      const gl = this.gl;
      const L = this.levels;
      if (L < 2) return;
      gl.useProgram(this.down);
      gl.bindVertexArray(this.emptyVao);
      gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.uniform1i(this.uDownSrc, 0);
      for (let i = 1; i < L; i++) {
        // Sample only level i-1 while writing level i: no feedback loop.
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL, i - 1);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, i - 1);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, i);
        gl.viewport(0, 0, Math.max(1, this.texW >> i), Math.max(1, this.texH >> i));
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, null, 0);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL, 0);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, L - 1);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.drawCalls += L - 1;
    }

    resize(aw, ah) {
      const c = this.canvas;
      if (c.width !== aw) c.width = aw;
      if (c.height !== ah) c.height = ah;
    }

    render(data, count, aw, ah, u) {
      const gl = this.gl;
      this.resize(aw, ah);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, aw, ah);
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(this.pane);
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.inst);
      const view = data.subarray(0, count * FLOATS);
      if (view.byteLength > this.instBytes) {
        this.instBytes = data.byteLength;
        gl.bufferData(gl.ARRAY_BUFFER, this.instBytes, gl.DYNAMIC_DRAW);
      }
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, view);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.uniform1i(this.uPane.tex, 0);
      gl.uniform2f(this.uPane.atlas, aw, ah);
      gl.uniform4f(this.uPane.backdrop, u.bx, u.by, u.bw, u.bh);
      gl.uniform4f(this.uPane.texInfo, this.texW, this.texH, this.levels - 1, 0);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);   // one draw call for all panes
      gl.bindVertexArray(null);
      this.drawCalls += 1;
      if (CONFIG.debug) {
        const err = gl.getError();
        if (err) console.warn('[RefractGL] WebGL error 0x' + err.toString(16));
      }
    }

    dispose() {
      this.disposed = true;
      this.canvas.removeEventListener('webglcontextlost', this._onLost);
      const ext = this.gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
      this.canvas.width = this.canvas.height = 1;
    }
  }

  /* ------------------------------------------------------------------ */
  /* WebGPU backend (progressive enhancement, same pipeline)             */
  /* ------------------------------------------------------------------ */

  class WebGPUBackend {
    static async create(engine) {
      // GPURequestAdapterOptions has no 'default' value: leaving the key out means the same.
      const adapter = await navigator.gpu.requestAdapter(CONFIG.powerPreference === 'default' ? {} : { powerPreference: CONFIG.powerPreference });
      if (!adapter) throw new Error('No WebGPU adapter');
      const device = await adapter.requestDevice();
      let name = '';
      try {
        const info = adapter.info || (adapter.requestAdapterInfo ? await adapter.requestAdapterInfo() : null);
        if (info) name = [info.vendor, info.architecture, info.description].filter(Boolean).join(' ');
      } catch (e) { name = ''; }
      return new WebGPUBackend(engine, device, name);
    }

    constructor(engine, device, gpuName) {
      const U = global.GPUBufferUsage, T = global.GPUTextureUsage;
      this.name = 'webgpu';
      this.gpuName = gpuName || '';
      this.device = device;
      this.drawCalls = 0;
      this.disposed = false;
      this.U = U; this.T = T;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext('webgpu');
      if (!ctx) throw new Error('WebGPU canvas context unavailable');
      this.format = navigator.gpu.getPreferredCanvasFormat();
      ctx.configure({ device, format: this.format, alphaMode: 'premultiplied' });
      this.canvas = canvas; this.ctx = ctx;
      this.maxSize = device.limits.maxTextureDimension2D;
      this.sampler = device.createSampler({
        magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear',
        addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge',
      });
      const paneModule = device.createShaderModule({ code: PANE_WGSL });
      const downModule = device.createShaderModule({ code: DOWN_WGSL });
      const attrs = [];
      for (let i = 0; i < ATTRS.length; i++) attrs.push({ shaderLocation: 1 + i, offset: i * 16, format: 'float32x4' });
      this.panePipe = device.createRenderPipeline({
        layout: 'auto',
        vertex: {
          module: paneModule, entryPoint: 'vs',
          buffers: [
            { arrayStride: 8, stepMode: 'vertex', attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] },
            { arrayStride: STRIDE, stepMode: 'instance', attributes: attrs },
          ],
        },
        fragment: { module: paneModule, entryPoint: 'fs', targets: [{ format: this.format }] },
        primitive: { topology: 'triangle-strip' },
      });
      this.downPipe = device.createRenderPipeline({
        layout: 'auto',
        vertex: { module: downModule, entryPoint: 'vs' },
        fragment: { module: downModule, entryPoint: 'fs', targets: [{ format: 'rgba8unorm' }] },
        primitive: { topology: 'triangle-list' },
      });
      this.quad = device.createBuffer({ size: 32, usage: U.VERTEX | U.COPY_DST });
      device.queue.writeBuffer(this.quad, 0, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]));
      this.ubo = device.createBuffer({ size: 48, usage: U.UNIFORM | U.COPY_DST });
      this.uData = new Float32Array(12);
      this.inst = null; this.instSize = 0;
      this.tex = null; this.texW = 0; this.texH = 0; this.levels = 1;
      this.placeholder();
      device.lost.then((info) => { if (!this.disposed) engine._onLost(this, 'webgpu device lost: ' + (info && info.message)); });
    }

    _alloc(w, h) {
      const device = this.device, T = this.T;
      if (this.tex) this.tex.destroy();
      const levels = levelCount(w, h);
      this.tex = device.createTexture({
        size: [w, h], format: 'rgba8unorm', mipLevelCount: levels,
        usage: T.TEXTURE_BINDING | T.COPY_DST | T.RENDER_ATTACHMENT,
      });
      this.texW = w; this.texH = h; this.levels = levels;
      this.paneBind = device.createBindGroup({
        layout: this.panePipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.ubo } },
          { binding: 1, resource: this.tex.createView() },
          { binding: 2, resource: this.sampler },
        ],
      });
      this.levelViews = [];
      this.downBinds = [];
      for (let i = 0; i < levels; i++) this.levelViews.push(this.tex.createView({ baseMipLevel: i, mipLevelCount: 1 }));
      for (let i = 1; i < levels; i++) {
        this.downBinds.push(device.createBindGroup({
          layout: this.downPipe.getBindGroupLayout(0),
          entries: [{ binding: 0, resource: this.levelViews[i - 1] }, { binding: 1, resource: this.sampler }],
        }));
      }
    }

    placeholder() {
      this._alloc(1, 1);
      this.device.queue.writeTexture({ texture: this.tex }, PLACEHOLDER, { bytesPerRow: 4 }, [1, 1]);
    }

    upload(source, w, h) {
      if (!this.tex || w !== this.texW || h !== this.texH || this.levels !== levelCount(w, h)) this._alloc(w, h);
      this.device.queue.copyExternalImageToTexture(
        { source, flipY: false },
        { texture: this.tex, mipLevel: 0, premultipliedAlpha: true },
        [w, h]
      );
      this._pyramid();
    }

    uploadRect(source, x, y, w, h) {
      this.device.queue.copyExternalImageToTexture(
        { source, origin: { x, y }, flipY: false },
        { texture: this.tex, mipLevel: 0, origin: { x, y }, premultipliedAlpha: true },
        [w, h]
      );
      this._pyramid();
    }

    _pyramid() {
      if (this.levels < 2) return;
      const enc = this.device.createCommandEncoder();
      for (let i = 1; i < this.levels; i++) {
        const pass = enc.beginRenderPass({
          colorAttachments: [{ view: this.levelViews[i], loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }],
        });
        pass.setPipeline(this.downPipe);
        pass.setBindGroup(0, this.downBinds[i - 1]);
        pass.draw(3);
        pass.end();
      }
      this.device.queue.submit([enc.finish()]);
      this.drawCalls += this.levels - 1;
    }

    resize(aw, ah) {
      const c = this.canvas;
      if (c.width !== aw) c.width = aw;
      if (c.height !== ah) c.height = ah;
    }

    render(data, count, aw, ah, u) {
      const device = this.device;
      this.resize(aw, ah);
      const bytes = count * STRIDE;
      if (!this.inst || this.instSize < bytes) {
        if (this.inst) this.inst.destroy();
        this.instSize = Math.max(bytes * 2, STRIDE * 32);
        this.inst = device.createBuffer({ size: this.instSize, usage: this.U.VERTEX | this.U.COPY_DST });
      }
      device.queue.writeBuffer(this.inst, 0, data.buffer, data.byteOffset, bytes);
      const D = this.uData;
      D[0] = aw; D[1] = ah; D[2] = 0; D[3] = 0;
      D[4] = u.bx; D[5] = u.by; D[6] = u.bw; D[7] = u.bh;
      D[8] = this.texW; D[9] = this.texH; D[10] = this.levels - 1; D[11] = 0;
      device.queue.writeBuffer(this.ubo, 0, D);
      const enc = device.createCommandEncoder();
      const pass = enc.beginRenderPass({
        colorAttachments: [{ view: this.ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }],
      });
      pass.setPipeline(this.panePipe);
      pass.setBindGroup(0, this.paneBind);
      pass.setVertexBuffer(0, this.quad);
      pass.setVertexBuffer(1, this.inst);
      pass.draw(4, count);
      pass.end();
      device.queue.submit([enc.finish()]);
      this.drawCalls += 1;
    }

    dispose() {
      this.disposed = true;
      try {
        if (this.tex) this.tex.destroy();
        if (this.inst) this.inst.destroy();
        this.ubo.destroy();
        this.quad.destroy();
        this.ctx.unconfigure();
        this.device.destroy();
      } catch (e) { /* ignore */ }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Engine: one shared renderer, one shared framebuffer for all panes   */
  /* ------------------------------------------------------------------ */

  class Engine {
    constructor() {
      this.instances = [];
      this.hooks = new Set();
      this.listeners = new Map();
      this.mode = 'idle';            // idle | pending | gpu | unsupported
      this.reason = '';
      this.backend = null;
      this.token = 0;
      this.fbScale = 0;
      this.started = false;
      this.rafId = 0;
      this.restarts = 0;             // failed starts in a row; see _restart()
      this.backendSince = 0;         // when the current (or last) backend started, ms
      this.restartTimer = 0;
      this.webgpuBroken = false;
      this.atlasW = 0; this.atlasH = 0; this.shrink = 0;
      this.data = new Float32Array(FLOATS * 32);
      this.stage = null;
      this.autoComp = IS_GECKO ? 'staging' : 'direct';
      this.compProbe = { n: 0, ema: 0 };
      this.bd = { source: null, rect: 'element', dynamic: 'auto', dirty: true, version: 0, warned: false, tmp: null, cs: null };
      this.fps = { start: 0, last: 0, frames: 0 };
      this.stats = { fps: 0, cpuMs: 0, rendered: 0, drawCalls: 0, uploads: 0, partialUploads: 0, readPixels: 0 };
      this._frame = this._frame.bind(this);
    }

    ensure() {
      if (this.started || !hasDOM) return;
      this.started = true;
      injectStyles();
      global.addEventListener('resize', () => {
        for (const i of this.instances) i._sizeDirty = true;
        this.bd.cs = null;   // re-read the backdrop's padding and object-fit (media queries may change them)
      });
      this.start(CONFIG.backend);
      this.schedule();
    }

    schedule() {
      if (!this.rafId && CONFIG.autoRender && this.started) this.rafId = global.requestAnimationFrame(this._frame);
    }

    on(type, fn) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(fn);
      return () => this.off(type, fn);
    }
    off(type, fn) { const s = this.listeners.get(type); if (s) s.delete(fn); }
    emit(type, detail) {
      const s = this.listeners.get(type);
      if (s) for (const fn of s) { try { fn(detail); } catch (e) { console.error(e); } }
    }

    add(inst) { this.instances.push(inst); this.schedule(); }
    remove(inst) { const k = this.instances.indexOf(inst); if (k >= 0) this.instances.splice(k, 1); }
    markAll() { for (const i of this.instances) i._dirty = true; }

    compositor() {
      const c = CONFIG.compositor;
      return c === 'direct' || c === 'staging' ? c : this.autoComp;
    }

    start(name) {
      const token = ++this.token;
      clearTimeout(this.restartTimer);
      this._destroyBackend();
      let order = name === 'auto' || name === 'webgpu' ? ['webgpu', 'webgl2'] : ['webgl2'];
      if (this.webgpuBroken && order.length > 1) order = order.filter((n) => n !== 'webgpu');
      const next = (k, err) => {
        if (token !== this.token) return;
        if (k >= order.length) {
          this._setMode('unsupported', err ? String(err.message || err) : 'no GPU path');
          return;
        }
        if (order[k] === 'webgl2') {
          let be;
          try { be = new WebGL2Backend(this); } catch (e) { next(k + 1, e); return; }
          this._useBackend(be);
          return;
        }
        if (!global.navigator || !navigator.gpu) { next(k + 1, new Error('WebGPU is not available')); return; }
        this._setMode('pending', 'initializing webgpu');
        let settled = false;
        // some drivers never resolve requestAdapter/requestDevice -> continue with WebGL2
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          this.webgpuBroken = true;
          next(k + 1, new Error('WebGPU init timeout'));
        }, CONFIG.webgpuTimeout);
        WebGPUBackend.create(this).then(
          (be) => {
            if (settled || token !== this.token) { be.dispose(); return; }
            settled = true; clearTimeout(timer);
            this._useBackend(be);
          },
          (e) => {
            if (settled) return;
            settled = true; clearTimeout(timer);
            next(k + 1, e);
          }
        );
      };
      next(0, null);
    }

    _useBackend(be) {
      this.backend = be;
      this.backendSince = now();
      this.bd.dirty = true; this.bd.dirtyRect = null;
      this.atlasW = this.atlasH = 0;
      this.markAll();
      this._setMode('gpu', be.name);
    }

    _destroyBackend() {
      if (this.backend) { try { this.backend.dispose(); } catch (e) { /* ignore */ } }
      this.backend = null;
    }

    /** Context / device loss: keep the last frame in the layers and re-create the renderer. */
    _onLost(be, reason) {
      if (be !== this.backend) return;
      this.backend = null;
      if (be.name === 'webgpu') this.webgpuBroken = true;   // usually a driver or compositor problem
      if (CONFIG.debug) console.info('[RefractGL] ' + reason + ', restarting');
      this._restart(reason, be.name === 'webgpu' ? 0 : 400);
    }

    // Context loss or a render error. A backend that worked for STABLE_MS counts as a successful
    // start, so a rare loss (driver update, GPU reset, sleep) later in a long session starts a fresh
    // count. Losses within STABLE_MS of a start count up: a crash loop still gives up after 6 tries.
    _restart(reason, delay) {
      if (this.backendSince && now() - this.backendSince >= STABLE_MS) this.restarts = 0;
      this.backendSince = 0;
      if (this.restarts >= MAX_RESTARTS) { this._setMode('unsupported', reason + ' (gave up after repeated failures)'); return; }
      this.restarts++;
      this._setMode('pending', reason);
      const token = this.token;
      clearTimeout(this.restartTimer);
      this.restartTimer = setTimeout(() => { if (token === this.token && !this.backend) this.start(CONFIG.backend); }, delay);
    }

    _setMode(mode, reason) {
      if (this.mode === mode && this.reason === reason) return;
      const prev = this.mode;
      this.mode = mode;
      this.reason = reason;
      if (mode !== 'gpu') for (const i of this.instances) i._dirty = true;
      this.emit('mode', { mode, backend: this.backend ? this.backend.name : null, reason, previous: prev });
    }

    _tickFps(t) {
      const f = this.fps;
      if (!f.start || t - f.last > 500) { f.start = f.last = t; f.frames = 0; return; }
      f.last = t;
      f.frames++;
      const span = t - f.start;
      if (span < CONFIG.statsInterval) return;
      this.stats.fps = (f.frames * 1000) / span;
      f.start = t; f.frames = 0;
      this.emit('stats', this.getStats());
    }

    _frame(t) {
      this.rafId = 0;
      this.schedule();
      this.render(t);
    }

    render(t) {
      if (t === undefined) t = now();
      this._tickFps(t);
      for (const h of this.hooks) {
        try { h(t); } catch (e) { console.error('[RefractGL] onBeforeFrame hook failed', e); }
      }
      for (const inst of this.instances) if (inst._tweens.length) inst._stepTweens(t);
      if (this.mode !== 'gpu' || !this.backend) { this.stats.rendered = 0; return; }
      const t0 = now();
      try {
        this._renderGPU();
      } catch (e) {
        console.warn('[RefractGL] GPU render failed, restarting the renderer:', e);
        this._destroyBackend();
        this._restart('render error: ' + (e && e.message), 300);
      }
      const dt = now() - t0;
      this.stats.cpuMs = this.stats.cpuMs ? this.stats.cpuMs * 0.9 + dt * 0.1 : dt;
    }

    _backdropRect(vw, vh) {
      const bd = this.bd;
      if (typeof bd.rect === 'function') {
        const r = bd.rect();
        return { x: r.x !== undefined ? r.x : r.left, y: r.y !== undefined ? r.y : r.top, w: Math.max(r.width, 1), h: Math.max(r.height, 1) };
      }
      const el = bd.source;
      if (bd.rect === 'viewport' || !el || typeof Element === 'undefined' || !(el instanceof Element) || !el.isConnected) {
        return { x: 0, y: 0, w: vw, h: vh };
      }
      // Transform-aware content box + object-fit / object-position of the replaced element.
      const r = el.getBoundingClientRect();
      const ow = el.offsetWidth || r.width || 1, oh = el.offsetHeight || r.height || 1;
      const kx = r.width / ow, ky = r.height / oh;
      const cs = bd.cs || (bd.cs = global.getComputedStyle(el));
      const pl = parseFloat(cs.paddingLeft) || 0, pt = parseFloat(cs.paddingTop) || 0;
      const pr = parseFloat(cs.paddingRight) || 0, pb = parseFloat(cs.paddingBottom) || 0;
      const bw = Math.max(1, (el.clientWidth || ow) - pl - pr), bh = Math.max(1, (el.clientHeight || oh) - pt - pb);
      const [sw, sh] = sourceSize(el);
      const f = fitBox(bw, bh, sw, sh, cs.objectFit, cs.objectPosition);
      return {
        x: r.left + (el.clientLeft + pl + f[0]) * kx,
        y: r.top + (el.clientTop + pt + f[1]) * ky,
        w: Math.max(f[2] * kx, 1),
        h: Math.max(f[3] * ky, 1),
      };
    }

    _uploadBackdrop(be) {
      const bd = this.bd;
      const src = bd.source;
      if (!sourceReady(src)) return;
      let [w, h] = sourceSize(src);
      if (!w || !h) return;
      let up = src;
      const max = Math.min(CONFIG.maxBackdropSize, be.maxSize);
      const k = Math.min(CONFIG.backdropScale, max / Math.max(w, h), 1);
      if (k < 0.999) {
        const tw = Math.max(1, Math.floor(w * k)), th = Math.max(1, Math.floor(h * k));
        if (!bd.tmp) bd.tmp = document.createElement('canvas');
        if (bd.tmp.width !== tw) bd.tmp.width = tw;
        if (bd.tmp.height !== th) bd.tmp.height = th;
        bd.tmp.getContext('2d').drawImage(src, 0, 0, tw, th);
        up = bd.tmp; w = tw; h = th;
      }
      const r = bd.dirtyRect;
      bd.dirtyRect = null;
      try {
        // Partial update: same size, no downscale, texture already holds the rest of the source.
        if (r && up === src && be.tex && w === be.texW && h === be.texH && bd.version > 0 && be.uploadRect) {
          const x0 = Math.max(0, Math.floor(r.x)), y0 = Math.max(0, Math.floor(r.y));
          const x1 = Math.min(w, Math.ceil(r.x + r.width)), y1 = Math.min(h, Math.ceil(r.y + r.height));
          if (x1 > x0 && y1 > y0) be.uploadRect(up, x0, y0, x1 - x0, y1 - y0);
          this.stats.partialUploads++;
        } else {
          be.upload(up, w, h);
        }
      } catch (e) {
        if (!bd.warned) {
          bd.warned = true;
          console.warn('[RefractGL] backdrop upload failed (cross-origin / tainted source?)', e);
        }
        be.placeholder();
      }
      bd.dirty = false;
      bd.version++;
      this.stats.uploads++;
    }

    _renderGPU() {
      const be = this.backend;
      const de = document.documentElement;
      const vw = de.clientWidth || global.innerWidth;
      const vh = de.clientHeight || global.innerHeight;
      const dpr = Math.min(global.devicePixelRatio || 1, CONFIG.maxDpr);
      const fbS = Math.max(0.25, dpr * CONFIG.renderScale);
      if (Math.abs(fbS - this.fbScale) > 1e-4) {
        this.fbScale = fbS;
        for (const i of this.instances) i._sizeDirty = true;
      }
      be.drawCalls = 0;

      // 1. Backdrop: one upload + one mip pyramid shared by every pane.
      const bd = this.bd;
      if (bd.source) {
        const dyn = bd.dynamic === 'auto' ? isLiveSource(bd.source) : !!bd.dynamic;
        const [sw, sh] = sourceSize(bd.source);
        if (sw !== bd.srcW || sh !== bd.srcH) { bd.srcW = sw; bd.srcH = sh; bd.dirty = true; bd.dirtyRect = null; }  // resized canvas
        if (dyn) bd.dirtyRect = null;
        if (dyn || bd.dirty) this._uploadBackdrop(be);
      } else if (bd.dirty) {
        be.placeholder();
        bd.dirty = false;
        bd.version++;
      }
      const br = this._backdropRect(vw, vh);
      const bdKey = bd.version + ':' + br.x.toFixed(2) + ',' + br.y.toFixed(2) + ',' + br.w.toFixed(1) + ',' + br.h.toFixed(1);

      // 2. Collect visible panes whose input changed.
      const list = [];
      for (const inst of this.instances) {
        const st = inst._measure(vw, vh, fbS);
        if (!st) continue;
        const key = st.key + '|' + bdKey;
        if (!inst._dirty && key === inst._key) continue;
        inst._key = key;
        inst._dirty = false;
        list.push(inst);
      }
      this.stats.rendered = list.length;
      if (!list.length) { this.stats.drawCalls = be.drawCalls; return; }

      // 3. Shelf-pack the dirty panes into a tight shared atlas (small readback, no overlap).
      const limit = be.maxSize;
      let widest = 0, area = 0;
      for (const inst of list) { widest = Math.max(widest, inst._st.w); area += (inst._st.w + 1) * (inst._st.h + 1); }
      const rowW = Math.min(limit, Math.max(widest, Math.ceil(Math.sqrt(area) * 1.15)));
      list.sort((a, b) => b._st.h - a._st.h);
      let x = 0, y = 0, rowH = 0, usedW = 0;
      const placed = [];
      for (const inst of list) {
        const s = inst._st;
        s.w = Math.min(s.w, rowW);
        if (x + s.w > rowW) { x = 0; y += rowH + 1; rowH = 0; }
        if (y + s.h > limit) { inst._dirty = true; continue; }
        s.ax = x; s.ay = y;
        x += s.w + 1;
        usedW = Math.max(usedW, x - 1);
        rowH = Math.max(rowH, s.h);
        placed.push(inst);
      }
      const usedH = y + rowH;
      this._sizeAtlas(usedW, usedH, limit);

      // 4. Instance data -> one instanced draw call.
      if (this.data.length < placed.length * FLOATS) this.data = new Float32Array(roundUp(placed.length, 16) * FLOATS);
      const D = this.data;
      let count = 0;
      for (const inst of placed) inst._write(D, count++ * FLOATS);
      be.render(D, count, this.atlasW, this.atlasH, { bx: br.x, by: br.y, bw: br.w, bh: br.h });

      // 5. Distribute: copy each pane 1:1 into its element's layer canvas.
      this._distribute(be, placed, usedW, usedH);
      this.stats.drawCalls = be.drawCalls;
    }

    _sizeAtlas(usedW, usedH, limit) {
      const needW = Math.min(limit, roundUp(Math.max(usedW, 1), 64));
      const needH = Math.min(limit, roundUp(Math.max(usedH, 1), 64));
      if (needW > this.atlasW || needH > this.atlasH) {
        this.atlasW = Math.max(this.atlasW, needW);
        this.atlasH = Math.max(this.atlasH, needH);
        this.shrink = 0;
      } else if (needW * needH * 2 < this.atlasW * this.atlasH) {
        // hysteresis: shrink after a run of renders that need less than half the area
        if (++this.shrink > 30) { this.atlasW = needW; this.atlasH = needH; this.shrink = 0; }
      } else this.shrink = 0;
    }

    _distribute(be, placed, usedW, usedH) {
      const mode = this.compositor();
      const t0 = now();
      let src = be.canvas;
      if (mode === 'staging') {
        // One readback of the GL drawing buffer per frame instead of one per pane.
        let st = this.stage;
        if (!st) {
          const c = document.createElement('canvas');
          st = this.stage = { canvas: c, ctx: c.getContext('2d') };
        }
        const c = st.canvas;
        if (c.width !== this.atlasW) c.width = this.atlasW;
        if (c.height !== this.atlasH) c.height = this.atlasH;
        st.ctx.clearRect(0, 0, usedW, usedH);
        st.ctx.drawImage(be.canvas, 0, 0, usedW, usedH, 0, 0, usedW, usedH);
        src = c;
        this.stats.readPixels = usedW * usedH;
      } else {
        this.stats.readPixels = 0;
      }
      for (const inst of placed) inst._blit(src);
      if (mode === 'direct' && CONFIG.compositor === 'auto' && placed.length > 1) {
        // Adaptive: browsers that read back per drawImage() call get the staging path.
        const p = this.compProbe;
        const dt = now() - t0;
        p.ema = p.n ? p.ema * 0.8 + dt * 0.2 : dt;
        if (++p.n >= 8 && p.ema > 3) {
          this.autoComp = 'staging';
          this.emit('compositor', { compositor: 'staging', reason: 'direct copy took ' + p.ema.toFixed(1) + ' ms' });
        }
      }
    }

    getStats() {
      return {
        mode: this.mode,
        backend: this.backend ? this.backend.name : null,
        reason: this.reason,
        gpu: this.backend ? this.backend.gpuName : '',
        compositor: this.compositor(),
        fps: Math.round(this.stats.fps * 10) / 10,
        cpuMs: Math.round(this.stats.cpuMs * 100) / 100,
        panes: this.instances.length,
        rendered: this.stats.rendered,
        drawCalls: this.stats.drawCalls,
        uploads: this.stats.uploads,
        partialUploads: this.stats.partialUploads,
        renderScale: Math.round(this.fbScale * 100) / 100,
        atlas: [this.atlasW, this.atlasH],
      };
    }
  }

  const engine = new Engine();

  /* ------------------------------------------------------------------ */
  /* Public class                                                        */
  /* ------------------------------------------------------------------ */

  class RefractGL {
    /**
     * @param {HTMLElement|string} element existing DOM element (or selector)
     * @param {object} [options] see RefractGL.SCHEMA
     */
    constructor(element, options) {
      if (!hasDOM) throw new Error('RefractGL requires a DOM environment');
      const el = typeof element === 'string' ? document.querySelector(element) : element;
      if (!el || el.nodeType !== 1) throw new TypeError('RefractGL: element not found');
      if (el.__refractgl) el.__refractgl.dispose();
      this.el = el;
      this.opts = fullOptions(options);
      this._P = new Float32Array(36);
      this._tweens = [];
      this.disposed = false;
      this._attach();
    }

    _attach() {
      const el = this.el;
      engine.ensure();
      this._compile();
      el.__refractgl = this;
      el.classList.add('rgl-host');
      this._origPos = el.style.position;
      this._origRadius = el.style.borderRadius;
      this._radStyled = false;
      if (global.getComputedStyle(el).position === 'static') el.style.position = 'relative';
      const c = document.createElement('canvas');
      c.className = 'rgl-layer';
      c.setAttribute('aria-hidden', 'true');
      el.insertBefore(c, el.firstChild);
      this.canvas = c;
      this.ctx = c.getContext('2d');
      this._st = { key: '' };
      this._key = '';
      this._dirty = true;
      this._sizeDirty = true;
      this._version = 0;
      this._cw = 1; this._ch = 1; this._ow = 1; this._oh = 1; this._radius = 0;
      this._ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { this._sizeDirty = true; }) : null;
      if (this._ro) this._ro.observe(el);
      engine.add(this);
    }

    _detach() {
      engine.remove(this);
      if (this._ro) this._ro.disconnect();
      if (this.canvas) this.canvas.remove();
      const el = this.el;
      el.classList.remove('rgl-host');
      el.style.position = this._origPos;
      if (this._radStyled) { el.style.borderRadius = this._origRadius; this._radStyled = false; }
      if (el.__refractgl === this) delete el.__refractgl;
      this.canvas = null;
      this.ctx = null;
    }

    /** 'gpu' | 'pending' | 'unsupported' | 'idle' — shared by all instances. */
    get mode() { return engine.mode; }
    get element() { return this.el; }

    /** Pre-compute the per-instance shader parameters once per option change. */
    _compile() {
      const o = this.opts, P = this._P;
      const tint = parseColor(o.tint) || [1, 1, 1, 0];
      const lc = parseColor(o.lightColor) || [1, 1, 1, 1];
      P[0] = 0; P[1] = o.thickness; P[2] = o.bevelCurve; P[3] = o.zoom;
      P[4] = o.refraction; P[5] = o.ior; P[6] = o.dispersion; P[7] = o.blurFalloff;
      P[8] = o.blur; P[9] = o.edgeBlur; P[10] = o.shininess; P[11] = o.lightAngle * DEG;
      P[12] = o.saturation; P[13] = o.brightness; P[14] = o.contrast; P[15] = o.hue * DEG;
      P[16] = o.specular; P[17] = o.fresnel; P[18] = o.rim; P[19] = o.rimWidth;
      P[20] = o.innerShadow; P[21] = o.bounce; P[22] = o.opacity; P[23] = o.edgeGlow;
      P[24] = tint[0]; P[25] = tint[1]; P[26] = tint[2]; P[27] = tint[3];
      P[28] = lc[0]; P[29] = lc[1]; P[30] = lc[2]; P[31] = 1;
      P[32] = o.vibrancy; P[33] = o.adaptive; P[34] = o.edgeLine; P[35] = o.rimFocus;
    }

    _layout(fbS) {
      const el = this.el;
      const ow = el.offsetWidth || 0, oh = el.offsetHeight || 0;
      const cw = Math.max(1, Math.round(ow * fbS)), ch = Math.max(1, Math.round(oh * fbS));
      const c = this.canvas;
      if (c.width !== cw) c.width = cw;
      if (c.height !== ch) c.height = ch;
      const st = c.style;
      st.width = ow + 'px';
      st.height = oh + 'px';
      st.left = -el.clientLeft + 'px';
      st.top = -el.clientTop + 'px';
      let rad = this.opts.radius;
      if (typeof rad === 'number') {
        // A numeric radius reshapes the element too, so its CSS clipping and outline match the glass.
        const want = Math.max(0, rad) + 'px';
        if (el.style.borderRadius !== want) el.style.borderRadius = want;
        this._radStyled = true;
      } else {
        if (this._radStyled) { el.style.borderRadius = this._origRadius; this._radStyled = false; }
        // The glass has one radius: take the largest corner, so a pane with mixed corners is never
        // clipped by its own CSS. Elliptical corners ("10px 20px") use the first value.
        const cs = global.getComputedStyle(el);
        rad = 0;
        for (const v of [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius]) {
          const t = String(v || '0').trim().split(/\s+/)[0];
          const r = t.endsWith('%') ? (parseFloat(t) / 100) * Math.min(ow, oh) : parseFloat(t) || 0;
          if (r > rad) rad = r;
        }
      }
      this._radius = Math.max(0, rad);
      this._cw = cw; this._ch = ch; this._ow = Math.max(ow, 1); this._oh = Math.max(oh, 1);
      this._sizeDirty = false;
      this._version++;
    }

    _measure(vw, vh, fbS) {
      const el = this.el;
      if (!el.isConnected) return null;
      if (!(this.opts.opacity > 0)) {
        // Fully transparent: skip the pane and clear what it last showed.
        if (this._key) { this.ctx.clearRect(0, 0, this._cw, this._ch); this._key = ''; }
        return null;
      }
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return null;
      if (r.right <= 0 || r.bottom <= 0 || r.left >= vw || r.top >= vh) return null;
      if (el.checkVisibility && !el.checkVisibility(VIS_OPTS)) return null;
      if (this.canvas.parentNode !== el) {
        // host children were replaced (innerHTML / framework re-render): re-attach the layer
        el.insertBefore(this.canvas, el.firstChild);
        this._sizeDirty = true;
      }
      if (this._sizeDirty) this._layout(fbS);
      const CW = this._cw, CH = this._ch;
      const sx = CW / r.width, sy = CH / r.height;
      const i0 = clamp(Math.floor((Math.max(r.left, 0) - r.left) * sx), 0, CW);
      const i1 = clamp(Math.ceil((Math.min(r.right, vw) - r.left) * sx), 0, CW);
      const j0 = clamp(Math.floor((Math.max(r.top, 0) - r.top) * sy), 0, CH);
      const j1 = clamp(Math.ceil((Math.min(r.bottom, vh) - r.top) * sy), 0, CH);
      const w = i1 - i0, h = j1 - j0;
      if (w < 1 || h < 1) return null;
      const s = this._st;
      s.rect = r; s.i0 = i0; s.j0 = j0; s.w = w; s.h = h;
      s.key = r.left.toFixed(2) + ',' + r.top.toFixed(2) + ',' + r.width.toFixed(2) + ',' + r.height.toFixed(2) +
        ',' + i0 + ',' + j0 + ',' + w + ',' + h + ',' + this._version;
      return s;
    }

    _write(D, o) {
      const s = this._st, r = s.rect, P = this._P;
      const k = this._cw / this._ow;   // element px per layout CSS px
      D[o] = s.ax; D[o + 1] = s.ay; D[o + 2] = s.w; D[o + 3] = s.h;
      D[o + 4] = s.i0; D[o + 5] = s.j0; D[o + 6] = this._cw; D[o + 7] = this._ch;
      D[o + 8] = r.left; D[o + 9] = r.top; D[o + 10] = r.width; D[o + 11] = r.height;
      D[o + 12] = this._radius * k;
      D[o + 13] = P[1] * k;
      for (let i = 2; i < 36; i++) D[o + 12 + i] = P[i];
    }

    _blit(src) {
      const s = this._st, ctx = this.ctx;
      ctx.clearRect(0, 0, this._cw, this._ch);
      ctx.drawImage(src, s.ax, s.ay, s.w, s.h, s.i0, s.j0, s.w, s.h);
    }

    /** Update options on the fly. Unknown keys are ignored, numbers are clamped to the schema. */
    setOptions(partial) {
      if (this.disposed || !partial) return this;
      const warnings = CONFIG.debug ? [] : null;
      const v = validateOptions(partial, warnings);
      if (warnings && warnings.length) console.warn('[RefractGL] setOptions:', warnings.map((w) => w.message).join('; '));
      // An explicit setOptions() wins over a running animate() for the same keys.
      if (!this._tweening && this._tweens && this._tweens.length) {
        this._tweens = this._tweens.filter((tw) => {
          for (const k of Object.keys(v)) { delete tw.to[k]; delete tw.from[k]; }
          if (Object.keys(tw.to).length) return true;
          tw.done(false);
          return false;
        });
      }
      Object.assign(this.opts, v);
      if ('radius' in v) this._sizeDirty = true;
      this._compile();
      this._version++;
      this._dirty = true;
      return this;
    }

    /** Back to RefractGL.DEFAULTS (+ RefractGL.defaults overrides). */
    resetOptions() { return this.setOptions(fullOptions({})); }

    getOptions() { return Object.assign({}, this.opts); }

    /** Id of the built-in preset the current options match (shape keys ignored), or null. */
    get preset() { return RefractGL.matchPreset(this.opts); }

    /** Switch to a built-in preset. The shape (radius, thickness) is kept unless overridden. */
    applyPreset(name, overrides) {
      if (!PRESETS[name]) throw new RefractGLError('unknown-preset', 'Unknown preset "' + name + '"');
      return this.setOptions(Object.assign({ preset: name }, overrides));
    }

    /**
     * Tween numeric and colour options to new values (other keys switch at once).
     * Resolves true when finished, false when a newer animate() took over its keys or it was stopped.
     * With prefers-reduced-motion the values apply immediately unless opts.reducedMotion is 'ignore'.
     */
    animate(partial, opts) {
      if (this.disposed || !partial) return Promise.resolve(false);
      const o = opts || {};
      const v = validateOptions(partial);
      let dur = Math.max(0, Number(o.duration == null ? 300 : o.duration) || 0);
      if (o.reducedMotion !== 'ignore' && global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches) dur = 0;
      const ease = typeof o.easing === 'function' ? o.easing : EASINGS[o.easing] || EASINGS.out;
      const from = {}, to = {}, jump = {};
      for (const k of Object.keys(v)) {
        const spec = SCHEMA_MAP[k], a = this.opts[k], b = v[k];
        if (spec.type === 'color') {
          const ca = parseColor(a), cb = parseColor(b);
          if (ca && cb) { from[k] = ca; to[k] = cb; } else jump[k] = b;
        } else if (typeof a === 'number' && typeof b === 'number') { from[k] = a; to[k] = b; } else jump[k] = b;
      }
      const keys = Object.keys(to);
      // A newer animation owns its keys.
      this._tweens = this._tweens.filter((tw) => {
        for (const k of keys) { delete tw.to[k]; delete tw.from[k]; }
        if (Object.keys(tw.to).length) return true;
        tw.done(false);
        return false;
      });
      this._tweening = true;
      try {
        if (Object.keys(jump).length) this.setOptions(jump);
        if (keys.length && dur === 0) this.setOptions(v);
      } finally { this._tweening = false; }
      if (!keys.length || dur === 0) {
        return Promise.resolve(true);
      }
      return new Promise((resolve) => {
        this._tweens.push({ from, to, start: -1, dur, ease, done: resolve });
        engine.schedule();
      });
    }

    /** Stop running animate() tweens where they are. */
    stopAnimation() {
      const list = this._tweens;
      this._tweens = [];
      for (const tw of list) tw.done(false);
      return this;
    }

    _stepTweens(t) {
      const out = {}, finished = [];
      this._tweens = this._tweens.filter((tw) => {
        if (tw.start < 0) tw.start = t;
        const p = Math.min(1, Math.max(0, (t - tw.start) / tw.dur));
        const e = p >= 1 ? 1 : tw.ease(p);
        for (const k of Object.keys(tw.to)) {
          const a = tw.from[k], b = tw.to[k];
          if (Array.isArray(b)) {
            const c = a.map((x, i) => clamp(x + (b[i] - x) * e, 0, 1));
            out[k] = 'rgba(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ',' + +c[3].toFixed(3) + ')';
          } else out[k] = e === 1 ? b : a + (b - a) * e;
        }
        if (p >= 1) { finished.push(tw); return false; }
        return true;
      });
      this._tweening = true;
      try { this.setOptions(out); } finally { this._tweening = false; }
      for (const tw of finished) tw.done(true);
    }

    /** Plain, JSON-safe copy of every option. */
    toJSON() {
      const out = {};
      for (const s of SCHEMA) out[s.key] = this.opts[s.key];
      return out;
    }

    /** JSON document with this instance's options. */
    exportJSON(opts) { return RefractGL.exportJSON(this, opts); }

    /**
     * Apply options from a JSON document (string or parsed object).
     * Accepts { options }, a bare options object, or { presets } with `opts.preset` name.
     */
    importJSON(input, opts) {
      const doc = parseDoc(input);
      let options = doc.options;
      if (!options && doc.presets) {
        const names = Object.keys(doc.presets);
        const name = opts && opts.preset ? opts.preset : names.length === 1 ? names[0] : null;
        if (!name || !doc.presets[name]) throw new RefractGLError('preset-missing', 'Choose a preset: ' + names.join(', '));
        options = doc.presets[name];
      }
      if (options) this.setOptions(opts && opts.merge === false ? Object.assign(fullOptions({}), options) : options);
      return doc;
    }

    /** Re-measure size / border-radius (called automatically on resize). */
    refresh() { this._sizeDirty = true; this._dirty = true; return this; }

    /** Tear down and attach again, optionally with new options. */
    reinit(options) {
      if (this.disposed) this.disposed = false; else this._detach();
      if (options) Object.assign(this.opts, validateOptions(options));
      this._attach();
      return this;
    }

    /** Remove the effect and restore the element. */
    dispose() {
      if (this.disposed) return;
      this.stopAnimation();
      this._detach();
      this.disposed = true;
    }

    /* ---------------- static API ---------------- */

    static configure(cfg) {
      if (!cfg) return Object.assign({}, CONFIG);
      const warnings = [];
      const v = validateConfig(cfg, warnings, false);
      if (warnings.length) console.warn('[RefractGL] configure:', warnings.map((w) => w.message).join('; '));
      const backendChanged = 'backend' in v && v.backend !== CONFIG.backend;
      const powerChanged = 'powerPreference' in v && v.powerPreference !== CONFIG.powerPreference;
      Object.assign(CONFIG, v);
      if ('renderScale' in v || 'maxDpr' in v) for (const i of engine.instances) i._sizeDirty = true;
      if ('blurLevels' in v || 'backdropScale' in v || 'maxBackdropSize' in v) { engine.bd.dirty = true; engine.bd.dirtyRect = null; }
      if ('compositor' in v) { engine.compProbe.n = 0; if (v.compositor === 'auto') engine.autoComp = IS_GECKO ? 'staging' : 'direct'; }
      if (engine.started) {
        if (backendChanged || powerChanged || ('backend' in v && engine.mode === 'unsupported')) {
          engine.restarts = 0;
          if (v.backend !== 'webgl2') engine.webgpuBroken = false;   // explicit request: try again
          engine.start(CONFIG.backend);
        }
        if ('autoRender' in v) engine.schedule();
        engine.markAll();
      }
      return Object.assign({}, CONFIG);
    }

    static getConfig() { return Object.assign({}, CONFIG); }

    /**
     * Set the shared backdrop the glass refracts.
     * @param {HTMLCanvasElement|HTMLVideoElement|HTMLImageElement|ImageBitmap|OffscreenCanvas|string|null} source
     * @param {{dynamic?: boolean|'auto', rect?: 'element'|'viewport'|(() => DOMRectLike)}} [opts]
     */
    static setBackdrop(source, opts) {
      const src = typeof source === 'string' ? document.querySelector(source) : source;
      const bd = engine.bd;
      bd.source = src || null;
      bd.dynamic = opts && 'dynamic' in opts ? opts.dynamic : 'auto';
      bd.rect = (opts && opts.rect) || 'element';
      bd.cs = null;
      bd.dirty = true;
      bd.dirtyRect = null;
      bd.warned = false;
      engine.markAll();
    }

    /**
     * Mark a static backdrop as changed (re-upload on the next frame). Pass a rectangle in source
     * pixels ({ x, y, width, height }) when only that part changed: only it is uploaded. Several
     * calls before the next frame merge; a call without a rectangle always means a full upload.
     */
    static invalidateBackdrop(rect) {
      const bd = engine.bd;
      bd.cs = null;
      const ok = rect && [rect.x, rect.y, rect.width, rect.height].every((n) => typeof n === 'number' && isFinite(n));
      if (!ok || (bd.dirty && !bd.dirtyRect)) { bd.dirtyRect = null; bd.dirty = true; return; }
      if (!bd.dirty) bd.dirtyRect = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      else {
        const a = bd.dirtyRect, x0 = Math.min(a.x, rect.x), y0 = Math.min(a.y, rect.y);
        bd.dirtyRect = { x: x0, y: y0, width: Math.max(a.x + a.width, rect.x + rect.width) - x0, height: Math.max(a.y + a.height, rect.y + rect.height) - y0 };
      }
      bd.dirty = true;
    }

    /** Callback before each frame (paint your backdrop here). Returns an unsubscribe fn. */
    static onBeforeFrame(fn) {
      engine.hooks.add(fn);
      engine.ensure();
      engine.schedule();
      return () => engine.hooks.delete(fn);
    }

    /** Manual render (use with configure({ autoRender: false })). */
    static render(time) { engine.ensure(); engine.render(time); }

    static on(type, fn) { return engine.on(type, fn); }
    static off(type, fn) { engine.off(type, fn); }
    static getStats() { return engine.getStats(); }
    static get mode() { return engine.mode; }

    static isSupported() {
      let webgl2 = false;
      if (hasDOM) {
        try { webgl2 = !!global.WebGL2RenderingContext && !!document.createElement('canvas').getContext('webgl2'); } catch (e) { webgl2 = false; }
      }
      return { webgl2, webgpu: !!(global.navigator && navigator.gpu) };
    }

    /** Full material of a built-in preset (no radius / thickness) plus optional overrides. */
    static preset(name, overrides) {
      const base = presetValues(name);
      if (!base) throw new RefractGLError('unknown-preset', 'Unknown preset "' + name + '"');
      return Object.assign(base, validateOptions(overrides || {}));
    }

    /** Id of the built-in preset these options match (shape keys ignored), or null. */
    static matchPreset(options) {
      const o = Object.assign({}, DEFAULTS, validateOptions(options || {}));
      for (const p of PRESET_LIST) {
        const v = presetValues(p.id);
        if (Object.keys(v).every((k) => sameValue(SCHEMA_MAP[k], v[k], o[k]))) return p.id;
      }
      return null;
    }

    /** Validate a partial options object: { options, warnings }. */
    static validateOptions(input) {
      const warnings = [];
      return { options: validateOptions(input, warnings, ''), warnings };
    }

    /**
     * Serialize settings to the portable JSON format.
     * @param data instance | options object | { options?, presets?: { name: instance|options }, config? }
     */
    static exportJSON(data, opts) {
      const pretty = !opts || opts.pretty !== false;
      return JSON.stringify(exportDoc(data), null, pretty ? 2 : 0);
    }

    /** Parse + validate a settings document. Throws RefractGLError with `code`. */
    static parseJSON(input) { return parseDoc(input); }

    /** Create instances for every element matching a selector. */
    static from(selector, options) {
      const els = typeof selector === 'string' ? document.querySelectorAll(selector) : selector;
      return Array.prototype.map.call(els, (el) => new RefractGL(el, options));
    }

    static get instances() { return engine.instances.slice(); }
    static disposeAll() { engine.instances.slice().forEach((i) => i.dispose()); }
  }

  RefractGL.FORMAT = FORMAT;
  RefractGL.FORMAT_VERSION = FORMAT_VERSION;
  RefractGL.SCHEMA = SCHEMA;
  RefractGL.GROUPS = GROUPS;
  RefractGL.DEFAULTS = DEFAULTS;
  RefractGL.PRESETS = PRESETS;
  RefractGL.EASINGS = EASINGS;
  RefractGL.defaults = {};
  RefractGL.cssText = CSS_TEXT;
  RefractGL.Error = RefractGLError;
  RefractGL.parseColor = parseColor;

  return RefractGL;
});
