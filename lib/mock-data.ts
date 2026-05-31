import type { FloorplanAnalysis } from '@/types/project';

// Accurate polygon coordinates for the 2305EEN plan (niveau +1)
// Each unit includes parking/staanplaats at top + residential area below
// Coordinates are percentages of the full image (0-100 for x and y)
export function generateMockAnalysis(): FloorplanAnalysis {
  return {
    totalUnits: 15,
    uniqueTypes: 3,
    mirroredTypes: 4,
    floors: [
      { index: 0, label: 'Niveau +1' },
    ],
    units: [
      // ═══════════════════════════════════════
      // TYPE A (hoofdtype) — 1 unit, wider
      // ═══════════════════════════════════════
      {
        id: 'unit-a1',
        label: 'A1',
        typeGroup: 'Type A',
        classification: 'hoofdtype',
        isMirrored: false,
        floor: 0,
        polygon: [
          { x: 2, y: 10 }, { x: 13, y: 10 }, { x: 13, y: 83 }, { x: 2, y: 83 },
        ],
        area: 110,
        rooms: [
          { type: 'leefruimte', label: 'Leefkeuken', polygon: [], area: 18.7, dimensions: { width: 4.5, height: 4.2 } },
          { type: 'leefruimte', label: 'Woonkamer', polygon: [], area: 6.3, dimensions: { width: 2.8, height: 2.2 } },
          { type: 'berging', label: 'Berging', polygon: [], area: 5.6, dimensions: { width: 2.2, height: 2.5 } },
          { type: 'wc', label: 'Toilet', polygon: [], area: 1.5, dimensions: { width: 1.2, height: 1.3 } },
          { type: 'inkom', label: 'Inkom', polygon: [], area: 4.3, dimensions: { width: 2.0, height: 2.2 } },
          { type: 'terras', label: 'Staanplaats / Tuin', polygon: [], area: 33.9, dimensions: { width: 6.0, height: 5.6 } },
        ],
        confidence: 0.95,
      },

      // ═══════════════════════════════════════
      // TYPE B (hoofdtype) — B2
      // ═══════════════════════════════════════
      {
        id: 'unit-b2',
        label: 'B2',
        typeGroup: 'Type B',
        classification: 'hoofdtype',
        isMirrored: false,
        floor: 0,
        polygon: [
          { x: 13, y: 10 }, { x: 19.5, y: 10 }, { x: 19.5, y: 83 }, { x: 13, y: 83 },
        ],
        area: 85,
        rooms: [
          { type: 'slaapkamer', label: 'Slaapkamer 1', polygon: [], area: 12.0, dimensions: { width: 3.6, height: 3.4 } },
          { type: 'nachthal', label: 'Nachthal', polygon: [], area: 5.1, dimensions: { width: 2.0, height: 2.5 } },
          { type: 'badkamer', label: 'Douche', polygon: [], area: 3.8, dimensions: { width: 1.8, height: 2.1 } },
          { type: 'slaapkamer', label: 'Slaapkamer 2', polygon: [], area: 9.2, dimensions: { width: 3.2, height: 2.9 } },
          { type: 'terras', label: 'Staanplaats', polygon: [], area: 24.0, dimensions: { width: 3.5, height: 6.8 } },
        ],
        confidence: 0.94,
      },

      // TYPE B gespiegeld — B3
      {
        id: 'unit-b3',
        label: 'B3',
        typeGroup: 'Type B',
        classification: 'gespiegeld',
        isMirrored: true,
        mirrorOf: 'unit-b2',
        floor: 0,
        polygon: [
          { x: 19.5, y: 10 }, { x: 26, y: 10 }, { x: 26, y: 83 }, { x: 19.5, y: 83 },
        ],
        area: 85,
        rooms: [
          { type: 'slaapkamer', label: 'Slaapkamer 1', polygon: [], area: 12.0, dimensions: { width: 3.6, height: 3.4 } },
          { type: 'nachthal', label: 'Nachthal', polygon: [], area: 5.1, dimensions: { width: 2.0, height: 2.5 } },
          { type: 'badkamer', label: 'Douche', polygon: [], area: 3.8, dimensions: { width: 1.8, height: 2.1 } },
          { type: 'slaapkamer', label: 'Slaapkamer 2', polygon: [], area: 9.2, dimensions: { width: 3.2, height: 2.9 } },
          { type: 'terras', label: 'Staanplaats', polygon: [], area: 24.0, dimensions: { width: 3.5, height: 6.8 } },
        ],
        confidence: 0.93,
      },

      // TYPE B (hoofdtype) — B4
      {
        id: 'unit-b4',
        label: 'B4',
        typeGroup: 'Type B',
        classification: 'hoofdtype',
        isMirrored: false,
        floor: 0,
        polygon: [
          { x: 26, y: 10 }, { x: 32.5, y: 10 }, { x: 32.5, y: 83 }, { x: 26, y: 83 },
        ],
        area: 85,
        rooms: [
          { type: 'slaapkamer', label: 'Slaapkamer 1', polygon: [], area: 12.0, dimensions: { width: 3.6, height: 3.4 } },
          { type: 'nachthal', label: 'Nachthal', polygon: [], area: 5.1, dimensions: { width: 2.0, height: 2.5 } },
          { type: 'badkamer', label: 'Douche', polygon: [], area: 3.8, dimensions: { width: 1.8, height: 2.1 } },
          { type: 'slaapkamer', label: 'Slaapkamer 2', polygon: [], area: 9.2, dimensions: { width: 3.2, height: 2.9 } },
        ],
        confidence: 0.92,
      },

      // TYPE B gespiegeld — B5
      {
        id: 'unit-b5',
        label: 'B5',
        typeGroup: 'Type B',
        classification: 'gespiegeld',
        isMirrored: true,
        mirrorOf: 'unit-b4',
        floor: 0,
        polygon: [
          { x: 32.5, y: 10 }, { x: 39, y: 10 }, { x: 39, y: 83 }, { x: 32.5, y: 83 },
        ],
        area: 85,
        rooms: [
          { type: 'slaapkamer', label: 'Slaapkamer 1', polygon: [], area: 12.0, dimensions: { width: 3.6, height: 3.4 } },
          { type: 'nachthal', label: 'Nachthal', polygon: [], area: 5.1, dimensions: { width: 2.0, height: 2.5 } },
          { type: 'badkamer', label: 'Douche', polygon: [], area: 3.8, dimensions: { width: 1.8, height: 2.1 } },
          { type: 'slaapkamer', label: 'Slaapkamer 2', polygon: [], area: 9.2, dimensions: { width: 3.2, height: 2.9 } },
        ],
        confidence: 0.91,
      },

      // TYPE B (hoofdtype) — B6
      {
        id: 'unit-b6',
        label: 'B6',
        typeGroup: 'Type B',
        classification: 'hoofdtype',
        isMirrored: false,
        floor: 0,
        polygon: [
          { x: 39, y: 10 }, { x: 45.5, y: 10 }, { x: 45.5, y: 83 }, { x: 39, y: 83 },
        ],
        area: 85,
        rooms: [
          { type: 'slaapkamer', label: 'Slaapkamer 1', polygon: [], area: 12.0, dimensions: { width: 3.6, height: 3.4 } },
          { type: 'nachthal', label: 'Nachthal', polygon: [], area: 5.1, dimensions: { width: 2.0, height: 2.5 } },
          { type: 'badkamer', label: 'Douche', polygon: [], area: 3.8, dimensions: { width: 1.8, height: 2.1 } },
          { type: 'slaapkamer', label: 'Slaapkamer 2', polygon: [], area: 9.2, dimensions: { width: 3.2, height: 2.9 } },
        ],
        confidence: 0.90,
      },

      // ═══════════════════════════════════════
      // TYPE C (variant van B) — C7 t/m C15
      // ═══════════════════════════════════════
      {
        id: 'unit-c7',
        label: 'C7',
        typeGroup: 'Type C',
        classification: 'variant',
        isMirrored: false,
        variantOf: 'Type B',
        floor: 0,
        polygon: [
          { x: 45.5, y: 10 }, { x: 51.5, y: 10 }, { x: 51.5, y: 83 }, { x: 45.5, y: 83 },
        ],
        area: 82,
        rooms: [
          { type: 'slaapkamer', label: 'Slaapkamer 1', polygon: [], area: 12.0, dimensions: { width: 3.6, height: 3.4 } },
          { type: 'nachthal', label: 'Nachthal', polygon: [], area: 4.8, dimensions: { width: 2.0, height: 2.4 } },
          { type: 'badkamer', label: 'Douche', polygon: [], area: 3.5, dimensions: { width: 1.7, height: 2.1 } },
          { type: 'slaapkamer', label: 'Slaapkamer 2', polygon: [], area: 8.5, dimensions: { width: 3.0, height: 2.8 } },
        ],
        confidence: 0.89,
      },
      {
        id: 'unit-c8', label: 'C8', typeGroup: 'Type C', classification: 'variant', isMirrored: false, variantOf: 'Type B', floor: 0,
        polygon: [{ x: 51.5, y: 10 }, { x: 57.5, y: 10 }, { x: 57.5, y: 83 }, { x: 51.5, y: 83 }],
        area: 82, rooms: [], confidence: 0.88,
      },
      {
        id: 'unit-c9', label: 'C9', typeGroup: 'Type C', classification: 'variant', isMirrored: false, variantOf: 'Type B', floor: 0,
        polygon: [{ x: 57.5, y: 10 }, { x: 63.5, y: 10 }, { x: 63.5, y: 83 }, { x: 57.5, y: 83 }],
        area: 82, rooms: [], confidence: 0.88,
      },
      {
        id: 'unit-c10', label: 'C10', typeGroup: 'Type C', classification: 'variant', isMirrored: false, variantOf: 'Type B', floor: 0,
        polygon: [{ x: 63.5, y: 10 }, { x: 69.5, y: 10 }, { x: 69.5, y: 83 }, { x: 63.5, y: 83 }],
        area: 82, rooms: [], confidence: 0.87,
      },
      {
        id: 'unit-c11', label: 'C11', typeGroup: 'Type C', classification: 'variant', isMirrored: false, variantOf: 'Type B', floor: 0,
        polygon: [{ x: 69.5, y: 10 }, { x: 75, y: 10 }, { x: 75, y: 83 }, { x: 69.5, y: 83 }],
        area: 82, rooms: [], confidence: 0.87,
      },
      {
        id: 'unit-c12', label: 'C12', typeGroup: 'Type C', classification: 'variant', isMirrored: false, variantOf: 'Type B', floor: 0,
        polygon: [{ x: 75, y: 10 }, { x: 80.5, y: 10 }, { x: 80.5, y: 83 }, { x: 75, y: 83 }],
        area: 82, rooms: [], confidence: 0.86,
      },
      {
        id: 'unit-c13', label: 'C13', typeGroup: 'Type C', classification: 'variant', isMirrored: false, variantOf: 'Type B', floor: 0,
        polygon: [{ x: 80.5, y: 10 }, { x: 86, y: 10 }, { x: 86, y: 83 }, { x: 80.5, y: 83 }],
        area: 82, rooms: [], confidence: 0.86,
      },
      {
        id: 'unit-c14', label: 'C14', typeGroup: 'Type C', classification: 'variant', isMirrored: false, variantOf: 'Type B', floor: 0,
        polygon: [{ x: 86, y: 10 }, { x: 91.5, y: 10 }, { x: 91.5, y: 83 }, { x: 86, y: 83 }],
        area: 82, rooms: [], confidence: 0.86,
      },
      {
        id: 'unit-c15', label: 'C15', typeGroup: 'Type C', classification: 'variant', isMirrored: false, variantOf: 'Type B', floor: 0,
        polygon: [{ x: 91.5, y: 10 }, { x: 97, y: 10 }, { x: 97, y: 83 }, { x: 91.5, y: 83 }],
        area: 82, rooms: [], confidence: 0.85,
      },
    ],
  };
}
