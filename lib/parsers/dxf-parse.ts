// DXF file parser - extracts wall geometry and text labels
// Uses the dxf-parser npm package to parse DXF files

import DxfParser from 'dxf-parser';
import type {
  IEntity,
  ILineEntity,
  ILwpolylineEntity,
  IPolylineEntity,
  IArcEntity,
  ICircleEntity,
  ITextEntity,
  IMtextEntity,
} from 'dxf-parser';
import type { WallLine } from '@/types/project';

export interface TextLabel {
  text: string;
  x: number; // normalized 0-100
  y: number; // normalized 0-100
  fontSize: number;
}

export interface DxfExtraction {
  walls: WallLine[];
  texts: TextLabel[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  layerNames: string[];
}

// Layer name patterns that typically contain wall geometry
const WALL_LAYER_PATTERNS = [
  /wall/i,
  /muur/i,
  /wand/i,
  /a[-_]?wall/i,
  /s[-_]?wall/i,
  /ar[-_]?wall/i,
  /struct/i,
  /bearing/i,
  /gevel/i,       // Dutch for facade
  /bouwkundig/i,  // Dutch for architectural
];

// Minimum line width (in DXF units) to consider as a wall when layer name doesn't match
const WALL_WIDTH_THRESHOLD = 50; // mm typical for walls

function isWallLayer(layerName: string): boolean {
  return WALL_LAYER_PATTERNS.some(pattern => pattern.test(layerName));
}

function computeBounds(entities: IEntity[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  function updateBounds(x: number, y: number) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  for (const entity of entities) {
    switch (entity.type) {
      case 'LINE': {
        const line = entity as ILineEntity;
        if (line.vertices) {
          for (const v of line.vertices) {
            updateBounds(v.x, v.y);
          }
        }
        break;
      }
      case 'LWPOLYLINE': {
        const lwpoly = entity as ILwpolylineEntity;
        if (lwpoly.vertices) {
          for (const v of lwpoly.vertices) {
            updateBounds(v.x, v.y);
          }
        }
        break;
      }
      case 'POLYLINE': {
        const poly = entity as IPolylineEntity;
        if (poly.vertices) {
          for (const v of poly.vertices) {
            updateBounds(v.x, v.y);
          }
        }
        break;
      }
      case 'ARC':
      case 'CIRCLE': {
        const arc = entity as IArcEntity | ICircleEntity;
        if (arc.center && arc.radius) {
          updateBounds(arc.center.x - arc.radius, arc.center.y - arc.radius);
          updateBounds(arc.center.x + arc.radius, arc.center.y + arc.radius);
        }
        break;
      }
      case 'TEXT': {
        const text = entity as ITextEntity;
        if (text.startPoint) {
          updateBounds(text.startPoint.x, text.startPoint.y);
        }
        break;
      }
      case 'MTEXT': {
        const mtext = entity as IMtextEntity;
        if (mtext.position) {
          updateBounds(mtext.position.x, mtext.position.y);
        }
        break;
      }
    }
  }

  // Fallback if no entities
  if (minX === Infinity) {
    minX = 0; minY = 0; maxX = 100; maxY = 100;
  }

  return { minX, minY, maxX, maxY };
}

function normalizeX(x: number, bounds: { minX: number; maxX: number }): number {
  const range = bounds.maxX - bounds.minX;
  if (range === 0) return 50;
  return ((x - bounds.minX) / range) * 100;
}

function normalizeY(y: number, bounds: { minY: number; maxY: number }): number {
  const range = bounds.maxY - bounds.minY;
  if (range === 0) return 50;
  // Flip Y axis: DXF has Y up, we want Y down (screen coordinates)
  return (1 - (y - bounds.minY) / range) * 100;
}

function arcToLineSegments(
  cx: number, cy: number, radius: number,
  startAngleDeg: number, endAngleDeg: number,
  segments: number = 16,
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  const startRad = (startAngleDeg * Math.PI) / 180;
  let endRad = (endAngleDeg * Math.PI) / 180;
  if (endRad <= startRad) endRad += 2 * Math.PI;
  const step = (endRad - startRad) / segments;

  for (let i = 0; i <= segments; i++) {
    const angle = startRad + i * step;
    points.push({
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    });
  }
  return points;
}

function extractWallLines(
  entities: IEntity[],
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  wallLayerNames: Set<string>,
): WallLine[] {
  const walls: WallLine[] = [];

  for (const entity of entities) {
    // Only include entities from wall layers, or thick entities from any layer
    const onWallLayer = wallLayerNames.has(entity.layer);
    const isThick = entity.lineweight > 0 && entity.lineweight >= 30; // lineweight in 1/100 mm

    if (!onWallLayer && !isThick) continue;

    const wallWidth = entity.lineweight > 0 ? entity.lineweight / 100 : 1;

    switch (entity.type) {
      case 'LINE': {
        const line = entity as ILineEntity;
        if (line.vertices && line.vertices.length >= 2) {
          walls.push({
            x1: normalizeX(line.vertices[0].x, bounds),
            y1: normalizeY(line.vertices[0].y, bounds),
            x2: normalizeX(line.vertices[1].x, bounds),
            y2: normalizeY(line.vertices[1].y, bounds),
            width: wallWidth,
          });
        }
        break;
      }
      case 'LWPOLYLINE': {
        const lwpoly = entity as ILwpolylineEntity;
        if (lwpoly.vertices && lwpoly.vertices.length >= 2) {
          const w = lwpoly.width || wallWidth;
          for (let i = 0; i < lwpoly.vertices.length - 1; i++) {
            walls.push({
              x1: normalizeX(lwpoly.vertices[i].x, bounds),
              y1: normalizeY(lwpoly.vertices[i].y, bounds),
              x2: normalizeX(lwpoly.vertices[i + 1].x, bounds),
              y2: normalizeY(lwpoly.vertices[i + 1].y, bounds),
              width: w,
            });
          }
          // Close shape if needed
          if (lwpoly.shape && lwpoly.vertices.length >= 3) {
            const last = lwpoly.vertices[lwpoly.vertices.length - 1];
            const first = lwpoly.vertices[0];
            walls.push({
              x1: normalizeX(last.x, bounds),
              y1: normalizeY(last.y, bounds),
              x2: normalizeX(first.x, bounds),
              y2: normalizeY(first.y, bounds),
              width: w,
            });
          }
        }
        break;
      }
      case 'POLYLINE': {
        const poly = entity as IPolylineEntity;
        if (poly.vertices && poly.vertices.length >= 2) {
          for (let i = 0; i < poly.vertices.length - 1; i++) {
            walls.push({
              x1: normalizeX(poly.vertices[i].x, bounds),
              y1: normalizeY(poly.vertices[i].y, bounds),
              x2: normalizeX(poly.vertices[i + 1].x, bounds),
              y2: normalizeY(poly.vertices[i + 1].y, bounds),
              width: wallWidth,
            });
          }
          if (poly.shape && poly.vertices.length >= 3) {
            const last = poly.vertices[poly.vertices.length - 1];
            const first = poly.vertices[0];
            walls.push({
              x1: normalizeX(last.x, bounds),
              y1: normalizeY(last.y, bounds),
              x2: normalizeX(first.x, bounds),
              y2: normalizeY(first.y, bounds),
              width: wallWidth,
            });
          }
        }
        break;
      }
      case 'ARC': {
        const arc = entity as IArcEntity;
        if (arc.center && arc.radius) {
          const points = arcToLineSegments(
            arc.center.x, arc.center.y, arc.radius,
            arc.startAngle || 0, arc.endAngle || 360,
          );
          for (let i = 0; i < points.length - 1; i++) {
            walls.push({
              x1: normalizeX(points[i].x, bounds),
              y1: normalizeY(points[i].y, bounds),
              x2: normalizeX(points[i + 1].x, bounds),
              y2: normalizeY(points[i + 1].y, bounds),
              width: wallWidth,
            });
          }
        }
        break;
      }
      case 'CIRCLE': {
        const circle = entity as ICircleEntity;
        if (circle.center && circle.radius) {
          const points = arcToLineSegments(
            circle.center.x, circle.center.y, circle.radius,
            0, 360, 32,
          );
          for (let i = 0; i < points.length - 1; i++) {
            walls.push({
              x1: normalizeX(points[i].x, bounds),
              y1: normalizeY(points[i].y, bounds),
              x2: normalizeX(points[i + 1].x, bounds),
              y2: normalizeY(points[i + 1].y, bounds),
              width: wallWidth,
            });
          }
        }
        break;
      }
    }
  }

  return walls;
}

function extractTexts(
  entities: IEntity[],
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
): TextLabel[] {
  const texts: TextLabel[] = [];

  for (const entity of entities) {
    if (entity.type === 'TEXT') {
      const text = entity as ITextEntity;
      if (text.text && text.startPoint) {
        texts.push({
          text: text.text.trim(),
          x: normalizeX(text.startPoint.x, bounds),
          y: normalizeY(text.startPoint.y, bounds),
          fontSize: text.textHeight || 10,
        });
      }
    } else if (entity.type === 'MTEXT') {
      const mtext = entity as IMtextEntity;
      if (mtext.text && mtext.position) {
        // MTEXT can have formatting codes like {\fArial;text} - strip them
        const cleanText = mtext.text
          .replace(/\\[A-Za-z][^;]*;/g, '')
          .replace(/[{}]/g, '')
          .replace(/\\P/g, '\n')
          .trim();
        if (cleanText) {
          texts.push({
            text: cleanText,
            x: normalizeX(mtext.position.x, bounds),
            y: normalizeY(mtext.position.y, bounds),
            fontSize: mtext.height || 10,
          });
        }
      }
    }
  }

  return texts;
}

export function parseDxf(fileContent: string): DxfExtraction {
  const parser = new DxfParser();
  const dxf = parser.parseSync(fileContent);

  if (!dxf || !dxf.entities) {
    return {
      walls: [],
      texts: [],
      bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
      layerNames: [],
    };
  }

  // Collect all entities including those in blocks
  const allEntities: IEntity[] = [...dxf.entities];
  if (dxf.blocks) {
    for (const blockName of Object.keys(dxf.blocks)) {
      const block = dxf.blocks[blockName];
      if (block.entities) {
        allEntities.push(...block.entities);
      }
    }
  }

  // Compute bounding box from all entities
  const bounds = computeBounds(allEntities);

  // Identify wall layers
  const allLayerNames = new Set<string>();
  for (const entity of allEntities) {
    if (entity.layer) allLayerNames.add(entity.layer);
  }

  // Also check the layer table
  if (dxf.tables?.layer) {
    const layersTable = dxf.tables.layer;
    if ('layers' in layersTable && layersTable.layers) {
      for (const name of Object.keys(layersTable.layers)) {
        allLayerNames.add(name);
      }
    }
  }

  const wallLayerNames = new Set<string>();
  for (const name of allLayerNames) {
    if (isWallLayer(name)) {
      wallLayerNames.add(name);
    }
  }

  // If no wall layers found by name, use all layers (fallback)
  // but filter by line weight / thickness later
  const useAllLayers = wallLayerNames.size === 0;
  if (useAllLayers) {
    for (const name of allLayerNames) {
      wallLayerNames.add(name);
    }
  }

  const walls = extractWallLines(allEntities, bounds, wallLayerNames);
  const texts = extractTexts(allEntities, bounds);

  return {
    walls,
    texts,
    bounds,
    layerNames: Array.from(allLayerNames),
  };
}

// Find unit labels in DXF text (A1, B2, C3 patterns)
export function findDxfUnitLabels(texts: TextLabel[]): TextLabel[] {
  const unitPattern = /^[A-Z]\d{1,3}$/;
  return texts.filter(t => unitPattern.test(t.text.trim()));
}
