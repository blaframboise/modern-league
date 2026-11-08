import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarFromOverrides, fullSchedulerRows, updateCalendarChoice, validateCalendarConfiguration, parseCalendarOverrides} from '../src/calendar/scheduler.ts';

test('default event scheduler keeps four SC, one LC, and all 105 date rows',()=>{
 const rows=fullSchedulerRows({});
 assert.equal(rows.length,105);
 assert.equal(rows.filter(s=>s.kind==='seasonal').length,4);
 assert.equal(rows.filter(s=>s.kind==='annual').length,1);
 assert.equal(calendarFromOverrides({}).length,105);
});
test('exclusive checkbox toggle changes type, then clears date from preview',()=>{
 let o=updateCalendarChoice({},'2027-02-01','prerelease');
 assert.equal(fullSchedulerRows(o).find(s=>s.date==='2027-02-01')?.kind,'prerelease');
 assert.equal(calendarFromOverrides(o).find(s=>s.date==='2027-02-01')?.kind,'prerelease');
 o=updateCalendarChoice(o,'2027-02-01','none');
 assert.equal(fullSchedulerRows(o).find(s=>s.date==='2027-02-01')?.kind,'none');
 assert.equal(calendarFromOverrides(o).some(s=>s.date==='2027-02-01'),false);
 o=updateCalendarChoice(o,'2027-02-01','modern');
 assert.equal(Object.keys(o).length,0);
});
test('moving a championship reassigns later regular dates into the next competitive season',()=>{
 let o=updateCalendarChoice({},'2027-12-10','modern');
 o=updateCalendarChoice(o,'2027-12-03','seasonal');
 const cal=calendarFromOverrides(o);
 assert.equal(cal.find(s=>s.date==='2027-12-03')?.kind,'seasonal');
 assert.equal(cal.find(s=>s.date==='2027-12-06')?.season,5);
 assert.equal(cal.find(s=>s.date==='2027-12-10')?.season,5);
 assert.equal(cal.find(s=>s.date==='2027-12-17')?.kind,'annual');
});
test('cannot persist an incomplete or out-of-order championship schedule',()=>{
 assert.throws(()=>validateCalendarConfiguration({'2027-03-26':'none'}),/exactly four/);
 assert.throws(()=>validateCalendarConfiguration({'2027-12-17':'none'}),/one league/);
 assert.throws(()=>validateCalendarConfiguration({'2027-12-17':'modern','2027-12-03':'annual'}),/follow/);
});
test('reject invalid override dates, types, and object values',()=>{
 assert.throws(()=>parseCalendarOverrides({'2027-02-02':'modern'}),/invalid/);
 assert.throws(()=>parseCalendarOverrides({'2027-02-01':'admin'}),/invalid/);
 assert.throws(()=>parseCalendarOverrides([]),/Invalid/);
 assert.throws(()=>updateCalendarChoice({},'2027-02-02','modern'),/Invalid/);
});
