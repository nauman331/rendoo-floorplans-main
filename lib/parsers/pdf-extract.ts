// Server-side PDF geometry extraction using pdf.js
// Extracts wall lines, text labels, and dimensions from architectural PDFs

import { readFile } from 'fs/promises';
import path from 'path';
import { spawn, spawnSync } from 'child_process';
import { access } from 'fs/promises';
import { renderPdfToPng } from '@/lib/conversion/pdf-to-png';

interface ExtractedLine {
  x1: number; y1: number;
  x2: number; y2: number;
  width: number;
}

interface ExtractedText {
  text: string;
  x: number; y: number;
  fontSize: number;
}

export interface PdfExtraction {
  width: number;
  height: number;
  lines: ExtractedLine[];
  texts: ExtractedText[];
  wallLines: ExtractedLine[]; // Thick lines = walls
}

export async function extractPdfGeometry(pdfPath: string): Promise<PdfExtraction> {
  // Strict: require the Python-based PyMuPDF extractor. No JS fallback allowed.
  const scriptPath = path.join(process.cwd(), 'scripts', 'py_extract.py');
  await access(scriptPath);
  // Spawn python script and capture stdout
  const py = spawn('python3', [scriptPath, pdfPath], { stdio: ['ignore', 'pipe', 'inherit'] });
  const chunks: Buffer[] = [];
  for await (const chunk of py.stdout) {
    chunks.push(chunk as Buffer);
  }
  const out = Buffer.concat(chunks).toString('utf-8');
  if (!out) throw new Error('Python extractor produced no output');
  const parsed = JSON.parse(out);
  if (parsed.error) throw new Error(`Python extractor error: ${parsed.error}`);

  // If vector data found, return it directly
  if (parsed.vector === true && parsed.lines && parsed.lines.length > 0) {
    return {
      width: parsed.width,
      height: parsed.height,
      lines: parsed.lines,
      texts: parsed.texts || [],
      wallLines: parsed.wallLines || [],
    };
  }

  // Otherwise, treat as scanned PDF: render PNG raster and run system Tesseract CLI
  const pngFileName = path.join(process.cwd(), 'uploads', `${path.basename(pdfPath)}.raster.png`);
  const renderResult = await renderPdfToPng(pdfPath, pngFileName);
  if (!renderResult) throw new Error('Failed to render PDF to PNG for OCR');

  // Run system tesseract CLI: output to stdout
  const tess = spawnSync('tesseract', [pngFileName, 'stdout', '-l', 'eng'], { encoding: 'utf8' });
  if (tess.status !== 0) {
    throw new Error(`Tesseract failed: ${tess.stderr || tess.stdout}`);
  }
  const ocrText = (tess.stdout || '').trim();
  const ocrLines = ocrText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const texts: ExtractedText[] = ocrLines.map(t => ({ text: t, x: 0, y: 0, fontSize: 10 }));

  return {
    width: parsed.width,
    height: parsed.height,
    lines: [],
    texts,
    wallLines: [],
  };
}

// Find unit labels in extracted text (A1, B2, C3 patterns)
export function findUnitLabels(texts: ExtractedText[]): ExtractedText[] {
  const unitPattern = /^[A-Z]\d{1,2}$/;
  return texts.filter(t => unitPattern.test(t.text.trim()));
}

// Convert PDF coordinates to image percentage coordinates
export function pdfToPercent(x: number, y: number, pdfWidth: number, pdfHeight: number): { x: number; y: number } {
  return {
    x: (x / pdfWidth) * 100,
    y: (y / pdfHeight) * 100,
  };
}
