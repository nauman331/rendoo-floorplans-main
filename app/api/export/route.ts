import { NextRequest, NextResponse } from 'next/server';
import type { Unit } from '@/types/project';
import { applyMoodTokensToSVG } from '@/lib/render/mood-tokens';

/**
 * Stage 07: Export Pipeline
 *
 * Export rendered floorplans in multiple formats:
 * - PNG: Raster, web-optimised, watermarked
 * - SVG: Vector source, editable, with mood tokens
 * - PDF: Print-ready, multi-page support
 */

interface ExportOptions {
    format: 'png' | 'svg' | 'pdf';
    width?: number;
    height?: number;
    quality?: number; // 0-100 for PNG
    watermark?: {
        text: string;
        opacity?: number; // 0-1
    };
    mood?: string;
}

interface CanvasDrawing {
    imageUrl?: string;
    units: Unit[];
    selectedUnitId?: string | null;
    width: number;
    height: number;
}

/**
 * Export as PNG (raster, web-friendly)
 */
export async function exportPNG(
    drawing: CanvasDrawing,
    options: ExportOptions
): Promise<Buffer> {
    const { createCanvas } = await import('canvas');

    const width = options.width || drawing.width || 1200;
    const height = options.height || drawing.height || 1600;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Fill background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    // Draw base image if provided
    if (drawing.imageUrl) {
        try {
            const { Image } = await import('canvas');
            const img = new Image();
            img.src = drawing.imageUrl;
            ctx.drawImage(img, 0, 0, width, height);
        } catch (err) {
            console.warn('Failed to load base image:', err);
        }
    }

    // Draw units
    drawUnitsOnCanvas(ctx, drawing.units, width, height);

    // Add watermark
    if (options.watermark) {
        addWatermarkToCanvas(ctx, options.watermark, width, height);
    }

    // Convert to PNG buffer
    return canvas.toBuffer('image/png');
}

/**
 * Export as SVG (vector, editable, preserves mood tokens)
 */
export function exportSVG(
    drawing: CanvasDrawing,
    options: ExportOptions
): string {
    const width = options.width || drawing.width || 1200;
    const height = options.height || drawing.height || 1600;

    let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <style>
      .unit-polygon { fill: {{mood.walls}}; stroke: {{mood.doors}}; stroke-width: 2; }
      .unit-label { font-family: {{mood.font-family}}; font-size: 14px; fill: {{mood.text}}; }
      .watermark { font-size: 12px; fill: {{mood.text}}; opacity: 0.3; }
    </style>
  </defs>

  <!-- Background -->
  <rect width="${width}" height="${height}" fill="{{mood.primary}}"/>

  <!-- Base image reference (if available) -->
  <!-- <image href="${drawing.imageUrl}" width="${width}" height="${height}"/> -->

  <!-- Units -->
  <g id="units">
`;

    // Add each unit as a polygon
    for (const unit of drawing.units) {
        if (!unit.polygon || unit.polygon.length < 3) continue;

        // Scale polygon to SVG coordinates
        const points = unit.polygon
            .map(p => `${(p.x / 100) * width},${(p.y / 100) * height}`)
            .join(' ');

        const isSelected = unit.id === drawing.selectedUnitId ? ' selected' : '';
        svg += `    <polygon class="unit-polygon${isSelected}" points="${points}" data-unit-id="${unit.id}"/>
`;

        // Add unit label at centroid
        const cx = (unit.polygon.reduce((s, p) => s + p.x, 0) / unit.polygon.length / 100) * width;
        const cy = (unit.polygon.reduce((s, p) => s + p.y, 0) / unit.polygon.length / 100) * height;

        svg += `    <text class="unit-label" x="${cx}" y="${cy}" text-anchor="middle">${unit.label || unit.id}</text>
`;
    }

    svg += `  </g>

  <!-- Watermark -->
  <g id="watermark">
`;

    if (options.watermark) {
        svg += `    <text class="watermark" x="${width / 2}" y="${height - 20}" text-anchor="middle">${options.watermark.text}</text>
`;
    }

    svg += `  </g>
</svg>
`;

    // Apply mood tokens if specified
    if (options.mood) {
        svg = applyMoodTokensToSVG(svg, options.mood);
    }

    return svg;
}

/**
 * Export as PDF (print-ready)
 * Requires jsPDF library
 */
export async function exportPDF(
    drawing: CanvasDrawing,
    options: ExportOptions
): Promise<Buffer> {
    const { jsPDF } = await import('jspdf');

    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // Draw base image if provided
    if (drawing.imageUrl) {
        try {
            doc.addImage(drawing.imageUrl, 'JPEG', 10, 10, pageWidth - 20, pageHeight - 40);
        } catch (err) {
            console.warn('Failed to add image to PDF:', err);
        }
    }

    // Add units as outlines
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);

    for (const unit of drawing.units) {
        if (!unit.polygon || unit.polygon.length < 3) continue;

        // Convert percentage coords to PDF coords
        const pdfPoints = unit.polygon.map(p => [
            10 + (p.x / 100) * (pageWidth - 20),
            10 + (p.y / 100) * (pageHeight - 40),
        ]);

        // Draw polygon
        doc.setFillColor(240, 240, 240);
        doc.polygon(pdfPoints as [number, number][], 'S');

        // Add label
        const cx = (unit.polygon.reduce((s, p) => s + p.x, 0) / unit.polygon.length / 100) * (pageWidth - 20) + 10;
        const cy = (unit.polygon.reduce((s, p) => s + p.y, 0) / unit.polygon.length / 100) * (pageHeight - 40) + 10;

        doc.setFontSize(10);
        doc.text(unit.label || unit.id, cx, cy, { align: 'center' });
    }

    // Add watermark
    if (options.watermark) {
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(options.watermark.text, pageWidth / 2, pageHeight - 10, { align: 'center' });
    }

    // Return as buffer
    return Buffer.from(doc.output('arraybuffer'));
}

/**
 * Draw units on canvas
 */
function drawUnitsOnCanvas(
    ctx: CanvasRenderingContext2D,
    units: Unit[],
    width: number,
    height: number
): void {
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 2;
    ctx.fillStyle = '#F0F0F0';

    for (const unit of units) {
        if (!unit.polygon || unit.polygon.length < 3) continue;

        // Scale polygon to canvas coordinates
        ctx.beginPath();
        for (let i = 0; i < unit.polygon.length; i++) {
            const p = unit.polygon[i];
            const x = (p.x / 100) * width;
            const y = (p.y / 100) * height;

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Add unit label
        const cx = (unit.polygon.reduce((s, p) => s + p.x, 0) / unit.polygon.length / 100) * width;
        const cy = (unit.polygon.reduce((s, p) => s + p.y, 0) / unit.polygon.length / 100) * height;

        ctx.fillStyle = '#000000';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(unit.label || unit.id, cx, cy);
    }
}

/**
 * Add watermark to canvas
 */
function addWatermarkToCanvas(
    ctx: CanvasRenderingContext2D,
    watermark: { text: string; opacity?: number },
    width: number,
    height: number
): void {
    ctx.save();
    ctx.globalAlpha = watermark.opacity ?? 0.2;
    ctx.fillStyle = '#999999';
    ctx.font = 'italic 24px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Diagonal watermark
    ctx.translate(width / 2, height / 2);
    ctx.rotate((-Math.PI / 180) * 45);
    ctx.fillText(watermark.text, 0, 0);

    ctx.restore();
}

/**
 * Main export handler
 */
export async function handleExport(
    drawing: CanvasDrawing,
    options: ExportOptions
): Promise<{
    data: Buffer | string;
    contentType: string;
    filename: string;
}> {
    let data: Buffer | string;
    let contentType: string;
    let filename: string;

    const timestamp = new Date().toISOString().slice(0, 10);

    switch (options.format) {
        case 'png':
            data = await exportPNG(drawing, options);
            contentType = 'image/png';
            filename = `floorplan-${timestamp}.png`;
            break;

        case 'svg':
            data = exportSVG(drawing, options);
            contentType = 'image/svg+xml';
            filename = `floorplan-${timestamp}.svg`;
            break;

        case 'pdf':
            data = await exportPDF(drawing, options);
            contentType = 'application/pdf';
            filename = `floorplan-${timestamp}.pdf`;
            break;

        default:
            throw new Error(`Unsupported export format: ${options.format}`);
    }

    return { data, contentType, filename };
}

/**
 * API route handler for export
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        const { drawing, options } = body;

        if (!drawing) {
            return NextResponse.json({ error: 'Missing drawing data' }, { status: 400 });
        }

        const result = await handleExport(drawing, options || {});

        return new NextResponse(result.data, {
            status: 200,
            headers: {
                'Content-Type': result.contentType,
                'Content-Disposition': `attachment; filename="${result.filename}"`,
            },
        });
    } catch (error) {
        console.error('Export error:', error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
