import test from 'node:test';
import assert from 'node:assert/strict';
import {proposedCalendar2027,releaseDates2027,proposedChampionships2027} from '../src/calendar/proposed2027.ts';

test('2027 planning calendar covers all Monday and Friday nights from January 1',()=>{
 const entries=proposedCalendar2027();
 assert.equal(entries[0]?.date,'2027-01-01');
 assert.equal(entries.length,105);
 assert.equal(entries.filter(e=>e.kind==='modern').length,94);
 assert.equal(entries.filter(e=>e.kind==='prerelease').length,6);
 assert.equal(entries.filter(e=>e.kind==='seasonal').length,4);
 assert.equal(entries.filter(e=>e.kind==='annual').length,1);
 assert.ok(entries.every((e,i)=>i===0||entries[i-1].date<e.date));
 assert.ok(entries.every(e=>[1,5].includes(new Date(e.date+'T12:00:00Z').getUTCDay())));
});
test('each prerelease is Friday exactly one week ahead of a documented release',()=>{
 const entries=proposedCalendar2027();
 for(const release of releaseDates2027){
   const date=new Date(Date.parse(release.date+'T12:00:00Z')-7*86400000).toISOString().slice(0,10);
   const match=entries.find(e=>e.date===date);
   assert.equal(match?.kind,'prerelease');
   assert.equal(match.releaseDate,release.date);
 }
});
test('five provisional championship Fridays stay distinct from prerelease holds',()=>{
 const entries=proposedCalendar2027();
 for(const championship of proposedChampionships2027){
   const match=entries.find(e=>e.date===championship.date);
   assert.equal(match?.kind,championship.kind);
 }
 assert.equal(entries.find(e=>e.date==='2027-09-24')?.kind,'prerelease');
 assert.equal(entries.find(e=>e.date==='2027-09-17')?.kind,'seasonal');
 assert.equal(entries.find(e=>e.date==='2027-12-31')?.kind,'annual');
 assert.equal(entries.find(e=>e.date==='2027-12-20')?.season,5);
});
