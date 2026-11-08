import test from 'node:test';
import assert from 'node:assert/strict';
import { proposedCalendarReviewCsv, proposedSlotReviewRow } from '../src/calendar/reviewExport.ts';
import { proposedCalendar2027 } from '../src/calendar/proposed2027.ts';

test('verification CSV enumerates 105 slots and never treats proposed dates as confirmed',()=>{
 const text=proposedCalendarReviewCsv();
 const lines=text.replace(/^\uFEFF/,'').trimEnd().split('\r\n');
 assert.equal(lines.length,106);
 assert.match(lines[0],/Review status/);
 for(const line of lines.slice(1)){
   assert.match(line,/"UNVERIFIED"/);
   assert.doesNotMatch(line,/"CONFIRMED"/);
 }
 assert.match(lines.find(l=>l.includes('2027-12-24'))!,/"tbd"/);
 assert.match(lines.find(l=>l.includes('2027-12-31'))!,/"tbd"/);
 assert.match(lines.find(l=>l.includes('2027-12-13'))!,/"2028","1"/);
 assert.match(lines.find(l=>l.includes('2027-12-17'))!,/"annual"/);
});
test('review row preserves tentative release distinctions and only marks upcoming year after season 4',()=>{
 const slots=proposedCalendar2027();
 const pre=proposedSlotReviewRow(slots.find(s=>s.kind==='prerelease')!);
 assert.equal(pre[7],'UNVERIFIED');
 assert.match(pre[9],/Release-based estimate/);
 assert.equal(proposedSlotReviewRow(slots.find(s=>s.date==='2027-12-13')!)[3],'2028');
});
