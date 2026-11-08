import { calendarFromOverrides } from './scheduler.ts';
import type { CalendarOverrides } from './scheduler.ts';
import type { Tournament } from '../results/index.ts';

export type EventMatch =
  | { status:'matched'; date:string; code:'REG'|'SC'|'LC'; kind:Tournament['kind']; competitionYear:number; seasonId?:string; season:number; description:string }
  | { status:'historical'; date:string; code:'TEST'; kind:'regular'; competitionYear:number; description:string }
  | { status:'blocked'; date:string; code:'PR'|'TBD'|'OFF'|'UNSCHEDULED'|'INVALID'; message:string };

/** The saved administrator calendar determines classification; not the screenshot's guessed kind.
 * Date matching is exact for the single league event permitted per calendar date in 2027.
 */
export function resolveScheduledEvent(date:string, overrides:CalendarOverrides):EventMatch {
  if(!/^2027-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0,10)!==date){
    return {status:'blocked',date,code:'INVALID',message:'Enter a valid 2027 tournament date before matching.'};
  }
  const slot=calendarFromOverrides(overrides).find(event=>event.date===date);
  if(!slot)return {status:'blocked',date,code:'UNSCHEDULED',message:'No league event is scheduled on this date. Check the event scheduler before continuing.'};
  if(slot.kind==='prerelease')return {status:'blocked',date,code:'PR',message:'This date is reserved for a prerelease; it does not count toward Modern League standings.'};
  if(slot.kind==='tbd')return {status:'blocked',date,code:'TBD',message:'This date is marked TBD. Confirm and classify it in the event scheduler before continuing.'};
  const kind=slot.kind==='modern'?'regular':slot.kind;
  const code=kind==='regular'?'REG':kind==='seasonal'?'SC':'LC';
  const competitionYear=slot.season===5&&kind==='regular'?2028:2027;
  const season=slot.season===5?1:slot.season;
  const seasonId=kind==='annual'?undefined:`s${season}`;
  return {status:'matched',date,kind,code,competitionYear,seasonId,season,
    description:kind==='annual'?'2027 League Championship':kind==='seasonal'?`2027 Season ${season} Championship`:
      `${competitionYear} Season ${season} regular Modern`};
}
