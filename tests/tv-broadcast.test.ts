import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {MemoryRouter} from 'react-router-dom';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';

test('broadcast prototype A is 16 players per slide and 48 sample entries are strictly previews',async()=>{
 const server=await createServer({configFile:false,server:{middlewareMode:true,ws:false},optimizeDeps:{noDiscovery:true},esbuild:{jsx:'automatic'}});
 try{
  const mod=await server.ssrLoadModule('/src/pages/TvLeaderboardPage.tsx');
  const sample=mod.tvSampleRows as {rank:number}[];
  assert.equal(sample.length,48);
  const first=mod.tvSlice(sample,0);
  assert.deepEqual(first.left.map((p:{rank:number})=>p.rank),[1,2,3,4,5,6,7,8]);
  assert.deepEqual(first.right.map((p:{rank:number})=>p.rank),[9,10,11,12,13,14,15,16]);
  assert.equal(first.count,3);
  assert.equal(mod.tvSlice(sample,2).left[0].rank,33);
  const preview=renderToStaticMarkup(createElement(MemoryRouter,{initialEntries:['/leaderboards/tv?preview=1']},createElement(mod.TvLeaderboardPage)));
  assert.match(preview,/DEMONSTRATION DATA/);
  assert.match(preview,/Alex Morgan/);
  assert.match(preview,/As of 03\/26\/2027/);
  assert.equal((preview.match(/class="tv-broadcast-row"/g)??[]).length,16);
  assert.match(preview,/Play slideshow/);
  assert.match(preview,/Fullscreen/);
  const official=renderToStaticMarkup(createElement(MemoryRouter,{initialEntries:['/leaderboards/tv']},createElement(mod.TvLeaderboardPage)));
  assert.match(official,/Loading official standings/);
  assert.doesNotMatch(official,/Alex Morgan|DEMONSTRATION DATA/);
 } finally{await server.close();}
});
