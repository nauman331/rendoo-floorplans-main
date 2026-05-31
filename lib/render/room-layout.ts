/**
 * Room layout generator.
 *
 * Given a unit and its rooms (type/area/dimensions), produce a packed
 * rectangular layout that the renderer can draw. The output is in
 * normalized 0..100 plan coordinates so the renderer can scale to any
 * canvas size.
 *
 * The algorithm is intentionally simple: a recursive binary partition
 * (a.k.a. "guillotine split") that places rooms in order of decreasing
 * area. It produces clean axis-aligned rectangles that look like a
 * commercial floorplan, even when the source detection didn't supply
 * room polygons.
 *
 * This is NOT meant to reproduce the exact original geometry of the
 * architect's plan — it produces a stylized, schematic version, which
 * is what Rendoo's manual service does anyway.
 */

import type { DetectedRoom, DetectedUnit } from '@/types/project';

/**
 * Coarse classification of a room. Drives floor color (tile vs plank),
 * default furniture, and label position.
 */
export type RoomKind =
  | 'living'      // woonkamer, leefruimte, woonkamer/keuken
  | 'kitchen'     // keuken (standalone)
  | 'bedroom'     // slaapkamer
  | 'bathroom'    // badkamer, douche
  | 'toilet'      // wc, toilet
  | 'hallway'     // hal, inkom, gang, nachthal
  | 'storage'     // berging, wasruimte, technieklokaal
  | 'outdoor'     // balkon, terras, tuin, loggia
  | 'office'      // bureau, werkplek
  | 'other';

export interface LaidOutRoom {
  /** Source room (preserved for label/area). */
  source: DetectedRoom;
  kind: RoomKind;
  /** Coordinates inside the unit's bounding box, all 0..100. */
  x: number;
  y: number;
  w: number;
  h: number;
}

/* ---------------- room kind classification ---------------- */

const KIND_RULES: { kind: RoomKind; patterns: RegExp[] }[] = [
  { kind: 'living',   patterns: [/woon/i, /leef/i, /living/i] },
  { kind: 'kitchen',  patterns: [/keuken/i, /kitchen/i] },
  { kind: 'bedroom',  patterns: [/slaap/i, /bedroom/i, /master/i] },
  { kind: 'bathroom', patterns: [/badkamer/i, /douche/i, /bath/i, /shower/i] },
  { kind: 'toilet',   patterns: [/^wc$/i, /toilet/i] },
  { kind: 'hallway',  patterns: [/inkom/i, /^hal$/i, /nachthal/i, /gang/i, /entry/i] },
  { kind: 'storage',  patterns: [/berging/i, /wasruimte/i, /techniek/i, /storage/i, /utility/i] },
  { kind: 'outdoor',  patterns: [/balkon/i, /terras/i, /tuin/i, /loggia/i, /staanplaats/i] },
  { kind: 'office',   patterns: [/bureau/i, /office/i, /werkplek/i] },
];

export function classifyRoom(room: DetectedRoom): RoomKind {
  const haystack = `${room.label ?? ''} ${room.type ?? ''}`;
  for (const rule of KIND_RULES) {
    if (rule.patterns.some((p) => p.test(haystack))) return rule.kind;
  }
  return 'other';
}

/* ---------------- guillotine packer ---------------- */

interface Slot {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PendingRoom {
  source: DetectedRoom;
  kind: RoomKind;
  /** Target weight relative to total — drives the area split. */
  weight: number;
}

/**
 * Lay out a unit's rooms inside a 0..100 × 0..100 box, leaving a small
 * outdoor strip on one side if any room is classified as outdoor.
 */
export function layoutRoomsForUnit(
  unit: DetectedUnit | null | undefined
): LaidOutRoom[] {
  if (!unit) return [];

  // Synthesize default rooms if the unit has none — this happens with
  // mock units like C8..C15 that only carry a polygon.
  const sourceRooms: DetectedRoom[] = unit.rooms.length
    ? unit.rooms
    : defaultRoomsForArea(unit.area);

  const pending: PendingRoom[] = sourceRooms.map((r) => ({
    source: r,
    kind: classifyRoom(r),
    weight: Math.max(1, r.area || 1),
  }));

  // Pull outdoor rooms aside — they get their own strip on the right.
  const indoor = pending.filter((p) => p.kind !== 'outdoor');
  const outdoor = pending.filter((p) => p.kind === 'outdoor');

  // Reserve up to 22% width on the right for outdoor space if any.
  const outdoorWidth = outdoor.length ? Math.min(22, 14 + outdoor.length * 4) : 0;
  const indoorBox: Slot = { x: 0, y: 0, w: 100 - outdoorWidth, h: 100 };
  const outdoorBox: Slot = { x: 100 - outdoorWidth, y: 0, w: outdoorWidth, h: 100 };

  const out: LaidOutRoom[] = [];
  packRooms(indoor, indoorBox, out);
  if (outdoor.length) packRooms(outdoor, outdoorBox, out);
  return out;
}

/**
 * Recursive guillotine pack — splits the slot horizontally or vertically
 * based on the slot's aspect, putting the largest pending room on one
 * side and recursing on the rest.
 */
function packRooms(rooms: PendingRoom[], slot: Slot, out: LaidOutRoom[]) {
  if (rooms.length === 0) return;
  if (rooms.length === 1) {
    out.push({
      source: rooms[0].source,
      kind: rooms[0].kind,
      ...slot,
    });
    return;
  }

  // Sort biggest first
  const sorted = [...rooms].sort((a, b) => b.weight - a.weight);
  const head = sorted[0];
  const tail = sorted.slice(1);
  const totalWeight = sorted.reduce((s, r) => s + r.weight, 0);
  const headRatio = clamp(head.weight / totalWeight, 0.25, 0.7);

  // Split along the longer axis to keep rooms roughly square
  if (slot.w >= slot.h) {
    const headW = slot.w * headRatio;
    out.push({
      source: head.source,
      kind: head.kind,
      x: slot.x,
      y: slot.y,
      w: headW,
      h: slot.h,
    });
    packRooms(tail, { x: slot.x + headW, y: slot.y, w: slot.w - headW, h: slot.h }, out);
  } else {
    const headH = slot.h * headRatio;
    out.push({
      source: head.source,
      kind: head.kind,
      x: slot.x,
      y: slot.y,
      w: slot.w,
      h: headH,
    });
    packRooms(tail, { x: slot.x, y: slot.y + headH, w: slot.w, h: slot.h - headH }, out);
  }
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * If a unit has no rooms, fabricate a sensible default set so the
 * renderer still has something to draw. Mirrors what a small 2-bedroom
 * apartment would have.
 */
function defaultRoomsForArea(area: number | undefined): DetectedRoom[] {
  // We don't know exact m² breakdowns; share roughly by typical ratios.
  const total = area && area > 0 ? area : 80;
  return [
    { type: 'leefruimte', label: 'Woonkamer / keuken', polygon: [], area: total * 0.42, dimensions: { width: 0, height: 0 } },
    { type: 'slaapkamer', label: 'Slaapkamer 1', polygon: [], area: total * 0.18, dimensions: { width: 0, height: 0 } },
    { type: 'slaapkamer', label: 'Slaapkamer 2', polygon: [], area: total * 0.13, dimensions: { width: 0, height: 0 } },
    { type: 'badkamer', label: 'Badkamer', polygon: [], area: total * 0.07, dimensions: { width: 0, height: 0 } },
    { type: 'wc', label: 'Toilet', polygon: [], area: total * 0.02, dimensions: { width: 0, height: 0 } },
    { type: 'inkom', label: 'Hal', polygon: [], area: total * 0.06, dimensions: { width: 0, height: 0 } },
    { type: 'berging', label: 'Berging', polygon: [], area: total * 0.04, dimensions: { width: 0, height: 0 } },
    { type: 'terras', label: 'Balkon', polygon: [], area: total * 0.08, dimensions: { width: 0, height: 0 } },
  ];
}
