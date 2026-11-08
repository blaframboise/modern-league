import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveScheduledEvent} from '../src/calendar/importMatch.ts';
import {updateCalendarChoice} from '../src/calendar/scheduler.ts';

test('classifies regular tournaments by organizer-saved calendar date',()=>{
  const match=resolveScheduledEvent('2027-02-01',{});
  assert.deepEqual(match,{status:'matched',date:'2027-02-01',code:'REG',kind:'regular',competitionYear:2027,seasonId:'s1',season:1,description:'2027 Season 1 regular Modern'});
});
test('classifies all four season championships and the league championship',()=>{
  for(const [date,n] of [['2027-03-26',1],['2027-06-25',2],['2027-09-17',3],['2027-12-10',4]] as const){
    const match=resolveScheduledEvent(date,{});
    assert.equal(match.status,'matched');
    if(match.status==='matched'){assert.equal(match.code,'SC');assert.equal(match.kind,'seasonal');assert.equal(match.seasonId,'s'+n);}
  }
  const annual=resolveScheduledEvent('2027-12-17',{});
  assert.equal(annual.status,'matched');
  if(annual.status==='matched'){assert.equal(annual.code,'LC');assert.equal(annual.kind,'annual');assert.equal(annual.seasonId,undefined);assert.equal(annual.competitionYear,2027);}
});
test('blocks prerelease, holiday TBD, unchecked date, weekday not in schedule and invalid date',()=>{
  const cases=[['2027-01-29','PR'],['2027-12-24','TBD'],['2027-02-02','UNSCHEDULED'],['2027-02-30','INVALID'],['2028-01-03','INVALID']] as const;
  for(const [date,code] of cases){const match=resolveScheduledEvent(date,{});assert.equal(match.status,'blocked');if(match.status==='blocked')assert.equal(match.code,code);}
  const historical=resolveScheduledEvent('2026-11-09',{});
  assert.equal(historical.status,'historical');
  if(historical.status==='historical'){
    assert.equal(historical.code,'TEST');
    assert.equal(historical.competitionYear,2026);
    assert.equal(historical.kind,'regular');
  }
  const removed=updateCalendarChoice({},'2027-02-01','none');
  assert.equal(resolveScheduledEvent('2027-02-01',removed).status,'blocked');
});
test('saved scheduler edits change classification and season mapping',()=>{
  let changes=updateCalendarChoice({},'2027-02-01','seasonal');
  changes=updateCalendarChoice(changes,'2027-03-26','modern');
  const moved=resolveScheduledEvent('2027-02-01',changes);
  assert.equal(moved.status,'matched');
  if(moved.status==='matched'){assert.equal(moved.code,'SC');assert.equal(moved.season,1);}
  const after=resolveScheduledEvent('2027-02-05',changes);
  assert.equal(after.status,'matched');
  if(after.status==='matched')assert.equal(after.season,2);
});
test('December rollover is 2028 Season 1 while League Championship remains 2027',()=>{
  const next=resolveScheduledEvent('2027-12-13',{});
  assert.equal(next.status,'matched');
  if(next.status==='matched'){assert.equal(next.kind,'regular');assert.equal(next.competitionYear,2028);assert.equal(next.season,1);assert.equal(next.seasonId,'s1');}
  const league=resolveScheduledEvent('2027-12-17',{});
  assert.equal(league.status,'matched');
  if(league.status==='matched')assert.equal(league.competitionYear,2027);
});
