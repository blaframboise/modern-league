import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { top16SampleRows } from '../src/pages/Top16LeaderboardPage.tsx';

test('Top 16 preview has fictional, numbered and independently paginatable rows',()=>{
  assert.equal(top16SampleRows.length,20);
  assert.deepEqual(top16SampleRows.slice(0,8).map(x=>x.rank),[1,2,3,4,5,6,7,8]);
  assert.deepEqual(top16SampleRows.slice(8,16).map(x=>x.rank),[9,10,11,12,13,14,15,16]);
  assert.equal(top16SampleRows[16].rank,17);
});
test('Top 16 page is explicitly bookmarkable and separated from approved publication',async()=>{
 const server=await createServer({configFile:false,server:{middlewareMode:true,ws:false},optimizeDeps:{noDiscovery:true},esbuild:{jsx:'automatic'}});
 try{
  const pages=await server.ssrLoadModule('/src/pages/Top16LeaderboardPage.tsx');
  const html=renderToStaticMarkup(createElement(MemoryRouter,{initialEntries:['/leaderboards/top-16?preview=1']},createElement(pages.Top16LeaderboardPage)));
  assert.match(html,/Annual Leaderboard/);
  assert.match(html,/Season pts/);
  assert.match(html,/Total pts/);
  assert.match(html,/LAYOUT PREVIEW/);
  assert.match(html,/Places 1–16 of 20/);
  assert.match(html,/Next 16/);
  assert.equal((html.match(/<table class="top16-table"/g)??[]).length,2);
  assert.equal((html.match(/class="top16-rank"/g)??[]).length,16);
  const live=renderToStaticMarkup(createElement(MemoryRouter,{initialEntries:['/leaderboards/top-16']},createElement(pages.Top16LeaderboardPage)));
  assert.match(live,/Loading official results/);
  assert.doesNotMatch(live,/Alex Morgan|Taylor Brooks/);
 }finally{await server.close();}
});
