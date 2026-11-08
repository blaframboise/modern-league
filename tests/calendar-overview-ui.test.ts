import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { proposedCalendar2027 } from '../src/calendar/proposed2027.ts';

test('four-column proposal renders each regular and prerelease tile once, with championships in their seasons',async()=>{
 const server=await createServer({configFile:false,server:{middlewareMode:true,ws:false},optimizeDeps:{noDiscovery:true},esbuild:{jsx:'automatic'}});
 try{
  const page=await server.ssrLoadModule('/src/pages/CalendarPreviewPage.tsx');
  const html=renderToStaticMarkup(createElement(MemoryRouter,null,createElement(page.CalendarPreviewPage)));
  assert.match(html,/season-overview-grid/);
  for(let season=1;season<=4;season++){
   assert.match(html,new RegExp('aria-label="2027 Season '+season+'"'));
  }
  const source=proposedCalendar2027();
  const renderedTiles=html.match(/class="season-date-tile /g)??[];
  assert.equal(renderedTiles.length,source.filter(s=>s.kind==='modern'||s.kind==='prerelease'||s.kind==='tbd').length);
  const dateLabel=(iso:string)=>new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(iso+'T12:00:00Z'));
  for(const slot of source.filter(s=>s.kind==='modern'||s.kind==='prerelease')){
    assert.ok(html.includes(dateLabel(slot.date)),slot.date);
  }
  assert.match(html,/SEASON CHAMPIONSHIP/);
  assert.match(html,/League Championship/);
  assert.match(html,/2028 Season 1 begins in December/);
  assert.match(html,/Dec 10, 2027/);
  assert.match(html,/Dec 17, 2027/);
  assert.match(html,/aria-label="2027 Season 1"/);
  assert.match(html,/season-month-name">Jan/);
  assert.match(html,/season-date-prerelease/);
  assert.match(html,/season-date-tbd/);
  assert.match(html,/TBD \/ Holiday/);
  assert.doesNotMatch(html,/season-date-slash/);
  assert.doesNotMatch(html,/Prerelease hold/);
  assert.doesNotMatch(html,/2027-12-31.*Annual Championship \(high-risk holiday proposal\)/);
 }finally{await server.close();}
});
