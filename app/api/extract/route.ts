import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { readFile } from 'fs/promises';
import { extractPdfGeometry, findUnitLabels, type PdfExtraction, type ExtractedLine, type ExtractedText } from '@/lib/parsers/pdf-extract';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { fileId } = body;

  const uploadsDir = path.join(process.cwd(), 'uploads');
  const pdfPath = path.join(uploadsDir, `${fileId}.pdf`);
  const cacheDir = path.join(uploadsDir, 'cache');
  const cachePath = path.join(cacheDir, `${fileId}-pdf.json`);

  console.log('[extract api] request', { fileId, pdfPath, cachePath });

  try {
    let extraction: PdfExtraction;
    try {
      const cached = await readFile(cachePath, 'utf-8');
      extraction = JSON.parse(cached) as PdfExtraction;
      console.log('[extract api] using cached extraction', {
        fileId,
        wallLines: extraction.wallLines.length,
        texts: extraction.texts.length,
      });
    } catch {
      extraction = await extractPdfGeometry(pdfPath);
      console.log('[extract api] extracted PDF geometry', {
        fileId,
        wallLines: extraction.wallLines.length,
        texts: extraction.texts.length,
      });
    }

    // Convert to percentage coordinates
    const wallLinesPercent = extraction.wallLines.map((l: ExtractedLine) => ({
      x1: (l.x1 / extraction.width) * 100,
      y1: (l.y1 / extraction.height) * 100,
      x2: (l.x2 / extraction.width) * 100,
      y2: (l.y2 / extraction.height) * 100,
      width: l.width,
    }));

    const textsPercent = extraction.texts.map((t: ExtractedText) => ({
      ...t,
      x: (t.x / extraction.width) * 100,
      y: (t.y / extraction.height) * 100,
    }));

    const unitLabels = findUnitLabels(extraction.texts).map(t => ({
      ...t,
      x: (t.x / extraction.width) * 100,
      y: (t.y / extraction.height) * 100,
    }));

    return NextResponse.json({
      status: 'complete',
      extraction: {
        width: extraction.width,
        height: extraction.height,
        totalLines: extraction.lines.length,
        totalWallLines: extraction.wallLines.length,
        totalTexts: extraction.texts.length,
        wallLines: wallLinesPercent,
        texts: textsPercent,
        unitLabels,
      },
    });
  } catch (error) {
    console.error('[extract api] error', error);
    return NextResponse.json({ status: 'error', error: String(error) }, { status: 500 });
  }
}
