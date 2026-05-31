import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { parseCsv } from '@/lib/parsers/csv-parse';

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'Geen bestand ontvangen' }, { status: 400 });
  }

  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext !== 'csv') {
    return NextResponse.json({ error: 'Alleen CSV bestanden worden ondersteund' }, { status: 400 });
  }

  const fileId = uuidv4();
  const fileName = `${fileId}.csv`;

  // Store file
  const uploadsDir = path.join(process.cwd(), 'uploads');
  await mkdir(uploadsDir, { recursive: true });

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const filePath = path.join(uploadsDir, fileName);
  await writeFile(filePath, buffer);

  // Parse CSV
  const content = buffer.toString('utf-8');
  const result = parseCsv(content);

  // Cache parsed data
  const cacheDir = path.join(uploadsDir, 'cache');
  await mkdir(cacheDir, { recursive: true });
  await writeFile(
    path.join(cacheDir, `${fileId}-csv.json`),
    JSON.stringify(result, null, 2),
  );

  return NextResponse.json({
    fileId,
    fileName: file.name,
    size: file.size,
    unitCount: result.units.length,
    typeGroups: Object.keys(result.typeGroups),
    units: result.units,
    errors: result.errors,
  });
}
