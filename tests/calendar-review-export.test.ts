import test from 'node:test';
import assert from 'node:assert/strict';
import { proposedCalendarReviewCsv, proposedSlotReviewRow } from '../src/calendar/reviewExport.ts';
import { proposedCalendar2027 } from '../src/calendar/proposed2027.ts';

test('organizer schedule CSV has 105 dates and only holiday slots marked TBD',()=>{
 const text=proposedCalendarReviewCsv();
 const lines=text.replace(/^\uFEFF/,'').trimEnd().split('\r\n');
 assert.equal(lines.length,106);
 assert.match(lines[0],/League status/);
 for(const line of lines.slice(1)){
   assert.match(line,/"(?:SCHEDULED|TBD)"/);
   assert.doesNotMatch(line,/"UNVERIFIED"/);
 }
 assert.match(lines.find(l=>l.includes('2027-12-24'))!,/"tbd".*"TBD"/);
 assert.match(lines.find(l=>l.includes('2027-12-31'))!,/"tbd".*"TBD"/);
 assert.match(lines.find(l=>l.includes('2027-12-13'))!,/"2028","1"/);
 assert.match(lines.find(l=>l.includes('2027-12-17'))!,/"annual"/);
});
test('review sheet retains classification and 2028 rollover',()=>{
 const slots=proposedCalendar2027();
 const pre=proposedSlotReviewRow(slots.find(s=>s.kind==='prerelease')!);
 assert.equal(pre[7],'SCHEDULED');
 assert.match(pre[9],/subject to change/);
 assert.equal(proposedSlotReviewRow(slots.find(s=>s.date==='2027-12-13')!)[3],'2028');
});
