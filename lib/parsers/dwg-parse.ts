/**
 * Native DWG parser using @mlightcad/libredwg-web (WebAssembly).
 *
 * This is the "most effective" path Nick asked for: it works on any
 * server with no external converter installs (no LibreDWG CLI, no
 * ODA File Converter download, no cloud API). The WASM bundle ships
 * inside node_modules and gets loaded the first time a DWG upload
 * comes in.
 *
 * The output mirrors the existing DxfExtraction shape from
 * lib/parsers/dxf-parse.ts so the downstream pipeline (room
 * detection, unit grouping, /api/analyze cache) doesn't need to
 * change at all — DWGs feed into exactly the same code path as DXFs.
 */

import path from 'path';
import { readFile, writeFile } from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createRequire } from 'module';
import type { WallLine } from '@/types/project';
import type { DxfExtraction, TextLabel } from './dxf-parse';

const execAsync = promisify(exec);

// Re-exported so callers can write the same cache shape
export type { DxfExtraction, TextLabel };

/* ----------------------------------------------------------------- */
/* WASM module loader (one-time init, cached)                         */
/* ----------------------------------------------------------------- */

// libredwg-web ships a Vite-bundled UMD build. Loading it via the
// ESM import path drags in a broken `__viteBrowserExternal` stub for
// `node:module`, which crashes at runtime. Loading it via require()
// from the bundled CJS build works once we apply the postinstall
// patch (scripts/patch-libredwg.mjs) that swaps the broken stub for
// a real `await import('node:module')`.
//
// We dynamically import the package on first use so the WASM only
// loads when a DWG actually comes in — keeps cold-start fast.
let libreDwgPromise: Promise<unknown> | null = null;

async function getLibreDwg(): Promise<unknown> {
  if (libreDwgPromise) return libreDwgPromise;
  libreDwgPromise = (async () => {
    // Use createRequire so we get the CJS UMD build, not the broken
    // ESM build. Both files are patched by scripts/patch-libredwg.mjs.
    const req = createRequire(import.meta.url);
    const mod = req('@mlightcad/libredwg-web') as {
      LibreDwg: {
        instance?: unknown;
        create: (filepath?: string) => Promise<unknown>;
      };
    };
    if (mod.LibreDwg.instance) return mod.LibreDwg.instance;
    // Point the WASM loader at the package's wasm/ directory so it
    // can find libredwg-web.wasm next to the JS glue file.
    const wasmDir = path.join(
      process.cwd(),
      'node_modules',
      '@mlightcad',
      'libredwg-web',
      'wasm'
    );
    return mod.LibreDwg.create(wasmDir);
  })();
  return libreDwgPromise;
}

/* ----------------------------------------------------------------- */
/* Wall layer detection — same patterns as the DXF parser            */
/* ----------------------------------------------------------------- */

const WALL_LAYER_PATTERNS: RegExp[] = [
  /wall/i,
  /muur/i,
  /wand/i,
  /a[-_]?wall/i,
  /s[-_]?wall/i,
  /ar[-_]?wall/i,
  /struct/i,
  /bearing/i,
  /gevel/i,
  /bouwkundig/i,
];

function isWallLayer(layerName: string): boolean {
  return WALL_LAYER_PATTERNS.some((p) => p.test(layerName));
}

/* ----------------------------------------------------------------- */
/* Coordinate normalization                                           */
/* ----------------------------------------------------------------- */

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function normalizeX(x: number, b: Bounds): number {
  const r = b.maxX - b.minX;
  if (r === 0) return 50;
  return ((x - b.minX) / r) * 100;
}

function normalizeY(y: number, b: Bounds): number {
  const r = b.maxY - b.minY;
  if (r === 0) return 50;
  // Flip Y axis: DWG/DXF have Y up, screen has Y down
  return (1 - (y - b.minY) / r) * 100;
}

/* ----------------------------------------------------------------- */
/* Loose entity types — we cast from libredwg-web's typed entities    */
/* into a single permissive shape so the extractor stays compact.    */
/* ----------------------------------------------------------------- */

interface DwgEntityLike {
  type: string;
  layer?: string;
  lineweight?: number;
  // LINE
  startPoint?: { x: number; y: number; z?: number };
  endPoint?: { x: number; y: number; z?: number };
  // LWPOLYLINE / POLYLINE
  vertices?: Array<{ x: number; y: number }>;
  flag?: number;
  closed?: boolean;
  // ARC / CIRCLE
  center?: { x: number; y: number };
  radius?: number;
  startAngle?: number;
  endAngle?: number;
  // TEXT
  text?: string;
  textHeight?: number;
  // MTEXT
  insertionPoint?: { x: number; y: number };
}

/* ----------------------------------------------------------------- */
/* Bounds computation                                                 */
/* ----------------------------------------------------------------- */

function computeBounds(entities: DwgEntityLike[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const update = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  for (const e of entities) {
    switch (e.type) {
      case 'LINE':
        if (e.startPoint) update(e.startPoint.x, e.startPoint.y);
        if (e.endPoint) update(e.endPoint.x, e.endPoint.y);
        break;
      case 'LWPOLYLINE':
      case 'POLYLINE2D':
      case 'POLYLINE3D':
        if (e.vertices) for (const v of e.vertices) update(v.x, v.y);
        break;
      case 'ARC':
      case 'CIRCLE':
        if (e.center && e.radius) {
          update(e.center.x - e.radius, e.center.y - e.radius);
          update(e.center.x + e.radius, e.center.y + e.radius);
        }
        break;
      case 'TEXT':
        if (e.startPoint) update(e.startPoint.x, e.startPoint.y);
        break;
      case 'MTEXT':
        if (e.insertionPoint) update(e.insertionPoint.x, e.insertionPoint.y);
        break;
    }
  }

  if (minX === Infinity) {
    return { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  }
  return { minX, minY, maxX, maxY };
}

/* ----------------------------------------------------------------- */
/* Wall + text extractors                                             */
/* ----------------------------------------------------------------- */

function arcToSegments(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
  segCount = 16
): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  const startRad = (startDeg * Math.PI) / 180;
  let endRad = (endDeg * Math.PI) / 180;
  if (endRad <= startRad) endRad += 2 * Math.PI;
  const step = (endRad - startRad) / segCount;
  for (let i = 0; i <= segCount; i++) {
    const a = startRad + i * step;
    out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return out;
}

function extractWalls(
  entities: DwgEntityLike[],
  bounds: Bounds,
  wallLayerNames: Set<string>
): WallLine[] {
  const walls: WallLine[] = [];

  for (const e of entities) {
    const onWallLayer = e.layer ? wallLayerNames.has(e.layer) : false;
    const isThick = (e.lineweight ?? 0) >= 30; // 1/100 mm
    if (!onWallLayer && !isThick) continue;

    const w = (e.lineweight ?? 0) > 0 ? (e.lineweight ?? 0) / 100 : 1;

    switch (e.type) {
      case 'LINE': {
        if (!e.startPoint || !e.endPoint) break;
        walls.push({
          x1: normalizeX(e.startPoint.x, bounds),
          y1: normalizeY(e.startPoint.y, bounds),
          x2: normalizeX(e.endPoint.x, bounds),
          y2: normalizeY(e.endPoint.y, bounds),
          width: w,
        });
        break;
      }
      case 'LWPOLYLINE':
      case 'POLYLINE2D':
      case 'POLYLINE3D': {
        if (!e.vertices || e.vertices.length < 2) break;
        for (let i = 0; i < e.vertices.length - 1; i++) {
          walls.push({
            x1: normalizeX(e.vertices[i].x, bounds),
            y1: normalizeY(e.vertices[i].y, bounds),
            x2: normalizeX(e.vertices[i + 1].x, bounds),
            y2: normalizeY(e.vertices[i + 1].y, bounds),
            width: w,
          });
        }
        // Close polyline if the flag says so. The libredwg shape uses
        // bit 1 of `flag` for closed (matches DXF convention).
        const isClosed =
          e.closed === true || (e.flag !== undefined && (e.flag & 1) !== 0);
        if (isClosed && e.vertices.length >= 3) {
          const last = e.vertices[e.vertices.length - 1];
          const first = e.vertices[0];
          walls.push({
            x1: normalizeX(last.x, bounds),
            y1: normalizeY(last.y, bounds),
            x2: normalizeX(first.x, bounds),
            y2: normalizeY(first.y, bounds),
            width: w,
          });
        }
        break;
      }
      case 'ARC': {
        if (!e.center || !e.radius) break;
        const pts = arcToSegments(
          e.center.x,
          e.center.y,
          e.radius,
          e.startAngle ?? 0,
          e.endAngle ?? 360
        );
        for (let i = 0; i < pts.length - 1; i++) {
          walls.push({
            x1: normalizeX(pts[i].x, bounds),
            y1: normalizeY(pts[i].y, bounds),
            x2: normalizeX(pts[i + 1].x, bounds),
            y2: normalizeY(pts[i + 1].y, bounds),
            width: w,
          });
        }
        break;
      }
      case 'CIRCLE': {
        if (!e.center || !e.radius) break;
        const pts = arcToSegments(e.center.x, e.center.y, e.radius, 0, 360, 32);
        for (let i = 0; i < pts.length - 1; i++) {
          walls.push({
            x1: normalizeX(pts[i].x, bounds),
            y1: normalizeY(pts[i].y, bounds),
            x2: normalizeX(pts[i + 1].x, bounds),
            y2: normalizeY(pts[i + 1].y, bounds),
            width: w,
          });
        }
        break;
      }
    }
  }

  return walls;
}

function extractTexts(entities: DwgEntityLike[], bounds: Bounds): TextLabel[] {
  const out: TextLabel[] = [];
  for (const e of entities) {
    if (e.type === 'TEXT' && e.text && e.startPoint) {
      out.push({
        text: e.text.trim(),
        x: normalizeX(e.startPoint.x, bounds),
        y: normalizeY(e.startPoint.y, bounds),
        fontSize: e.textHeight ?? 10,
      });
    } else if (e.type === 'MTEXT' && e.text && e.insertionPoint) {
      // Strip MTEXT formatting codes ({\fArial;text} → text)
      const clean = e.text
        .replace(/\\[A-Za-z][^;]*;/g, '')
        .replace(/[{}]/g, '')
        .replace(/\\P/g, '\n')
        .trim();
      if (clean) {
        out.push({
          text: clean,
          x: normalizeX(e.insertionPoint.x, bounds),
          y: normalizeY(e.insertionPoint.y, bounds),
          fontSize: e.textHeight ?? 10,
        });
      }
    }
  }
  return out;
}

/* ----------------------------------------------------------------- */
/* Public API                                                         */
/* ----------------------------------------------------------------- */

export type DwgParseResult =
  | { ok: true; extraction: DxfExtraction }
  | { ok: false; reason: string; detail?: string };

export type DwgRenderResult =
  | { ok: true; pngPath: string }
  | { ok: false; reason: string; detail?: string };

/**
 * Render a DWG to a PNG image via libredwg's SVG export + rsvg-convert.
 *
 * AutoCAD DWGs have white lines on a dark background. We fix that by
 * swapping white → black (and inverting near-white colors) so the
 * output looks correct on a white page.
 *
 * This PNG is the "raster image" that Gemini Vision analyzes to
 * detect units — same role as the pdftoppm-rendered PNG for PDFs.
 */
export async function renderDwgToPng(
  dwgPath: string,
  pngPath: string
): Promise<DwgRenderResult> {
  let lib: unknown;
  try {
    lib = await getLibreDwg();
  } catch (err) {
    return { ok: false, reason: 'wasm_init', detail: errMsg(err) };
  }

  let buffer: Buffer;
  try {
    buffer = await readFile(dwgPath);
  } catch (err) {
    return { ok: false, reason: 'read_failed', detail: errMsg(err) };
  }

  const libApi = lib as {
    dwg_read_data: (data: ArrayBuffer, fileType: number) => number | undefined;
    convert: (ptr: number) => unknown;
    dwg_to_svg: (db: unknown) => string;
    dwg_free: (ptr: number) => void;
  };

  const FILE_TYPE_DWG = 0;
  let ptr: number | undefined;
  try {
    const ab = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    );
    ptr = libApi.dwg_read_data(ab as ArrayBuffer, FILE_TYPE_DWG);
  } catch (err) {
    return { ok: false, reason: 'dwg_read', detail: errMsg(err) };
  }

  if (!ptr) {
    return { ok: false, reason: 'dwg_read', detail: 'null pointer' };
  }

  try {
    const db = libApi.convert(ptr);
    let svg = libApi.dwg_to_svg(db);
    if (!svg || svg.length < 100) {
      return { ok: false, reason: 'svg_empty', detail: 'SVG export produced no content' };
    }

    // Fix AutoCAD white-on-dark colors for white-background rendering.
    // Color 7 in DWG = rgb(255,255,255) which is invisible on white.
    // Swap to black, and invert any near-white colors.
    svg = svg.replace(/rgb\(255,255,255\)/g, 'rgb(0,0,0)');
    svg = svg.replace(/rgb\((\d+),(\d+),(\d+)\)/g, (match, r, g, b) => {
      const ri = parseInt(r, 10);
      const gi = parseInt(g, 10);
      const bi = parseInt(b, 10);
      if (ri > 200 && gi > 200 && bi > 200) {
        return `rgb(${255 - ri},${255 - gi},${255 - bi})`;
      }
      return match;
    });

    // We DON'T inject a background rect — the viewBox is in user
    // units (not pixels) and a `width="100%"` rect ends up positioned
    // strangely. Instead we pass --background-color=white to
    // rsvg-convert below so the renderer paints the canvas white.
    //
    // We also DON'T override the viewBox. The libredwg-generated one
    // spans model + paper space with internal transforms we can't
    // easily unwind; overriding it tends to break coordinate
    // resolution. We rely on rendering at high resolution + a
    // post-render content-bbox trim instead.

    // Write the fixed SVG to a temp file
    const svgPath = pngPath.replace(/\.png$/, '.svg');
    await writeFile(svgPath, svg);

    // Render SVG → PNG via rsvg-convert (librsvg, installed via brew).
    // --background-color=white because libredwg's SVG has a
    // transparent canvas (originally meant for AutoCAD's dark theme).
    try {
      await execAsync(
        `rsvg-convert -w 3000 --background-color=white "${svgPath}" -o "${pngPath}"`
      );
    } catch {
      // Fallback to sips (macOS built-in, less capable but always there)
      try {
        await execAsync(`sips -s format png "${svgPath}" --out "${pngPath}" -z 2000 3000`);
      } catch (sipsErr) {
        return { ok: false, reason: 'svg_render', detail: errMsg(sipsErr) };
      }
    }

    // Check the output exists
    try {
      await readFile(pngPath);
    } catch {
      return { ok: false, reason: 'png_missing', detail: `${pngPath} not created` };
    }

    // Auto-trim white borders from the rendered PNG. DWG drawings
    // often have extreme aspect ratios (model space + paper space
    // combined) leaving 80%+ white space. We then also try to find
    // the LARGEST cluster of content and crop tightly to it, to
    // isolate the actual floor plan from stray paper-space content.
    try {
      await execAsync(
        `python3 -c "
from PIL import Image, ImageOps, ImageFilter
img = Image.open('${pngPath}').convert('RGB')
gray = img.convert('L')
# Binary mask: 255 where there's content, 0 where there's white
mask = gray.point(lambda v: 0 if v >= 240 else 255)
# Erode to remove isolated noise pixels that keep the bbox full
mask = mask.filter(ImageFilter.MinFilter(5))
bbox = mask.getbbox()
if bbox:
    img = img.crop(bbox)
    img = ImageOps.expand(img, border=30, fill=(255,255,255))
img.save('${pngPath}')
"`
      );
    } catch (trimErr) {
      console.warn('[dwg-parse] PNG trim failed (non-fatal):', errMsg(trimErr));
    }

    return { ok: true, pngPath };
  } catch (err) {
    return { ok: false, reason: 'svg_export', detail: errMsg(err) };
  } finally {
    if (ptr !== undefined) {
      try {
        libApi.dwg_free(ptr);
      } catch {
        /* best-effort */
      }
    }
  }
}

/**
 * Compute tight bounds from model-space entities only (ignoring paper
 * space, title blocks, etc. which libredwg includes in the global
 * viewBox). Uses DWG coordinates (Y up), not SVG coordinates.
 *
 * The SVG generated by dwg_to_svg uses these DWG coordinates directly
 * (libredwg doesn't flip Y). So the returned bounds can be used as-is
 * for the SVG viewBox.
 */
function computeModelSpaceBounds(
  entities: DwgEntityLike[]
): { x: number; y: number; w: number; h: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const update = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (Math.abs(x) > 1e15 || Math.abs(y) > 1e15) return; // skip garbage
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  for (const e of entities) {
    // In the SVG, libredwg negates Y (SVG Y-down vs DWG Y-up). The
    // entity coordinates are in the DWG system; we'll negate Y when
    // computing the viewBox.
    switch (e.type) {
      case 'LINE':
        if (e.startPoint) update(e.startPoint.x, e.startPoint.y);
        if (e.endPoint) update(e.endPoint.x, e.endPoint.y);
        break;
      case 'LWPOLYLINE':
      case 'POLYLINE2D':
      case 'POLYLINE3D':
        if (e.vertices) for (const v of e.vertices) update(v.x, v.y);
        break;
      case 'ARC':
      case 'CIRCLE':
        if (e.center && e.radius) {
          update(e.center.x - e.radius, e.center.y - e.radius);
          update(e.center.x + e.radius, e.center.y + e.radius);
        }
        break;
      case 'TEXT':
        if (e.startPoint) update(e.startPoint.x, e.startPoint.y);
        break;
      case 'MTEXT':
        if (e.insertionPoint) update(e.insertionPoint.x, e.insertionPoint.y);
        break;
    }
  }

  if (minX === Infinity) return null;
  const w = maxX - minX;
  const h = maxY - minY;
  if (w <= 0 || h <= 0) return null;

  // In the SVG, Y is negated by libredwg (Y-down). Return negated Y
  // bounds for the viewBox.
  return { x: minX, y: -maxY, w, h };
}

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Parse a DWG file from disk into the same DxfExtraction shape that
 * lib/parsers/dxf-parse.ts produces. The downstream pipeline can
 * use it interchangeably with native DXF data.
 */
export async function parseDwgFile(dwgPath: string): Promise<DwgParseResult> {
  let lib: unknown;
  try {
    lib = await getLibreDwg();
  } catch (err) {
    return {
      ok: false,
      reason: 'wasm_init_failed',
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  let buffer: Buffer;
  try {
    buffer = await readFile(dwgPath);
  } catch (err) {
    return {
      ok: false,
      reason: 'read_failed',
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  // Cast to the loose API shape we use
  const libApi = lib as {
    dwg_read_data: (data: ArrayBuffer, fileType: number) => number | undefined;
    convert: (ptr: number) => {
      entities?: DwgEntityLike[];
      tables?: { LAYER?: { entries?: Array<{ name?: string }> } };
    };
    dwg_free: (ptr: number) => void;
  };

  const FILE_TYPE_DWG = 0;

  let ptr: number | undefined;
  try {
    // The WASM API takes an ArrayBuffer; convert from Node Buffer
    const ab = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    );
    ptr = libApi.dwg_read_data(ab as ArrayBuffer, FILE_TYPE_DWG);
  } catch (err) {
    return {
      ok: false,
      reason: 'dwg_read_failed',
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  if (!ptr) {
    return {
      ok: false,
      reason: 'dwg_read_failed',
      detail: 'libredwg returned null pointer (corrupt or unsupported version)',
    };
  }

  try {
    const database = libApi.convert(ptr);
    const entities = (database.entities ?? []) as DwgEntityLike[];

    const bounds = computeBounds(entities);

    // Collect layer names from entities + the layer table
    const allLayerNames = new Set<string>();
    for (const e of entities) {
      if (e.layer) allLayerNames.add(e.layer);
    }
    if (database.tables?.LAYER?.entries) {
      for (const layer of database.tables.LAYER.entries) {
        if (layer.name) allLayerNames.add(layer.name);
      }
    }

    // Identify wall layers by name; fall back to "all layers" if no
    // matches and rely on the lineweight threshold.
    let wallLayerNames = new Set<string>();
    for (const name of allLayerNames) {
      if (isWallLayer(name)) wallLayerNames.add(name);
    }
    if (wallLayerNames.size === 0) wallLayerNames = new Set(allLayerNames);

    const walls = extractWalls(entities, bounds, wallLayerNames);
    const texts = extractTexts(entities, bounds);

    return {
      ok: true,
      extraction: {
        walls,
        texts,
        bounds,
        layerNames: Array.from(allLayerNames),
      },
    };
  } catch (err) {
    return {
      ok: false,
      reason: 'dwg_convert_failed',
      detail: err instanceof Error ? err.message : String(err),
    };
  } finally {
    if (ptr !== undefined) {
      try {
        libApi.dwg_free(ptr);
      } catch {
        /* best-effort cleanup */
      }
    }
  }
}
