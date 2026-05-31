import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import type { TrainingExample } from '@/lib/ai/prompts';

const TRAINING_FILE = path.join(process.cwd(), 'uploads', 'training', 'examples.json');

async function loadExamples(): Promise<TrainingExample[]> {
  try {
    const data = await readFile(TRAINING_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function saveExamples(examples: TrainingExample[]) {
  await mkdir(path.dirname(TRAINING_FILE), { recursive: true });
  await writeFile(TRAINING_FILE, JSON.stringify(examples, null, 2));
}

// GET — load all training examples
export async function GET() {
  const examples = await loadExamples();
  return NextResponse.json({ examples, count: examples.length });
}

// POST — save a corrected polygon as training example
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { label, typeGroup, polygon, notes, sourceFile } = body;

  if (!label || !polygon || !Array.isArray(polygon)) {
    return NextResponse.json({ error: 'Missing label or polygon' }, { status: 400 });
  }

  const examples = await loadExamples();

  // Check if we already have this label — update instead of duplicate
  const existingIndex = examples.findIndex(e => e.label === label && e.sourceFile === sourceFile);
  const example: TrainingExample = {
    label,
    typeGroup: typeGroup || 'Unknown',
    polygon,
    notes: notes || `Gecorrigeerde polygon voor ${label}`,
    sourceFile,
  };

  if (existingIndex >= 0) {
    examples[existingIndex] = example;
  } else {
    examples.push(example);
    // Keep max 20 examples to avoid prompt getting too long
    if (examples.length > 20) examples.shift();
  }

  await saveExamples(examples);
  return NextResponse.json({ saved: true, totalExamples: examples.length });
}
