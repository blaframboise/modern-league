import { proposedCalendar2027 } from './proposed2027.ts';
import type { ProposedSlot } from './proposed2027.ts';

export type SchedulerType = ProposedSlot['kind'] | 'none';
export type CalendarOverrides = Record<string,SchedulerType>;
export const SCHEDULER_TYPES = ['modern','seasonal','annual','prerelease','tbd'] as const;
export const SCHEDULER_LABELS = ['REG','SC','LC','PR','TBD'] as const;
const base=proposedCalendar2027();
const baseDates=new Set(base.map(s=>s.date));
const kinds=new Set<SchedulerType>([...SCHEDULER_TYPES,'none']);

export function parseCalendarOverrides(input:unknown):CalendarOverrides{
  if(!input || typeof input!=='object' || Array.isArray(input))throw new Error('Invalid calendar settings.');
  const result:CalendarOverrides={};
  for(const [date,kind] of Object.entries(input)){
    if(!baseDates.has(date)||!kinds.has(kind as SchedulerType))throw new Error('Calendar contains an invalid date or event type.');
    result[date]=kind as SchedulerType;
  }
  return result;
}
export function configuredKind(date:string, overrides:CalendarOverrides):SchedulerType{
  const original=base.find(s=>s.date===date);
  if(!original)throw new Error('Invalid proposed calendar date.');
  return overrides[date]??original.kind;
}
export function updateCalendarChoice(overrides:CalendarOverrides,date:string,choice:SchedulerType):CalendarOverrides{
  if(!baseDates.has(date)||!kinds.has(choice))throw new Error('Invalid date or category.');
  const original=base.find(s=>s.date===date)!;
  const result={...overrides};
  if(choice===original.kind)delete result[date];else result[date]=choice;
  return result;
}
export function validateCalendarConfiguration(overrides:CalendarOverrides):void{
  const rows=base.map(slot=>({...slot,kind:configuredKind(slot.date,overrides)})).filter(s=>s.kind!=='none');
  const seasonal=rows.filter(s=>s.kind==='seasonal');
  const annual=rows.filter(s=>s.kind==='annual');
  // Incomplete plans are allowed: clearing ANY date (including a championship)
  // must remove it from the preview. Only over-allocation is invalid.
  if(seasonal.length>4||annual.length>1){
    throw new Error('No more than four seasonal championships (SC) and one league championship (LC).');
  }
  if(annual.length && seasonal.length && annual[0].date<=seasonal[seasonal.length-1].date){
    throw new Error('The league championship must follow all selected seasonal championships.');
  }
  // Classification is chronological: the nth SC closes the nth season.
}
export function calendarFromOverrides(overrides:CalendarOverrides):ProposedSlot[]{
  validateCalendarConfiguration(overrides);
  const changed=base.map(slot=>({...slot,kind:configuredKind(slot.date,overrides)}));
  const championshipDates=changed.filter(s=>s.kind==='seasonal').map(s=>s.date);
  return changed.flatMap((slot):ProposedSlot[]=>{
    if(slot.kind==='none')return [];
    // SC is owned by the season it concludes, LC is always 2027's annual finale.
    const n=championshipDates.filter(d=>d<=slot.date).length;
    const season=slot.kind==='seasonal'?championshipDates.indexOf(slot.date)+1:
      slot.kind==='annual'?4:n+1;
    return [{...slot,kind:slot.kind as ProposedSlot['kind'],season, title:
      slot.kind==='seasonal'?`Season ${season} Championship (proposed)`:
      slot.kind==='annual'?'League Championship (proposed)':
      slot.kind==='prerelease'?'Prerelease (proposed)':
      slot.kind==='tbd'?'Event TBD — unconfirmed':
      'Modern — proposed 6:00 p.m.'}];
  });
}
export function fullSchedulerRows(overrides:CalendarOverrides){
  return base.map(slot=>({...slot,kind:configuredKind(slot.date,overrides)}));
}
