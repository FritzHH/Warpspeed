// Cadence Extension — esbuild-based cross-browser build.
//
// Bundles the shared sources (background.js, content.js, popup.js) once per
// browser target and copies the per-platform manifest + static assets into
// dist/<browser>/. Every JS entry is emitted as IIFE — that single format
// works as a Chrome MV3 service worker (classic script), a Firefox MV3
// event-page script, and a Safari MV3 service worker without per-target
// output format juggling.
//
// Usage:
//   node build.mjs            one-shot build for all browsers
//   node build.mjs --watch    rebuild on shared/ or platforms/ changes
//   node build.mjs --browser=firefox   build only one target
//
// Outputs:
//   dist/chrome/    {background,content,popup}.js + popup.html + manifest.json
//   dist/firefox/   ...
//   dist/safari/    ...

import * as esbuild from "esbuild";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SHARED = path.join(ROOT, "shared");
const PLATFORMS = path.join(ROOT, "platforms");
const DIST = path.join(ROOT, "dist");

const args = new Set(process.argv.slice(2));
const watch = args.has("--watch");
const onlyBrowserArg = process.argv.find((a) => a.startsWith("--browser="));
const ONLY_BROWSER = onlyBrowserArg ? onlyBrowserArg.split("=")[1] : null;
const ALL_BROWSERS = ["chrome", "firefox", "safari"];
const BROWSERS = ONLY_BROWSER ? [ONLY_BROWSER] : ALL_BROWSERS;

const JS_ENTRIES = ["background.js", "content.js", "popup.js"];
const STATIC_COPIES = ["popup.html"];
const STATIC_DIRS = ["assets"];

async function clean(browser) {
  const out = path.join(DIST, browser);
  await fs.rm(out, { recursive: true, force: true });
  await fs.mkdir(out, { recursive: true });
}

async function copyStatic(browser) {
  const out = path.join(DIST, browser);
  // Per-platform manifest.
  await fs.copyFile(
    path.join(PLATFORMS, browser, "manifest.json"),
    path.join(out, "manifest.json")
  );
  // Shared static assets.
  for (const file of STATIC_COPIES) {
    await fs.copyFile(path.join(SHARED, file), path.join(out, file));
  }
  for (const dir of STATIC_DIRS) {
    await fs.cp(path.join(SHARED, dir), path.join(out, dir), { recursive: true });
  }
}

function bundleOptionsFor(browser) {
  // Same options across all three browsers — IIFE keeps the output as a
  // classic script that any MV3 background runtime can load.
  return JS_ENTRIES.map((entry) => ({
    entryPoints: [path.join(SHARED, entry)],
    outfile: path.join(DIST, browser, entry),
    bundle: true,
    format: "iife",
    target: "chrome110",
    platform: "browser",
    sourcemap: "inline",
    logLevel: "info",
    define: { "process.env.NODE_ENV": '"production"' },
  }));
}

async function buildOnce(browser) {
  await clean(browser);
  await copyStatic(browser);
  for (const opts of bundleOptionsFor(browser)) {
    await esbuild.build(opts);
  }
  // eslint-disable-next-line no-console
  console.log(`[build] ${browser} ✓ -> dist/${browser}`);
}

async function buildWatch(browser) {
  await clean(browser);
  await copyStatic(browser);
  for (const opts of bundleOptionsFor(browser)) {
    const ctx = await esbuild.context(opts);
    await ctx.watch();
  }
  // eslint-disable-next-line no-console
  console.log(`[watch] ${browser} watching shared/ ...`);
}

async function main() {
  if (watch) {
    for (const browser of BROWSERS) await buildWatch(browser);
    // Keep the process alive — esbuild watchers don't block on their own.
    await new Promise(() => {});
  } else {
    for (const browser of BROWSERS) await buildOnce(browser);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
