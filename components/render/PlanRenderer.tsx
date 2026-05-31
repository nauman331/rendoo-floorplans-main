'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type {
  AnnotationShape,
  Branding,
  DetectedUnit,
  PlanEdit,
} from '@/types/project';
import { applyBranding, getPalette, type Palette } from '@/lib/render/palettes';
import { layoutRoomsForUnit, type LaidOutRoom } from '@/lib/render/room-layout';
import {
  FURNITURE,
  ROOM_FURNITURE,
  type FurnitureId,
  type FurnitureItem,
} from '@/lib/render/furniture';

/**
 * Renders a stylised commercial floorplan from a single unit + chosen
 * stijl-example + branding. Pure HTML canvas (no Konva) so it composes
 * with the existing PlanCanvas approach.
 *
 * Pipeline per render:
 *   1. Lay out the unit's rooms with the guillotine packer
 *   2. Compute meters→pixels by sniffing the unit area
 *   3. Paint pageBg
 *   4. For each room: floor pattern (plank/herringbone/tile/flat)
 *   5. For each room: wall outline
 *   6. For each room: auto-placed furniture
 *   7. For each room: label + area in m²
 *
 * Pixel coordinates are computed at draw time so the canvas can be any
 * size — we listen to ResizeObserver and re-paint when the container
 * changes shape.
 */

export interface PlanRendererHandle {
  /** Returns a PNG data URL of the current render — handy for downloads. */
  toDataURL: () => string | null;
}

interface Props {
  /** The unit we're rendering as the focused subject. */
  unit: DetectedUnit | null;
  /**
   * All detected units. When set together with `baseImageUrl`, the
   * renderer switches to "raster mode" — it draws the original image
   * tinted with the palette and overlays every unit polygon.
   */
  allUnits?: DetectedUnit[];
  /**
   * URL of the actual uploaded plan (rasterUrl from project.files[0]).
   * When provided, raster mode is used; otherwise we fall back to the
   * template-based renderer.
   */
  baseImageUrl?: string | null;
  exampleId: string | null;
  branding: Branding | null;
  /** True for 2D Luxe — branding overrides are ignored when set. */
  isLuxe: boolean;
  /** User-feedback-derived edits applied AFTER auto-placement. */
  edits?: PlanEdit[];
  /** Bumping this number forces a re-render (used after feedback). */
  version?: number;
}

const RENDER_PADDING = 0.04; // 4% page margin

const PlanRenderer = forwardRef<PlanRendererHandle, Props>(function PlanRenderer(
  {
    unit,
    allUnits,
    baseImageUrl,
    exampleId,
    branding,
    isLuxe,
    edits = [],
    version = 1,
  },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const baseImageRef = useRef<HTMLImageElement | null>(null);

  useImperativeHandle(ref, () => ({
    toDataURL: () => canvasRef.current?.toDataURL('image/png') ?? null,
  }));

  // Load the base image (if any) and trigger a repaint when ready
  useEffect(() => {
    if (!baseImageUrl) {
      baseImageRef.current = null;
      paint();
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      baseImageRef.current = img;
      paint();
    };
    img.onerror = () => {
      // Couldn't load — fall back to template mode
      baseImageRef.current = null;
      paint();
    };
    img.src = baseImageUrl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseImageUrl]);

  // Repaint on resize
  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const ro = new ResizeObserver(() => paint());
    ro.observe(c);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Repaint on prop changes
  useEffect(() => {
    paint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit, allUnits, exampleId, branding, isLuxe, edits, version]);

  function paint() {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${ch}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cw, ch);

    const basePalette = getPalette(exampleId);
    const palette = applyBranding(basePalette, branding, isLuxe);

    // Background
    ctx.fillStyle = palette.pageBg;
    ctx.fillRect(0, 0, cw, ch);

    // Raster mode: crop the actual uploaded plan to the focused unit
    // and tint it with the chosen palette. This is what makes the
    // result actually look like THIS woningtype, not the whole project.
    const baseImage = baseImageRef.current;
    if (baseImage && unit && unit.polygon && unit.polygon.length > 0) {
      paintRasterMode(ctx, cw, ch, baseImage, unit, palette, edits);
      ctx.restore();
      return;
    }

    if (!unit) {
      drawEmptyState(ctx, cw, ch, palette);
      ctx.restore();
      return;
    }

    const rooms = layoutRoomsForUnit(unit);
    if (rooms.length === 0) {
      drawEmptyState(ctx, cw, ch, palette);
      ctx.restore();
      return;
    }

    // Compute the inner box (page minus padding) and the unit's aspect
    // ratio. Layout rooms span 0..100 but we want to keep the unit
    // looking roughly square when drawn — derive aspect from total area.
    const boxX = cw * RENDER_PADDING;
    const boxY = ch * RENDER_PADDING;
    const boxW = cw * (1 - RENDER_PADDING * 2);
    const boxH = ch * (1 - RENDER_PADDING * 2);

    // Pick the larger of {layout aspect, container aspect} so the plan
    // fills the box. Layout is always 100×100 normalized.
    const containerAspect = boxW / boxH;
    let drawW: number, drawH: number;
    if (containerAspect >= 1) {
      drawH = boxH;
      drawW = boxH;
      if (drawW > boxW) {
        drawW = boxW;
        drawH = boxW;
      }
    } else {
      drawW = boxW;
      drawH = boxW;
      if (drawH > boxH) {
        drawH = boxH;
        drawW = boxH;
      }
    }
    const drawX = boxX + (boxW - drawW) / 2;
    const drawY = boxY + (boxH - drawH) / 2;

    // Helper: layout coords (0..100) → canvas pixels
    const px = (x: number) => drawX + (x / 100) * drawW;
    const py = (y: number) => drawY + (y / 100) * drawH;

    const wallPx = Math.max(2, palette.wallWidth * Math.min(drawW, drawH));

    // Estimate meters→pixels using the unit area + total drawn area.
    // Useful for sizing furniture realistically.
    const totalAreaSqM = unit.area && unit.area > 0 ? unit.area : 80;
    const totalAreaPx2 = drawW * drawH;
    const pxPerM = Math.sqrt(totalAreaPx2 / totalAreaSqM);

    // 1. Floors (per-room fill + pattern)
    for (const room of rooms) {
      drawFloor(ctx, room, palette, px, py);
    }

    // 2. Outer wall outline (over the whole unit) — drawn as one
    // continuous frame to avoid double lines.
    ctx.strokeStyle = palette.wallColor;
    ctx.lineWidth = wallPx;
    ctx.lineJoin = 'miter';
    ctx.lineCap = 'butt';
    ctx.strokeRect(drawX, drawY, drawW, drawH);

    // 3. Interior walls between rooms
    drawInteriorWalls(ctx, rooms, palette, wallPx, px, py);

    // 4. Auto-place furniture for each room (collected, not yet drawn)
    const placed: PlacedItem[] = [];
    for (const room of rooms) {
      placeFurnitureForRoom(room, pxPerM, px, py, placed);
    }

    // 4b. Apply user edits (add/remove/replace inside annotation areas)
    const finalPlaced = applyEdits(placed, edits, rooms, pxPerM, drawX, drawY, drawW, drawH);

    // 4c. Draw all furniture in one pass
    for (const item of finalPlaced) {
      drawFurniture(
        ctx,
        FURNITURE[item.id],
        item.x,
        item.y,
        item.w,
        item.h,
        item.rotated,
        palette
      );
    }

    // 5. Labels
    for (const room of rooms) {
      drawLabel(ctx, room, palette, px, py, drawW);
    }

    ctx.restore();
  }

  return (
    <div ref={containerRef} className="absolute inset-0">
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
});

export default PlanRenderer;

/* ================================================================== */
/* Drawing helpers                                                    */
/* ================================================================== */

function drawEmptyState(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  palette: Palette
) {
  ctx.fillStyle = palette.labelColor;
  ctx.font = `14px ${palette.fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Geen plan beschikbaar — voltooi eerst de analyse.', w / 2, h / 2);
}

/* ------------------------------------------------------------------ */
/* Raster mode — single woningtype cropped from the uploaded plan    */
/* ------------------------------------------------------------------ */

/**
 * Crop the source image to the focused unit's polygon bounding box and
 * draw it tinted with the chosen palette. This is the "show ONE
 * woningtype, not the whole project" mode — same idea as the
 * competitor screenshots Nick referenced.
 *
 * Pipeline:
 *   1. Compute the unit's bbox in image pixel coordinates (with a
 *      small padding margin so we don't clip terrace/balkon labels)
 *   2. Use ctx.drawImage with source-rect to crop on draw
 *   3. Apply a palette tint via 'multiply' blend
 *   4. Draw a small label badge in the corner
 *   5. Apply user edits (added furniture) at the annotation positions
 */
function paintRasterMode(
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  image: HTMLImageElement,
  unit: DetectedUnit,
  palette: Palette,
  edits: PlanEdit[]
) {
  // 1. Compute the unit's bbox in image pixel coordinates.
  // unit.polygon is in 0..100 percentages of the original image.
  const xs = unit.polygon.map((p) => p.x);
  const ys = unit.polygon.map((p) => p.y);
  const minXPct = Math.min(...xs);
  const maxXPct = Math.max(...xs);
  const minYPct = Math.min(...ys);
  const maxYPct = Math.max(...ys);

  // Add padding so labels/terraces near the edges stay visible
  const padPct = 1.5;
  const cropMinX = Math.max(0, minXPct - padPct);
  const cropMinY = Math.max(0, minYPct - padPct);
  const cropMaxX = Math.min(100, maxXPct + padPct);
  const cropMaxY = Math.min(100, maxYPct + padPct);

  const imgW = image.naturalWidth;
  const imgH = image.naturalHeight;
  const sx = (cropMinX / 100) * imgW;
  const sy = (cropMinY / 100) * imgH;
  const sw = ((cropMaxX - cropMinX) / 100) * imgW;
  const sh = ((cropMaxY - cropMinY) / 100) * imgH;

  if (sw <= 0 || sh <= 0) {
    // Degenerate polygon — nothing useful to crop
    drawEmptyState(ctx, cw, ch, palette);
    return;
  }

  // 2. Compute destination rect (object-contain inside canvas, with a
  // small page margin)
  const margin = 0.04;
  const boxW = cw * (1 - margin * 2);
  const boxH = ch * (1 - margin * 2);
  const cropAspect = sw / sh;
  const boxAspect = boxW / boxH;
  let dw: number, dh: number;
  if (cropAspect > boxAspect) {
    dw = boxW;
    dh = boxW / cropAspect;
  } else {
    dh = boxH;
    dw = boxH * cropAspect;
  }
  const dx = (cw - dw) / 2;
  const dy = (ch - dh) / 2;

  // Helper: convert polygon point (0..100 of source image) → canvas px
  const polyToCanvas = (p: { x: number; y: number }) => ({
    x: dx + ((p.x - cropMinX) / (cropMaxX - cropMinX)) * dw,
    y: dy + ((p.y - cropMinY) / (cropMaxY - cropMinY)) * dh,
  });

  // 3. Build the polygon clip path so we ONLY draw inside the user's
  // confirmed unit boundary. This is what makes manual polygon edits
  // immediately visible — pulling a vertex inward actually clips the
  // image to the new shape instead of just changing the bbox.
  ctx.save();
  ctx.beginPath();
  unit.polygon.forEach((p, i) => {
    const pt = polyToCanvas(p);
    if (i === 0) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  });
  ctx.closePath();
  ctx.clip();

  // 4. Draw the cropped portion with the palette's filter applied so
  // the chosen sfeer (warm/moody/scandi/...) is unmistakable
  if (palette.rasterFilter) {
    ctx.filter = palette.rasterFilter;
  }
  ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
  ctx.filter = 'none';

  // 5. Subtle multiply tint on top — pushes the palette accent further
  if (palette.floorColor !== '#ffffff') {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = palette.floorColor;
    ctx.fillRect(dx, dy, dw, dh);
    ctx.restore();
  }
  ctx.restore(); // releases the polygon clip

  // 6. Draw the polygon outline in the palette wall color so users can
  // see the boundary they confirmed
  ctx.save();
  ctx.beginPath();
  unit.polygon.forEach((p, i) => {
    const pt = polyToCanvas(p);
    if (i === 0) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  });
  ctx.closePath();
  ctx.strokeStyle = palette.wallColor;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();

  // 7. Label badge in the top-left corner of the crop
  drawUnitBadge(ctx, unit, dx + 30, dy + 18, palette);

  // 8. Classification note when not hoofdtype
  if (unit.classification === 'gespiegeld') {
    drawCornerNote(ctx, dx + dw - 12, dy + 18, 'Gespiegeld', '#0ea5e9');
  } else if (unit.classification === 'variant') {
    drawCornerNote(ctx, dx + dw - 12, dy + 18, 'Variant', '#a855f7');
  }

  // 9. User edits — drop added furniture at annotation positions
  for (const edit of edits) {
    if (edit.action === 'remove') continue;
    const newId = edit.newItem;
    if (!newId) continue;
    const item = FURNITURE[newId as FurnitureId];
    if (!item) continue;

    // Annotation lives in 0..1 of the canvas
    const ann = edit.area;
    const targetX = ann.cx * cw;
    const targetY = ann.cy * ch;

    // Skip if the annotation falls outside the crop box (user marked
    // something off-image)
    if (targetX < dx || targetX > dx + dw || targetY < dy || targetY > dy + dh) {
      continue;
    }

    const fw = Math.min(dw, dh) * 0.12;
    const fh = (item.height / item.width) * fw;
    ctx.save();
    ctx.translate(targetX - fw / 2, targetY - fh / 2);
    item.draw(ctx, fw, fh, palette);
    ctx.restore();

    // Marker pin so it's clear this came from feedback
    ctx.save();
    ctx.beginPath();
    ctx.arc(targetX, targetY, 5, 0, Math.PI * 2);
    ctx.fillStyle = palette.accentColor;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
}

/** Small chip in the top-right corner ("Gespiegeld" / "Variant"). */
function drawCornerNote(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  dotColor: string
) {
  ctx.save();
  ctx.font = '600 11px "Inter", sans-serif';
  const tw = ctx.measureText(text).width;
  const padX = 7;
  const padY = 4;
  const bw = tw + padX * 2 + 12;
  const bh = 18;
  const bx = x - bw;
  const by = y - bh / 2;

  // Pill background
  const r = bh / 2;
  ctx.beginPath();
  ctx.moveTo(bx + r, by);
  ctx.lineTo(bx + bw - r, by);
  ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + r);
  ctx.lineTo(bx + bw, by + bh - r);
  ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - r, by + bh);
  ctx.lineTo(bx + r, by + bh);
  ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - r);
  ctx.lineTo(bx, by + r);
  ctx.quadraticCurveTo(bx, by, bx + r, by);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Dot
  ctx.beginPath();
  ctx.arc(bx + padX + 3, by + bh / 2, 3, 0, Math.PI * 2);
  ctx.fillStyle = dotColor;
  ctx.fill();

  // Text
  ctx.fillStyle = '#374151';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, bx + padX + 12, by + bh / 2);

  ctx.restore();
}

/** Pill-shaped badge with the unit's label, classification color-coded. */
function drawUnitBadge(
  ctx: CanvasRenderingContext2D,
  unit: DetectedUnit,
  cx: number,
  cy: number,
  palette: Palette
) {
  const label = unit.label;
  const cls = unit.classification;
  const fontSize = 12;
  ctx.save();
  ctx.font = `600 ${fontSize}px ${palette.fontFamily}`;
  const tw = ctx.measureText(label).width;
  const padX = 6;
  const padY = 3;
  const bw = tw + padX * 2;
  const bh = fontSize + padY * 2;
  const bx = cx - bw / 2;
  const by = cy - bh / 2;

  // Background pill
  const r = bh / 2;
  ctx.beginPath();
  ctx.moveTo(bx + r, by);
  ctx.lineTo(bx + bw - r, by);
  ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + r);
  ctx.lineTo(bx + bw, by + bh - r);
  ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - r, by + bh);
  ctx.lineTo(bx + r, by + bh);
  ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - r);
  ctx.lineTo(bx, by + r);
  ctx.quadraticCurveTo(bx, by, bx + r, by);
  ctx.closePath();
  ctx.fillStyle =
    cls === 'gespiegeld'
      ? mix(palette.accentColor, '#ffffff', 0.4)
      : cls === 'variant'
      ? mix(palette.accentColor, '#ffffff', 0.2)
      : palette.wallColor;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Text
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, cx, cy);

  // Tiny classification marker dot to the right of the pill
  if (cls && cls !== 'hoofdtype') {
    const dotX = bx + bw + 4;
    const dotY = cy;
    ctx.beginPath();
    ctx.arc(dotX, dotY, 3, 0, Math.PI * 2);
    ctx.fillStyle = cls === 'gespiegeld' ? '#0ea5e9' : '#a855f7';
    ctx.fill();
  }

  ctx.restore();
}

function drawFloor(
  ctx: CanvasRenderingContext2D,
  room: LaidOutRoom,
  palette: Palette,
  px: (n: number) => number,
  py: (n: number) => number
) {
  const rx = px(room.x);
  const ry = py(room.y);
  const rw = px(room.x + room.w) - rx;
  const rh = py(room.y + room.h) - ry;

  // Pick the right base color
  let fill = palette.floorColor;
  if (room.kind === 'bathroom' || room.kind === 'toilet' || room.kind === 'storage') {
    fill = palette.tileColor;
  } else if (room.kind === 'outdoor') {
    fill = palette.outdoorColor;
  } else if (room.kind === 'hallway') {
    // Slightly desaturated version of floor
    fill = mix(palette.floorColor, palette.tileColor, 0.4);
  }

  ctx.fillStyle = fill;
  ctx.fillRect(rx, ry, rw, rh);

  // Pattern overlay (only for living/sleeping/kitchen — bathroom/toilet
  // get a small tile grid even when palette is plank).
  if (room.kind === 'bathroom' || room.kind === 'toilet' || room.kind === 'storage') {
    drawTileGrid(ctx, rx, ry, rw, rh, palette);
  } else if (room.kind === 'outdoor') {
    drawOutdoorTexture(ctx, rx, ry, rw, rh, palette);
  } else {
    switch (palette.floorPattern) {
      case 'plank':
        drawPlanks(ctx, rx, ry, rw, rh, palette);
        break;
      case 'herringbone':
        drawHerringbone(ctx, rx, ry, rw, rh, palette);
        break;
      case 'tile':
        drawTileGrid(ctx, rx, ry, rw, rh, palette);
        break;
      case 'flat':
      default:
        // No-op
        break;
    }
  }
}

function drawPlanks(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  palette: Palette
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = mix(palette.floorColor, palette.wallColor, 0.18);
  ctx.lineWidth = 0.6;
  const plankH = Math.max(8, h / 12);
  for (let yy = y; yy < y + h; yy += plankH) {
    ctx.beginPath();
    ctx.moveTo(x, yy);
    ctx.lineTo(x + w, yy);
    ctx.stroke();
  }
  // Random short vertical seams to fake plank ends
  for (let yy = y; yy < y + h; yy += plankH) {
    const seamCount = Math.max(2, Math.floor(w / (plankH * 4)));
    for (let i = 1; i <= seamCount; i++) {
      const offset = ((yy / plankH) * 0.37 + i * 0.61) % 1;
      const xx = x + offset * w;
      ctx.beginPath();
      ctx.moveTo(xx, yy);
      ctx.lineTo(xx, yy + plankH);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawHerringbone(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  palette: Palette
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = mix(palette.floorColor, palette.wallColor, 0.22);
  ctx.lineWidth = 0.6;
  const step = Math.max(10, h / 10);
  for (let yy = y - w; yy < y + h + w; yy += step) {
    ctx.beginPath();
    ctx.moveTo(x, yy);
    ctx.lineTo(x + w, yy + w * 0.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, yy);
    ctx.lineTo(x + w, yy - w * 0.5);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTileGrid(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  palette: Palette
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = mix(palette.tileColor, palette.wallColor, 0.18);
  ctx.lineWidth = 0.6;
  const tile = Math.max(10, Math.min(w, h) / 6);
  for (let xx = x; xx < x + w; xx += tile) {
    ctx.beginPath();
    ctx.moveTo(xx, y);
    ctx.lineTo(xx, y + h);
    ctx.stroke();
  }
  for (let yy = y; yy < y + h; yy += tile) {
    ctx.beginPath();
    ctx.moveTo(x, yy);
    ctx.lineTo(x + w, yy);
    ctx.stroke();
  }
  ctx.restore();
}

function drawOutdoorTexture(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  palette: Palette
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = mix(palette.outdoorColor, palette.wallColor, 0.18);
  ctx.lineWidth = 0.6;
  const step = Math.max(8, Math.min(w, h) / 10);
  for (let xx = x; xx < x + w; xx += step) {
    ctx.beginPath();
    ctx.moveTo(xx, y);
    ctx.lineTo(xx, y + h);
    ctx.stroke();
  }
  for (let yy = y; yy < y + h; yy += step) {
    ctx.beginPath();
    ctx.moveTo(x, yy);
    ctx.lineTo(x + w, yy);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draw the wall lines that separate adjacent rooms. We treat shared
 * edges as walls, but skip the segment where outdoor meets indoor and
 * leave a "doorway" gap when two indoor rooms touch.
 */
function drawInteriorWalls(
  ctx: CanvasRenderingContext2D,
  rooms: LaidOutRoom[],
  palette: Palette,
  wallPx: number,
  px: (n: number) => number,
  py: (n: number) => number
) {
  ctx.strokeStyle = palette.wallColor;
  ctx.lineWidth = wallPx;
  ctx.lineCap = 'butt';

  for (let i = 0; i < rooms.length; i++) {
    const a = rooms[i];
    for (let j = i + 1; j < rooms.length; j++) {
      const b = rooms[j];

      // Vertical shared edge?
      if (Math.abs(a.x + a.w - b.x) < 0.01 || Math.abs(b.x + b.w - a.x) < 0.01) {
        const sharedYStart = Math.max(a.y, b.y);
        const sharedYEnd = Math.min(a.y + a.h, b.y + b.h);
        if (sharedYEnd > sharedYStart + 0.5) {
          const sharedX =
            Math.abs(a.x + a.w - b.x) < 0.01 ? a.x + a.w : b.x + b.w;
          drawWallWithDoor(
            ctx,
            px(sharedX),
            py(sharedYStart),
            px(sharedX),
            py(sharedYEnd),
            !shouldHaveDoor(a, b),
            palette.pageBg
          );
        }
      }

      // Horizontal shared edge?
      if (Math.abs(a.y + a.h - b.y) < 0.01 || Math.abs(b.y + b.h - a.y) < 0.01) {
        const sharedXStart = Math.max(a.x, b.x);
        const sharedXEnd = Math.min(a.x + a.w, b.x + b.w);
        if (sharedXEnd > sharedXStart + 0.5) {
          const sharedY =
            Math.abs(a.y + a.h - b.y) < 0.01 ? a.y + a.h : b.y + b.h;
          drawWallWithDoor(
            ctx,
            px(sharedXStart),
            py(sharedY),
            px(sharedXEnd),
            py(sharedY),
            !shouldHaveDoor(a, b),
            palette.pageBg
          );
        }
      }
    }
  }
}

/** True if there should be a door between these two rooms. */
function shouldHaveDoor(a: LaidOutRoom, b: LaidOutRoom): boolean {
  // Outdoor never gets a "doorway gap" — drawn as solid wall (sliding door is implicit).
  if (a.kind === 'outdoor' || b.kind === 'outdoor') return false;
  // Storage / hallway connect openly.
  if (a.kind === 'hallway' || b.kind === 'hallway') return true;
  // Bedroom-bathroom always has a door.
  if (
    (a.kind === 'bedroom' && b.kind === 'bathroom') ||
    (b.kind === 'bedroom' && a.kind === 'bathroom')
  )
    return true;
  // Living-kitchen open passage.
  if (
    (a.kind === 'living' && b.kind === 'kitchen') ||
    (b.kind === 'living' && a.kind === 'kitchen')
  )
    return true;
  return true;
}

function drawWallWithDoor(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  solid: boolean,
  bgColor: string
) {
  if (solid) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    return;
  }
  // Carve out a 0.9 m doorway near the middle.
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len < 30) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    return;
  }
  const doorSize = Math.min(len * 0.35, 32);
  const doorStart = (len - doorSize) / 2;
  const doorEnd = doorStart + doorSize;
  const tx = (x2 - x1) / len;
  const ty = (y2 - y1) / len;

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 + tx * doorStart, y1 + ty * doorStart);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x1 + tx * doorEnd, y1 + ty * doorEnd);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // Draw door arc swing
  const arcCx = x1 + tx * doorStart;
  const arcCy = y1 + ty * doorStart;
  const angle = Math.atan2(ty, tx);
  ctx.save();
  ctx.strokeStyle = ctx.strokeStyle;
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.arc(arcCx, arcCy, doorSize, angle, angle + Math.PI / 2);
  ctx.stroke();
  // Door leaf line
  ctx.beginPath();
  ctx.moveTo(arcCx, arcCy);
  ctx.lineTo(arcCx + Math.cos(angle + Math.PI / 2) * doorSize, arcCy + Math.sin(angle + Math.PI / 2) * doorSize);
  ctx.stroke();
  ctx.restore();

  // Doorway gap "fill" with bg so the floor lines underneath don't show
  // through the wall break.
  ctx.save();
  ctx.fillStyle = bgColor;
  const halfW = 1.5;
  ctx.fillRect(arcCx - halfW, arcCy - halfW, doorSize, halfW * 2);
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* Furniture placement                                                 */
/* ------------------------------------------------------------------ */

interface PlacedItem {
  id: FurnitureId;
  x: number;
  y: number;
  w: number;
  h: number;
  rotated: boolean;
  /** Which room this item lives in (used by the edit applier). */
  roomIndex: number;
  /** True if the user added it via feedback (drawn slightly differently). */
  fromEdit?: boolean;
}

/** Auto-place furniture for one room and append the results to `out`. */
function placeFurnitureForRoom(
  room: LaidOutRoom,
  pxPerM: number,
  px: (n: number) => number,
  py: (n: number) => number,
  out: PlacedItem[],
  roomIndex: number = -1
) {
  const recipe = ROOM_FURNITURE[room.kind];
  if (!recipe || recipe.length === 0) return;

  const rx = px(room.x);
  const ry = py(room.y);
  const rw = px(room.x + room.w) - rx;
  const rh = py(room.y + room.h) - ry;

  const padding = Math.min(rw, rh) * 0.08;
  const innerX = rx + padding;
  const innerY = ry + padding;
  const innerW = rw - padding * 2;
  const innerH = rh - padding * 2;

  const localPlaced: Array<{ x: number; y: number; w: number; h: number }> = [];
  const idx = roomIndex >= 0 ? roomIndex : out.length;

  for (const id of recipe) {
    const item = FURNITURE[id];
    if (!item) continue;
    const result = tryPlaceItem(
      item,
      pxPerM,
      innerX,
      innerY,
      innerW,
      innerH,
      padding * 0.4,
      localPlaced
    );
    if (result) {
      localPlaced.push(result);
      out.push({ id, ...result, roomIndex: idx });
    }
  }
}

function tryPlaceItem(
  item: FurnitureItem,
  pxPerM: number,
  innerX: number,
  innerY: number,
  innerW: number,
  innerH: number,
  margin: number,
  existing: Array<{ x: number; y: number; w: number; h: number }>
): { x: number; y: number; w: number; h: number; rotated: boolean } | null {
  const candidates: Array<{ w: number; h: number; rotated: boolean }> = [
    { w: item.width * pxPerM, h: item.height * pxPerM, rotated: false },
    { w: item.height * pxPerM, h: item.width * pxPerM, rotated: true },
  ];

  for (const c of candidates) {
    if (c.w > innerW || c.h > innerH) continue;
    const positions: Array<[number, number]> = [
      [innerX, innerY],
      [innerX + innerW - c.w, innerY],
      [innerX, innerY + innerH - c.h],
      [innerX + innerW - c.w, innerY + innerH - c.h],
      [innerX + (innerW - c.w) / 2, innerY + (innerH - c.h) / 2],
    ];
    for (const [cx, cy] of positions) {
      const bbox = { x: cx, y: cy, w: c.w, h: c.h };
      if (overlapsAny(bbox, existing, margin)) continue;
      return { ...bbox, rotated: c.rotated };
    }
  }
  return null;
}

function overlapsAny(
  bbox: { x: number; y: number; w: number; h: number },
  others: Array<{ x: number; y: number; w: number; h: number }>,
  margin: number
): boolean {
  for (const o of others) {
    if (
      bbox.x < o.x + o.w + margin &&
      bbox.x + bbox.w + margin > o.x &&
      bbox.y < o.y + o.h + margin &&
      bbox.y + bbox.h + margin > o.y
    ) {
      return true;
    }
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Edit application                                                    */
/* ------------------------------------------------------------------ */

/**
 * Apply user-feedback edits on top of auto-placed furniture.
 *
 * Annotation coordinates are 0..1 relative to the *whole canvas*
 * (because that's what the overlay draws), so we convert to canvas
 * pixels via the renderer's draw box and intersect each edit with the
 * room layout.
 */
function applyEdits(
  placed: PlacedItem[],
  edits: PlanEdit[],
  rooms: LaidOutRoom[],
  pxPerM: number,
  drawX: number,
  drawY: number,
  drawW: number,
  drawH: number
): PlacedItem[] {
  if (edits.length === 0) return placed;

  // We're working off the canvas, but PlanRenderer is anchored to the
  // canvas top-left. The annotation overlay also lives in the same
  // coordinate system, so 0..1 fractions of the canvas multiplied by
  // canvas size give us pixels.
  //
  // The renderer canvas is the same physical canvas; we have its
  // logical size via drawX/Y/W/H plus the page padding (drawX/drawY
  // are the inner box origin). For coordinate conversion we need the
  // full canvas dimensions, not the inner box.
  //
  // We can recover them: the page padding is RENDER_PADDING on each
  // side, so canvas_w = drawW / (1 - 2*RENDER_PADDING) iff aspect
  // matches. That assumption breaks when the inner box is letterboxed,
  // so instead we walk back via drawX = canvas_w * RENDER_PADDING when
  // the box is the limiting axis. Cleanest: pass canvas size in.
  // Since this helper doesn't have it, derive an approximate canvas
  // bbox from drawX/drawY: canvasW = drawX * 2 + drawW (since the box
  // is centered horizontally) — same for vertical.
  const canvasW = drawX * 2 + drawW;
  const canvasH = drawY * 2 + drawH;

  let next = [...placed];

  for (const edit of edits) {
    const rect = annotationToCanvasRect(edit.area, canvasW, canvasH);
    if (!rect) continue;

    if (edit.action === 'remove' || edit.action === 'replace') {
      next = next.filter((item) => {
        if (!rectsOverlap(item, rect)) return true;
        if (edit.targetItem && item.id !== edit.targetItem) return true;
        return false;
      });
    }

    if (edit.action === 'add' || edit.action === 'replace') {
      const newId = edit.newItem as FurnitureId | undefined;
      if (!newId || !FURNITURE[newId]) continue;

      // Try to drop the new item inside the rect, snapping to whichever
      // room the rect overlaps the most.
      const room = pickRoomForRect(rooms, rect, drawX, drawY, drawW, drawH);
      const padding = Math.min(rect.w, rect.h) * 0.08;
      const innerX = rect.x + padding;
      const innerY = rect.y + padding;
      const innerW = Math.max(20, rect.w - padding * 2);
      const innerH = Math.max(20, rect.h - padding * 2);

      const result = tryPlaceItem(
        FURNITURE[newId],
        pxPerM,
        innerX,
        innerY,
        innerW,
        innerH,
        4,
        next.map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h }))
      );
      if (result) {
        next.push({
          id: newId,
          ...result,
          roomIndex: room ?? -1,
          fromEdit: true,
        });
      } else {
        // Fall back to placing at the rect center even if there's
        // overlap — better to show the edit than silently drop it.
        const item = FURNITURE[newId];
        const w = item.width * pxPerM;
        const h = item.height * pxPerM;
        next.push({
          id: newId,
          x: rect.x + rect.w / 2 - w / 2,
          y: rect.y + rect.h / 2 - h / 2,
          w,
          h,
          rotated: false,
          roomIndex: room ?? -1,
          fromEdit: true,
        });
      }
    }
  }

  return next;
}

function annotationToCanvasRect(
  shape: AnnotationShape,
  canvasW: number,
  canvasH: number
): { x: number; y: number; w: number; h: number } | null {
  if (shape.kind === 'circle') {
    const r = shape.r * Math.min(canvasW, canvasH);
    return {
      x: shape.cx * canvasW - r,
      y: shape.cy * canvasH - r,
      w: r * 2,
      h: r * 2,
    };
  }
  return {
    x: (shape.cx - shape.w / 2) * canvasW,
    y: (shape.cy - shape.h / 2) * canvasH,
    w: shape.w * canvasW,
    h: shape.h * canvasH,
  };
}

function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
): boolean {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

/** Find which laid-out room overlaps the rect the most. */
function pickRoomForRect(
  rooms: LaidOutRoom[],
  rect: { x: number; y: number; w: number; h: number },
  drawX: number,
  drawY: number,
  drawW: number,
  drawH: number
): number | null {
  let bestIdx: number | null = null;
  let bestArea = 0;
  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i];
    const rx = drawX + (r.x / 100) * drawW;
    const ry = drawY + (r.y / 100) * drawH;
    const rw = (r.w / 100) * drawW;
    const rh = (r.h / 100) * drawH;
    const ix = Math.max(rect.x, rx);
    const iy = Math.max(rect.y, ry);
    const iw = Math.min(rect.x + rect.w, rx + rw) - ix;
    const ih = Math.min(rect.y + rect.h, ry + rh) - iy;
    if (iw <= 0 || ih <= 0) continue;
    const area = iw * ih;
    if (area > bestArea) {
      bestArea = area;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function drawFurniture(
  ctx: CanvasRenderingContext2D,
  item: FurnitureItem,
  x: number,
  y: number,
  w: number,
  h: number,
  rotated: boolean,
  palette: Palette
) {
  ctx.save();
  ctx.translate(x, y);
  if (rotated) {
    // Rotate 90° around top-left so we can pretend we're drawing in
    // the item's natural orientation. After rotation our drawing
    // commands need to use w (the natural width) and h (natural height).
    ctx.translate(w, 0);
    ctx.rotate(Math.PI / 2);
    // Inside item.draw, the natural orientation expects (item.width, item.height)
    // measured in pixels. Since we passed in (w,h) as the *rotated* sizes,
    // we need to swap when calling.
    item.draw(ctx, h, w, palette);
  } else {
    item.draw(ctx, w, h, palette);
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* Labels                                                              */
/* ------------------------------------------------------------------ */

function drawLabel(
  ctx: CanvasRenderingContext2D,
  room: LaidOutRoom,
  palette: Palette,
  px: (n: number) => number,
  py: (n: number) => number,
  drawW: number
) {
  const rx = px(room.x);
  const ry = py(room.y);
  const rw = px(room.x + room.w) - rx;
  const rh = py(room.y + room.h) - ry;

  // Skip labels in tiny rooms
  if (rw < 40 || rh < 30) return;

  ctx.save();
  ctx.fillStyle = palette.labelColor;
  const baseSize = Math.max(11, Math.min(18, drawW / 36));
  ctx.font = `500 ${baseSize}px ${palette.fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const cx = rx + rw / 2;
  const cy = ry + rh / 2;

  ctx.fillText(room.source.label, cx, cy - baseSize * 0.5);

  if (room.source.area && room.source.area > 0) {
    ctx.font = `400 ${baseSize * 0.78}px ${palette.fontFamily}`;
    ctx.fillStyle = mix(palette.labelColor, '#ffffff', 0.35);
    ctx.fillText(`${room.source.area.toFixed(1)} m²`, cx, cy + baseSize * 0.5);
  }

  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* Color helpers                                                       */
/* ------------------------------------------------------------------ */

function mix(a: string, b: string, t: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  const r = Math.round(ca.r + (cb.r - ca.r) * t);
  const g = Math.round(ca.g + (cb.g - ca.g) * t);
  const bl = Math.round(ca.b + (cb.b - ca.b) * t);
  return `rgb(${r},${g},${bl})`;
}

function parseHex(c: string): { r: number; g: number; b: number } {
  if (c.startsWith('rgb')) {
    const m = c.match(/\d+/g);
    if (m && m.length >= 3) {
      return { r: Number(m[0]), g: Number(m[1]), b: Number(m[2]) };
    }
  }
  let s = c.replace('#', '');
  if (s.length === 3) s = s.split('').map((ch) => ch + ch).join('');
  return {
    r: parseInt(s.slice(0, 2), 16) || 0,
    g: parseInt(s.slice(2, 4), 16) || 0,
    b: parseInt(s.slice(4, 6), 16) || 0,
  };
}
