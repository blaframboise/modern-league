import { proposedCalendar2027 } from './proposed2027.ts';
import type { ProposedSlot } from './proposed2027.ts';

export const CALENDAR_REVIEW_COLUMNS = [
  'Date', 'Day', 'Time (America/Detroit)', 'Competition year', 'Season',
  'Proposed type', 'Proposed event', 'Review status', 'Confirmed store listing', 'Review notes',
] as const;

/** This is a verification worksheet, NOT an official calendar import or an approval record.
 * Do not provide a prefilled 'confirmed' state for inferred recurring slots.
 */
export function proposedSlotReviewRow(slot: ProposedSlot): string[] {
  const day = new Date(slot.date + 'T12:00:00Z').toLocaleDateString('en-US', {
    timeZone:'UTC', weekday:'long',
  });
  const nextYear = slot.season === 5 && (slot.kind === 'modern' || slot.kind === 'tbd');
  return [
    slot.date,
    day,
    '18:00 (proposed)',
    nextYear ? '2028' : '2027',
    nextYear ? '1' : String(slot.season),
    slot.kind,
    slot.title,
    'UNVERIFIED',
    '',
    slot.kind === 'tbd' ? 'Holiday hours unknown; do not assume Modern runs' :
      slot.kind === 'prerelease' ? 'Release-based estimate; confirm this store replaces Modern' :
      slot.kind === 'annual' || slot.kind === 'seasonal' ? 'Organizer and store must approve championship date' :
      'Recurring Monday/Friday expectation only; verify store event',
  ];
}
function escapeCell(raw:string):string {
  // Guard spreadsheet formulas if future input ever includes editable event names.
  const safe = /^[=+\-@\t\r]/.test(raw) ? "'" + raw : raw;
  return '"' + safe.replaceAll('"','""') + '"';
}
export function proposedCalendarReviewCsv():string {
  const rows = [
    [...CALENDAR_REVIEW_COLUMNS],
    ...proposedCalendar2027().map(proposedSlotReviewRow),
  ];
  return '\uFEFF' + rows.map(row => row.map(escapeCell).join(',')).join('\r\n') + '\r\n';
}
