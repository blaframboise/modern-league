import { proposedCalendar2027 } from './proposed2027.ts';
import type { ProposedSlot } from './proposed2027.ts';

export const CALENDAR_REVIEW_COLUMNS = [
  'Date', 'Day', 'Time (America/Detroit)', 'Competition year', 'Season',
  'Event type', 'League event', 'League status', 'Store listing (optional)', 'Notes',
] as const;

/** Public-facing organizer schedule export, NOT a tournament-results publication or a claim of independent venue verification. */
export function proposedSlotReviewRow(slot: ProposedSlot): string[] {
  const day = new Date(slot.date + 'T12:00:00Z').toLocaleDateString('en-US', {
    timeZone:'UTC', weekday:'long',
  });
  const nextYear = slot.season === 5 && (slot.kind === 'modern' || slot.kind === 'tbd');
  return [
    slot.date,
    day,
    '18:00 (league schedule)',
    nextYear ? '2028' : '2027',
    nextYear ? '1' : String(slot.season),
    slot.kind,
    slot.title,
    slot.kind === 'tbd' ? 'TBD' : 'SCHEDULED',
    '',
    slot.kind === 'tbd' ? 'Holiday hours unknown; do not assume Modern runs' :
      slot.kind === 'prerelease' ? 'League schedules prerelease instead of regular Modern; subject to change' :
      slot.kind === 'annual' || slot.kind === 'seasonal' ? 'League championship date; subject to change' :
      'League regular Modern date; subject to change',
  ];
}
function escapeCell(raw:string):string {
  // Guard spreadsheet formulas if future input ever includes editable event names.
  const safe = /^[=+\-@\t\r]/.test(raw) ? "'" + raw : raw;
  return '"' + safe.replaceAll('"','""') + '"';
}
export function proposedCalendarReviewCsv(slots: readonly ProposedSlot[] = proposedCalendar2027()):string {
  const rows = [
    [...CALENDAR_REVIEW_COLUMNS],
    ...slots.map(proposedSlotReviewRow),
  ];
  return '\uFEFF' + rows.map(row => row.map(escapeCell).join(',')).join('\r\n') + '\r\n';
}
