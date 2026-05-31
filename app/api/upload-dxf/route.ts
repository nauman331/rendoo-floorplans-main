import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { parseDxf, findDxfUnitLabels } from '@/lib/parsers/dxf-parse';
import { detectRooms, groupRoomsIntoUnits } from '@/lib/parsers/room-detection';

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'Geen bestand ontvangen' }, { status: 400 });
  }

  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext !== 'dxf') {
    return NextResponse.json({ error: 'Alleen DXF bestanden worden ondersteund' }, { status: 400 });
  }

  const fileId = uuidv4();
  const fileName = `${fileId}.dxf`;

  // Store file
  const uploadsDir = path.join(process.cwd(), 'uploads');
  await mkdir(uploadsDir, { recursive: true });

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const filePath = path.join(uploadsDir, fileName);
  await writeFile(filePath, buffer);

  // Parse DXF
  const content = buffer.toString('utf-8');
  const extraction = parseDxf(content);

  // Detect rooms from wall geometry
  const regions = detectRooms(extraction.walls, extraction.texts);
  const units = groupRoomsIntoUnits(regions);

  // Find unit labels
  const unitLabels = findDxfUnitLabels(extraction.texts);

  // Cache parsed data for use during analysis
  const cacheDir = path.join(uploadsDir, 'cache');
  await mkdir(cacheDir, { recursive: true });
  await writeFile(
    path.join(cacheDir, `${fileId}-dxf.json`),
    JSON.stringify({
      walls: extraction.walls,
      texts: extraction.texts,
      bounds: extraction.bounds,
      layerNames: extraction.layerNames,
      regions: units,
    }, null, 2),
  );

  return NextResponse.json({
    fileId,
    fileName: file.name,
    size: file.size,
    type: 'dxf',
    url: `/api/files/${fileName}`,
    wallCount: extraction.walls.length,
    textCount: extraction.texts.length,
    unitLabels: unitLabels.map(l => l.text),
    regionCount: units.length,
    layerNames: extraction.layerNames,
  });
}
