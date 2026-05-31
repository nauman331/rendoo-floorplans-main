// Server-side PDF geometry extraction using pdf.js
// Extracts wall lines, text labels, and dimensions from architectural PDFs

import { readFile } from 'fs/promises';
import path from 'path';

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
  // Dynamic import for pdf.js (ESM module)
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const data = await readFile(pdfPath);
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const page = await pdf.getPage(1);

  const viewport = page.getViewport({ scale: 1.0 });
  const width = viewport.width;
  const height = viewport.height;

  // Extract operator list (all drawing commands)
  const opList = await page.getOperatorList();
  const lines: ExtractedLine[] = [];
  let currentLineWidth = 1;

  // Parse PDF operators to extract lines
  let currentX = 0, currentY = 0;
  let moveX = 0, moveY = 0;

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    const args = opList.argsArray[i];

    // OPS.setLineWidth
    if (fn === 15) {
      currentLineWidth = args[0] as number;
    }
    // OPS.moveTo
    if (fn === 13) {
      currentX = args[0] as number;
      currentY = args[1] as number;
      moveX = currentX;
      moveY = currentY;
    }
    // OPS.lineTo
    if (fn === 14) {
      const x2 = args[0] as number;
      const y2 = args[1] as number;
      lines.push({
        x1: currentX, y1: height - currentY, // Flip Y (PDF has origin at bottom)
        x2: x2, y2: height - y2,
        width: currentLineWidth,
      });
      currentX = x2;
      currentY = y2;
    }
    // OPS.closePath
    if (fn === 18) {
      if (currentX !== moveX || currentY !== moveY) {
        lines.push({
          x1: currentX, y1: height - currentY,
          x2: moveX, y2: height - moveY,
          width: currentLineWidth,
        });
      }
      currentX = moveX;
      currentY = moveY;
    }
    // OPS.rectangle
    if (fn === 16) {
      const [rx, ry, rw, rh] = args as number[];
      const fy = height - ry;
      lines.push(
        { x1: rx, y1: fy, x2: rx + rw, y2: fy, width: currentLineWidth },
        { x1: rx + rw, y1: fy, x2: rx + rw, y2: fy - rh, width: currentLineWidth },
        { x1: rx + rw, y1: fy - rh, x2: rx, y2: fy - rh, width: currentLineWidth },
        { x1: rx, y1: fy - rh, x2: rx, y2: fy, width: currentLineWidth },
      );
    }
  }

  // Extract text content
  const textContent = await page.getTextContent();
  const texts: ExtractedText[] = textContent.items
    .filter((item) => 'str' in item && (item as { str: string }).str.trim().length > 0)
    .map(item => {
      const textItem = item as { str: string; transform: number[]; height?: number };
      return {
        text: textItem.str,
        x: textItem.transform[4],
        y: height - textItem.transform[5], // Flip Y
        fontSize: textItem.height || 10,
      };
    });

  // Identify wall lines (thicker lines, typically > 0.3mm in PDF units)
  const wallThreshold = 0.3;
  const wallLines = lines.filter(l => l.width >= wallThreshold);

  return { width, height, lines, texts, wallLines };
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
