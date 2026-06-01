/**
 * Stage 03: Geometry Normalisation
 * 
 * Runs BEFORE vision AI to detect structural elements from CAD/PDF:
 * - Walls (outer perimeter, internal divisions)
 * - Doors (type, swing direction, width)
 * - Windows (size, style hints)
 * - Fixtures (fixed furniture that implies unit boundary)
 * - Scale reference (if available in annotations)
 * - North arrow (orientation reference)
 * 
 * Output provides structured hints to vision model (Stage 04).
 */

import type { WallLine } from '@/types/project';

export interface GeometryNormalisationResult {
    walls: NormalisedWall[];
    doors: DetectedDoor[];
    windows: DetectedWindow[];
    fixtures: DetectedFixture[];
    scale?: {
        pixelsPerMeter: number;
        reference: string; // e.g., "1:100 scale bar"
    };
    northArrow?: {
        angle: number; // degrees from vertical
        confidence: number;
    };
    boundaries?: {
        minX: number;
        minY: number;
        maxX: number;
        maxY: number;
    };
}

export interface NormalisedWall {
    id: string;
    type: 'outer' | 'inner' | 'load_bearing';
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    thickness: number; // in mm if scale known
    confidence: number;
}

export interface DetectedDoor {
    id: string;
    x: number;
    y: number;
    width: number;
    swingAngle?: number; // 0-360, direction door opens
    type: 'entrance' | 'interior' | 'egress';
    confidence: number;
}

export interface DetectedWindow {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    confidence: number;
}

export interface DetectedFixture {
    id: string;
    type: 'kitchen' | 'bathroom' | 'other';
    x: number;
    y: number;
    width: number;
    height: number;
    confidence: number;
}

/**
 * Normalise wall data from DXF to standard format.
 * Input: raw wall lines (possibly at different scales)
 * Output: standardised walls in percentage coordinates
 */
export function normaliseWalls(
    rawWalls: WallLine[],
    imageWidth: number,
    imageHeight: number
): NormalisedWall[] {
    if (!rawWalls || rawWalls.length === 0) return [];

    const wallsUsePercent = rawWalls.every((wall) =>
        [wall.x1, wall.y1, wall.x2, wall.y2].every(
            (coord) => coord >= 0 && coord <= 100
        )
    );

    const xScale = wallsUsePercent ? 1 : imageWidth > 0 ? 100 / imageWidth : 1;
    const yScale = wallsUsePercent ? 1 : imageHeight > 0 ? 100 / imageHeight : 1;

    return rawWalls.map((wall, idx) => ({
        id: `wall-${idx}`,
        type: detectWallType(wall),
        x1: wall.x1 * xScale,
        y1: wall.y1 * yScale,
        x2: wall.x2 * xScale,
        y2: wall.y2 * yScale,
        thickness: wall.width || 0.1, // in percentage units if unknown
        confidence: 0.85, // DXF geometry is usually reliable
    }));
}

/**
 * Heuristic: detect wall type from thickness or layer.
 * Load-bearing walls are typically thicker or on specific layers.
 */
function detectWallType(wall: WallLine): 'outer' | 'inner' | 'load_bearing' {
    // If no thickness info, assume inner wall
    if (!wall.width) return 'inner';

    // Thicker walls are likely load-bearing
    if (wall.width > 0.2) return 'load_bearing';

    return 'inner';
}

/**
 * Extract door/window hints from text annotations in DXF.
 * Looks for patterns like "D1", "F2" (door/fenêtre in French/Dutch contexts).
 */
export function extractOpeningsFromText(
    texts: Array<{ text: string; x: number; y: number }>
): {
    doors: Omit<DetectedDoor, 'id'>[];
    windows: Omit<DetectedWindow, 'id'>[];
} {
    const doors: Omit<DetectedDoor, 'id'>[] = [];
    const windows: Omit<DetectedWindow, 'id'>[] = [];

    const doorPattern = /^[Dd](\d+)?$/;
    const windowPattern = /^[FfWw](\d+)?$/;

    for (const text of texts) {
        if (doorPattern.test(text.text.trim())) {
            doors.push({
                x: text.x,
                y: text.y,
                width: 0.9, // estimated door width in percentage
                type: 'interior',
                confidence: 0.5, // Heuristic guess
            });
        }

        if (windowPattern.test(text.text.trim())) {
            windows.push({
                x: text.x,
                y: text.y,
                width: 1.2,
                height: 1.5,
                confidence: 0.5, // Heuristic guess
            });
        }
    }

    return { doors, windows };
}

/**
 * Generate structured hints for vision model based on geometry.
 * These hints are passed to gpt-5 (OpenAI) to improve detection.
 */
export function generateGeometryHints(geometry: GeometryNormalisationResult): string {
    let hints = '';

    if (geometry.walls.length > 0) {
        hints += `\n\n## Geometrische structuur gedetecteerd\n`;
        hints += `- ${geometry.walls.length} muren gedetecteerd uit CAD\n`;

        const outerWalls = geometry.walls.filter(w => w.type === 'outer');
        if (outerWalls.length > 0) {
            hints += `- Buitenmuren kunnen detectie van unit-grenzen helpen\n`;
        }
    }

    if (geometry.doors.length > 0) {
        hints += `- ${geometry.doors.length} potentiële deuren gevonden (verifieer in afbeelding)\n`;
    }

    if (geometry.windows.length > 0) {
        hints += `- ${geometry.windows.length} ramen/deuren gedetecteerd\n`;
    }

    if (geometry.scale) {
        hints += `\n## Schaal gedetecteerd\n`;
        hints += `- ${geometry.scale.reference}\n`;
    }

    if (geometry.northArrow) {
        hints += `\n## Oriëntatie\n`;
        hints += `- Noord-pijl op ${geometry.northArrow.angle}°\n`;
    }

    return hints;
}

/**
 * Detect scale reference from text annotations.
 * Common patterns: "1:100", "1/100", "Schaal: 1:50"
 */
export function detectScale(
    texts: Array<{ text: string }>
): { pixelsPerMeter: number; reference: string } | undefined {
    const scalePattern = /1\s*[:\/]\s*(\d+)/i;

    for (const text of texts) {
        const match = text.text.match(scalePattern);
        if (match) {
            const ratio = parseInt(match[1], 10);
            // Rough estimate: 1:100 means 100 units per meter
            // Adjust based on actual image DPI/resolution
            return {
                pixelsPerMeter: 100 / ratio, // Placeholder
                reference: `1:${ratio}`,
            };
        }
    }

    return undefined;
}

/**
 * Detect north arrow orientation.
 * Looks for "N" text and estimates angle.
 */
export function detectNorthArrow(
    texts: Array<{ text: string; x: number; y: number }>
): { angle: number; confidence: number } | undefined {
    // Simple heuristic: find "N" text
    const northText = texts.find(t => /^N$/i.test(t.text.trim()));
    if (!northText) return undefined;

    // If N is at top-middle, angle ≈ 0°
    // If N is at top-right, angle ≈ 45°, etc.
    // This is a rough estimate; proper implementation would analyze rotation.
    return {
        angle: 0, // Default: assume north is up
        confidence: 0.3, // Low confidence without rotation detection
    };
}

/**
 * Full geometry normalisation pipeline.
 * Input: DXF/PDF extracted data
 * Output: Structured geometry hints for vision model
 */
export async function normaliseGeometry(
    walls: WallLine[] = [],
    texts: Array<{ text: string; x?: number; y?: number }> = [],
    imageWidth: number = 1000,
    imageHeight: number = 1400
): Promise<GeometryNormalisationResult> {
    const normalisedWalls = normaliseWalls(walls, imageWidth, imageHeight);

    // Extract text-based hints
    const textsUsePercent = texts.every(
        (t) =>
            t.x !== undefined &&
            t.y !== undefined &&
            t.x >= 0 &&
            t.x <= 100 &&
            t.y >= 0 &&
            t.y <= 100
    );

    const textsWithCoords = texts
        .filter((t): t is typeof t & { x: number; y: number } => t.x !== undefined && t.y !== undefined)
        .map(t => ({
            text: t.text || '',
            x: textsUsePercent ? t.x : ((t.x || 0) / imageWidth) * 100,
            y: textsUsePercent ? t.y : ((t.y || 0) / imageHeight) * 100,
        }));

    const { doors, windows } = extractOpeningsFromText(textsWithCoords);
    const scale = detectScale(texts);
    const northArrow = detectNorthArrow(textsWithCoords);

    return {
        walls: normalisedWalls,
        doors: doors.map((d, idx) => ({ ...d, id: `door-${idx}` })),
        windows: windows.map((w, idx) => ({ ...w, id: `window-${idx}` })),
        fixtures: [], // Could be detected from specific layer patterns in DXF
        scale,
        northArrow,
        boundaries: {
            minX: 0,
            minY: 0,
            maxX: imageWidth,
            maxY: imageHeight,
        },
    };
}
