/**
 * Heuristic Dutch-language parser for feedback comments on /resultaat.
 *
 * Takes a free-text comment plus the annotation the user drew, and
 * tries to produce a list of concrete PlanEdits the renderer can apply.
 *
 *   "ik wil hier een tweepersoonsbed, geen eenpersoonsbed"
 *     → [{action:'replace', targetItem:'single-bed', newItem:'double-bed'}]
 *
 *   "voeg een plant toe"
 *     → [{action:'add', newItem:'plant'}]
 *
 *   "weg met die loungestoel"
 *     → [{action:'remove', targetItem:'lounge-chair'}]
 *
 * Returns an empty array when nothing matches — the caller should then
 * fall back to the Claude API for more complex phrasings.
 */

import type { AnnotationShape, PlanEdit } from '@/types/project';
import type { FurnitureId } from './furniture';

/**
 * Mapping from Dutch keywords to FurnitureId. The first match wins,
 * so put longer / more specific phrases first ("hoekbank" before
 * "bank") — Map iteration preserves insertion order.
 */
const FURNITURE_KEYWORDS = new Map<RegExp, FurnitureId>([
  // Beds — explicit "tweepersoons"/"eenpersoons" before plain "bed"
  [/twee[\s-]?persoons[\s-]?bed|2[\s-]?persoons[\s-]?bed|double[\s-]?bed|tweepersoonsbed/i, 'double-bed'],
  [/een[\s-]?persoons[\s-]?bed|1[\s-]?persoons[\s-]?bed|single[\s-]?bed|eenpersoonsbed/i, 'single-bed'],
  [/\bbed\b/i, 'double-bed'],

  // Sofas — corner before plain
  [/hoek[\s-]?bank|corner[\s-]?sofa|loungebank/i, 'sofa-corner'],
  [/3[\s-]?(zit|persoons)[\s-]?bank|driezit|driepersoons[\s-]?bank|grote bank/i, 'sofa'],
  [/2[\s-]?(zit|persoons)[\s-]?bank|tweezit|kleinere? bank|kleine bank/i, 'sofa'],
  [/lounge[\s-]?stoel/i, 'lounge-chair'],
  [/\bbank\b|\bsofa\b/i, 'sofa'],

  // Dining
  [/grote eettafel|6[\s-]?(persoons|p)[\s-]?(eet)?tafel|eettafel.*6/i, 'dining-table-large'],
  [/eet[\s-]?tafel|dining[\s-]?table|eettafel/i, 'dining-table'],

  // Kitchen
  [/kook[\s-]?eiland|kitchen[\s-]?island|eiland/i, 'kitchen-island'],
  [/keuken[\s-]?blok|keuken[\s-]?counter|kitchen[\s-]?counter/i, 'kitchen-counter'],

  // Sanitair
  [/wastafel|wash[\s-]?basin|sink|lavabo/i, 'sink'],
  [/\bdouche\b|shower/i, 'shower'],
  [/ligbad|\bbad\b|bathtub/i, 'bath'],
  [/toilet|\bwc\b/i, 'toilet'],

  // Outdoor
  [/balkon[\s-]?(set|stoel|tafel|meubel)|terras[\s-]?(set|stoel|tafel|meubel)|outdoor[\s-]?(set|chair|table)/i, 'balcony-chairs'],

  // Office
  [/bureau[\s-]?stoel|office[\s-]?chair/i, 'office-chair'],
  [/\bbureau\b|\bdesk\b/i, 'desk'],

  // Storage
  [/kleding[\s-]?kast|wardrobe|kast/i, 'wardrobe'],

  // Decor
  [/vloer[\s-]?kleed[\s-]?(groot|large)|groot[\s-]?vloerkleed/i, 'rug-large'],
  [/vloer[\s-]?kleed|tapijt|rug/i, 'rug'],
  [/kleine plant|plant[\s-]?je|small[\s-]?plant/i, 'plant-small'],
  [/plant|plantje/i, 'plant'],
  [/tv[\s-]?(meubel|kast|bench)/i, 'tv-bench'],
]);

const REMOVE_KEYWORDS =
  /\b(verwijder|verwijderen|weg met|haal weg|weghalen|geen|zonder|niet meer|drop)\b/i;
const ADD_KEYWORDS =
  /\b(voeg toe|toevoegen|plaats|zet hier|ik wil hier|hier graag|extra|er moet|kan er.*?(?:bij|komen)|moet er.*?bij)\b/i;
const REPLACE_KEYWORDS =
  /\b(vervang|verander|wissel|inruilen|maak er.*?van|in plaats van|ipv|i\.p\.v\.)\b/i;

export interface ParseInput {
  text: string;
  annotation: AnnotationShape | null;
  feedbackId: string;
}

/**
 * Parse a feedback comment into a list of edits.
 *
 * - When no annotation is supplied we can't apply targeted edits, so
 *   we return [] and let the caller decide how to handle it (we still
 *   record the feedback round, just nothing renders differently).
 * - When the parser returns [] but the comment was non-trivial, the
 *   caller should fall back to the Claude API.
 */
export function parseFeedback(
  input: ParseInput
): Omit<PlanEdit, 'id' | 'createdAt'>[] {
  const { text, annotation, feedbackId } = input;
  if (!annotation) return [];
  const lower = text.toLowerCase();

  // Find all furniture keywords in the order they appear
  const matches: Array<{ id: FurnitureId; index: number; raw: string }> = [];
  for (const [pattern, id] of FURNITURE_KEYWORDS) {
    const m = lower.match(pattern);
    if (m && m.index != null) {
      // Avoid double-matching the same id
      if (matches.some((existing) => existing.id === id)) continue;
      matches.push({ id, index: m.index, raw: m[0] });
    }
  }
  matches.sort((a, b) => a.index - b.index);

  if (matches.length === 0) return [];

  const isReplace = REPLACE_KEYWORDS.test(lower);
  const isRemove = REMOVE_KEYWORDS.test(lower);
  const isAdd = ADD_KEYWORDS.test(lower);

  const base = {
    feedbackId,
    area: annotation,
    source: text.trim(),
  };

  // Two-item replacement: "vervang X door Y" or "Y in plaats van X"
  if (matches.length >= 2) {
    // Heuristic: if the words "in plaats van" / "ipv" / "geen" appear,
    // the *first* matched item is the new one and the second is the
    // target. Otherwise (vervang X door Y), it's the opposite.
    const newFirst = /(in plaats van|ipv|i\.p\.v\.|geen)/i.test(lower);
    const [a, b] = newFirst ? [matches[0], matches[1]] : [matches[0], matches[1]];
    const targetItem = newFirst ? b.id : a.id;
    const newItem = newFirst ? a.id : b.id;
    return [
      {
        ...base,
        action: 'replace',
        targetItem,
        newItem,
      },
    ];
  }

  // Single item — decide based on action keywords
  const item = matches[0];

  if (isRemove) {
    return [{ ...base, action: 'remove', targetItem: item.id }];
  }

  if (isReplace) {
    // "vervang de bank" without specifying what to vervang met → no-op
    return [];
  }

  // Default: ADD (covers "voeg een plant toe", "ik wil hier een bed",
  // and the bare "een plant").
  return [{ ...base, action: 'add', newItem: item.id }];
}
