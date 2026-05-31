import { NextResponse, type NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import type { AnnotationShape, PlanEdit } from '@/types/project';
import type { FurnitureId } from '@/lib/render/furniture';

/**
 * Claude-powered fallback for the heuristic feedback parser.
 *
 * Called by /resultaat when lib/render/parse-feedback.ts can't extract
 * any edits from the user's text. We send Claude the feedback comment,
 * the area the user marked on the plan, the rooms that area overlaps,
 * and the catalog of furniture ids — Claude returns a JSON array of
 * concrete edits the renderer can apply.
 *
 * The route is intentionally tight: it only ever returns valid PlanEdit
 * fragments (no id/createdAt — those are added by the store on insert).
 */

const FURNITURE_CATALOG: { id: FurnitureId; name: string; rooms: string[] }[] = [
  { id: 'double-bed', name: 'Tweepersoonsbed', rooms: ['bedroom'] },
  { id: 'single-bed', name: 'Eenpersoonsbed', rooms: ['bedroom'] },
  { id: 'sofa', name: 'Bank (3-zit)', rooms: ['living'] },
  { id: 'sofa-corner', name: 'Hoekbank', rooms: ['living'] },
  { id: 'lounge-chair', name: 'Loungestoel', rooms: ['living'] },
  { id: 'dining-table', name: 'Eettafel (4 personen)', rooms: ['kitchen', 'living'] },
  { id: 'dining-table-large', name: 'Eettafel (6 personen)', rooms: ['kitchen', 'living'] },
  { id: 'kitchen-island', name: 'Kookeiland', rooms: ['kitchen', 'living'] },
  { id: 'kitchen-counter', name: 'Keukenblok', rooms: ['kitchen', 'living'] },
  { id: 'rug', name: 'Vloerkleed', rooms: ['living', 'bedroom'] },
  { id: 'rug-large', name: 'Vloerkleed (groot)', rooms: ['living'] },
  { id: 'plant', name: 'Plant', rooms: ['living', 'bedroom', 'office', 'outdoor'] },
  { id: 'plant-small', name: 'Plant (klein)', rooms: ['bathroom', 'kitchen'] },
  { id: 'toilet', name: 'Toilet', rooms: ['toilet', 'bathroom'] },
  { id: 'sink', name: 'Wastafel', rooms: ['bathroom', 'toilet'] },
  { id: 'shower', name: 'Douche', rooms: ['bathroom'] },
  { id: 'bath', name: 'Bad', rooms: ['bathroom'] },
  { id: 'desk', name: 'Bureau', rooms: ['office', 'bedroom'] },
  { id: 'office-chair', name: 'Bureaustoel', rooms: ['office'] },
  { id: 'wardrobe', name: 'Kledingkast', rooms: ['bedroom'] },
  { id: 'balcony-chairs', name: 'Balkonset', rooms: ['outdoor'] },
  { id: 'tv-bench', name: 'TV-meubel', rooms: ['living'] },
];

const ALLOWED_IDS = new Set<string>(FURNITURE_CATALOG.map((f) => f.id));

interface RequestBody {
  feedback: string;
  feedbackId: string;
  annotation: AnnotationShape | null;
  /** Names of the rooms the annotation overlaps, for context. */
  contextRooms: { label: string; kind: string }[];
}

interface ClaudeEdit {
  action: 'add' | 'remove' | 'replace';
  targetItem?: string;
  newItem?: string;
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { edits: [], error: 'ANTHROPIC_API_KEY not set' },
      { status: 200 }
    );
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ edits: [], error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.feedback?.trim() || !body.annotation) {
    // Without an annotation we can't apply targeted edits
    return NextResponse.json({ edits: [] });
  }

  const catalogText = FURNITURE_CATALOG.map(
    (f) => `  - ${f.id} (${f.name}) — past in: ${f.rooms.join(', ') || '—'}`
  ).join('\n');

  const contextText =
    body.contextRooms.length > 0
      ? body.contextRooms
          .map((r) => `  - ${r.label} (${r.kind})`)
          .join('\n')
      : '  - (geen specifieke kamer geïdentificeerd)';

  const systemPrompt = `Je bent een assistent die natuurlijke-taal feedback op een gegenereerde plattegrond omzet naar concrete bewerkingen voor een floorplan-renderer.

Je krijgt:
  1. Een feedback-zin van een gebruiker (Nederlands).
  2. Het gebied dat de gebruiker op de plattegrond heeft gemarkeerd.
  3. De ruimte(s) waarmee dat gebied overlapt.
  4. Een catalogus van beschikbare meubel-ids die de renderer kan tekenen.

Je antwoord is een JSON-array met objecten van de vorm:

  { "action": "add" | "remove" | "replace", "targetItem"?: "<id>", "newItem"?: "<id>" }

Regels:
  - Gebruik UITSLUITEND meubel-ids uit de catalogus. Verzin geen ids.
  - "add" → vereist newItem.
  - "remove" → vereist targetItem (laat weg = "alles in het gebied").
  - "replace" → vereist beide.
  - Geef meerdere edits terug als de feedback er meerdere noemt.
  - Geef een lege array [] terug als er geen toepasbare bewerking uit te halen is.
  - Geef ALLEEN het JSON-array terug, geen extra tekst, geen markdown, geen uitleg.`;

  const userPrompt = `Catalogus van beschikbare meubels:
${catalogText}

Ruimte(s) onder de markering:
${contextText}

Feedback van de gebruiker:
"${body.feedback.trim()}"

Wat zijn de concrete bewerkingen?`;

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    // Extract first text block, parse as JSON
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    const parsed = parseClaudeResponse(text);
    const edits = validateEdits(parsed, body.annotation, body.feedback, body.feedbackId);

    return NextResponse.json({ edits });
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.error('apply-feedback Anthropic error', err.status, err.message);
    } else {
      console.error('apply-feedback unknown error', err);
    }
    return NextResponse.json({ edits: [], error: 'claude_failed' }, { status: 200 });
  }
}

/**
 * Tolerant JSON extraction — Claude usually returns clean JSON but
 * sometimes wraps it in ```json fences or adds a leading sentence.
 */
function parseClaudeResponse(raw: string): unknown {
  let cleaned = raw.trim();
  // Strip ```json ... ``` fences
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) cleaned = fenceMatch[1].trim();
  // Otherwise pull out the first [...] block
  if (!cleaned.startsWith('[')) {
    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrMatch) cleaned = arrMatch[0];
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

/**
 * Validate that the parsed payload is an array of well-formed edits
 * referring only to known furniture ids. Anything invalid is dropped.
 */
function validateEdits(
  parsed: unknown,
  annotation: AnnotationShape,
  source: string,
  feedbackId: string
): Omit<PlanEdit, 'id' | 'createdAt'>[] {
  if (!Array.isArray(parsed)) return [];
  const edits: Omit<PlanEdit, 'id' | 'createdAt'>[] = [];
  for (const raw of parsed) {
    if (!raw || typeof raw !== 'object') continue;
    const candidate = raw as ClaudeEdit;
    if (!['add', 'remove', 'replace'].includes(candidate.action)) continue;
    if (candidate.targetItem && !ALLOWED_IDS.has(candidate.targetItem)) continue;
    if (candidate.newItem && !ALLOWED_IDS.has(candidate.newItem)) continue;
    if ((candidate.action === 'add' || candidate.action === 'replace') && !candidate.newItem) {
      continue;
    }
    edits.push({
      feedbackId,
      area: annotation,
      action: candidate.action,
      targetItem: candidate.targetItem,
      newItem: candidate.newItem,
      source,
    });
  }
  return edits;
}
