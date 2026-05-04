/**
 * NomadGo SpatialVision — Production Build Script
 *
 * 1. Builds the React client with Vite  → dist/public/
 * 2. Bundles the Express server with esbuild → dist/index.cjs
 */

import { build as viteBuild } from "vite";
import * as esbuild from "esbuild";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// ── Ensure dist directory exists ───────────────────────────────────────────────

const distDir = path.join(root, "dist");
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// ── Step 1: Build client with Vite ─────────────────────────────────────────────

console.log("[build] Building React client…");

await viteBuild({
  configFile: path.join(root, "vite.config.ts"),
  root: path.join(root, "client"),
  build: {
    outDir: path.join(root, "dist/public"),
    emptyOutDir: true,
  },
});

console.log("[build] Client build complete → dist/public/");

// ── Step 2: Bundle server with esbuild ─────────────────────────────────────────

console.log("[build] Bundling Express server…");

await esbuild.build({
  entryPoints: [path.join(root, "server/index.ts")],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: path.join(root, "dist/index.mjs"),
  external: [
    // keep native bindings external
    "pg-native",
    "bufferutil",
    "utf-8-validate",
  ],
  define: {
    "process.env.NODE_ENV": '"production"',
  },
  banner: {
    js: "// NomadGo SpatialVision — production server bundle",
  },
});

console.log("[build] Server bundle complete → dist/index.mjs");
console.log("[build] Done.");
