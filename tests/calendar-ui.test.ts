import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

test('public Events displays organizer calendar while standings remain unpublished', async () => {
 const server=await createServer({configFile:false,server:{middlewareMode:true,ws:false},optimizeDeps:{noDiscovery:true},esbuild:{jsx:'automatic'}});
 try{
  const pages=await server.ssrLoadModule('/src/pages/CalendarPages.tsx');
  const events=renderToStaticMarkup(createElement(MemoryRouter,null,createElement(pages.EventsPage)));
  const seasons=renderToStaticMarkup(createElement(MemoryRouter,null,createElement(pages.SeasonsPage)));
  assert.match(events,/2027 \/ ETERNAL GAMES \/ LEAGUE SCHEDULE/);
  assert.match(events,/season-overview-grid/);
  assert.match(events,/Season 1/);
  assert.match(events,/TBD \/ Holiday/);
  assert.doesNotMatch(events,/No official events are currently listed|FICTIONAL SAMPLE/);
  assert.match(seasons,/Four seasons/);
  assert.match(seasons,/SEASON/);
  assert.equal((seasons.match(/class="season-story-winner"/g)??[]).length,4);
  assert.match(seasons,/Reigning league champion/);
  assert.match(seasons,/glowing crown/);
  assert.match(seasons,/Nobody has been awarded a crown yet/);
  assert.match(seasons,/2027 event calendar/);
  assert.doesNotMatch(seasons,/CHAMPIONSHIP DATES PENDING/);
  const leaderboard=await server.ssrLoadModule('/src/pages/LeaderboardPage.tsx');
  const html=renderToStaticMarkup(createElement(leaderboard.LeaderboardPage));
  assert.match(html,/Official standings are not yet published/);
 }finally{await server.close();}
});
