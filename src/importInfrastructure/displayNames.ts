/** Suggest presentation casing only. Never use casing to identify or merge players. */
export function suggestDisplayName(raw: string): string {
  const normalized = raw.normalize('NFC').trim().replace(/\s+/gu, ' ');
  if (!normalized) return '';
  // Preserve deliberate mixed-case spelling: McDonald, DeVito, iPhone-like handles.
  // Also preserve single-word nicknames and initials; these need a human decision.
  const parts = normalized.split(' ');
  if (parts.length < 2 || parts.some(part => part.length === 1 || /\d|@|_|\./u.test(part))) return normalized;
  return parts.map(part => {
    if (/[\p{Ll}]/u.test(part) && /[\p{Lu}]/u.test(part)) return part;
    return part.toLocaleLowerCase('en-US').replace(/(^|[-'’])([\p{L}])/gu,
      (_match, prefix: string, letter: string) => prefix + letter.toLocaleUpperCase('en-US'));
  }).join(' ');
}
