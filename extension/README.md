# Cadence Extension — cross-browser

Single source tree that compiles to Chrome MV3, Firefox MV3, and Safari Web Extension.

## Layout

```
extension/
├── shared/              # all behavioral code (no chrome.* refs — uses browser.*)
│   ├── config.js
│   ├── background.js
│   ├── content.js
│   ├── popup.js
│   └── popup.html
├── platforms/
│   ├── chrome/manifest.json     # service_worker
│   ├── firefox/manifest.json    # scripts (event page) + gecko id
│   └── safari/manifest.json     # service_worker
├── build.mjs            # esbuild orchestrator (IIFE bundles per browser)
├── package.json
└── dist/                # generated — gitignored
    ├── chrome/
    ├── firefox/
    └── safari/
```

### How the cross-browser layer works

- `webextension-polyfill` exposes `browser.*` (Promise API) in every runtime. The shared code imports it and uses `browser.runtime.*` / `browser.storage.*` throughout.
- esbuild produces **IIFE** bundles. The same JS works as a Chrome MV3 service worker (classic script), a Firefox MV3 event-page script, and a Safari MV3 service worker — no `type: "module"` gymnastics.
- The only per-platform divergence is `manifest.json`. Behavior changes happen exactly once, in `shared/`.

## Dev workflow

```
cd extension
npm install
npm run dev          # watch-rebuild all 3 browsers as you edit shared/
```

Then load the unpacked extension from the appropriate `dist/<browser>/`:

- **Chrome**: `chrome://extensions` → enable Developer mode → Load unpacked → pick `dist/chrome/`
- **Firefox**: `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → pick `dist/firefox/manifest.json`
- **Safari**: Xcode → File → New → Project → Safari Web Extension → import `dist/safari/`

## One-shot builds

```
npm run build              # all three
npm run build:chrome
npm run build:firefox
npm run build:safari
```

## Firefox packaging + lint

```
npm run lint:firefox       # web-ext lint against dist/firefox
npm run pack:firefox       # emits dist/artifacts/cadence-*.zip (rename to .xpi for AMO)
```

## Migration from `chrome-extension/`

The legacy `chrome-extension/` directory at the repo root is being retired. It still works, but every behavioral change now happens in `extension/shared/`. Delete `chrome-extension/` once `dist/chrome/` is verified in your browser.
