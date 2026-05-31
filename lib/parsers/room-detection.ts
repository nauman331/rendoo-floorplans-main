// Room detection algorithm using flood-fill on a discretized grid
// Finds enclosed spaces from wall line geometry

import type { WallLine, Point } from '@/types/project';
import type { TextLabel } from './dxf-parse';

export interface DetectedRegion {
  id: string;
  polygon: Point[];
  area: number; // percentage of total area
  center: Point;
  label?: string; // text label found inside region
}

const GRID_SIZE = 500; // 500x500 grid for discretization

// Draw a line on the grid using Bresenham's algorithm with thickness
function drawLine(
  grid: Uint8Array,
  x1: number, y1: number,
  x2: number, y2: number,
  thickness: number = 1,
) {
  const halfT = Math.max(Math.floor(thickness / 2), 1);

  // Bresenham's line algorithm
  let dx = Math.abs(x2 - x1);
  let dy = Math.abs(y2 - y1);
  const sx = x1 < x2 ? 1 : -1;
  const sy = y1 < y2 ? 1 : -1;
  let err = dx - dy;
  let cx = x1, cy = y1;

  while (true) {
    // Draw a thick point
    for (let ox = -halfT; ox <= halfT; ox++) {
      for (let oy = -halfT; oy <= halfT; oy++) {
        const px = cx + ox;
        const py = cy + oy;
        if (px >= 0 && px < GRID_SIZE && py >= 0 && py < GRID_SIZE) {
          grid[py * GRID_SIZE + px] = 1; // wall
        }
      }
    }

    if (cx === x2 && cy === y2) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; cx += sx; }
    if (e2 < dx) { err += dx; cy += sy; }
  }
}

// Flood-fill a region, returns list of pixel coordinates
function floodFill(
  grid: Uint8Array,
  visited: Uint8Array,
  startX: number,
  startY: number,
): { x: number; y: number }[] {
  const pixels: { x: number; y: number }[] = [];
  const stack: [number, number][] = [[startX, startY]];

  while (stack.length > 0) {
    const [x, y] = stack.pop()!;
    const idx = y * GRID_SIZE + x;

    if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) continue;
    if (grid[idx] === 1 || visited[idx] === 1) continue;

    visited[idx] = 1;
    pixels.push({ x, y });

    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  return pixels;
}

// Convert a set of pixels to a simplified convex-hull-like polygon
function pixelsToPolygon(pixels: { x: number; y: number }[]): Point[] {
  if (pixels.length === 0) return [];

  // Find bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pixels) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  // Convert grid coords to percentage (0-100)
  const toPercent = (v: number) => (v / GRID_SIZE) * 100;

  // Use the axis-aligned bounding box as the polygon
  // (A convex hull would be more accurate but this is simpler and sufficient for rectangular units)
  return [
    { x: toPercent(minX), y: toPercent(minY) },
    { x: toPercent(maxX), y: toPercent(minY) },
    { x: toPercent(maxX), y: toPercent(maxY) },
    { x: toPercent(minX), y: toPercent(maxY) },
  ];
}

function computeCenter(pixels: { x: number; y: number }[]): Point {
  if (pixels.length === 0) return { x: 50, y: 50 };
  let sumX = 0, sumY = 0;
  for (const p of pixels) {
    sumX += p.x;
    sumY += p.y;
  }
  return {
    x: (sumX / pixels.length / GRID_SIZE) * 100,
    y: (sumY / pixels.length / GRID_SIZE) * 100,
  };
}

function pointInPolygon(px: number, py: number, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function detectRooms(
  walls: WallLine[],
  texts: TextLabel[] = [],
  minRegionPercent: number = 0.5, // minimum region size as % of total area
): DetectedRegion[] {
  // Create grid
  const grid = new Uint8Array(GRID_SIZE * GRID_SIZE);

  // Draw walls on grid
  for (const wall of walls) {
    const x1 = Math.round((wall.x1 / 100) * GRID_SIZE);
    const y1 = Math.round((wall.y1 / 100) * GRID_SIZE);
    const x2 = Math.round((wall.x2 / 100) * GRID_SIZE);
    const y2 = Math.round((wall.y2 / 100) * GRID_SIZE);
    // Map wall width to grid thickness (at least 1 pixel)
    const thickness = Math.max(1, Math.round(wall.width * 0.5));
    drawLine(grid, x1, y1, x2, y2, thickness);
  }

  // Flood-fill to find enclosed regions
  const visited = new Uint8Array(GRID_SIZE * GRID_SIZE);
  const regions: { pixels: { x: number; y: number }[] }[] = [];
  const totalPixels = GRID_SIZE * GRID_SIZE;

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const idx = y * GRID_SIZE + x;
      if (grid[idx] === 0 && visited[idx] === 0) {
        const pixels = floodFill(grid, visited, x, y);
        if (pixels.length > 0) {
          regions.push({ pixels });
        }
      }
    }
  }

  // Filter out small regions and the background (largest region touching edges)
  const minPixelCount = (minRegionPercent / 100) * totalPixels;

  const detectedRegions: DetectedRegion[] = [];
  let regionId = 0;

  for (const region of regions) {
    // Skip tiny regions
    if (region.pixels.length < minPixelCount) continue;

    // Skip regions that touch all 4 edges (likely the background)
    const touchesLeft = region.pixels.some(p => p.x === 0);
    const touchesRight = region.pixels.some(p => p.x === GRID_SIZE - 1);
    const touchesTop = region.pixels.some(p => p.y === 0);
    const touchesBottom = region.pixels.some(p => p.y === GRID_SIZE - 1);
    if (touchesLeft && touchesRight && touchesTop && touchesBottom) continue;

    const polygon = pixelsToPolygon(region.pixels);
    const center = computeCenter(region.pixels);
    const areaPercent = (region.pixels.length / totalPixels) * 100;

    // Find text label inside this region
    let label: string | undefined;
    for (const text of texts) {
      if (pointInPolygon(text.x, text.y, polygon)) {
        label = text.text;
        break;
      }
    }

    detectedRegions.push({
      id: `region-${regionId++}`,
      polygon,
      area: areaPercent,
      center,
      label,
    });
  }

  // Sort by area (largest first)
  detectedRegions.sort((a, b) => b.area - a.area);

  return detectedRegions;
}

// Group rooms into units based on proximity
export function groupRoomsIntoUnits(
  regions: DetectedRegion[],
  mergeDistancePercent: number = 2, // merge regions closer than this
): DetectedRegion[] {
  if (regions.length === 0) return [];

  // Simple merge: combine small adjacent regions into larger units
  const merged: DetectedRegion[] = [];
  const used = new Set<number>();

  for (let i = 0; i < regions.length; i++) {
    if (used.has(i)) continue;

    const group: DetectedRegion[] = [regions[i]];
    used.add(i);

    // Find nearby regions to merge
    for (let j = i + 1; j < regions.length; j++) {
      if (used.has(j)) continue;

      const dist = Math.sqrt(
        Math.pow(regions[i].center.x - regions[j].center.x, 2) +
        Math.pow(regions[i].center.y - regions[j].center.y, 2),
      );

      if (dist < mergeDistancePercent) {
        group.push(regions[j]);
        used.add(j);
      }
    }

    if (group.length === 1) {
      merged.push(group[0]);
    } else {
      // Merge polygons: take bounding box of all
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      let totalArea = 0;
      let label: string | undefined;

      for (const r of group) {
        for (const p of r.polygon) {
          if (p.x < minX) minX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
        }
        totalArea += r.area;
        if (!label && r.label) label = r.label;
      }

      merged.push({
        id: group[0].id,
        polygon: [
          { x: minX, y: minY },
          { x: maxX, y: minY },
          { x: maxX, y: maxY },
          { x: minX, y: maxY },
        ],
        area: totalArea,
        center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
        label,
      });
    }
  }

  return merged;
}
