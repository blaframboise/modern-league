import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';
import {createServer} from 'vite';
import {ANNUAL_MINIMUM_EVENTS,SEASON_MINIMUM_EVENTS,SEASON_COUNTED_RESULTS,calculateRegularEventPoints} from '../src/scoring/regular.ts';
import {CHAMPIONSHIP_RULES} from '../src/scoring/championship.ts';

test('published Rules page includes verified 2027 calculations and identifies unresolved procedures',async()=>{
 const server=await createServer({configFile:false,server:{middlewareMode:true,ws:false},optimizeDeps:{noDiscovery:true},esbuild:{jsx:'automatic'}});
 try{
  const page=await server.ssrLoadModule('/src/pages/RulesPage.tsx');
  const html=renderToStaticMarkup(createElement(MemoryRouter,null,createElement(page.RulesPage)));
  assert.match(html,/LEAGUE RULES/);
  // Native buttons scroll to sections without changing the HashRouter route.
  const jump=html.match(/<nav class="rules-jump"[^>]*>([\s\S]*?)<\/nav>/)?.[1]??'';
  assert.equal((jump.match(/<button type="button"/g)??[]).length,5);
  assert.doesNotMatch(jump,/<a\s|href="#rules-/);
  for(const section of ['rules-regular','rules-season','rules-championship','rules-ties','rules-pending']){
    assert.match(html,new RegExp('id="'+section+'"'));
  }

  assert.match(html,/10 × \(3W \+ D\) ÷ \(3R\)/);
  assert.match(html,/3–1–0 record earns 7\.50/);
  assert.match(html,/3–0–1 record earns 8\.33/);
  assert.equal(calculateRegularEventPoints({wins:3,draws:1,scheduledRounds:4}).toFixed(2),'8.33');
  assert.match(html,new RegExp('best '+SEASON_COUNTED_RESULTS,'i'));
  assert.match(html,new RegExp(String(SEASON_MINIMUM_EVENTS)));
  assert.match(html,new RegExp(String(ANNUAL_MINIMUM_EVENTS)));
  assert.equal(CHAMPIONSHIP_RULES[2027].maximumPoints.seasonal,40);
  assert.equal(CHAMPIONSHIP_RULES[2027].maximumPoints.annual,120);
  assert.match(html,/December 10/);
  assert.match(html,/December 13/);
  assert.match(html,/December 17/);
  assert.match(html,/PROCEDURES UNDER REVIEW/);
  assert.match(html,/Championship registration/);
  assert.match(html,/Official event results and public player standings remain unavailable/);
  assert.doesNotMatch(html,/playbook is in progress|COMING SOON|DRAFT FOR LEAGUE OWNER APPROVAL/);
 }finally{await server.close();}
});
