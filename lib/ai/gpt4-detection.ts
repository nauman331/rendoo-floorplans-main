import type { TrainingExample } from './prompts';

// 1. Extend the imported type to include the missing properties
export interface ExtendedTrainingExample extends Partial<TrainingExample> {
    imageBase64?: string;
    description?: string;
    response?: string | Record<string, unknown>;
}

interface GPT4Unit {
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

interface GPT4AnalysisResult {
    totalUnits: number;
    uniqueTypes: number;
    mirroredTypes: number;
    floors: { index: number; label: string }[];
    units: GPT4Unit[];
    source?: 'gpt4_vision';
    aiModel?: string;
    pipelineStatus?: 'complete' | 'error';
    pipelineError?: string;
}

const GPT4_PROMPT = `Je bent een expert in het analyseren van architecturale plattegronden. Analyseer dit plan zeer nauwkeurig.

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
- Als er zichtbare woningen/units in de tekening staan, mag het veld units NOOIT leeg zijn.

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


export async function analyzeWithGPT4(
    imageBase64: string,
    apiKey: string,
    trainingExamples: ExtendedTrainingExample[] = [],
    textHint: string = ''
): Promise<GPT4AnalysisResult> {
    const { OpenAI } = await import('openai');
    const openaiVisionModel = process.env.OPENAI_VISION_MODEL || 'gpt-5';

    const client = new OpenAI({ apiKey });

    // Build few-shot examples from training data
    let fewShotContent = '';
    if (trainingExamples && trainingExamples.length > 0) {
        fewShotContent = '\n\n## TRAINING EXAMPLES\n';
        for (let i = 0; i < Math.min(trainingExamples.length, 2); i++) {
            const ex = trainingExamples[i];
            fewShotContent += `\nExample ${i + 1}:\n`;
            if (ex.imageBase64) {
                fewShotContent += `[Image provided: ${ex.description || 'Training example'}]\n`;
            }
            if (ex.response) {
                fewShotContent += `Result: ${typeof ex.response === 'string' ? ex.response : JSON.stringify(ex.response)}\n`;
            }
        }
    }

    const fullPrompt = GPT4_PROMPT + fewShotContent + (textHint ? textHint : '');

    // Force structured JSON output to reduce parsing failures.
    const response = await client.chat.completions.create({
        model: openaiVisionModel,
        response_format: { type: 'json_object' },
        messages: [
            {
                role: 'user',
                content: [
                    {
                        type: 'image_url',
                        image_url: {
                            url: `data:image/jpeg;base64,${imageBase64}`,
                            detail: 'high',
                        },
                    },
                    {
                        type: 'text',
                        text: fullPrompt,
                    },
                ],
            },
        ],
    });

    // Extract text from the OpenAI response.
    let analysisText = response.choices[0]?.message?.content;
    if (!analysisText) {
        throw new Error('Expected text response from gpt-5 Vision');
    }

    // Accept raw JSON, markdown-wrapped JSON, or a response that embeds JSON.
    const jsonMatch = analysisText.match(/```(?:json)?\s*([\s\S]*?)```/) ||
        analysisText.match(/(\{[\s\S]*\})/);
    if (jsonMatch) {
        analysisText = jsonMatch[1] ?? jsonMatch[0];
    }

    let analysis: GPT4AnalysisResult;
    try {
        analysis = JSON.parse(analysisText) as GPT4AnalysisResult;
    } catch (err) {
        const preview = analysisText.slice(0, 300).replace(/\s+/g, ' ');
        throw new Error(`gpt-5 returned non-JSON content: ${preview}. Parse error: ${err instanceof Error ? err.message : 'unknown error'}`);
    }

    if (!analysis || !Array.isArray(analysis.units)) {
        throw new Error('gpt-5 JSON did not contain a valid units array');
    }

    return {
        totalUnits: analysis.totalUnits || 0,
        uniqueTypes: analysis.uniqueTypes || 1,
        mirroredTypes: analysis.mirroredTypes || 0,
        floors: analysis.floors || [{ index: 0, label: 'Gelijkvloers' }],
        units: (analysis.units || []).map((u: GPT4Unit) => ({
            ...u,
            isMirrored: u.classification === 'gespiegeld',
            area: u.area || calculatePolygonArea(u.polygon),
        })),
    };
}

function calculatePolygonArea(polygon: { x: number; y: number }[]): number {
    if (!polygon || polygon.length < 3) return 0;

    // Shoelace formula (in percentage units)
    let sum = 0;
    for (let i = 0; i < polygon.length; i++) {
        const p1 = polygon[i];
        const p2 = polygon[(i + 1) % polygon.length];
        sum += (p2.x - p1.x) * (p2.y + p1.y);
    }

    const areaPercent = Math.abs(sum / 2);
    // Approximate: 1% of image ≈ 1 m² for typical apartment plans
    // This is rough; actual calculation would need scale/unit metadata
    return Math.round(areaPercent);
}