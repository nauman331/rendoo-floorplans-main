/**
 * PDF rasterization for the upload pipeline.
 *
 * The previous implementation used `qlmanage -t` (macOS QuickLook) at
 * 3000px which produces a small thumbnail and chokes on complex
 * multi-page or vector PDFs. This module switches to `pdftoppm` from
 * poppler — already installed via Homebrew on the dev box and capable
 * of high-DPI rendering of any PDF type.
 *
 * Strategy in priority order:
 *   1. pdftoppm (poppler)  — handles vector / image / multi-page
 *   2. pdftocairo          — same family, slightly different output
 *   3. qlmanage            — original macOS thumbnail tool, last resort
 *
 * All three are tried in turn. The first one that produces an output
 * file wins. If none work we return null and the caller surfaces a
 * clear error to the user.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { access } from 'fs/promises';

const execAsync = promisify(exec);

const RENDER_DPI = 200;

export interface PdfRenderResult {
  /** Absolute path to the rendered PNG. */
  pngPath: string;
  /** Which converter actually did the work — handy for logging. */
  source: 'pdftoppm' | 'pdftocairo' | 'qlmanage';
}

/**
 * Render the first page of a PDF to a PNG file.
 *
 * @param pdfPath  Absolute path to the input PDF
 * @param pngPath  Absolute path to the desired output PNG
 * @returns        Result object on success, or null when every converter failed
 */
export async function renderPdfToPng(
  pdfPath: string,
  pngPath: string
): Promise<PdfRenderResult | null> {
  // 1. pdftoppm — preferred. -singlefile makes it write directly to
  // {pngPath} (.png is appended automatically — we strip our .png
  // suffix when passing the prefix).
  if (await commandExists('pdftoppm')) {
    try {
      const prefix = pngPath.endsWith('.png') ? pngPath.slice(0, -4) : pngPath;
      await execAsync(
        `pdftoppm -png -r ${RENDER_DPI} -singlefile -f 1 -l 1 "${pdfPath}" "${prefix}"`
      );
      if (await fileExists(pngPath)) {
        return { pngPath, source: 'pdftoppm' };
      }
    } catch (err) {
      console.warn('[pdf-to-png] pdftoppm failed:', errMsg(err));
    }
  }

  // 2. pdftocairo — also poppler. Same -singlefile flag.
  if (await commandExists('pdftocairo')) {
    try {
      const prefix = pngPath.endsWith('.png') ? pngPath.slice(0, -4) : pngPath;
      await execAsync(
        `pdftocairo -png -r ${RENDER_DPI} -singlefile -f 1 -l 1 "${pdfPath}" "${prefix}"`
      );
      if (await fileExists(pngPath)) {
        return { pngPath, source: 'pdftocairo' };
      }
    } catch (err) {
      console.warn('[pdf-to-png] pdftocairo failed:', errMsg(err));
    }
  }

  // 3. qlmanage — last resort. It writes "{pdfPath}.png" in the output
  // dir, so we have to move it.
  if (await commandExists('qlmanage')) {
    try {
      const outDir = pngPath.substring(0, pngPath.lastIndexOf('/'));
      await execAsync(
        `qlmanage -t -s 3000 -o "${outDir}" "${pdfPath}"`
      );
      const qlOutput = `${pdfPath}.png`;
      if (await fileExists(qlOutput)) {
        await execAsync(`mv "${qlOutput}" "${pngPath}"`);
        return { pngPath, source: 'qlmanage' };
      }
    } catch (err) {
      console.warn('[pdf-to-png] qlmanage failed:', errMsg(err));
    }
  }

  return null;
}

async function commandExists(cmd: string): Promise<boolean> {
  try {
    await execAsync(`command -v ${cmd}`);
    return true;
  } catch {
    return false;
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
