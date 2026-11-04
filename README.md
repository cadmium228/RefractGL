# RefractGL

<img width="359" height="535" src="github.com/cadmium228/RefractGL/blob/main/screenshot.png" />

RefractGL is shader-based "liquid glass" for ordinary DOM elements: refraction along a bevel profile, per-channel dispersion, blur that fades from rim to centre, specular highlights, Fresnel reflection and a rim light. Every glass element on the page is drawn by one WebGL2 context in a single draw call. WebGPU is available as an option. No dependencies, MIT licence.

```html
<script src="refractgl.js"></script>
<script>
  RefractGL.setBackdrop(document.querySelector('img.wallpaper'));
  new RefractGL('#toolbar', { preset: 'ios' });
  new RefractGL('#sidebar', { preset: 'frosted', blur: 30 });
</script>
```

## Files

| File | Contents |
|---|---|
| `refractgl.js` | The library: global `window.RefractGL` and CommonJS |
| `refractgl.mjs` | Wrapper for `import RefractGL from './refractgl.mjs'` |
| `refractgl.d.ts` | TypeScript types |
| `package.json` | For npm and bundlers: `main`, `module`, `types`, `exports` |
| `demo.html` | Demo and settings playground |
| `README.md` | This file |
| `LICENSE` | MIT licence |

## Quick start

### `<script>` tag

```html
<img class="wallpaper" src="photo.jpg" crossorigin="anonymous" alt="">
<nav class="toolbar">…</nav>

<script src="refractgl.js"></script>
<script>
  RefractGL.setBackdrop(document.querySelector('.wallpaper'));
  const glass = new RefractGL('.toolbar', { thickness: 20, blur: 6 });
</script>
```

The glass element needs a transparent background: the glass layer sits underneath its content.

### ES modules and bundlers

```js
import RefractGL from './refractgl.mjs';
// or: const RefractGL = require('./refractgl.js');
```

The folder can be installed as a package (`npm install ./refractgl` or through a workspace): `package.json` exposes `refractgl.js` for `require`, `refractgl.mjs` for `import` and the types, so both `import RefractGL from 'refractgl'` and `require('refractgl')` work. The package is marked `"sideEffects": false`; the ES wrapper imports the library with a binding, so a bundler will not drop it.

### Running the demo

Open `demo.html` in a browser; no server is needed. The photos load from Unsplash; offline, use the "Upload your photo" button.

## How it works

```
 backdrop (img / video / canvas)
     │  uploaded only when it changes
     ▼
 texture + blur mip pyramid, shared by all panes
     │
     ▼
 dense atlas: panes that changed are packed side by side
     │  one instanced draw call per frame (48 floats per pane)
     ▼
 copy into a <canvas class="rgl-layer"> inside each element
     │  direct: a copy from the WebGL canvas for each pane
     │  staging: one GPU readback per frame, then 2D copies
     ▼
 the DOM stays real: clicks, focus, hover, accessibility, z-index, transform
```

* **The layer lives inside the element.** The glass is a child `<canvas>`, so it follows scrolling, `position: fixed/sticky` and `transform` animations, and stacks correctly with other elements. The host gets the `rgl-host` class (`isolation: isolate`) and `position: relative` if it was `static`.
* **One GPU context per page**, one backdrop texture, one draw call, however many panes there are.
* **Redraw on change only.** A pane is redrawn only when its position, size, options or backdrop change. At rest a frame costs about 0.1 ms of CPU and does not touch the GPU. A pane with `opacity: 0` is not drawn at all and its layer is cleared.
* **A smooth outline without a CSS clip.** The edge is computed in the shader: pixel coverage is the exact fraction of the pixel's area inside the rounded rectangle, and in the band near the edge (rim, contour line, highlight) the shader averages four rotated-grid samples. A 1 px rim weighs the same on straight runs and on corners, with no beading or stair steps. Against a 4× supersampled reference, the RMS error on the outline of the `ios` preset is 0.45 levels of 255 at DPR 1 (max 3.6) and 0.23 at DPR 2. A CSS `border-radius` clip with one sample per pixel gives 6.7 and 4.7.

## API

### `new RefractGL(element, options?)`

`element`: an element or a CSS selector. Calling it again on the same element replaces the previous instance.

| Method | What it does |
|---|---|
| `setOptions(partial)` | Changes some options. Values are validated and clamped to range. Returns `this` |
| `getOptions()` | All current options |
| `resetOptions()` | Back to `RefractGL.DEFAULTS`, taking `RefractGL.defaults` into account |
| `applyPreset(name, overrides?)` | Applies a material preset without touching the shape. An unknown name throws `RefractGL.Error` with code `unknown-preset`. Returns `this` |
| `preset` | Name of the preset the current options match, or `null` (read-only) |
| `animate(partial, { duration, easing, reducedMotion })` | Changes options smoothly. Returns `Promise<boolean>` |
| `stopAnimation()` | Stops the animation at the current values. Returns `this` |
| `toJSON()` | Options as a plain object (works with `JSON.stringify(glass)`) |
| `exportJSON({ pretty })` | A `.json` document with the element's options |
| `importJSON(input, { preset, merge })` | Applies a `.json` document and returns the parsed document |
| `refresh()` | Re-read size and `border-radius` (done automatically on resize) |
| `reinit(options?)` | Detach and re-attach the layer |
| `dispose()` | Remove the layer and restore the element |

### Element options

Defaults live in `RefractGL.DEFAULTS`. Shared overrides for new instances: `RefractGL.defaults.blur = 10`.

**Shape**

| Option | Default | Range | What it does |
|---|---|---|---|
| `radius` | `'auto'` | `'auto'` or 0…400 px | Corner radius. `'auto'` takes `border-radius` from CSS: the glass has a single radius, so the largest of the four corners is used (percentages are relative to the shorter side; for elliptical corners the first value is used). A number also sets the host's `border-radius`, so text, focus ring and shadow match the glass |
| `thickness` | `24` | 0…120 px | Bevel width: the band near the edge where the surface curves and refracts |
| `bevelCurve` | `4` | 1…8 | Bevel profile: 1 is a straight chamfer, 2 an arc, 4 and above a flat centre with a steep edge |

**Optics**

| Option | Default | Range | What it does |
|---|---|---|---|
| `refraction` | `1` | −3…3 | Multiplier of the refraction offset. 0 gives flat glass. Above zero, the rim shows the backdrop from inside the element, stretched towards the edge. Below zero, it shows the backdrop from outside, pressed against the edge, as iOS glass does |
| `ior` | `1.5` | 1…2.5 | Index of refraction (glass is about 1.5, water 1.33) |
| `dispersion` | `0.35` | 0…1 | Chromatic dispersion: a different index of refraction for R, G and B |
| `zoom` | `1` | 0.5…2 | Magnification of the backdrop under the glass (above 1 gives a magnifier) |

**Blur**

| Option | Default | Range | What it does |
|---|---|---|---|
| `blur` | `6` | 0…64 px | Blur in the flat centre |
| `edgeBlur` | `1.5` | 0…64 px | Blur on the bevel. `edgeBlur < blur` gives a sharp lens at the rim and a frosted centre |
| `blurFalloff` | `1.5` | 0.25…4 | Width of the rim-to-centre transition, in bevel widths |

**Colour**

| Option | Default | Range | What it does |
|---|---|---|---|
| `tint` | `'rgba(255,255,255,0.08)'` | CSS colour or `[r, g, b, a]` | Tint. The alpha sets the density |
| `saturation` | `1.25` | 0…3 | Saturation of the backdrop under the glass |
| `brightness` | `1.03` | 0…2 | Brightness (for panes over a dark backdrop try 0.6–0.9) |
| `contrast` | `1` | 0…2 | Contrast of the backdrop under the glass |
| `hue` | `0` | −180…180° | Hue shift |
| `opacity` | `1` | 0…1 | Opacity of the whole glass layer. At `0` the pane is not drawn and costs no GPU time |
| `vibrancy` | `0` | 0…1 | Vibrancy: the tint changes only lightness and the backdrop keeps its colour |
| `adaptive` | `0` | 0…1 | Adaptive tone: the tint lightens over a light backdrop and darkens over a dark one (like the Tinted mode in iOS) |

**Light**

| Option | Default | Range | What it does |
|---|---|---|---|
| `specular` | `0.9` | 0…2 | Strength of the key highlight |
| `shininess` | `60` | 8…256 | Highlight sharpness: higher means smaller and sharper |
| `lightAngle` | `125` | 0…360° | Direction to the light: 0° is right, 90° is up |
| `lightColor` | `'#ffffff'` | CSS colour | Colour of highlights, rim and reflection |
| `bounce` | `0.4` | 0…1 | Bounce highlight on the opposite side |
| `fresnel` | `0.8` | 0…2 | Fresnel reflection on the bevels |
| `rim` | `0.5` | 0…2 | Rim light brightness |
| `rimWidth` | `1.1` | 0.5…6 px | Rim width |
| `rimFocus` | `0.78` | 0…1 | Rim directionality: 0 glows along the whole outline, 1 only on the light side |
| `edgeLine` | `0` | 0…1 | A thin dark line on the very edge, like tinted iOS glass |
| `edgeGlow` | `0` | 0…1 | A soft light band about 4 px wide along the inside of the outline |
| `innerShadow` | `0.07` | 0…1 | Darkening near the edge for depth |

Colours accept `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()`, `hsl()`, named colours and an `[r, g, b, a]` array (0–1 or 0–255).

Invalid values never break rendering: a number out of range is clamped, a non-numeric value or an unknown key is ignored. To see warnings in the console, enable `RefractGL.configure({ debug: true })`; to check values without applying them, use `RefractGL.validateOptions(obj)`, which returns `{ options, warnings }`.

### Material presets

A preset defines the whole material: every option except the shape (`radius`, `thickness`). Options the preset does not name explicitly come from `RefractGL.DEFAULTS`, so switching from `lens` to `ios` also resets `zoom` to 1. Full values: `RefractGL.PRESETS.ios.options`.

| `id` | Name | Description | `blur` | `edgeBlur` | `refraction` | `dispersion` | `zoom` | `tint` |
|---|---|---|---|---|---|---|---|---|
| `ios` | iOS Liquid Glass | iOS 26 Liquid Glass: a clear lens with a light milky haze and slight magnification; at the rim the backdrop from outside is pressed against the edge, and the edge glows softly. Works best with a 14–18 px bevel. | 0.9 | 2.5 | -2.6 | 0.05 | 1.2 | `rgba(255,255,255,0.2)` |
| `iosClear` | iOS Clear | The Clear variant from iOS 26: almost no haze or blur, the backdrop shows through fully; edge and rim as on regular iOS glass. | 0.5 | 1.5 | -2.8 | 0.08 | 1.15 | `rgba(255,255,255,0.07)` |
| `iosTinted` | iOS Tinted | The Tinted mode from iOS 26.1: denser and more contrasty than regular glass; the base lightens over a light backdrop and darkens over a dark one. | 4 | 6 | -2 | 0.05 | 1.1 | `rgba(128,128,128,0.45)` |
| `frosted` | Frosted Glass | Frosted glass with a live lens at the rim: a blurred centre, crisp refraction at the edge, the backdrop keeps its colour. | 22 | 3 | 0.8 | 0.1 | 1 | `rgba(255,255,255,0.18)` |
| `visionos` | visionOS Glass | The grey glass of visionOS windows: heavy blur, muted contrast, a light rim on top and a glow along the edge. | 36 | 4 | 0.5 | 0 | 1 | `rgba(110,110,118,0.38)` |
| `smoked` | Smoked Glass | Darkened glass: the backdrop is muted but keeps its colour; a crisp lens at the rim and soft highlights. | 14 | 2.5 | 1 | 0.25 | 1 | `rgba(12,12,16,0.55)` |
| `ice` | Ice | Cool bluish glass: moderate blur, a bright rim, dispersion at the edge. | 9 | 1.5 | 1.1 | 0.35 | 1 | `rgba(205,232,255,0.22)` |
| `crystal` | Crystal | Clear glass with maximum dispersion: a rainbow fringe along the edge. | 0 | 0 | 1.6 | 1 | 1 | `rgba(255,255,255,0.02)` |
| `lens` | Magnifier | A magnifying lens: the centre enlarges the backdrop 1.5 times. | 0 | 0.5 | 1.3 | 0.25 | 1.5 | `rgba(255,255,255,0.03)` |
| `bubble` | Bubble | A thin sphere: a rounded profile, strong dispersion and a bright highlight. | 0 | 0 | 1.8 | 0.8 | 0.9 | `rgba(255,255,255,0)` |

```js
// on creation: explicit options win over the preset
const glass = new RefractGL('#card', { preset: 'frosted', radius: 24, blur: 30 });

glass.applyPreset('smoked');                     // change the material, radius 24 is kept
glass.applyPreset('lens', { zoom: 2 });          // a preset with overrides
glass.preset;                                    // 'smoked', 'lens', or null after manual changes

RefractGL.preset('ice', { blur: 10 });           // an options object, not applied
RefractGL.matchPreset(glass.getOptions());       // same as glass.preset
RefractGL.PRESETS.ios.label;                     // 'iOS Liquid Glass'
```

`RefractGL.PRESETS` is frozen. Each preset is `{ id, label, name, description, options }`: `label` and `description` are display text for a UI (replace them to localise it), `name` is the stable English name. The `preset` key works wherever options are accepted: in the constructor, `setOptions`, `animate`, `RefractGL.defaults` and the `options` block of a `.json` file. An unknown name in options does not break rendering: the key is skipped with an `invalid` warning.

Do not confuse this with the `presets` block of a `.json` file (see "Saving and loading settings"): that block stores your own named sets of settings, not the built-in presets.

### How the iOS presets were matched

Apple does not publish Liquid Glass parameters, so the preset was fitted to an image rather than copied from the system. The reference for `ios` is an image of a glass circle 156 px across over a brick wall. The backdrop under the circle was reconstructed from the neighbouring rows of bricks; RefractGL then drew a circle of the same size with a 16 px bevel over that backdrop, and the parameters were tuned until the mean colour inside the circle, saturation, detail contrast and sharpness, and the brightness profile across the edge matched. The edge was decisive: in the reference, the backdrop from outside is pressed against the rim and bent along it, while a positive `refraction` pulls the backdrop from inside towards the edge and produces radial streaks. That is why the iOS presets use a negative `refraction`. The preset does not set the shape; the bevel width for iOS is about 14–18 px (a wider band takes up too much of the element), so choose `thickness` yourself.

| Inside the circle | Reference | `ios` |
|---|---|---|
| Mean colour, RGB | 119.7, 92.3, 83.4 | 119.2, 92.2, 84.3 |
| Saturation | 0.285 | 0.284 |
| Detail contrast (SD of luminance, 0…255) | 28.4 | 27.5 |
| Sharpness (mean luminance step between neighbouring pixels) | 2.30 | 2.26 |

What matches: the backdrop is visible and slightly magnified, a light milky haze, about 1 px of blur, the backdrop from outside pressed against the rim, a soft light glow and a thin rim along the outline, no shadow. A per-pixel match is impossible because the backdrop under the reference circle is only an approximation. What the library does not have: the system adaptation for text that iOS applies to buttons and labelled bars. In the demo, a neutral contrast layer stands in for it (see "Demo"). `iosClear` and `iosTinted` have no references of their own and are derived from `ios`: the first with less haze and blur, the second denser, more contrasty and with an adaptive base, as Apple describes them.

### Animating options

```js
await glass.animate({ refraction: 1.4, tint: 'rgba(255,255,255,.3)' }, { duration: 300, easing: 'out' });
glass.animate({ preset: 'iosTinted' }, { duration: 400 });           // transition between presets
glass.animate({ zoom: 1.3 }, { easing: (t) => t * t });              // custom easing function
glass.stopAnimation();
```

| Parameter | Default | What it does |
|---|---|---|
| `duration` | `300` | Duration in milliseconds. `0` applies at once |
| `easing` | `'out'` | `'linear'`, `'in'`, `'out'`, `'inOut'`, `'spring'` or a function `t → t` on 0…1. The functions are available as `RefractGL.EASINGS` |
| `reducedMotion` | `'reduce'` | `'reduce'`: under `prefers-reduced-motion` values apply at once. `'ignore'`: always animate |

* Numbers and colours change smoothly. Values that cannot be blended (an unrecognised colour, for example) apply at once.
* The promise resolves to `true` when the animation reaches its end, and to `false` if a newer `animate()` took over its keys, or `stopAnimation()` or `dispose()` was called. A new call takes over only its own keys: `animate({ blur })` does not interrupt a running `refraction` animation.
* During an animation `getOptions()` returns the intermediate values. `setOptions()` on a key that is animating stops the animation of that key.
* Animation is computed in the same frame as rendering; there is no separate `requestAnimationFrame`.

### Schema for your own UI

`RefractGL.SCHEMA` describes every option: `key`, `group`, `type` (`number`, `length`, `color`), `default`, `min`, `max`, `step`, `unit`, a display `label`, the English `name` and a `hint`. `RefractGL.GROUPS` lists the groups in display order. The demo's settings panel is built entirely from the schema:

```js
for (const spec of RefractGL.SCHEMA) {
  if (spec.type !== 'number') continue;
  const input = Object.assign(document.createElement('input'), {
    type: 'range', min: spec.min, max: spec.max, step: spec.step, value: glass.getOptions()[spec.key],
  });
  input.addEventListener('input', () => glass.setOptions({ [spec.key]: +input.value }));
  panel.append(spec.label, input);
}
```

### Static methods

| Method | What it does |
|---|---|
| `RefractGL.configure(config)` | Render settings (table below). Returns the resulting config |
| `RefractGL.getConfig()` | Current config |
| `RefractGL.setBackdrop(source, { dynamic, rect })` | Backdrop source for all panes |
| `RefractGL.invalidateBackdrop(rect?)` | Re-upload a static backdrop on the next frame. With `rect` (`{ x, y, width, height }` in source pixels) only that part is uploaded; calls before the frame are merged |
| `RefractGL.onBeforeFrame(fn)` | Callback before every frame; returns an unsubscribe function |
| `RefractGL.render(time?)` | Manual frame with `autoRender: false` |
| `RefractGL.on(type, fn)` / `off` | Events `mode`, `stats`, `compositor`. `on` returns an unsubscribe function |
| `RefractGL.getStats()` | FPS, CPU per frame, draw calls, mode, copy method, GPU name |
| `RefractGL.isSupported()` | `{ webgl2, webgpu }` |
| `RefractGL.mode` | `'idle'`, `'pending'`, `'gpu'` or `'unsupported'` |
| `RefractGL.exportJSON(data, { pretty })` | A `.json` string from an instance, an options object or `{ options, presets, config }` |
| `RefractGL.parseJSON(input)` | Validates and parses `.json`; throws `RefractGL.Error` |
| `RefractGL.validateOptions(obj)` | `{ options, warnings }` without applying |
| `RefractGL.PRESETS` | Built-in material presets (see "Material presets") |
| `RefractGL.preset(name, overrides?)` | The preset's options object with overrides. An unknown name throws `unknown-preset` |
| `RefractGL.matchPreset(options)` | Name of the preset the options match, or `null`. Shape is ignored |
| `RefractGL.EASINGS` | Easing functions for `animate()` |
| `RefractGL.parseColor(css)` | `[r, g, b, a]` in 0–1, or `null` |
| `RefractGL.from(selector, options)` | An instance for every matching element |
| `RefractGL.instances` / `disposeAll()` | All instances, and disposing of all of them |

### Render settings: `RefractGL.configure({...})`

| Key | Default | What it does |
|---|---|---|
| `backend` | `'webgl2'` | `'webgl2'`, `'webgpu'` or `'auto'` (WebGPU first, WebGL2 on failure) |
| `compositor` | `'auto'` | How finished panes are copied into the page: `'direct'`, `'staging'` or `'auto'`. See "Firefox and performance" |
| `renderScale` | `1` | Fraction of devicePixelRatio, 0.25–2. The library never changes it on its own |
| `maxDpr` | `2` | Upper DPR limit, 0.5–4 |
| `backdropScale` | `1` | Upload scale of the backdrop, 0.1–1. 0.5 is sensible for animated canvases and video |
| `maxBackdropSize` | `4096` | Maximum side of the backdrop texture |
| `blurLevels` | `8` | Levels of the blur pyramid, 1–12 |
| `webgpuTimeout` | `4000` | How long to wait for a WebGPU adapter, ms |
| `powerPreference` | `'high-performance'` | Which GPU to ask the browser for: `'high-performance'` (discrete), `'low-power'` (integrated, saves laptop battery) or `'default'` (the browser decides). Passed to `getContext('webgl2')` and to WebGPU `requestAdapter()`, which gets no key for `'default'`. Takes effect when a context is created: changing it on a running page re-creates the renderer. The browser may ignore the hint |
| `autoRender` | `true` | `false`: you call frames yourself with `RefractGL.render()` |
| `statsInterval` | `1000` | Period of the `stats` event, ms |
| `injectStyles` | `true` | Insert the library's `<style>`. With `false`, put `RefractGL.cssText` into your own CSS |
| `nonce` | `null` | CSP nonce for the inserted `<style>` |
| `debug` | `false` | Console warnings about invalid options |

### Events

```js
RefractGL.on('mode', ({ mode, backend, reason, previous }) => { /* 'gpu' | 'unsupported' | … */ });
RefractGL.on('stats', (s) => console.log(s.fps, s.cpuMs, s.compositor, s.gpu));
RefractGL.on('compositor', ({ compositor, reason }) => { /* auto mode switched to 'staging' */ });
```

## Saving and loading settings (.json)

### Format

```json
{
  "format": "refractgl",
  "version": 2,
  "presets": {
    "command": { "radius": "auto", "thickness": 18, "blur": 3, "dispersion": 0.5, "tint": "rgba(255,255,255,0.1)" },
    "dock":    { "radius": "auto", "thickness": 22, "blur": 8, "brightness": 0.95 }
  },
  "config": { "backend": "webgl2", "compositor": "auto", "renderScale": 1, "maxDpr": 2 }
}
```

* `options`: settings of one element. `presets`: named sets. `config`: portable render settings (`backend`, `compositor`, `renderScale`, `maxDpr`). Any of the three blocks can be omitted.
* `version` is the version of the file format (`RefractGL.FORMAT_VERSION`), not of the library.
* A bare options object without the wrapper is accepted too: `{ "blur": 4, "tint": "#ffffff22" }`.
* Exporting an instance writes all 25 options, so the file does not depend on default values that may change later. An options object is exported as is, validated keys only.

### API

```js
// One element
const json = glass.exportJSON();                 // { format, version, options }
glass.importJSON(json);                          // merge with the current options
glass.importJSON(json, { merge: false });        // reset everything missing from the file to defaults

// Several elements and render settings
const file = RefractGL.exportJSON({
  presets: { toolbar: toolbarGlass, card: cardGlass },   // instances or options objects
  config: RefractGL.getConfig(),                       // only portable keys go into the file
});
const doc = RefractGL.parseJSON(await blob.text());
toolbarGlass.setOptions(doc.presets.toolbar);
if (doc.config) RefractGL.configure(doc.config);
cardGlass.importJSON(doc, { preset: 'card' });         // pick a preset by name

// Download
const a = Object.assign(document.createElement('a'), {
  href: URL.createObjectURL(new Blob([file], { type: 'application/json' })),
  download: 'refractgl-settings.json',
});
a.click();
```

### Errors and warnings

`parseJSON` and `importJSON` throw `RefractGL.Error` with a `code` field:

| `code` | When |
|---|---|
| `invalid-json` | The text does not parse as JSON |
| `invalid-format` | Not an object, a foreign `format` or an invalid `version` |
| `unsupported-version` | The file uses a newer version of the format |
| `empty` | The file has no known settings |
| `preset-missing` | `importJSON` on a file with several presets without `{ preset }`, or with a name that does not exist |
| `unknown-preset` | `applyPreset(name)` or `RefractGL.preset(name)` with a name missing from `RefractGL.PRESETS` |

Everything that can be saved is applied. The rest is described in `doc.warnings`: an array of `{ key, code, message }`, where `code` is `clamped` (value clamped to range), `invalid` (wrong type) or `unknown` (unknown key).

## Backdrop source

The shader refracts the pixels of a source, not arbitrary DOM: the web has no API that hands a shader the pixels under an element. So the backdrop is set explicitly.

```js
// An image. Another origin needs crossorigin="anonymous" and CORS headers
RefractGL.setBackdrop(document.querySelector('img.wallpaper'));

// Video: re-uploaded every frame while it plays
RefractGL.setBackdrop(document.querySelector('video.bg'));

// A canvas you redraw rarely (static by default)
RefractGL.setBackdrop(sceneCanvas);
drawScene(); RefractGL.invalidateBackdrop();

// A canvas animated every frame
RefractGL.configure({ backdropScale: 0.5 });     // a quarter of the pixels per upload
RefractGL.setBackdrop(sceneCanvas, { dynamic: true });

// Where the backdrop sits on screen: the box of the source element (default, honours object-fit),
// the whole viewport, or your own function
RefractGL.setBackdrop(shotCanvas, { rect: () => content.getBoundingClientRect() });
```

A DOM snapshot (html-to-image, modern-screenshot) works as a source too: capture the content once and pass `rect`, so the glass moves over it as the page scrolls.

## Firefox and performance

### What is taken care of

On every `drawImage(webglCanvas)` Firefox reads the whole WebGL buffer back from video memory. Copying each pane straight from the WebGL canvas means 10 full readbacks per frame for 10 panes: about 200 ms, against 26 ms for a single readback. A full upload of a 1440×900 backdrop to a texture costs about 15 ms in Firefox. Therefore:

* **The `staging` copy mode.** The finished frame is read from video memory once into a helper 2D canvas, and panes are copied from there. With `compositor: 'auto'` it is enabled in Firefox right away. Other browsers use `direct`, but if copying consistently takes longer than 3 ms per frame, the mode switches to `staging` and a `compositor` event fires. Quality is the same.
* **A dense atlas.** Changed panes are packed side by side; the atlas grows at once and shrinks with a delay. Only the occupied area is read back.
* **The backdrop is uploaded only when it changes.** A canvas is static by default; a video updates while it plays.
* **Fewer samples in the flat part.** In the centre of a pane, where there is no refraction, dispersion takes one set of samples instead of three.
* **No automatic degradation.** The library never lowers `renderScale`, turns off dispersion or falls back to CSS on its own. If a device struggles, reduce the load explicitly: `renderScale`, `maxDpr`, `backdropScale`.

### Measurements

Environment: a virtual machine without a GPU, Firefox on software OpenGL (llvmpipe), a 1440×900 window, DPR 1, an earlier layout of the demo with 7 glass panes (the current demo has 11: the hero card, two header capsules and the autoplay button were added). Software rendering is many times slower than a real GPU, so the ratios matter more than the absolute numbers.

| Scenario | Firefox |
|---|---|
| Demo at rest | 59.0–59.3 FPS, 0.03–0.09 ms CPU per frame |
| Playground, pointer moving over the tab bar | 55.9–56.6 FPS |
| Playground, dragging the lens | 59.0 FPS |
| Scrolling the first screen (static backdrop, text contrast on glass recomputed every frame) | 52.6–54.1 FPS |
| Copying 12 panes into the page per frame | `direct` 17.1 ms, `staging` 3.4 ms |

**Photo changes in the demo.** A transition frame redraws the visible part of the backdrop and every pane above it, so it costs as much as redrawing every pane in the scene. Both photos are pre-rendered at backdrop size, so the backdrop itself is two plain unscaled copies per frame. Measured in Chromium on SwiftShader software rendering (no GPU, 1440×900, DPR 1): scrolling the first screen at 60 FPS, dragging the lens at 20 FPS, a transition frame takes 50–130 ms (8–20 FPS, varying between runs). At 390×844 the lens runs at 60 FPS and a transition frame takes 67–83 ms (12–15 FPS). A full autoplay cycle has no long tasks (over 50 ms) on the main thread: the next photo is prepared in slices of at most 10 ms. The transition is time-based: on slow graphics it still lasts 0.7 s, with fewer steps. The photo transition was not measured in Firefox.

### Recommendations

1. Keep the backdrop small: up to 1920 px on the long side. The glass blurs it anyway.
2. Animated canvas: `dynamic: true` and `backdropScale: 0.5`, or call `invalidateBackdrop()` only when the scene really changed.
3. On weak graphics: `renderScale: 0.75` or `maxDpr: 1.5`.
4. Large panes with a strong `blur` over video are the most expensive case: a frame upload and a blur pyramid every frame.

## Without WebGL2

There is no fallback. If a context cannot be created, `RefractGL.mode` becomes `'unsupported'`, the elements stay as your CSS made them, and nothing is drawn in the layer. To check in advance and show your own message:

```js
if (!RefractGL.isSupported().webgl2) showNotice('Turn on hardware acceleration');
RefractGL.on('mode', ({ mode }) => { if (mode === 'unsupported') showNotice('Glass is unavailable'); });
```

Context loss (laptop sleep, driver reset) is handled: the last frame stays on screen and the renderer is re-created. A renderer that has run for 5 seconds counts as started successfully and the failure counter resets, so rare losses over a long session do not add up. If failures come in a row (each new renderer fails within 5 seconds), the mode becomes `'unsupported'` after 6 attempts. If WebGPU fails, the library switches to WebGL2.

In `forced-colors: active` (Windows high contrast) the glass layer is hidden: the system enforces its own colours, and an image under the text works against them.

## Limitations

* **Only the backdrop source is refracted.** The shader does not see elements between the backdrop and the glass unless you pass a snapshot of them.
* **Glass over glass** refracts the backdrop, not the glass below.
* **Transforms:** translation and scale are supported, rotation and perspective are not (the backdrop is taken by the axis-aligned box).
* **The host background must be transparent**, or it covers the glass layer.
* **The child `<canvas class="rgl-layer">`** is inserted as the host's first child. Keep this in mind for `:first-child` and `:empty` selectors, and change the host's text inside a nested `<span>`.
* **Cross-origin sources** without CORS cannot be uploaded to a texture: there is one console warning and a neutral placeholder.
* **WebGPU** is enabled only explicitly (`backend: 'webgpu'` or `'auto'`).
* **Text on glass.** The library does not change text colour or add a base under it: clear glass over a busy photo may not give enough contrast. In the demo, the `paneLook()` function does this: it measures the backdrop under the text, sets `data-tone="light"` or `"dark"` (CSS switches the text colour), and when contrast falls short adds the weakest neutral layer to the tint at which the text passes WCAG.

## Integration

One rule: create after mounting, call `dispose()` on unmount.

### React

```jsx
import { useEffect, useRef } from 'react';
import RefractGL from './refractgl.mjs';

export function useRefractGL(options) {
  const ref = useRef(null);
  const glass = useRef(null);
  useEffect(() => {
    glass.current = new RefractGL(ref.current, options);
    return () => { glass.current.dispose(); glass.current = null; };
  }, []);
  useEffect(() => { glass.current?.setOptions(options); });
  return ref;
}
```

React 18 StrictMode mounts effects twice. That is safe: `dispose()` fully reverts the changes.

### Vue 3

```vue
<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import RefractGL from './refractgl.mjs';
const props = defineProps({ blur: { type: Number, default: 6 } });
const el = ref(null); let glass;
onMounted(() => { glass = new RefractGL(el.value, { blur: props.blur }); });
watch(() => props.blur, (blur) => glass?.setOptions({ blur }));
onBeforeUnmount(() => glass?.dispose());
</script>
<template><div ref="el" class="glass-card"><slot /></div></template>
```

Svelte: an action with `update` and `destroy`. Angular: a directive with `ngAfterViewInit` and `ngOnDestroy`. Web Components: `connectedCallback` and `disconnectedCallback`. With SSR (Next.js, Nuxt), import the library on the client only.

### Tauri and Electron

* **Tauri** uses the system WebView: WebView2 on Windows, WKWebView on macOS, WebKitGTK on Linux. WebGL2 is available everywhere; WebKit has no WebGPU yet, so keep `backend: 'webgl2'`. Hardware acceleration is sometimes off on WebKitGTK; the mode is then `'unsupported'`.
* **CSP:** either `RefractGL.configure({ nonce })`, or `injectStyles: false` with `RefractGL.cssText` in your CSS. For backdrops from `asset://`, allow `img-src asset: http://asset.localhost`.
* **Electron:** WebGL2 is always available, WebGPU in recent versions (`backend: 'auto'`). Do not call `app.disableHardwareAcceleration()`.
* **A transparent window** will not refract the desktop: a WebView cannot see the pixels under the window. That takes a system window effect (Mica, Acrylic, vibrancy); RefractGL works over your own backdrop inside the window.

## Demo

* **The first-screen photo is at full brightness:** no dimming, gradients or shadows under the text. The title and lead sit on a glass card, and the logo and header links on glass capsules. The trade-off: the card covers the middle of the picture, while the photo around it shows as is. Once the page scrolls, the header turns solid and the capsules fade out.
* **The code field and the dock** are glass and refract the photo. The dock has four Unsplash photos, an upload button for your own photo and photo credits. A picked photo crossfades in (360 ms).
* **The Playground** (header link, or scroll down) shows glass in motion:
  * **The lens** can be dragged with a mouse, a finger or the arrow keys (Shift takes bigger steps). Its material is chosen above the stage: Magnifier, iOS, iOS Clear, Frosted, Ice, Crystal (arrow keys switch). Its position is stored as a fraction of the stage and survives window resizes.
  * **The tab bar** has a liquid lens indicator: it follows the pointer on a spring, stretches with speed, turns clear while moving and then settles on the selected tab. Keyboard: arrow keys, Home, End.
  * **Photos change on their own:** while the Playground is on screen, the four photos take turns, 5 s each, with a 0.7 s transition. The button at the top right of the stage pauses and resumes (resuming shows the next photo at once). With `prefers-reduced-motion` or data saving (Save-Data) it starts paused, and the transition shortens to 180 ms. It waits while the Playground is off screen or the tab is hidden, and stops when you upload your own photo. Picking a photo in the dock restarts the countdown. The next photo is loaded ahead and decoded off the main thread (`createImageBitmap`), and its brightness for text contrast is computed in idle slices, so the change creates no long tasks on the main thread.
* **Text on glass adapts to the backdrop,** as in iOS: dark over a light part of the photo, light over a dark one. If the glass is too clear for text over a busy area, the demo adds the weakest neutral layer to the tint at which the text passes WCAG over the brightest (or darkest) pixel under it. This applies to the hero card and the header capsules alike. During a photo change, the check covers both pictures at once, so text stays readable mid-transition. For adaptive presets the base is fixed to a light or dark grey so contrast does not drift. The Playground lens carries no text and shows the material as is.
* **Glass settings** opens a panel: element picker (header, hero card, code field, dock, tooltip and menu, the tab bar with the autoplay button, its lens, the Playground lens), a material preset picker with descriptions (the change animates), 30 settings in groups, and a Rendering group (WebGL2 or WebGPU, copy method, render scale, FPS, CPU per frame, draw calls, GPU). Opened from the keyboard, focus moves into the panel; opened with a mouse, it stays on the button.
* **Save .json** writes the settings of all eight elements and the render settings. **Open .json** accepts such a file, a single-element file or a bare options object, and reports what was applied and what was skipped.
* **Photo credits and tooltips** are anchored to their buttons: on scroll they move with the dock instead of staying put.
* With `prefers-reduced-transparency` and `prefers-contrast: more` the glass becomes dense and dark; with `prefers-reduced-motion` animations are off and the photo change starts paused.
* `window.refractglDemo` exposes the instances and state in DevTools: `autoplay(true | false)` turns the photo change on and off, `photo()` returns the index of the current photo.
* Photos by Unsplash contributors, used under the [Unsplash License](https://unsplash.com/license) and loaded from `images.unsplash.com`.

## Licence

[MIT](LICENSE).
