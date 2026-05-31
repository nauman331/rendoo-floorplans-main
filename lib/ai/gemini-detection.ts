import { GoogleGenerativeAI } from '@google/generative-ai';
import type { TrainingExample } from './prompts';

interface GeminiUnit {
  label: string;
  typeGroup: string;
  classification: 'hoofdtype' | 'gespiegeld' | 'variant';
  isMirrored: boolean;
  mirrorOf: string | null;
  variantOf: string | null;
  polygon: { x: number; y: number }[];
  area: number;
  rooms: { type: string; label: string }[];
  confidence: number;
}

interface GeminiAnalysisResult {
  totalUnits: number;
  uniqueTypes: number;
  mirroredTypes: number;
  floors: { index: number; label: string }[];
  units: GeminiUnit[];
}

const GEMINI_PROMPT = `Je bent een expert in het analyseren van architecturale plattegronden. Analyseer dit plan zeer nauwkeurig.

## Taak
Identificeer ALLE individuele wooneenheden (appartementen/woningen) op dit plan.

## Hoe herken je units?
1. Lees de labels op het plan: A1, B2, B3, C7, etc. Elk label = een aparte unit.
2. De DIKKE zwarte lijnen zijn buitenmuren en scheidingswanden. De polygon van elke unit volgt deze muren.
3. Bij rijwoningen staan units NAAST elkaar als smalle stroken.
4. Privé buitenruimtes (terras, tuin, staanplaats) die direct aan een unit grenzen horen erbij.

## Polygon coördinaten
- Geef coördinaten als PERCENTAGES van de afbeelding (0-100)
- x=0 is links, x=100 is rechts
- y=0 is boven, y=100 is onder
- ALLE waarden MOETEN tussen 0 en 100 liggen
- Gebruik minimaal 4 punten per polygon
- Punten gaan KLOKSGEWIJS
- Volg de buitenmuren zo precies mogelijk

## Classificatie
- "hoofdtype": eerste keer dat dit grondplan voorkomt
- "gespiegeld": horizontaal gespiegelde versie van een ander type
- "variant": 90%+ identiek maar met kleine verschillen

## BELANGRIJK — LEES DIT GOED
- Tel EERST alle zichtbare unit labels op het plan
- Meet dan PRECIES waar het tekengebied begint en eindigt (exclusief titelblok, legenda, witruimte)
- Als er bv. 15 units in een rij staan en het tekengebied loopt van x=5% tot x=88%, dan is elke unit (88-5)/15 = 5.5% breed
- De bovenkant van elke unit begint bij de tuin/terras/staanplaats (inclusief de buitenruimte die bij die unit hoort)
- De onderkant eindigt bij de onderkant van de woning (voorgevel)
- Polygonen mogen NIET overlappen
- ALLE coördinaten MOETEN tussen 0 en 98 liggen — NOOIT 99 of hoger
- Het titelblok (rechts of onder), de legenda, en witruimte zijn GEEN units — negeer die gebieden
- Type C is een VARIANT van Type B als ze bijna identiek zijn (90%+ gelijk) — geef dan classification "variant" en variantOf "Type B"
- GESPIEGELD herkennen: vergelijk elke unit met de voorgaande/volgende unit. Als de indeling IDENTIEK is maar LINKS-RECHTS omgekeerd (trap links i.p.v. rechts, keuken rechts i.p.v. links), dan is het "gespiegeld". Bij rijwoningen zijn vaak B2/B3 een paar (origineel + gespiegeld), dan B4/B5 weer een paar, etc. Geef classification "gespiegeld" en mirrorOf het id van het origineel
- Als de laatste units niet meer op het plan passen, heb je waarschijnlijk het tekengebied verkeerd gemeten. Check het opnieuw.
- Het tekengebied is KLEINER dan de volledige afbeelding — er is altijd een rand/titelblok

## Output
Geef ALLEEN geldig JSON terug:
{
  "totalUnits": 15,
  "uniqueTypes": 3,
  "mirroredTypes": 4,
  "floors": [{ "index": 0, "label": "Gelijkvloers" }],
  "units": [
    {
      "label": "A1",
      "typeGroup": "Type A",
      "classification": "hoofdtype",
      "isMirrored": false,
      "mirrorOf": null,
      "variantOf": null,
      "polygon": [
        { "x": 5.0, "y": 15.0 },
        { "x": 12.0, "y": 15.0 },
        { "x": 12.0, "y": 85.0 },
        { "x": 5.0, "y": 85.0 }
      ],
      "area": 95,
      "rooms": [
        { "type": "leefruimte", "label": "Leefruimte" },
        { "type": "keuken", "label": "Keuken" }
      ],
      "confidence": 0.92
    }
  ]
}`;

export async function analyzeWithGemini(imageBase64: string, apiKey: string, trainingExamples: TrainingExample[] = [], textHint: string = ''): Promise<GeminiAnalysisResult> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-pro-preview-05-06',
    generationConfig: {
      temperature: 0.1,  // Low temperature for precise coordinate detection
    },
  });

  // Build prompt with training examples + text hints if available
  let fullPrompt = GEMINI_PROMPT;
  if (textHint) {
    fullPrompt += textHint;
  }
  if (trainingExamples.length > 0) {
    fullPrompt += `\n\n## VOORBEELDEN VAN CORRECTE DETECTIE (leer hiervan!)

Een gebruiker heeft de volgende polygonen handmatig gecorrigeerd. Dit zijn CORRECTE voorbeelden van hoe de polygonen de muurlijnen moeten volgen:\n`;
    for (const ex of trainingExamples) {
      fullPrompt += `\n### ${ex.label} (${ex.typeGroup})
Polygon: ${JSON.stringify(ex.polygon)}
${ex.notes || ''}\n`;
    }
    fullPrompt += `\nGebruik deze voorbeelden als referentie voor de precisie en stijl van polygonen.\n`;
  }

  const result = await model.generateContent([
    {
      inlineData: {
        mimeType: 'image/png',
        data: imageBase64,
      },
    },
    { text: fullPrompt },
  ]);

  const responseText = result.response.text();

  // Extract JSON from response
  let jsonStr = responseText;
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1];
  const jsonObjMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (jsonObjMatch) jsonStr = jsonObjMatch[0];

  const analysis = JSON.parse(jsonStr.trim()) as GeminiAnalysisResult;

  // Post-process: add IDs, clamp coordinates
  analysis.units = analysis.units.map((unit, i) => ({
    ...unit,
    id: `unit-${i + 1}`,
    polygon: unit.polygon.map(p => ({
      x: Math.max(0, Math.min(100, p.x)),
      y: Math.max(0, Math.min(100, p.y)),
    })),
    rooms: unit.rooms?.map(r => ({ ...r, polygon: [], area: 0, dimensions: { width: 0, height: 0 } })) || [],
  }));

  return analysis;
}
