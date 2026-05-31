import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { renderPdfToPng } from '@/lib/conversion/pdf-to-png';
import { parseDwgFile, renderDwgToPng } from '@/lib/parsers/dwg-parse';
import { findDxfUnitLabels } from '@/lib/parsers/dxf-parse';
import { detectRooms, groupRoomsIntoUnits } from '@/lib/parsers/room-detection';

/**
 * General upload endpoint.
 *
 * Handles three formats:
 *
 *  - PDF: rasterized to PNG via lib/conversion/pdf-to-png.ts (poppler
 *    via pdftoppm — handles complex multi-page / vector / image PDFs
 *    where the old qlmanage path failed). The PNG is what the
 *    /api/analyze pipeline reads via gpt-5 Vision.
 *
 *  - DWG: converted to DXF via lib/conversion/dwg-to-dxf.ts (LibreDWG
 *    or ODA File Converter, whichever is available). The resulting
 *    DXF is parsed and cached so the analyze pipeline picks it up
 *    via the existing DXF code path. If conversion isn't possible
 *    (no converter installed), we return a structured 422 error so
 *    the upload UI can tell the user to export their DWG to DXF or
 *    PDF first instead of silently moving on to mock data.
 *
 *  - Anything else (jpg/png images): stored as-is.
 */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const projectName = formData.get('projectName') as string | null;

  if (!file) {
    return NextResponse.json(
      { error: 'Geen bestand ontvangen' },
      { status: 400 }
    );
  }

  const fileId = uuidv4();
  const ext = file.name.split('.').pop()?.toLowerCase() || 'unknown';
  const fileName = `${fileId}.${ext}`;

  const uploadsDir = path.join(process.cwd(), 'uploads');
  await mkdir(uploadsDir, { recursive: true });

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const filePath = path.join(uploadsDir, fileName);
  await writeFile(filePath, buffer);

  let rasterUrl: string | undefined;

  /* ----------------------------- PDF ----------------------------- */
  if (ext === 'pdf') {
    const pngFileName = `${fileId}.png`;
    const pngPath = path.join(uploadsDir, pngFileName);
    const result = await renderPdfToPng(filePath, pngPath);
    if (result) {
      console.log(
        `[upload] PDF rasterized via ${result.source} → ${pngFileName}`
      );
      rasterUrl = `/api/files/${pngFileName}`;
    } else {
      console.error('[upload] All PDF renderers failed for', file.name);
      return NextResponse.json(
        {
          error: 'pdf_render_failed',
          message:
            'We kunnen deze PDF niet omzetten. Het bestand is mogelijk ' +
            'corrupt of beschermd. Probeer het opnieuw te exporteren of ' +
            'gebruik een DXF.',
        },
        { status: 422 }
      );
    }
  }

  /* ----------------------------- DWG ----------------------------- */
  if (ext === 'dwg') {
    // Two-track approach:
    //
    // Track 1: Geometry extraction — parse walls + texts from the
    //   DWG entities and cache them so the analyze pipeline can use
    //   geometry-based detection when enough walls are found.
    //
    // Track 2: Rasterization — render the DWG to a PNG via SVG so
    //   the analyze pipeline can run gpt-5 Vision (OpenAI) on the
    //   rendered image when geometry-based detection comes up short
    //   (which is common for DWGs with complex layer naming).
    //
    // Both tracks run; the analyze pipeline picks the best source.

    // Track 1 — geometry
    const parseResult = await parseDwgFile(filePath);
    if (parseResult.ok) {
      const { extraction } = parseResult;
      const regions = detectRooms(extraction.walls, extraction.texts);
      const units = groupRoomsIntoUnits(regions);
      const labels = findDxfUnitLabels(extraction.texts);

      const cacheDir = path.join(uploadsDir, 'cache');
      await mkdir(cacheDir, { recursive: true });
      await writeFile(
        path.join(cacheDir, `${fileId}-dxf.json`),
        JSON.stringify(
          {
            walls: extraction.walls,
            texts: extraction.texts,
            bounds: extraction.bounds,
            layerNames: extraction.layerNames,
            regions: units,
          },
          null,
          2
        )
      );
      console.log(
        `[upload] DWG geometry: ${extraction.walls.length} walls, ${labels.length} labels, ${units.length} regions`
      );
    } else {
      console.warn('[upload] DWG geometry extraction failed (non-fatal):', parseResult);
    }

    // Track 2 — rasterization (DWG → SVG → PNG for gpt-5 Vision)
    const pngFileName = `${fileId}.png`;
    const pngPath = path.join(uploadsDir, pngFileName);
    const renderResult = await renderDwgToPng(filePath, pngPath);
    if (renderResult.ok) {
      rasterUrl = `/api/files/${pngFileName}`;
      console.log(`[upload] DWG rasterized → ${pngFileName}`);
    } else {
      console.warn('[upload] DWG rasterization failed (non-fatal):', renderResult);
    }

    // If BOTH tracks failed, return an error
    if (!parseResult.ok && !renderResult.ok) {
      return NextResponse.json(
        {
          error: 'dwg_parse_failed',
          message:
            'We konden dit DWG-bestand niet lezen. Het is mogelijk corrupt ' +
            'of opgeslagen in een nog niet ondersteunde versie. Probeer het ' +
            'in AutoCAD opnieuw op te slaan als ACAD2018 DWG, of exporteer ' +
            'naar DXF / PDF.',
          detail: parseResult.detail,
        },
        { status: 422 }
      );
    }
  }

  return NextResponse.json({
    fileId,
    fileName: file.name,
    size: file.size,
    type: ext,
    url: `/api/files/${fileName}`,
    rasterUrl: rasterUrl || `/api/files/${fileName}`,
    projectName,
  });
}
