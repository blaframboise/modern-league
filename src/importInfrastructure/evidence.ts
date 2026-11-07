import type { ImportValues } from '../results/index.ts';
export interface HumanFieldEvidence { path: string; sources: string[]; note: string }
/** Every populated tournament/result field needs explicit source evidence. Registry IDs are separate. */
export function fieldPaths(values: ImportValues): string[] {
  const paths: string[] = [];
  function visit(value: unknown, path: string) {
    if ((path === 'tournament.year' && value === 0) || value === null || value === '' || value === undefined || path.endsWith('.playerId') || path.endsWith('.rowId')) return;
    if (typeof value === 'object') for (const [key, child] of Object.entries(value)) visit(child, path ? `${path}.${key}` : key);
    else paths.push(path);
  }
  visit(values.tournament, 'tournament');
  values.results.forEach((row, i) => visit(row, `results.${i}`));
  return paths;
}
export function validateHumanEvidence(input: unknown, values: ImportValues, sources: readonly string[]): HumanFieldEvidence[] {
  if (!Array.isArray(input) || input.length > 20000) throw new Error('Field evidence must be an array.');
  const required = new Set(fieldPaths(values)); const seen = new Set<string>();
  const evidence = input.map(item => {
    if (!item || typeof item !== 'object' || typeof item.path !== 'string' || !required.has(item.path) || seen.has(item.path)
      || typeof item.note !== 'string' || !item.note.trim() || item.note.length > 2000 || !Array.isArray(item.sources) || !item.sources.length
      || item.sources.some((s: unknown) => typeof s !== 'string' || !sources.includes(s)) || new Set(item.sources).size !== item.sources.length) throw new Error('Invalid field evidence or source reference.');
    seen.add(item.path);
    return { path: item.path as string, sources: [...item.sources].sort() as string[], note: item.note as string };
  });
  if (seen.size !== required.size) throw new Error('Every populated field requires source evidence; leave missing values unresolved.');
  return evidence.sort((a, b) => a.path.localeCompare(b.path));
}
