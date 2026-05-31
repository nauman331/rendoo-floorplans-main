// CSV parser for unit list (bouwnummers + types)

export type UnitClassificationType = 'hoofdtype' | 'gespiegeld' | 'variant';

export interface CsvUnit {
  bouwnummer: string;
  type: string;
  hoofdtype: string;        // Base type without modifiers (e.g. "Type B" from "Type B (gespiegeld)")
  classification: UnitClassificationType;
  verdieping: number;
  oppervlakte: number | null;
}

export interface CsvParseResult {
  units: CsvUnit[];
  typeGroups: Record<string, CsvUnit[]>; // grouped by hoofdtype
  errors: string[];
}

function parseClassification(typeStr: string): { hoofdtype: string; classification: UnitClassificationType } {
  const normalized = typeStr.trim();

  // Check for "(gespiegeld)" or "gespiegeld" or "mirror" indicators
  const gespiegeldPattern = /\(?\s*gespiegeld\s*\)?/i;
  if (gespiegeldPattern.test(normalized)) {
    const hoofdtype = normalized.replace(gespiegeldPattern, '').trim();
    return { hoofdtype, classification: 'gespiegeld' };
  }

  // Check for variant indicators like "(variant)" or "(v2)" etc.
  const variantPattern = /\(?\s*(?:variant|v\d+)\s*\)?/i;
  if (variantPattern.test(normalized)) {
    const hoofdtype = normalized.replace(variantPattern, '').trim();
    return { hoofdtype, classification: 'variant' };
  }

  return { hoofdtype: normalized, classification: 'hoofdtype' };
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((char === ',' || char === ';') && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

function findColumnIndex(headers: string[], ...candidates: string[]): number {
  const normalized = headers.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  for (const candidate of candidates) {
    const idx = normalized.indexOf(candidate.toLowerCase().replace(/[^a-z0-9]/g, ''));
    if (idx !== -1) return idx;
  }
  return -1;
}

export function parseCsv(content: string): CsvParseResult {
  const errors: string[] = [];
  const units: CsvUnit[] = [];

  // Split lines and remove empty
  const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) {
    return { units: [], typeGroups: {}, errors: ['CSV bestand heeft geen data (minimaal header + 1 rij)'] };
  }

  // Parse header
  const headers = parseCsvLine(lines[0]);

  // Find column indices - support Dutch and English column names
  const bouwnummerIdx = findColumnIndex(headers, 'Bouwnummer', 'bouwnr', 'unitnr', 'unit', 'nummer', 'number', 'nr');
  const typeIdx = findColumnIndex(headers, 'Type', 'woningtype', 'typering', 'model');
  const verdiepingIdx = findColumnIndex(headers, 'Verdieping', 'floor', 'etage', 'niveau', 'level');
  const oppervlakteIdx = findColumnIndex(headers, 'Oppervlakte', 'area', 'opp', 'm2', 'surface', 'gbo', 'bvo');

  if (bouwnummerIdx === -1) {
    errors.push('Kolom "Bouwnummer" niet gevonden. Verwacht: Bouwnummer, bouwnr, unit, of nummer');
    return { units: [], typeGroups: {}, errors };
  }
  if (typeIdx === -1) {
    errors.push('Kolom "Type" niet gevonden. Verwacht: Type, woningtype, of typering');
    return { units: [], typeGroups: {}, errors };
  }

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);

    const bouwnummer = fields[bouwnummerIdx]?.trim();
    const typeStr = fields[typeIdx]?.trim();

    if (!bouwnummer || !typeStr) {
      errors.push(`Rij ${i + 1}: ontbrekend bouwnummer of type`);
      continue;
    }

    const { hoofdtype, classification } = parseClassification(typeStr);

    let verdieping = 0;
    if (verdiepingIdx !== -1 && fields[verdiepingIdx]) {
      const parsed = parseInt(fields[verdiepingIdx], 10);
      if (!isNaN(parsed)) verdieping = parsed;
    }

    let oppervlakte: number | null = null;
    if (oppervlakteIdx !== -1 && fields[oppervlakteIdx]) {
      const parsed = parseFloat(fields[oppervlakteIdx].replace(',', '.'));
      if (!isNaN(parsed)) oppervlakte = parsed;
    }

    units.push({
      bouwnummer,
      type: typeStr,
      hoofdtype,
      classification,
      verdieping,
      oppervlakte,
    });
  }

  // Group by hoofdtype
  const typeGroups: Record<string, CsvUnit[]> = {};
  for (const unit of units) {
    if (!typeGroups[unit.hoofdtype]) {
      typeGroups[unit.hoofdtype] = [];
    }
    typeGroups[unit.hoofdtype].push(unit);
  }

  // Auto-classify: if a type group has only one unit, it's the hoofdtype
  // If multiple, the first non-gespiegeld is hoofdtype
  for (const group of Object.values(typeGroups)) {
    const hasExplicitHoofd = group.some(u => u.classification === 'hoofdtype');
    if (!hasExplicitHoofd && group.length > 0) {
      // Mark the first one as hoofdtype
      group[0].classification = 'hoofdtype';
    }
  }

  return { units, typeGroups, errors };
}
