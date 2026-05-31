import type { ProjectLevel, StyleExample } from '@/types/project';

/**
 * Gallery examples shown on the Step 2 stijlkeuze page.
 *
 * Images are pre-processed by the scripts in briefing-assets/scripts/ to
 * land on a consistent 1600x1066 white canvas with template chrome stripped.
 *
 * Each example is tagged with the niveau(s) it's applicable to so the
 * gallery can filter — e.g. a "situatietekening" only makes sense at
 * project niveau, not at woningtype.
 *
 * Keep this in sync with the two manifest.json files under
 * public/references/2d-*-examples/.
 */

interface InternalExample extends StyleExample {
  niveaus: ProjectLevel[];
}

export const basicExamples: InternalExample[] = [
  {
    id: '01-situatie',
    image: '/references/2d-basic-examples/01-situatie.jpg',
    label: 'Situatietekening — groen & rustig',
    niveaus: ['project'],
  },
  {
    id: '02-type-s-flow',
    image: '/references/2d-basic-examples/02-type-s-flow.jpg',
    label: 'Type S — warm & compact',
    niveaus: ['woningtype'],
  },
  {
    id: '03-a',
    image: '/references/2d-basic-examples/03-a.jpg',
    label: 'Type A — neutraal & licht',
    niveaus: ['woningtype'],
  },
  {
    id: '04-c30301',
    image: '/references/2d-basic-examples/04-c30301.jpg',
    label: 'Aardetinten — zand & olijf',
    niveaus: ['woningtype'],
  },
  {
    id: '05-fd',
    image: '/references/2d-basic-examples/05-fd.jpg',
    label: 'Strak & modern — grijs/bruin',
    niveaus: ['woningtype'],
  },
  {
    id: '06-c2',
    image: '/references/2d-basic-examples/06-c2.jpg',
    label: 'Minimalistisch — zandtint',
    niveaus: ['woningtype'],
  },
  {
    id: '07-h4',
    image: '/references/2d-basic-examples/07-h4.jpg',
    label: 'Kleurvol — blauwe accenten',
    niveaus: ['woningtype'],
  },
];

/**
 * 10 sfeer-stijlen — the labels were originally baked into the bottom of
 * each plan ("Warm", "Brown", …). The processing script wipes them so
 * we re-attach them here as the gallery title.
 */
export const luxeExamples: InternalExample[] = [
  { id: 'warm', image: '/references/2d-luxe-examples/warm.jpg', label: 'Warm', niveaus: ['woningtype'] },
  { id: 'brown', image: '/references/2d-luxe-examples/brown.jpg', label: 'Brown', niveaus: ['woningtype'] },
  { id: 'moody', image: '/references/2d-luxe-examples/moody.jpg', label: 'Moody', niveaus: ['woningtype'] },
  { id: 'scandi', image: '/references/2d-luxe-examples/scandi.jpg', label: 'Scandi', niveaus: ['woningtype'] },
  { id: 'neutral', image: '/references/2d-luxe-examples/neutral.jpg', label: 'Neutral', niveaus: ['woningtype'] },
  { id: 'classic', image: '/references/2d-luxe-examples/classic.jpg', label: 'Classic', niveaus: ['woningtype'] },
  { id: 'luxe', image: '/references/2d-luxe-examples/luxe.jpg', label: 'Luxe', niveaus: ['woningtype'] },
  { id: 'rustic', image: '/references/2d-luxe-examples/rustic.jpg', label: 'Rustic', niveaus: ['woningtype'] },
  { id: 'cosy', image: '/references/2d-luxe-examples/cosy.jpg', label: 'Cosy', niveaus: ['woningtype'] },
  { id: 'warm-luxe', image: '/references/2d-luxe-examples/warm-luxe.jpg', label: 'Warm Luxe', niveaus: ['woningtype'] },
];

export function getExamplesFor(
  outputType: string | null | undefined,
  niveau: ProjectLevel | null | undefined = 'woningtype'
): StyleExample[] {
  const all = outputType === '2d-luxe' ? luxeExamples : basicExamples;
  if (!niveau) return all;
  return all.filter((e) => e.niveaus.includes(niveau));
}

export function findExample(
  outputType: string | null | undefined,
  exampleId: string | null | undefined
): StyleExample | undefined {
  if (!exampleId) return undefined;
  const pool = outputType === '2d-luxe' ? luxeExamples : basicExamples;
  return pool.find((e) => e.id === exampleId);
}
