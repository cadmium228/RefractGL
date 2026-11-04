// ES module entry: `import RefractGL from './refractgl.mjs'`
// The namespace binding keeps the import even under "sideEffects": false: a bare `import './refractgl.js'`
// is dropped by bundlers that read the "module" field. Bundlers hand over module.exports as `default`;
// a browser loading this file natively gets an empty namespace, and the script sets globalThis.RefractGL.
import * as mod from './refractgl.js';

const RefractGL = (mod && (mod.default || mod.RefractGL)) || globalThis.RefractGL;
export { RefractGL };
export default RefractGL;
