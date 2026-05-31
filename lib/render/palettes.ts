/**
 * Per-stijl color palettes used by the floorplan renderer.
 *
 * Each palette is the visual fingerprint of one of the gallery examples
 * the user can choose in Step 2 (stijl). Picking "warm" gives you the
 * warm wood + terracotta accents you see in that example image; picking
 * "moody" gives you dark walls, herringbone floor and emerald green
 * accents.
 *
 * The renderer reads these values exclusively — no AI involved — so the
 * output is deterministic and reproducible.
 */

import type { Branding } from '@/types/project';

export interface Palette {
  id: string;
  name: string;
  /** Background fill behind the entire plan. */
  pageBg: string;
  /** Outer wall fill — usually dark, almost-black. */
  wallColor: string;
  /** Wall thickness as a fraction of the plan's short edge (0..1). */
  wallWidth: number;
  /** Default floor fill for living/sleeping spaces. */
  floorColor: string;
  /** Slightly cooler tile floor for bathroom/toilet/storage. */
  tileColor: string;
  /** Accent color for highlights — rugs, plants, branding hits. */
  accentColor: string;
  /** Soft fill used for outdoor spaces (balkon/terras). */
  outdoorColor: string;
  /** Stroke color for furniture outlines. */
  furnitureStroke: string;
  /** Solid fill used for upholstered furniture (sofa, bed). */
  furnitureFill: string;
  /** Color used for room labels and dimensions. */
  labelColor: string;
  /** Font stack — kept system-only so we don't have to bundle webfonts. */
  fontFamily: string;
  /**
   * Floor pattern strategy. 'plank' draws horizontal wood planks,
   * 'herringbone' draws a herringbone weave, 'tile' draws a square
   * tile grid, 'flat' is a solid fill.
   */
  floorPattern: 'plank' | 'herringbone' | 'tile' | 'flat';
  /** Whether the renderer should add small decorative items (plants etc.) */
  decorations: boolean;
  /**
   * CSS filter string applied to the source image when in raster mode
   * (the actual uploaded plan). This is what makes the chosen sfeer
   * unmistakably visible — sepia/saturate/hue-rotate/brightness combos
   * recolor the floors and furniture without losing structural detail.
   *
   * Empty string = no filter (the default for the fallback palette).
   */
  rasterFilter: string;
}

const SERIF = '"Cormorant Garamond", "Georgia", "Times New Roman", serif';
const SANS = '"Inter", "Helvetica Neue", Arial, sans-serif';

/**
 * 2D Luxe palettes — one per gallery image. Hand-tuned to match the
 * visual feel of the source jpgs Nick supplied.
 */
export const LUXE_PALETTES: Record<string, Palette> = {
  warm: {
    id: 'warm',
    name: 'Warm',
    pageBg: '#ffffff',
    wallColor: '#1f2329',
    wallWidth: 0.012,
    floorColor: '#c19872',
    tileColor: '#d8d3cd',
    accentColor: '#b6553c',
    outdoorColor: '#dcd6cd',
    furnitureStroke: '#3a3530',
    furnitureFill: '#e7d4c0',
    labelColor: '#2a2520',
    fontFamily: SERIF,
    floorPattern: 'plank',
    decorations: true,
    rasterFilter: 'sepia(0.45) saturate(1.25) hue-rotate(-8deg) brightness(1.02)',
  },
  brown: {
    id: 'brown',
    name: 'Brown',
    pageBg: '#ffffff',
    wallColor: '#1c1a17',
    wallWidth: 0.013,
    floorColor: '#a5774d',
    tileColor: '#cfc8c0',
    accentColor: '#7a3f25',
    outdoorColor: '#d6cdc1',
    furnitureStroke: '#2b2220',
    furnitureFill: '#cbb194',
    labelColor: '#211a13',
    fontFamily: SERIF,
    floorPattern: 'plank',
    decorations: true,
    rasterFilter: 'sepia(0.6) saturate(1.15) hue-rotate(-18deg) brightness(0.94)',
  },
  moody: {
    id: 'moody',
    name: 'Moody',
    pageBg: '#fbfaf8',
    wallColor: '#16181a',
    wallWidth: 0.014,
    floorColor: '#7a6448',
    tileColor: '#bcbcbc',
    accentColor: '#3f5a3a',
    outdoorColor: '#cfd4cd',
    furnitureStroke: '#1b1d20',
    furnitureFill: '#e3e1dc',
    labelColor: '#1b1d20',
    fontFamily: SERIF,
    floorPattern: 'herringbone',
    decorations: true,
    rasterFilter: 'brightness(0.82) saturate(0.65) hue-rotate(20deg) contrast(1.1)',
  },
  scandi: {
    id: 'scandi',
    name: 'Scandi',
    pageBg: '#ffffff',
    wallColor: '#1c1c1a',
    wallWidth: 0.011,
    floorColor: '#dcc096',
    tileColor: '#e5e5e3',
    accentColor: '#7c8f5f',
    outdoorColor: '#cfdcc6',
    furnitureStroke: '#2a2a26',
    furnitureFill: '#f1ece1',
    labelColor: '#2a2a26',
    fontFamily: SERIF,
    floorPattern: 'herringbone',
    decorations: true,
    rasterFilter: 'brightness(1.12) saturate(0.78) sepia(0.1)',
  },
  neutral: {
    id: 'neutral',
    name: 'Neutral',
    pageBg: '#ffffff',
    wallColor: '#1d1f22',
    wallWidth: 0.012,
    floorColor: '#c8a378',
    tileColor: '#cdd2d4',
    accentColor: '#cf6e4f',
    outdoorColor: '#dadcdb',
    furnitureStroke: '#252628',
    furnitureFill: '#e9e3d8',
    labelColor: '#252628',
    fontFamily: SERIF,
    floorPattern: 'plank',
    decorations: true,
    rasterFilter: 'sepia(0.3) saturate(1.1) brightness(1.02)',
  },
  classic: {
    id: 'classic',
    name: 'Classic',
    pageBg: '#ffffff',
    wallColor: '#1a1a1a',
    wallWidth: 0.014,
    floorColor: '#bf9572',
    tileColor: '#d3cec5',
    accentColor: '#2f5e3a',
    outdoorColor: '#d8d2c5',
    furnitureStroke: '#262220',
    furnitureFill: '#f0eadc',
    labelColor: '#1c1a17',
    fontFamily: SERIF,
    floorPattern: 'plank',
    decorations: true,
    rasterFilter: 'sepia(0.35) saturate(1.1) brightness(0.97) contrast(1.05)',
  },
  luxe: {
    id: 'luxe',
    name: 'Luxe',
    pageBg: '#ffffff',
    wallColor: '#0f0f10',
    wallWidth: 0.014,
    floorColor: '#d6b48b',
    tileColor: '#e1dad0',
    accentColor: '#3c4f37',
    outdoorColor: '#dcd6cb',
    furnitureStroke: '#1a1a1a',
    furnitureFill: '#f5efe2',
    labelColor: '#0f0f10',
    fontFamily: SERIF,
    floorPattern: 'herringbone',
    decorations: true,
    rasterFilter: 'sepia(0.4) saturate(1.2) brightness(0.96) contrast(1.08)',
  },
  rustic: {
    id: 'rustic',
    name: 'Rustic',
    pageBg: '#ffffff',
    wallColor: '#1f1a14',
    wallWidth: 0.013,
    floorColor: '#b88a5a',
    tileColor: '#d4cec3',
    accentColor: '#6f7a3c',
    outdoorColor: '#bfd1a8',
    furnitureStroke: '#2a221b',
    furnitureFill: '#dcc7a8',
    labelColor: '#221c14',
    fontFamily: SERIF,
    floorPattern: 'herringbone',
    decorations: true,
    rasterFilter: 'sepia(0.5) saturate(1.15) hue-rotate(-12deg) brightness(0.96)',
  },
  cosy: {
    id: 'cosy',
    name: 'Cosy',
    pageBg: '#fffaf3',
    wallColor: '#1a1612',
    wallWidth: 0.012,
    floorColor: '#b07a4d',
    tileColor: '#d2c9bd',
    accentColor: '#9c543b',
    outdoorColor: '#d8cdba',
    furnitureStroke: '#241c15',
    furnitureFill: '#e8c8a3',
    labelColor: '#1a1612',
    fontFamily: SERIF,
    floorPattern: 'herringbone',
    decorations: true,
    rasterFilter: 'sepia(0.5) saturate(1.3) hue-rotate(-12deg) brightness(0.97)',
  },
  'warm-luxe': {
    id: 'warm-luxe',
    name: 'Warm Luxe',
    pageBg: '#ffffff',
    wallColor: '#141414',
    wallWidth: 0.013,
    floorColor: '#c89a72',
    tileColor: '#d8d2c8',
    accentColor: '#a65a36',
    outdoorColor: '#d9d0c0',
    furnitureStroke: '#211a14',
    furnitureFill: '#ebd6bd',
    labelColor: '#1a1612',
    fontFamily: SERIF,
    floorPattern: 'plank',
    decorations: true,
    rasterFilter: 'sepia(0.5) saturate(1.25) hue-rotate(-10deg) brightness(0.98) contrast(1.05)',
  },
};

/**
 * 2D Basic palettes — softer, brandable. The "branding" hex colors
 * from Step 3 can override these at render time (see paletteFromBranding
 * below).
 */
export const BASIC_PALETTES: Record<string, Palette> = {
  '02-type-s-flow': {
    id: '02-type-s-flow',
    name: 'Type S — warm & compact',
    pageBg: '#ffffff',
    wallColor: '#1c1c1c',
    wallWidth: 0.013,
    floorColor: '#e6dccd',
    tileColor: '#e3e3e0',
    accentColor: '#9a8265',
    outdoorColor: '#d9d4c7',
    furnitureStroke: '#2a2a2a',
    furnitureFill: '#cfc0a8',
    labelColor: '#1c1c1c',
    fontFamily: SANS,
    floorPattern: 'plank',
    decorations: false,
    rasterFilter: 'sepia(0.3) saturate(1.05) brightness(1.04)',
  },
  '03-a': {
    id: '03-a',
    name: 'Type A — neutraal & licht',
    pageBg: '#ffffff',
    wallColor: '#1c1c1c',
    wallWidth: 0.012,
    floorColor: '#efe8db',
    tileColor: '#e2dfd8',
    accentColor: '#86a5b9',
    outdoorColor: '#dde6df',
    furnitureStroke: '#2a2a2a',
    furnitureFill: '#cfd9df',
    labelColor: '#1c1c1c',
    fontFamily: SANS,
    floorPattern: 'flat',
    decorations: false,
    rasterFilter: 'brightness(1.06) saturate(0.85)',
  },
  '04-c30301': {
    id: '04-c30301',
    name: 'Aardetinten — zand & olijf',
    pageBg: '#ffffff',
    wallColor: '#1c1c1c',
    wallWidth: 0.012,
    floorColor: '#e3dac6',
    tileColor: '#dad3c4',
    accentColor: '#8a8a4a',
    outdoorColor: '#d2d4b8',
    furnitureStroke: '#2a2a2a',
    furnitureFill: '#cfc6a8',
    labelColor: '#1c1c1c',
    fontFamily: SANS,
    floorPattern: 'flat',
    decorations: false,
    rasterFilter: 'sepia(0.4) saturate(1.1) hue-rotate(15deg) brightness(1.0)',
  },
  '05-fd': {
    id: '05-fd',
    name: 'Strak & modern — grijs/bruin',
    pageBg: '#ffffff',
    wallColor: '#1a1a1a',
    wallWidth: 0.014,
    floorColor: '#dcd2c2',
    tileColor: '#cfcfcd',
    accentColor: '#766658',
    outdoorColor: '#cfcfcc',
    furnitureStroke: '#262626',
    furnitureFill: '#bdb6a8',
    labelColor: '#1a1a1a',
    fontFamily: SANS,
    floorPattern: 'flat',
    decorations: false,
    rasterFilter: 'saturate(0.7) brightness(1.0) contrast(1.05)',
  },
  '06-c2': {
    id: '06-c2',
    name: 'Minimalistisch — zandtint',
    pageBg: '#ffffff',
    wallColor: '#1c1c1c',
    wallWidth: 0.012,
    floorColor: '#ece4d3',
    tileColor: '#e0ddd5',
    accentColor: '#8b7c66',
    outdoorColor: '#dad3c2',
    furnitureStroke: '#2a2a2a',
    furnitureFill: '#cdc4ae',
    labelColor: '#1c1c1c',
    fontFamily: SANS,
    floorPattern: 'flat',
    decorations: false,
    rasterFilter: 'sepia(0.25) saturate(0.85) brightness(1.05)',
  },
  '07-h4': {
    id: '07-h4',
    name: 'Kleurvol — blauwe accenten',
    pageBg: '#ffffff',
    wallColor: '#1a1a1a',
    wallWidth: 0.012,
    floorColor: '#e6e1d2',
    tileColor: '#d9dde2',
    accentColor: '#5b8aa8',
    outdoorColor: '#cfd8df',
    furnitureStroke: '#222a2f',
    furnitureFill: '#abc4d6',
    labelColor: '#1a1a1a',
    fontFamily: SANS,
    floorPattern: 'flat',
    decorations: false,
    rasterFilter: 'saturate(1.15) hue-rotate(180deg) brightness(1.0)',
  },
  // Project-niveau situatie — different beast, kept for completeness so
  // resolvePalette never returns null. Renderer falls back to plain
  // black-white when this is selected.
  '01-situatie': {
    id: '01-situatie',
    name: 'Situatietekening',
    pageBg: '#ffffff',
    wallColor: '#1a1a1a',
    wallWidth: 0.01,
    floorColor: '#f1f1ee',
    tileColor: '#e7e7e2',
    accentColor: '#7c9a6c',
    outdoorColor: '#c7d7b6',
    furnitureStroke: '#262626',
    furnitureFill: '#dfe5d6',
    labelColor: '#1a1a1a',
    fontFamily: SANS,
    floorPattern: 'flat',
    decorations: false,
    rasterFilter: '',
  },
};

/**
 * Default palette used as a safe fallback when an unknown example id
 * shows up (e.g. mid-flight refactor). Pure black-white, sans-serif.
 */
export const FALLBACK_PALETTE: Palette = {
  id: 'fallback',
  name: 'Zwart-wit',
  pageBg: '#ffffff',
  wallColor: '#1a1a1a',
  wallWidth: 0.012,
  floorColor: '#f4f4f2',
  tileColor: '#e8e8e6',
  accentColor: '#7c7c7c',
  outdoorColor: '#e3e3e0',
  furnitureStroke: '#1a1a1a',
  furnitureFill: '#d8d8d6',
  labelColor: '#1a1a1a',
  fontFamily: SANS,
  floorPattern: 'flat',
  decorations: false,
  rasterFilter: '',
};

/**
 * Pick the right palette for a given gallery example id. Tries luxe
 * first, then basic, then falls back to the safe default.
 */
export function getPalette(exampleId: string | null | undefined): Palette {
  if (!exampleId) return FALLBACK_PALETTE;
  return LUXE_PALETTES[exampleId] ?? BASIC_PALETTES[exampleId] ?? FALLBACK_PALETTE;
}

/**
 * Apply branding overrides on top of a base palette. Only Basic
 * projects feed branding through; the Luxe palettes are returned
 * untouched (their look is part of the chosen sfeer).
 *
 * Branding rules:
 *   - primaryColor wins over wallColor (the dominant brand statement)
 *   - secondaryColor → floorColor (sets the room atmosphere)
 *   - accentColor   → accentColor (rugs, plants, highlights)
 */
export function applyBranding(
  palette: Palette,
  branding: Branding | null,
  isLuxe: boolean
): Palette {
  if (!branding || isLuxe) return palette;
  return {
    ...palette,
    wallColor: branding.primaryColor ?? palette.wallColor,
    floorColor: branding.secondaryColor ?? palette.floorColor,
    accentColor: branding.accentColor ?? palette.accentColor,
  };
}
