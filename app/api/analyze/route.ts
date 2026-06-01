import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';

import type { DetectedRegion } from '@/lib/parsers/room-detection';
import type { CsvParseResult, CsvUnit } from '@/lib/parsers/csv-parse';
import type { WallLine } from '@/types/project';
import type { TextLabel } from '@/lib/parsers/dxf-parse';
import type { PdfExtraction } from '@/lib/parsers/pdf-extract';

const CACHE_DIR = path.join(process.cwd(), 'uploads', 'cache');

interface DxfCacheData {
  walls: WallLine[];
  texts: TextLabel[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  layerNames: string[];
  regions: DetectedRegion[];
}

async function getCachedAnalysis(fileId: string) {
  try {
    const data = await readFile(path.join(CACHE_DIR, `${fileId}.json`), 'utf-8');
    return JSON.parse(data);
  } catch { return null; }
}

async function cacheAnalysis(fileId: string, analysis: unknown) {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(path.join(CACHE_DIR, `${fileId}.json`), JSON.stringify(analysis, null, 2));
}

async function loadDxfData(fileId: string): Promise<DxfCacheData | null> {
  try {
    const data = await readFile(path.join(CACHE_DIR, `${fileId}-dxf.json`), 'utf-8');
    return JSON.parse(data);
  } catch { return null; }
}

async function loadCsvData(csvFileId: string): Promise<CsvParseResult | null> {
  try {
    const data = await readFile(path.join(CACHE_DIR, `${csvFileId}-csv.json`), 'utf-8');
    return JSON.parse(data);
  } catch { return null; }
}

async function loadPdfData(fileId: string): Promise<PdfExtraction | null> {
  try {
    const data = await readFile(path.join(CACHE_DIR, `${fileId}-pdf.json`), 'utf-8');
    return JSON.parse(data);
  } catch { return null; }
}

interface MirrorPairingUnit {
  id?: string;
  label: string;
  typeGroup: string;
  classification?: string;
  isMirrored?: boolean;
  mirrorOf?: string | null;
  variantOf?: string | null;
}

/**
 * Sort polygon vertices by angle from centroid so the result is a
 * simple (non-self-intersecting) polygon. Vision models routinely
 * return points in zigzag order, producing bowtie shapes that don't
 * represent any real apartment.
 *
 * This works perfectly for convex polygons (rectangles, trapezoids,
 * pentagons that wrap around) — which is what 99% of apartments are.
 * For genuinely concave layouts (L-shaped) the order may not be
 * perfect, but a convex hull is still a sensible approximation that
 * the user can fine-tune.
 */
function sortPolygonClockwise(
  points: { x: number; y: number }[]
): { x: number; y: number }[] {
  if (points.length < 4) return points;
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  return [...points].sort((a, b) => {
    const angA = Math.atan2(a.y - cy, a.x - cx);
    const angB = Math.atan2(b.y - cy, b.x - cx);
    return angA - angB;
  });
}

/** True if the polygon contains any pair of crossing edges. */
function isSelfIntersecting(points: { x: number; y: number }[]): boolean {
  const n = points.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    const a1 = points[i];
    const a2 = points[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      // Skip adjacent edges (they share a vertex)
      if (i === 0 && j === n - 1) continue;
      const b1 = points[j];
      const b2 = points[(j + 1) % n];
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

function segmentsIntersect(
  p: { x: number; y: number },
  p2: { x: number; y: number },
  q: { x: number; y: number },
  q2: { x: number; y: number }
): boolean {
  const d1 = direction(q, q2, p);
  const d2 = direction(q, q2, p2);
  const d3 = direction(p, p2, q);
  const d4 = direction(p, p2, q2);
  if (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  ) {
    return true;
  }
  return false;
}

function direction(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number }
): number {
  return (c.x - a.x) * (b.y - a.y) - (b.x - a.x) * (c.y - a.y);
}

/**
 * Apply the bowtie fix to every unit's polygon. Only re-sorts when
 * we actually detect self-intersection so user-edited polygons that
 * are already valid don't get touched.
 */
function fixBowtiePolygons<
  T extends { polygon?: { x: number; y: number }[] },
>(units: T[]): void {
  for (const u of units) {
    if (!u.polygon || u.polygon.length < 4) continue;
    if (isSelfIntersecting(u.polygon)) {
      u.polygon = sortPolygonClockwise(u.polygon);
    }
  }
}

/**
 * Mirror-pairing heuristic.
 *
 * Vision models routinely miss mirror detection — they classify both
 * halves of a B2/B3 pair as "hoofdtype" because the bird's-eye view
 * looks symmetric. We fix it heuristically: within each typeGroup,
 * sort by label number and pair adjacent units; the second of each
 * pair becomes 'gespiegeld' with mirrorOf set to the first.
 *
 * Rules:
 *  - Only runs when there are >= 2 units in the same typeGroup
 *  - Skips units whose classification was set by CSV (those have
 *    mirrorOf populated) — CSV is the source of truth
 *  - Variants (Type C variant of Type B) are left alone — they're a
 *    different relationship than mirroring
 *  - For odd counts (e.g. 5 units in Type B), the last one stays as
 *    whatever the model said
 *
 * The function mutates the units array in place.
 */
export function applyMirrorPairing<T extends MirrorPairingUnit>(units: T[]): void {
  // Group by typeGroup, but keep variants in their own bucket so we
  // don't pair a variant with a hoofdtype.
  const groups = new Map<string, T[]>();
  for (const u of units) {
    if (u.classification === 'variant') continue; // leave variants alone
    const key = u.typeGroup ?? 'unknown';
    const arr = groups.get(key) ?? [];
    arr.push(u);
    groups.set(key, arr);
  }

  for (const [, group] of groups) {
    if (group.length < 2) continue;

    // Sort by the numeric portion of the label (B2, B3, B4 → 2, 3, 4)
    // so adjacent labels pair up correctly. Fall back to label string
    // sort when there's no number.
    const labelNumber = (label: string): number => {
      const m = label.match(/\d+/);
      return m ? parseInt(m[0], 10) : Number.MAX_SAFE_INTEGER;
    };
    group.sort((a, b) => {
      const na = labelNumber(a.label);
      const nb = labelNumber(b.label);
      if (na !== nb) return na - nb;
      return a.label.localeCompare(b.label);
    });

    // Pair (0,1), (2,3), (4,5), ...
    for (let i = 0; i < group.length - 1; i += 2) {
      const first = group[i];
      const second = group[i + 1];

      // Don't override an explicit mirror relationship that was already
      // set (CSV or already-correct vision output)
      const firstFromCsv = first.classification === 'gespiegeld' && first.mirrorOf;
      const secondFromCsv = second.classification === 'gespiegeld' && second.mirrorOf;
      if (firstFromCsv || secondFromCsv) continue;

      // The first stays hoofdtype, the second becomes gespiegeld
      first.classification = 'hoofdtype';
      first.isMirrored = false;
      first.mirrorOf = null;

      second.classification = 'gespiegeld';
      second.isMirrored = true;
      second.mirrorOf = first.id ?? first.label;
    }
  }

  // Recompute mirroredTypes by mutation isn't this function's job —
  // the caller should refresh that summary if it uses it.
}

function buildAnalysisFromDxfAndCsv(
  dxfData: DxfCacheData,
  csvData: CsvParseResult | null,
) {
  const regions = dxfData.regions;
  const csvUnits = csvData?.units || [];

  // Match regions to CSV units by label or by order
  const units = [];
  const usedCsvUnits = new Set<number>();

  for (let i = 0; i < regions.length; i++) {
    const region = regions[i];

    // Try to find a matching CSV unit by label
    let csvUnit: CsvUnit | undefined;
    if (region.label) {
      const csvIdx = csvUnits.findIndex(
        (u, idx) => !usedCsvUnits.has(idx) && u.bouwnummer === region.label
      );
      if (csvIdx !== -1) {
        csvUnit = csvUnits[csvIdx];
        usedCsvUnits.add(csvIdx);
      }
    }

    // If no label match, try positional match
    if (!csvUnit && i < csvUnits.length && !usedCsvUnits.has(i)) {
      csvUnit = csvUnits[i];
      usedCsvUnits.add(i);
    }

    const label = csvUnit?.bouwnummer || region.label || `Unit ${i + 1}`;
    const typeGroup = csvUnit?.hoofdtype || `Type ${String.fromCharCode(65 + (i % 26))}`;
    const classification = csvUnit?.classification || 'hoofdtype';
    const isMirrored = classification === 'gespiegeld';
    const floor = csvUnit?.verdieping || 0;

    units.push({
      id: region.id,
      label,
      typeGroup,
      classification,
      isMirrored,
      mirrorOf: isMirrored ? typeGroup : undefined,
      floor,
      polygon: region.polygon,
      area: csvUnit?.oppervlakte || region.area,
      rooms: [],
      confidence: 0.95, // DXF-based detection is high confidence
    });
  }

  // Add CSV units that weren't matched to a region
  for (let i = 0; i < csvUnits.length; i++) {
    if (usedCsvUnits.has(i)) continue;
    const csvUnit = csvUnits[i];
    units.push({
      id: `csv-${i}`,
      label: csvUnit.bouwnummer,
      typeGroup: csvUnit.hoofdtype,
      classification: csvUnit.classification,
      isMirrored: csvUnit.classification === 'gespiegeld',
      mirrorOf: csvUnit.classification === 'gespiegeld' ? csvUnit.hoofdtype : undefined,
      floor: csvUnit.verdieping,
      polygon: [], // no geometry available
      area: csvUnit.oppervlakte || 0,
      rooms: [],
      confidence: 0.5, // CSV-only, no geometry
    });
  }

  // Determine unique types and mirrored count
  const typeSet = new Set(units.map(u => u.typeGroup));
  const mirroredCount = units.filter(u => u.isMirrored).length;

  // Build floors
  const floorSet = new Set(units.map(u => u.floor));
  const floors = Array.from(floorSet).sort().map((f) => ({
    index: f,
    label: f === 0 ? 'Begane grond' : `Verdieping ${f}`,
  }));

  return {
    totalUnits: units.length,
    uniqueTypes: typeSet.size,
    mirroredTypes: mirroredCount,
    floors,
    units,
  };
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { fileId, forceRefresh, csvFileId } = body;
  console.log('[analyze api] request', { fileId, forceRefresh, csvFileId });

  // Check cache first (unless force refresh)
  if (!forceRefresh && fileId) {
    const cached = await getCachedAnalysis(fileId);
    if (cached) {
      console.log(`Using cached analysis for ${fileId}`);
      return NextResponse.json({ status: 'complete', analysis: cached, mock: false, cached: true });
    }
  }

  // Try to load DXF parsed data
  const dxfData = fileId ? await loadDxfData(fileId) : null;
  const csvData = csvFileId ? await loadCsvData(csvFileId) : null;

  // Load the plan image
  const uploadsDir = path.join(process.cwd(), 'uploads');
  let imageBase64 = '';
  for (const ext of ['png', 'jpg', 'jpeg']) {
    try {
      const buf = await readFile(path.join(uploadsDir, `${fileId}.${ext}`));
      imageBase64 = buf.toString('base64');
      break;
    } catch { continue; }
  }

  if (!imageBase64) {
    console.error('[analyze api] missing image for', fileId);
    return NextResponse.json(
      { error: 'No image file found. Upload must produce a valid PNG/image file.' },
      { status: 400 }
    );
  }

  // === STAGE 03: Geometry Normalisation (runs BEFORE vision AI) ===
  let geometryHints = '';
  let pdfExtraction: PdfExtraction | null = null;
  try {
    const { normaliseGeometry, generateGeometryHints } = await import('@/lib/parsers/geometry-normaliser');

    let wallsForGeometry: WallLine[] = [];
    let textsForGeometry: Array<{ text: string; x?: number; y?: number }> = [];
    let geometryImageWidth = 100;
    let geometryImageHeight = 100;

    // Use DXF geometry if available
    if (dxfData) {
      wallsForGeometry = dxfData.walls;
      textsForGeometry = dxfData.texts || [];
      geometryImageWidth = 100;
      geometryImageHeight = 100;
    }

    // Fall back to cached PDF geometry when no DXF data exists
    pdfExtraction = dxfData ? null : fileId ? await loadPdfData(fileId) : null;
    if (!dxfData && pdfExtraction) {
      wallsForGeometry = pdfExtraction.wallLines;
      textsForGeometry = pdfExtraction.texts || [];
      geometryImageWidth = pdfExtraction.width;
      geometryImageHeight = pdfExtraction.height;
    }

    const geometry = await normaliseGeometry(
      wallsForGeometry,
      textsForGeometry,
      geometryImageWidth,
      geometryImageHeight
    );
    geometryHints = generateGeometryHints(geometry);
    console.log(`Geometry normalisation complete: ${geometry.walls.length} walls, ${geometry.doors.length} doors, ${geometry.windows.length} windows`);
  } catch (err) {
    console.warn('Geometry normalisation failed (non-blocking):', err);
  }

  // === STRATEGY 1: Try gpt-5 Vision first (superior spatial detection) ===
  const openaiKey = process.env.OPENAI_API_KEY;
  const openaiVisionModel = process.env.OPENAI_VISION_MODEL || 'gpt-5';

  const overlayWalls: WallLine[] = dxfData?.walls?.length
    ? dxfData.walls
    : pdfExtraction?.wallLines?.length
      ? pdfExtraction.wallLines.map((l) => ({
        x1: (l.x1 / pdfExtraction.width) * 100,
        y1: (l.y1 / pdfExtraction.height) * 100,
        x2: (l.x2 / pdfExtraction.width) * 100,
        y2: (l.y2 / pdfExtraction.height) * 100,
        width: l.width,
      }))
      : [];

  if (openaiKey) {
    try {
      console.log('Attempting gpt-5 Vision-based analysis...');
      const { analyzeWithGPT4 } = await import('@/lib/ai/gpt4-detection');

      // Load training examples for few-shot learning
      let trainingExamples: import('@/lib/ai/prompts').TrainingExample[] = [];
      try {
        const trainingPath = path.join(process.cwd(), 'uploads', 'training', 'examples.json');
        const trainingData = await readFile(trainingPath, 'utf-8');
        trainingExamples = JSON.parse(trainingData);
        console.log(`Loaded ${trainingExamples.length} training examples for gpt-5`);
      } catch { /* no training data yet */ }

      // If we have DXF/DWG-extracted text labels, pass them as a hint
      // so gpt-5 knows what unit names to look for even when the image
      // is hard to read.
      let textHint = '';
      if (dxfData && dxfData.texts && dxfData.texts.length > 0) {
        const unitPattern = /^[A-Z]\w{0,5}\d{0,3}$/;
        const labels = dxfData.texts
          .filter((t: { text: string }) => unitPattern.test(t.text.trim()))
          .map((t: { text: string }) => t.text.trim())
          .slice(0, 30);
        if (labels.length > 0) {
          textHint = `\n\n## HINT — Labels gedetecteerd in het bronbestand\nDe volgende labels zijn gevonden in de CAD-data: ${labels.join(', ')}. Zoek deze labels in de afbeelding en gebruik ze als uitgangspunt voor de unit-detectie.`;
        }
      }

      // Add geometry hints from Stage 03
      if (geometryHints) {
        textHint += geometryHints;
      }

      let gpt4Analysis = await analyzeWithGPT4(imageBase64, openaiKey, trainingExamples, textHint);

      // Treat empty detections as a failed pass so we can retry once.
      if (!gpt4Analysis.units || gpt4Analysis.units.length === 0) {
        const retryHint = `${textHint}\n\nBELANGRIJK: je vorige antwoord had 0 units. Er zijn duidelijk appartementen zichtbaar in deze tekening. Probeer opnieuw en geef een volledige JSON met alle zichtbare wooneenheden. Gebruik geen lege units-array.`;
        gpt4Analysis = await analyzeWithGPT4(imageBase64, openaiKey, trainingExamples, retryHint);
      }

      if (!gpt4Analysis.units || gpt4Analysis.units.length === 0) {
        return NextResponse.json(
          {
            error: 'gpt-5 returned 0 units after retry. No fallback will be used. Controleer de inputtekening of probeer een andere bron.',
            source: 'gpt4_vision',
            aiModel: openaiVisionModel,
          },
          { status: 422 }
        );
      }

      // Auto-fix self-intersecting (bowtie) polygons — vision models
      // routinely return points in zigzag order producing X-shaped
      // outlines that aren't real apartments.
      fixBowtiePolygons(gpt4Analysis.units);

      // Heuristic mirror pairing — fixes the common case where vision
      // models classify both halves of a B2/B3 pair as hoofdtype.
      // Runs BEFORE CSV so that CSV (source of truth) can still override.
      applyMirrorPairing(gpt4Analysis.units);

      // Apply CSV classifications if available
      if (csvData && csvData.units.length > 0) {
        for (const unit of gpt4Analysis.units) {
          const csvUnit = csvData.units.find(c => c.bouwnummer === unit.label);
          if (csvUnit) {
            unit.typeGroup = csvUnit.hoofdtype;
            unit.classification = csvUnit.classification as 'hoofdtype' | 'gespiegeld' | 'variant';
            unit.isMirrored = csvUnit.classification === 'gespiegeld';
            if (csvUnit.oppervlakte) unit.area = csvUnit.oppervlakte;
          }
        }
      }

      // Refresh the mirroredTypes summary after pairing
      gpt4Analysis.mirroredTypes = gpt4Analysis.units.filter(
        (u) => u.isMirrored
      ).length;

      gpt4Analysis.source = 'gpt4_vision';
      gpt4Analysis.aiModel = openaiVisionModel;
      gpt4Analysis.pipelineStatus = 'complete';

      // Cache
      if (fileId) await cacheAnalysis(fileId, gpt4Analysis);

      console.log(`gpt-5 detected ${gpt4Analysis.totalUnits} units`, {
        source: 'gpt4_vision',
        aiModel: openaiVisionModel,
        dxfWalls: overlayWalls.length,
      });
      return NextResponse.json({
        status: 'complete',
        analysis: gpt4Analysis,
        mock: false,
        source: 'gpt4_vision',
        aiModel: openaiVisionModel,
        dxfWalls: overlayWalls.length > 0 ? overlayWalls : undefined,
      });
    } catch (gpt4Err) {
      console.error('[analyze api] gpt-5 Vision analysis failed:', gpt4Err);
      if (dxfData) {
        console.log('[analyze api] falling back to dxf_csv_fallback', { fileId, csvFileId });
        const fallbackAnalysis = buildAnalysisFromDxfAndCsv(dxfData, csvData);
        if (fileId) await cacheAnalysis(fileId, fallbackAnalysis);
        return NextResponse.json({
          status: 'complete',
          analysis: fallbackAnalysis,
          mock: false,
          source: 'dxf_csv_fallback',
          aiModel: 'dxf_csv',
          fallbackReason: String(gpt4Err instanceof Error ? gpt4Err.message : gpt4Err),
          dxfWalls: overlayWalls.length > 0 ? overlayWalls : undefined,
        });
      }
      return NextResponse.json(
        {
          error: `gpt-5 Vision analysis failed: ${gpt4Err instanceof Error ? gpt4Err.message : 'Unknown error'}`,
          source: 'gpt4_vision',
          aiModel: openaiVisionModel,
        },
        { status: 500 }
      );
    }
  }

  if (dxfData) {
    console.log('[analyze api] no OpenAI key, using DXF fallback', { fileId, csvFileId });
    const fallbackAnalysis = buildAnalysisFromDxfAndCsv(dxfData, csvData);
    if (fileId) await cacheAnalysis(fileId, fallbackAnalysis);
    return NextResponse.json({
      status: 'complete',
      analysis: fallbackAnalysis,
      mock: false,
      source: 'dxf_csv_fallback',
      aiModel: 'dxf_csv',
      dxfWalls: overlayWalls.length > 0 ? overlayWalls : undefined,
    });
  }

  return NextResponse.json(
    { error: 'No API keys configured for gpt-5 Vision. Set OPENAI_API_KEY in .env.local' },
    { status: 500 }
  );
}
