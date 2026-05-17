# Vite Migration Plan — Warpspeed

**Status:** Planning
**Strategy:** Strict Vite migration only. RN-web stays fully in place — this plan does not remove, refactor, or transition any RN-web code. Vite is configured to support the existing RN-web layer as-is.
**Verification:** No structured smoke-test phase. Build success + dev server boot + initial render is the bar. Runtime issues surface through normal app use and are patched as they appear. Git rollback is the safety net.
**Estimated setup effort:** 4-5 hours green path, +1-2 days for runtime edge cases.

---

## Current State Snapshot

| Item | Value |
|------|-------|
| Build tool | `react-scripts` 5.0.1 (CRA) |
| Entry | `src/index.js` |
| HTML | `public/index.html` (uses `%PUBLIC_URL%`) |
| Overrides file | `config-overrides.js` (installed but NOT wired — scripts call `react-scripts` directly) |
| Env | `.env.production` with `GENERATE_SOURCEMAP=false` only |
| Prebuild | `scripts/update-version.js` |
| RN-web import count | 89 files import from `react-native` or `react-native-*` |
| Dynamic asset requires | 96 in `src/styles.js` (`require(ASSETS_PATH + "x.png")`) |
| `process.env.REACT_APP_*` usage | None in `src/` |
| HTTPS local serve | `yarn begin` uses `serve -s build --ssl-cert cert.pem --ssl-key key.pem` |

---

## Top Migration Risks

1. **RN-web compat layer** — 89 files. Aliased to `react-native-web` via Vite config. Stays in place; no code changes to RN-web consumers.
2. **`src/styles.js` 96 dynamic requires** — Vite/Rollup does not support `require(VAR + "string")`. Must convert to `import.meta.glob` or static imports.
3. **Flow types in `@rneui/*` and `react-native-vector-icons`** — Need esbuild loader override + Flow strip in Babel.
4. **Node-style polyfills** — `buffer`, `events`, `util`, `string_decoder`, `zlib` are in `dependencies`. Firebase + face-api expect Node globals. Need `vite-plugin-node-polyfills`.
5. **`@rneui` packages ship untranspiled JSX in `.js` files** — Need `optimizeDeps.esbuildOptions.loader: { '.js': 'jsx' }`.

---

## Phase Overview

```timeline
title: Vite Migration Phases
[ ] Phase 0 - Branch & baseline | Create migration branch, record current build size/time
[ ] Phase 1 - Install Vite + plugins | vite, @vitejs/plugin-react, node-polyfills, commonjs
[ ] Phase 2 - Move index.html to repo root | Replace %PUBLIC_URL%, add module script tag
[ ] Phase 3 - Refactor src/styles.js asset imports | import.meta.glob replaces 96 dynamic requires
[ ] Phase 4 - Write vite.config.js | RN-web alias, JSX-in-.js, Flow strip, optimizeDeps
[ ] Phase 5 - Wire update-version.js | Vite plugin buildStart hook OR keep as prebuild
[ ] Phase 6 - Env vars | None to migrate; move sourcemap flag into config
[ ] Phase 7 - Polyfills | Buffer / process / events shims
[ ] Phase 8 - Update scripts in package.json | yarn start -> vite; yarn build -> vite build
[ ] Phase 9 - Replace yarn begin SSL serve | vite preview with https config
[ ] Phase 10 - Cleanup CRA deps | Remove react-scripts, customize-cra, react-app-rewired, babel-preset-expo, webpack
```

---

## Phase 0 — Branch & baseline

```bash
git checkout -b vite-migration
yarn build
# Record: build duration, total bundle size, gzipped main chunk size
du -sh build/static/js/
```

Snapshot the numbers so you can compare post-migration.

---

## Phase 1 — Install dependencies

```bash
yarn add -D vite @vitejs/plugin-react vite-plugin-node-polyfills @originjs/vite-plugin-commonjs
yarn add -D @babel/plugin-transform-flow-strip-types
```

Keep `@babel/plugin-proposal-class-properties` (already a dep) — passed through `@vitejs/plugin-react`'s `babel.plugins`.

---

## Phase 2 — `index.html`

**Move** `public/index.html` → `index.html` (repo root).

**Diff:**

```diff
- <link rel="icon" type="image/png" href="%PUBLIC_URL%/bblogo_trans_high.png" />
+ <link rel="icon" type="image/png" href="/bblogo_trans_high.png" />
- <link rel="apple-touch-icon" href="%PUBLIC_URL%/bblogo_trans_high.png" />
+ <link rel="apple-touch-icon" href="/bblogo_trans_high.png" />
- <link rel="manifest" href="%PUBLIC_URL%/manifest.json" />
+ <link rel="manifest" href="/manifest.json" />
```

**Add before `</body>`:**

```html
<script type="module" src="/src/index.js"></script>
```

`public/` stays where it is — Vite serves it at root. Only the HTML moves.

---

## Phase 3 — `src/styles.js` asset imports

The single largest refactor. Current pattern (repeated 96 times):

```js
const ASSETS_PATH = "./assets/";
const GIFS_PATH = "./assets/gifs/";

export const ICONS = {
  workorder: require(ASSETS_PATH + "workorder.png"),
  receipt: require(ASSETS_PATH + "receipt.png"),
  wheelGIF: require(GIFS_PATH + "wheelGIF.gif"),
  // ... 93 more
};
```

**Replace with `import.meta.glob` eager imports:**

```js
const assetModules = import.meta.glob('./assets/*.{png,jpg,jpeg,gif}', {
  eager: true,
  import: 'default',
});
const gifModules = import.meta.glob('./assets/gifs/*.{gif,png}', {
  eager: true,
  import: 'default',
});

const asset = (name) => assetModules[`./assets/${name}`];
const gif = (name) => gifModules[`./assets/gifs/${name}`];

export const ICONS = {
  workorder: asset('workorder.png'),
  receipt: asset('receipt.png'),
  wheelGIF: gif('wheelGIF.gif'),
  // ... 93 more (same names, just swap `require(ASSETS_PATH + "x")` → `asset("x")`)
};
```

**Why this approach:** lowest-diff change. Object shape and keys stay identical. RN-web `<Image source={ICONS.workorder}>` consumers continue working because `import.meta.glob` with `import: 'default'` returns the URL string, same as webpack's `require()` of an image.

> [!WARNING]
> Test that consumers using `ICONS.x` as `<Image source={...}>` still work. RN-web's `Image` accepts both `{ uri }` objects and bare string URLs, but verify on a few screens before committing.

---

## Phase 4 — `vite.config.js`

Create at repo root:

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import commonjs from '@originjs/vite-plugin-commonjs';
import path from 'path';

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [
          ['@babel/plugin-proposal-class-properties', { loose: true }],
          '@babel/plugin-transform-flow-strip-types',
        ],
      },
    }),
    commonjs(),
    nodePolyfills({
      globals: { Buffer: true, process: true, global: true },
      protocolImports: true,
    }),
  ],

  resolve: {
    alias: {
      'react-native': 'react-native-web',
    },
    extensions: ['.web.js', '.web.jsx', '.js', '.jsx', '.json'],
  },

  define: {
    __DEV__: JSON.stringify(process.env.NODE_ENV !== 'production'),
    global: 'globalThis',
  },

  // Allow JSX in .js files (CRA did this implicitly; Vite does not)
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.jsx?$/,
    exclude: [],
  },

  optimizeDeps: {
    esbuildOptions: {
      loader: { '.js': 'jsx' },
    },
    include: [
      'react-native-web',
      '@rneui/base',
      '@rneui/themed',
      'react-native-vector-icons',
      'react-native-web-linear-gradient',
      'react-native-pager-view',
      'react-native-svg',
      '@react-native-community/datetimepicker',
    ],
  },

  server: {
    port: 3000,
    open: true,
  },

  build: {
    outDir: 'build',
    sourcemap: false,
    commonjsOptions: { transformMixedEsModules: true },
  },
});
```

**Critical config notes:**

- The `esbuild.loader: 'jsx'` line is what allows `.js` files to contain JSX. Without it, Vite errors on the first `<Component />` in `App.js`.
- The `optimizeDeps.esbuildOptions.loader` line is what allows JSX inside `node_modules/@rneui/**/*.js`. Without it, prebundle fails.
- `__DEV__` is a global RN-web/Flow expects.
- `extensions` ordering: `.web.js` comes first so `react-native-web` resolves platform-specific files correctly.

---

## Phase 5 — `scripts/update-version.js`

Two options:

**Option A — keep `prebuild` (zero change):**

```json
"prebuild": "node scripts/update-version.js",
"build": "vite build"
```

`prebuild` still runs before `build` automatically. Simplest.

**Option B — Vite plugin (runs on dev too):**

```js
// vite.config.js
{
  name: 'update-version',
  buildStart() {
    require('./scripts/update-version.js');
  }
}
```

Pick A unless you need version updates on every dev start.

---

## Phase 6 — Env vars

No `REACT_APP_*` usage in `src/`. The only env var is `GENERATE_SOURCEMAP=false`, which is handled by `build.sourcemap: false` in `vite.config.js`. **Delete `.env.production`** after migration confirmed working.

If future env vars are needed, they must be prefixed `VITE_` and accessed via `import.meta.env.VITE_FOO`.

---

## Phase 7 — Polyfills (covered in Phase 4)

`vite-plugin-node-polyfills` handles `buffer`, `process`, `events`, `util`, `string_decoder`, `zlib` automatically. Firebase + face-api should work without further intervention. Watch the dev console on first run for any "X is not defined" errors and add to polyfill config if so.

---

## Phase 8 — `package.json` scripts

```diff
  "scripts": {
    "emulator": "firebase emulators:start --only functions",
-   "start": "react-scripts start",
+   "start": "vite",
    "prebuild": "node scripts/update-version.js",
-   "build": "react-scripts build",
+   "build": "vite build",
-   "eject": "react-scripts eject",
+   "preview": "vite preview",
    "fun": "firebase deploy --only functions:initiatePaymentIntent",
    "dfun": "firebase deploy --only functions",
    "dprocess": "firebase deploy --only functions:processServerDrivenStripePayment",
    "auth": "firebase login --reauth",
-   "begin": "yarn build && serve -s build --ssl-cert cert.pem --ssl-key key.pem",
+   "begin": "yarn build && vite preview --host --port 3000",
-   "serveit": "serve -s build --ssl-cert cert.pem --ssl-key key.pem",
+   "serveit": "vite preview --host --port 3000",
    "host": "yarn build && firebase deploy --only hosting",
    "analyze": "vite-bundle-visualizer",
```

---

## Phase 9 — HTTPS local serve

For the `yarn begin` HTTPS flow, add to `vite.config.js`:

```js
import fs from 'fs';

// inside defineConfig:
preview: {
  port: 3000,
  https: {
    cert: fs.readFileSync('./cert.pem'),
    key: fs.readFileSync('./key.pem'),
  },
},
server: {
  https: {
    cert: fs.readFileSync('./cert.pem'),
    key: fs.readFileSync('./key.pem'),
  },
},
```

Guard with `fs.existsSync` if cert files are optional in CI.

---

## Phase 10 — CRA cleanup

After full QA passes, delete:

```bash
yarn remove react-scripts react-app-rewired customize-cra
yarn remove babel-preset-es2015 babel-preset-expo babel-plugin-react-native-web
yarn remove @babel/preset-react
yarn remove -D webpack webpack-cli
rm config-overrides.js
rm .env.production    # if no longer used
```

Keep `@babel/plugin-proposal-class-properties` (still used in `vite.config.js`).

Update `eslintConfig` in `package.json` — remove `"react-app"` and `"react-app/jest"` extends (these came from `react-scripts`). Replace with whatever ESLint config you want, or remove the block.

---

## Out of Scope

This plan does **not** include:

- Removing or refactoring `react-native` / `react-native-web` imports
- Removing `@rneui/base`, `@rneui/themed`, `react-native-vector-icons`, `react-native-pager-view`, `react-native-svg`, `react-native-web-linear-gradient`, or `@react-native-community/datetimepicker`
- Converting any RN-web component to DOM/CSS Modules
- Removing the `react-native` → `react-native-web` alias from `vite.config.js`
- Removing Flow-strip Babel plugin or `optimizeDeps` entries for RN packages

The RN-web layer is preserved exactly as it exists today. The only goal is replacing the build tool.

---

## Risk Register

| Risk | Likelihood | Severity | Mitigation |
|------|-----------|----------|------------|
| `@rneui` Flow types break prebundle | High | Medium | Flow strip plugin + `optimizeDeps.include` |
| `react-native-vector-icons` font loading fails | Medium | Medium | Verify font URLs in `public/`; may need explicit copy |
| `face-api.js` model paths break | Medium | Low | Models already in `public/models/` — should resolve at `/models/...` |
| `react-native-pager-view` runtime error | Medium | Medium | Surfaces in normal app use; replace with CSS-based swiper if broken |
| Firebase polyfill miss | Low | High | `vite-plugin-node-polyfills` covers it; watch console |
| jsPDF / xlsx CommonJS issues | Low | Medium | `vite-plugin-commonjs` handles most cases |
| `styles.js` `import.meta.glob` returns wrong URL format for RN-web `<Image>` | Medium | Low | Quick spot check; fallback is static imports |
| HMR breaks on RN-web components | Low | Low | Tolerate full reloads for RN-web files; DOM files get full HMR |

---

## Effort Estimate

| Phase | Time |
|-------|------|
| 0 - Branch & baseline | 15 min |
| 1 - Install | 10 min |
| 2 - index.html | 15 min |
| 3 - styles.js refactor | 45 min |
| 4 - vite.config.js | 1-2 hours (iterate on errors) |
| 5 - update-version.js | 5 min |
| 6 - Env | 5 min |
| 7 - Polyfills | (in Phase 4) |
| 8 - package.json scripts | 10 min |
| 9 - HTTPS | 30 min |
| 10 - CRA cleanup | 30 min |
| **Total green path** | **~4-5 hours** |
| Runtime edge cases buffer | +1-2 days (surfaced through normal app use) |

---

## Verification Strategy

No manual smoke-test checklist. Verification is **organic** — the app is used normally and runtime issues surface as they're encountered. Git rollback is the safety net.

After Phases 0-10 complete, the build is considered "done" when:

1. `yarn build` completes with no errors
2. `yarn start` boots the dev server with no errors
3. The app's initial render in the browser shows no console errors
4. The login screen and one workorder load successfully

Anything beyond that is verified by using the app in normal day-to-day workflow. Issues are reported back and patched as they appear.

---

## Decision Points

Before starting, decide:

1. **Branch strategy** — single `vite-migration` branch, or land Vite on `master`? Recommend single branch; merge when stable.
2. **Rollback plan** — keep CRA scripts as `start:cra` / `build:cra` aliases for first week? Optional but safe.

---

## Open Questions

- Are there any Webpack-specific loaders in use that I missed? (`?raw`, `!file-loader!`, etc.) — none found in initial grep, but worth a second pass.
- Does `scripts/update-version.js` write to a path that Vite reads at dev time? — verify before Phase 5 decision.
- Does the Electron build (`electron-builder` in devDeps) consume the CRA build output directly? — if so, confirm `build/` output structure matches what Electron expects.

---

*Last updated: 2026-05-17*
