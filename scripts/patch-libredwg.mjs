#!/usr/bin/env node
/**
 * Postinstall patch for @mlightcad/libredwg-web 0.6.10.
 *
 * The package's bundled dist/*.js has a Vite bundling bug: it tries
 * to load Node's built-in `node:module` via a stubbed
 * `__viteBrowserExternal` placeholder that never gets resolved at
 * runtime. The result is `TypeError: createRequire is not a function`
 * the moment LibreDwg.create() runs in a Node environment.
 *
 * This script replaces the broken stub call with a real
 * `await import('node:module')` in both the UMD/CJS and the ESM
 * builds. Idempotent — re-running it on already-patched files is a
 * no-op.
 *
 * Wired into package.json as `postinstall` so `npm ci` keeps the fix
 * after a clean install.
 */
import { readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';

const FILES = [
  'node_modules/@mlightcad/libredwg-web/dist/libredwg-web.umd.cjs',
  'node_modules/@mlightcad/libredwg-web/dist/libredwg-web.js',
];

const BROKEN =
  'const { createRequire } = await Promise.resolve().then(() => __viteBrowserExternal);';
const FIXED = 'const { createRequire } = await import("node:module");';

let patched = 0;
let skipped = 0;
for (const rel of FILES) {
  const p = path.resolve(rel);
  try {
    await access(p);
  } catch {
    console.log(`[patch-libredwg] skip — not installed: ${rel}`);
    continue;
  }
  const before = await readFile(p, 'utf8');
  if (!before.includes(BROKEN)) {
    if (before.includes(FIXED)) {
      skipped++;
      continue;
    }
    console.log(`[patch-libredwg] WARN — neither broken nor fixed marker found in ${rel}`);
    continue;
  }
  const after = before.replace(BROKEN, FIXED);
  await writeFile(p, after);
  patched++;
  console.log(`[patch-libredwg] patched ${rel}`);
}

if (patched === 0 && skipped > 0) {
  console.log(`[patch-libredwg] all files already patched (${skipped})`);
}
