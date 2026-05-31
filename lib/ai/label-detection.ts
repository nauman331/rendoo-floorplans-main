// Label detection using Claude Vision
// Only asks for text labels and positions, NOT polygon coordinates

export interface DetectedLabel {
  text: string;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
}

export interface LabelDetectionResult {
  labels: DetectedLabel[];
}

const LABEL_DETECTION_PROMPT = `Je bent een expert in het lezen van architecturale plattegronden.

## Opdracht

Zoek ALLE unit-labels (wooneenheid-aanduidingen) die je kunt lezen op dit plan.

Labels zijn typisch: A1, A2, B1, B2, B3, C1, C7, D1, etc. (een letter gevolgd door een cijfer).

## Wat je moet doen

1. Lees elk label dat je kunt vinden
2. Schat de POSITIE van elk label als percentage van de totale afbeelding
   - x=0 is helemaal links, x=100 is helemaal rechts
   - y=0 is helemaal boven, y=100 is helemaal onder

## Output

Geef ALLEEN geldig JSON terug:

{
  "labels": [
    { "text": "A1", "x": 10.5, "y": 50.2 },
    { "text": "B2", "x": 25.0, "y": 50.0 }
  ]
}

Geen uitleg, alleen JSON.`;

export async function detectLabels(imageBase64: string, apiKey: string): Promise<LabelDetectionResult> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: LABEL_DETECTION_PROMPT,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  const result = await response.json();
  const textBlock = result.content?.find((b: { type: string }) => b.type === 'text');

  if (!textBlock) {
    throw new Error('No text in Claude response');
  }

  let jsonStr = textBlock.text;
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1];
  const jsonObjMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (jsonObjMatch) jsonStr = jsonObjMatch[0];

  const parsed = JSON.parse(jsonStr.trim()) as LabelDetectionResult;

  // Clamp coordinates
  parsed.labels = parsed.labels.map(l => ({
    text: l.text.trim(),
    x: Math.max(0, Math.min(100, l.x)),
    y: Math.max(0, Math.min(100, l.y)),
  }));

  return parsed;
}

// Generate initial rectangular polygons from label positions and wall lines
export interface WallLine {
  x1: number; y1: number;
  x2: number; y2: number;
  width: number;
}

export function generatePolygonsFromLabelsAndWalls(
  labels: DetectedLabel[],
  wallLines: WallLine[],
  defaultSize = 8, // percentage units for half-width/half-height of default rect
): { label: string; polygon: { x: number; y: number }[] }[] {
  return labels.map(label => {
    // Find nearby walls to determine bounds
    const nearbyWalls = findNearbyWalls(label.x, label.y, wallLines, defaultSize * 2);

    let left = label.x - defaultSize;
    let right = label.x + defaultSize;
    let top = label.y - defaultSize;
    let bottom = label.y + defaultSize;

    if (nearbyWalls.length > 0) {
      // Use nearby vertical walls as left/right bounds
      const verticalWalls = nearbyWalls.filter(w => isVertical(w));
      const horizontalWalls = nearbyWalls.filter(w => isHorizontal(w));

      const leftWalls = verticalWalls.filter(w => avgX(w) < label.x).sort((a, b) => avgX(b) - avgX(a));
      const rightWalls = verticalWalls.filter(w => avgX(w) > label.x).sort((a, b) => avgX(a) - avgX(b));
      const topWalls = horizontalWalls.filter(w => avgY(w) < label.y).sort((a, b) => avgY(b) - avgY(a));
      const bottomWalls = horizontalWalls.filter(w => avgY(w) > label.y).sort((a, b) => avgY(a) - avgY(b));

      if (leftWalls.length > 0) left = avgX(leftWalls[0]);
      if (rightWalls.length > 0) right = avgX(rightWalls[0]);
      if (topWalls.length > 0) top = avgY(topWalls[0]);
      if (bottomWalls.length > 0) bottom = avgY(bottomWalls[0]);
    }

    // Clamp
    left = Math.max(0, left);
    right = Math.min(100, right);
    top = Math.max(0, top);
    bottom = Math.min(100, bottom);

    return {
      label: label.text,
      polygon: [
        { x: left, y: top },
        { x: right, y: top },
        { x: right, y: bottom },
        { x: left, y: bottom },
      ],
    };
  });
}

function findNearbyWalls(cx: number, cy: number, walls: WallLine[], radius: number): WallLine[] {
  return walls.filter(w => {
    const midX = (w.x1 + w.x2) / 2;
    const midY = (w.y1 + w.y2) / 2;
    return Math.abs(midX - cx) < radius && Math.abs(midY - cy) < radius;
  });
}

function isVertical(w: WallLine): boolean {
  return Math.abs(w.x1 - w.x2) < 0.5 && Math.abs(w.y1 - w.y2) > 1;
}

function isHorizontal(w: WallLine): boolean {
  return Math.abs(w.y1 - w.y2) < 0.5 && Math.abs(w.x1 - w.x2) > 1;
}

function avgX(w: WallLine): number { return (w.x1 + w.x2) / 2; }
function avgY(w: WallLine): number { return (w.y1 + w.y2) / 2; }
