export function buildAnalysisPrompt(trainingExamples: TrainingExample[] = []): string {
  let prompt = `Je bent een expert in het analyseren van architecturale plattegronden voor nieuwbouwprojecten in België en Nederland.

## Wat je moet doen

Identificeer ALLE individuele wooneenheden op dit plan. Elke unit is een apart appartement of woning.

## Hoe herken je een unit?

1. **Lees de labels** op het plan: A1, B2, B3, C7, etc. Elk label = een aparte wooneenheid.
2. **Volg de DIKKE buitenmuren** — de dikke zwarte lijnen op het plan zijn de buitenmuren en scheidingswanden. De polygon van een unit volgt deze muren precies.
3. **Elke unit bevat** typisch: leefruimte, keuken, badkamer, slaapkamer(s), hal/inkom, en soms een privé terras of tuin.
4. **Scheidingswanden tussen units** zijn dikke muren — dit is waar de ene unit eindigt en de volgende begint.
5. **Privé buitenruimtes** (terras, tuin, staanplaats) die direct aan een unit grenzen horen bij die unit.

## Hoe bepaal je de polygon?

- De polygon moet de BUITENKANT van de buitenmuren volgen
- Gebruik minimaal 4 punten, meer als de vorm niet rechthoekig is
- Bij rijwoningen zijn units smal en hoog — elke unit is een smalle verticale strook
- De punten gaan KLOKSGEWIJS rond de unit
- Coördinaten zijn percentages van de totale afbeelding: x=0 is links, x=100 is rechts, y=0 is boven, y=100 is onder
- ALLE waarden moeten tussen 0 en 100 liggen

## Classificatie

- **"hoofdtype"**: Een uniek grondplan (bv. A1 = Type A, B2 = Type B)
- **"gespiegeld"**: Links-rechts omgekeerde versie van een hoofdtype (bv. B3 is gespiegeld B2)
- **"variant"**: 90%+ identiek aan een ander type maar met kleine verschillen (bv. C7 lijkt op Type B maar is iets anders)

Bij gespiegelde: "mirrorOf" = het id van het origineel
Bij varianten: "variantOf" = de naam van het type (bv. "Type B")`;

  // Add training examples if available
  if (trainingExamples.length > 0) {
    prompt += `\n\n## Voorbeelden van CORRECTE unit detectie

Hieronder staan voorbeelden van hoe een gebruiker de polygonen heeft gecorrigeerd. Leer hiervan hoe je de muren correct moet volgen:\n`;

    for (const ex of trainingExamples) {
      prompt += `\n### Voorbeeld: ${ex.label} (${ex.typeGroup})
- Polygon punten: ${JSON.stringify(ex.polygon)}
- Opmerking: ${ex.notes || 'Polygon volgt de buitenmuren precies, inclusief terras/buitenruimte'}
`;
    }

    prompt += `\nGebruik deze voorbeelden om te begrijpen hoe precies de polygonen de muurlijnen moeten volgen. Pas dezelfde logica toe op alle units in dit plan.\n`;
  }

  prompt += `

## Output formaat

Geef ALLEEN geldig JSON terug:

{
  "totalUnits": 15,
  "uniqueTypes": 3,
  "mirroredTypes": 4,
  "floors": [{ "index": 0, "label": "Gelijkvloers" }],
  "units": [
    {
      "id": "unit-1",
      "label": "A1",
      "typeGroup": "Type A",
      "classification": "hoofdtype",
      "isMirrored": false,
      "mirrorOf": null,
      "variantOf": null,
      "floor": 0,
      "polygon": [
        { "x": 5.2, "y": 12.0 },
        { "x": 12.8, "y": 12.0 },
        { "x": 12.8, "y": 85.0 },
        { "x": 5.2, "y": 85.0 }
      ],
      "area": 95,
      "rooms": [],
      "confidence": 0.92
    }
  ]
}`;

  return prompt;
}

export interface TrainingExample {
  label: string;
  typeGroup: string;
  polygon: { x: number; y: number }[];
  notes?: string;
  sourceFile?: string;
}

// Legacy export for backwards compatibility
export const FLOORPLAN_ANALYSIS_PROMPT = buildAnalysisPrompt();

export const STYLE_GENERATION_PROMPT = '';
