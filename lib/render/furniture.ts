/**
 * Tiny furniture library used by the floorplan renderer.
 *
 * Each item is a top-down 2D primitive drawn straight onto a Canvas
 * 2D context, sized in *meters* (real-world units). The renderer
 * scales them to canvas pixels via the unit's m²-to-pixel ratio.
 *
 * Items are deliberately schematic — we're not trying to compete with
 * Photoshop drawings, just produce a consistent commercial-style plan.
 *
 * Adding a new piece is a 2-step job:
 *   1. add an entry to FURNITURE
 *   2. (optionally) add it to ROOM_FURNITURE so it auto-places in
 *      the right room kind
 */

import type { Palette } from './palettes';
import type { RoomKind } from './room-layout';

export type FurnitureId =
  | 'double-bed'
  | 'single-bed'
  | 'sofa'
  | 'sofa-corner'
  | 'lounge-chair'
  | 'dining-table'
  | 'dining-table-large'
  | 'kitchen-island'
  | 'kitchen-counter'
  | 'rug'
  | 'rug-large'
  | 'plant'
  | 'plant-small'
  | 'toilet'
  | 'sink'
  | 'shower'
  | 'bath'
  | 'desk'
  | 'office-chair'
  | 'wardrobe'
  | 'balcony-chairs'
  | 'tv-bench';

export interface FurnitureItem {
  id: FurnitureId;
  /** Human-readable Dutch name. */
  name: string;
  /** Width in meters. */
  width: number;
  /** Height (depth) in meters. */
  height: number;
  /** Recommended room kinds — used by auto-place. */
  rooms: RoomKind[];
  /** Drawing primitive — receives a context already translated/rotated. */
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number, palette: Palette) => void;
}

/* ------------------------------------------------------------------ */
/* Drawing helpers                                                     */
/* ------------------------------------------------------------------ */

function fillRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function strokeRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  fillRoundedRect(ctx, x, y, w, h, r);
  ctx.stroke();
}

/* ------------------------------------------------------------------ */
/* Items                                                               */
/* ------------------------------------------------------------------ */

export const FURNITURE: Record<FurnitureId, FurnitureItem> = {
  'double-bed': {
    id: 'double-bed',
    name: 'Tweepersoonsbed',
    width: 1.6,
    height: 2.0,
    rooms: ['bedroom'],
    draw: (ctx, w, h, p) => {
      // Mattress
      ctx.fillStyle = p.furnitureFill;
      fillRoundedRect(ctx, 0, 0, w, h, h * 0.05);
      ctx.fill();
      ctx.strokeStyle = p.furnitureStroke;
      ctx.lineWidth = 0.02;
      strokeRoundedRect(ctx, 0, 0, w, h, h * 0.05);
      // Pillows along the top edge
      const pillowH = h * 0.18;
      ctx.fillStyle = '#ffffff';
      fillRoundedRect(ctx, w * 0.07, h * 0.05, w * 0.4, pillowH, pillowH * 0.3);
      ctx.fill();
      ctx.stroke();
      fillRoundedRect(ctx, w * 0.53, h * 0.05, w * 0.4, pillowH, pillowH * 0.3);
      ctx.fill();
      ctx.stroke();
      // Duvet line
      ctx.beginPath();
      ctx.moveTo(w * 0.05, h * 0.32);
      ctx.lineTo(w * 0.95, h * 0.32);
      ctx.stroke();
    },
  },
  'single-bed': {
    id: 'single-bed',
    name: 'Eenpersoonsbed',
    width: 0.9,
    height: 2.0,
    rooms: ['bedroom'],
    draw: (ctx, w, h, p) => {
      ctx.fillStyle = p.furnitureFill;
      fillRoundedRect(ctx, 0, 0, w, h, h * 0.05);
      ctx.fill();
      ctx.strokeStyle = p.furnitureStroke;
      ctx.lineWidth = 0.02;
      strokeRoundedRect(ctx, 0, 0, w, h, h * 0.05);
      // Pillow
      const pillowH = h * 0.18;
      ctx.fillStyle = '#ffffff';
      fillRoundedRect(ctx, w * 0.1, h * 0.05, w * 0.8, pillowH, pillowH * 0.3);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(w * 0.05, h * 0.32);
      ctx.lineTo(w * 0.95, h * 0.32);
      ctx.stroke();
    },
  },
  sofa: {
    id: 'sofa',
    name: 'Bank (3-zit)',
    width: 2.2,
    height: 0.9,
    rooms: ['living'],
    draw: (ctx, w, h, p) => {
      // Backrest band along top
      ctx.fillStyle = p.accentColor;
      fillRoundedRect(ctx, 0, 0, w, h * 0.32, h * 0.16);
      ctx.fill();
      ctx.strokeStyle = p.furnitureStroke;
      ctx.lineWidth = 0.02;
      ctx.stroke();
      // Seat cushions
      ctx.fillStyle = p.furnitureFill;
      fillRoundedRect(ctx, h * 0.1, h * 0.3, w - h * 0.2, h * 0.6, h * 0.18);
      ctx.fill();
      ctx.stroke();
      // Cushion divisions
      ctx.beginPath();
      const divs = 3;
      for (let i = 1; i < divs; i++) {
        const dx = (w / divs) * i;
        ctx.moveTo(dx, h * 0.3);
        ctx.lineTo(dx, h * 0.85);
      }
      ctx.stroke();
    },
  },
  'sofa-corner': {
    id: 'sofa-corner',
    name: 'Hoekbank',
    width: 2.6,
    height: 1.8,
    rooms: ['living'],
    draw: (ctx, w, h, p) => {
      // L-shape: long horizontal + short vertical leg
      ctx.fillStyle = p.furnitureFill;
      fillRoundedRect(ctx, 0, 0, w, h * 0.45, h * 0.1);
      ctx.fill();
      ctx.strokeStyle = p.furnitureStroke;
      ctx.lineWidth = 0.02;
      ctx.stroke();
      fillRoundedRect(ctx, 0, 0, h * 0.55, h, h * 0.1);
      ctx.fill();
      ctx.stroke();
      // Accent backrest band
      ctx.fillStyle = p.accentColor;
      fillRoundedRect(ctx, 0, 0, w, h * 0.12, h * 0.05);
      ctx.fill();
      fillRoundedRect(ctx, 0, 0, h * 0.18, h, h * 0.05);
      ctx.fill();
    },
  },
  'lounge-chair': {
    id: 'lounge-chair',
    name: 'Loungestoel',
    width: 0.9,
    height: 0.9,
    rooms: ['living'],
    draw: (ctx, w, h, p) => {
      ctx.fillStyle = p.furnitureFill;
      fillRoundedRect(ctx, 0, 0, w, h, h * 0.18);
      ctx.fill();
      ctx.strokeStyle = p.furnitureStroke;
      ctx.lineWidth = 0.02;
      ctx.stroke();
    },
  },
  'dining-table': {
    id: 'dining-table',
    name: 'Eettafel (4p)',
    width: 1.4,
    height: 0.9,
    rooms: ['kitchen', 'living'],
    draw: (ctx, w, h, p) => {
      // Table surface
      ctx.fillStyle = p.furnitureFill;
      fillRoundedRect(ctx, 0, 0, w, h, h * 0.1);
      ctx.fill();
      ctx.strokeStyle = p.furnitureStroke;
      ctx.lineWidth = 0.02;
      ctx.stroke();
      // 4 chair markers
      const cs = 0.32;
      ctx.fillStyle = p.accentColor;
      [
        [-cs, h * 0.2],
        [-cs, h - cs - h * 0.2],
        [w, h * 0.2],
        [w, h - cs - h * 0.2],
      ].forEach(([cx, cy]) => {
        fillRoundedRect(ctx, cx, cy, cs, cs, cs * 0.2);
        ctx.fill();
        ctx.stroke();
      });
    },
  },
  'dining-table-large': {
    id: 'dining-table-large',
    name: 'Eettafel (6p)',
    width: 2.0,
    height: 1.0,
    rooms: ['kitchen', 'living'],
    draw: (ctx, w, h, p) => {
      ctx.fillStyle = p.furnitureFill;
      fillRoundedRect(ctx, 0, 0, w, h, h * 0.12);
      ctx.fill();
      ctx.strokeStyle = p.furnitureStroke;
      ctx.lineWidth = 0.02;
      ctx.stroke();
      const cs = 0.32;
      ctx.fillStyle = p.accentColor;
      [
        [w * 0.15, -cs],
        [w * 0.45, -cs],
        [w * 0.75 - cs, -cs],
        [w * 0.15, h],
        [w * 0.45, h],
        [w * 0.75 - cs, h],
      ].forEach(([cx, cy]) => {
        fillRoundedRect(ctx, cx, cy, cs, cs, cs * 0.2);
        ctx.fill();
        ctx.stroke();
      });
    },
  },
  'kitchen-island': {
    id: 'kitchen-island',
    name: 'Kookeiland',
    width: 2.2,
    height: 0.9,
    rooms: ['kitchen', 'living'],
    draw: (ctx, w, h, p) => {
      ctx.fillStyle = '#cfcfca';
      fillRoundedRect(ctx, 0, 0, w, h, h * 0.06);
      ctx.fill();
      ctx.strokeStyle = p.furnitureStroke;
      ctx.lineWidth = 0.02;
      ctx.stroke();
      // Sink
      ctx.fillStyle = '#a8a8a4';
      fillRoundedRect(ctx, w * 0.1, h * 0.2, w * 0.25, h * 0.6, h * 0.06);
      ctx.fill();
      ctx.stroke();
      // Hob
      ctx.fillStyle = '#1f1f1f';
      fillRoundedRect(ctx, w * 0.6, h * 0.2, w * 0.3, h * 0.6, h * 0.06);
      ctx.fill();
      ctx.stroke();
    },
  },
  'kitchen-counter': {
    id: 'kitchen-counter',
    name: 'Keukenblok',
    width: 2.4,
    height: 0.6,
    rooms: ['kitchen', 'living'],
    draw: (ctx, w, h, p) => {
      ctx.fillStyle = '#cfcfca';
      fillRoundedRect(ctx, 0, 0, w, h, h * 0.1);
      ctx.fill();
      ctx.strokeStyle = p.furnitureStroke;
      ctx.lineWidth = 0.02;
      ctx.stroke();
      // Cabinet divisions
      ctx.beginPath();
      for (let i = 1; i < 4; i++) {
        const dx = (w / 4) * i;
        ctx.moveTo(dx, 0);
        ctx.lineTo(dx, h);
      }
      ctx.stroke();
    },
  },
  rug: {
    id: 'rug',
    name: 'Vloerkleed',
    width: 1.8,
    height: 1.4,
    rooms: ['living', 'bedroom'],
    draw: (ctx, w, h, p) => {
      ctx.fillStyle = p.accentColor;
      ctx.globalAlpha = 0.35;
      fillRoundedRect(ctx, 0, 0, w, h, h * 0.05);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = p.accentColor;
      ctx.lineWidth = 0.015;
      ctx.setLineDash([0.08, 0.04]);
      ctx.stroke();
      ctx.setLineDash([]);
    },
  },
  'rug-large': {
    id: 'rug-large',
    name: 'Vloerkleed (groot)',
    width: 2.6,
    height: 1.8,
    rooms: ['living'],
    draw: (ctx, w, h, p) => {
      ctx.fillStyle = p.accentColor;
      ctx.globalAlpha = 0.3;
      fillRoundedRect(ctx, 0, 0, w, h, h * 0.04);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = p.accentColor;
      ctx.lineWidth = 0.02;
      ctx.setLineDash([0.1, 0.05]);
      ctx.stroke();
      ctx.setLineDash([]);
    },
  },
  plant: {
    id: 'plant',
    name: 'Plant',
    width: 0.5,
    height: 0.5,
    rooms: ['living', 'bedroom', 'office', 'outdoor'],
    draw: (ctx, w, h, p) => {
      ctx.fillStyle = '#5b7a4a';
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, Math.min(w, h) / 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = p.furnitureStroke;
      ctx.lineWidth = 0.015;
      ctx.stroke();
      ctx.fillStyle = '#3d5a30';
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, Math.min(w, h) / 4, 0, Math.PI * 2);
      ctx.fill();
    },
  },
  'plant-small': {
    id: 'plant-small',
    name: 'Plant (klein)',
    width: 0.3,
    height: 0.3,
    rooms: ['bathroom', 'kitchen'],
    draw: (ctx, w, h, p) => {
      ctx.fillStyle = '#5b7a4a';
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, Math.min(w, h) / 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = p.furnitureStroke;
      ctx.lineWidth = 0.015;
      ctx.stroke();
    },
  },
  toilet: {
    id: 'toilet',
    name: 'Toilet',
    width: 0.45,
    height: 0.7,
    rooms: ['toilet', 'bathroom'],
    draw: (ctx, w, h, p) => {
      ctx.fillStyle = '#ffffff';
      // Tank
      fillRoundedRect(ctx, w * 0.1, 0, w * 0.8, h * 0.35, h * 0.04);
      ctx.fill();
      ctx.strokeStyle = p.furnitureStroke;
      ctx.lineWidth = 0.02;
      ctx.stroke();
      // Bowl
      ctx.beginPath();
      ctx.ellipse(w / 2, h * 0.7, w * 0.42, h * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    },
  },
  sink: {
    id: 'sink',
    name: 'Wastafel',
    width: 0.7,
    height: 0.45,
    rooms: ['bathroom', 'toilet'],
    draw: (ctx, w, h, p) => {
      ctx.fillStyle = '#ffffff';
      fillRoundedRect(ctx, 0, 0, w, h, h * 0.15);
      ctx.fill();
      ctx.strokeStyle = p.furnitureStroke;
      ctx.lineWidth = 0.02;
      ctx.stroke();
      // Basin
      ctx.beginPath();
      ctx.ellipse(w / 2, h / 2 + 0.02, w * 0.35, h * 0.3, 0, 0, Math.PI * 2);
      ctx.stroke();
    },
  },
  shower: {
    id: 'shower',
    name: 'Douche',
    width: 0.9,
    height: 0.9,
    rooms: ['bathroom'],
    draw: (ctx, w, h, p) => {
      ctx.fillStyle = '#e6e6e2';
      fillRoundedRect(ctx, 0, 0, w, h, h * 0.05);
      ctx.fill();
      ctx.strokeStyle = p.furnitureStroke;
      ctx.lineWidth = 0.02;
      ctx.stroke();
      // Drain center
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, Math.min(w, h) * 0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Diagonal lines for tile feel
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(w, h);
      ctx.moveTo(w, 0);
      ctx.lineTo(0, h);
      ctx.lineWidth = 0.015;
      ctx.stroke();
    },
  },
  bath: {
    id: 'bath',
    name: 'Bad',
    width: 1.7,
    height: 0.7,
    rooms: ['bathroom'],
    draw: (ctx, w, h, p) => {
      ctx.fillStyle = '#ffffff';
      fillRoundedRect(ctx, 0, 0, w, h, h * 0.4);
      ctx.fill();
      ctx.strokeStyle = p.furnitureStroke;
      ctx.lineWidth = 0.02;
      ctx.stroke();
      fillRoundedRect(ctx, w * 0.08, h * 0.15, w * 0.84, h * 0.7, h * 0.3);
      ctx.stroke();
    },
  },
  desk: {
    id: 'desk',
    name: 'Bureau',
    width: 1.4,
    height: 0.6,
    rooms: ['office', 'bedroom'],
    draw: (ctx, w, h, p) => {
      ctx.fillStyle = p.furnitureFill;
      fillRoundedRect(ctx, 0, 0, w, h, h * 0.08);
      ctx.fill();
      ctx.strokeStyle = p.furnitureStroke;
      ctx.lineWidth = 0.02;
      ctx.stroke();
    },
  },
  'office-chair': {
    id: 'office-chair',
    name: 'Bureaustoel',
    width: 0.55,
    height: 0.55,
    rooms: ['office'],
    draw: (ctx, w, h, p) => {
      ctx.fillStyle = p.accentColor;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, Math.min(w, h) / 2 - 0.02, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = p.furnitureStroke;
      ctx.lineWidth = 0.02;
      ctx.stroke();
    },
  },
  wardrobe: {
    id: 'wardrobe',
    name: 'Kledingkast',
    width: 1.8,
    height: 0.55,
    rooms: ['bedroom'],
    draw: (ctx, w, h, p) => {
      ctx.fillStyle = p.furnitureFill;
      fillRoundedRect(ctx, 0, 0, w, h, h * 0.08);
      ctx.fill();
      ctx.strokeStyle = p.furnitureStroke;
      ctx.lineWidth = 0.02;
      ctx.stroke();
      // Door splits
      ctx.beginPath();
      for (let i = 1; i < 3; i++) {
        const dx = (w / 3) * i;
        ctx.moveTo(dx, 0);
        ctx.lineTo(dx, h);
      }
      ctx.stroke();
    },
  },
  'balcony-chairs': {
    id: 'balcony-chairs',
    name: 'Balkonset',
    width: 1.4,
    height: 1.1,
    rooms: ['outdoor'],
    draw: (ctx, w, h, p) => {
      ctx.fillStyle = p.furnitureFill;
      // Round table center
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, Math.min(w, h) * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = p.furnitureStroke;
      ctx.lineWidth = 0.02;
      ctx.stroke();
      // Two chairs flanking
      const cs = 0.4;
      [
        [w * 0.05, h / 2 - cs / 2],
        [w - cs - w * 0.05, h / 2 - cs / 2],
      ].forEach(([cx, cy]) => {
        fillRoundedRect(ctx, cx, cy, cs, cs, cs * 0.18);
        ctx.fill();
        ctx.stroke();
      });
    },
  },
  'tv-bench': {
    id: 'tv-bench',
    name: 'TV-meubel',
    width: 1.6,
    height: 0.4,
    rooms: ['living'],
    draw: (ctx, w, h, p) => {
      ctx.fillStyle = p.furnitureFill;
      fillRoundedRect(ctx, 0, 0, w, h, h * 0.15);
      ctx.fill();
      ctx.strokeStyle = p.furnitureStroke;
      ctx.lineWidth = 0.02;
      ctx.stroke();
    },
  },
};

/* ------------------------------------------------------------------ */
/* Auto-place                                                          */
/* ------------------------------------------------------------------ */

/**
 * Recipe of furniture pieces to drop into a room of the given kind.
 * The renderer iterates this list and tries to place each piece; ones
 * that don't fit are skipped silently.
 *
 * Order matters: largest pieces first so the small filler items end up
 * in the corners.
 */
export const ROOM_FURNITURE: Record<RoomKind, FurnitureId[]> = {
  living: ['sofa-corner', 'rug-large', 'tv-bench', 'lounge-chair', 'plant'],
  kitchen: ['kitchen-island', 'dining-table', 'plant-small'],
  bedroom: ['double-bed', 'rug', 'wardrobe', 'plant'],
  bathroom: ['shower', 'sink', 'toilet'],
  toilet: ['toilet', 'sink'],
  hallway: [],
  storage: [],
  outdoor: ['balcony-chairs', 'plant'],
  office: ['desk', 'office-chair', 'plant'],
  other: [],
};
