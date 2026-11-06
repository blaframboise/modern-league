import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import type { ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { calculateStandings } from '../src/scoring/standings.ts';
import type { Snapshot } from '../src/scoring/standings.ts';

test('cumulative UI adds markers without changing player names and explains active/ended periods', async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false },
    optimizeDeps: { noDiscovery: true },
    esbuild: { jsx: 'automatic' } });
  try {
    const page = await server.ssrLoadModule('/src/pages/LeaderboardPage.tsx');
    const Table = page.CumulativeLeaderboard as ComponentType<{ title: string; snapshot: Snapshot; ended?: boolean }>;
    const snapshot = calculateStandings({ year: 2027, seasonIds: ['s1', 's2', 's3', 's4'],
      players: [{ playerId: 'a', name: 'Alex' }, { playerId: 'b', name: 'Jordan' }], championships: [],
      regularEvents: Array.from({ length: 6 }, (_, i) => ({ eventId: `${i}`, year: 2027, seasonId: 's1',
        results: [{ playerId: 'b', wins: 1, draws: 0, scheduledRounds: 4 },
          ...(i < 5 ? [{ playerId: 'a', wins: 4, draws: 0, scheduledRounds: 4 }] : [])] })) }).seasons[0].beforeChampionship;
    for (const ended of [false, true]) {
      const html = renderToStaticMarkup(createElement(Table, { title: 'Example', snapshot, ended }));
      assert.match(html, /Alex<span[^>]*>\*<\/span>/);
      assert.match(html, /<th scope="row">Jordan<\/th>/);
      assert.ok(html.indexOf('Alex') < html.indexOf('Jordan'));
      assert.ok(html.includes(ended ? '* Not eligible for the cumulative title.' : '* Has not yet met the participation requirement for the cumulative title.'));
      assert.match(html, /Sample data/);
      assert.match(html, /Jordan<\/p>/);
    }
    assert.equal(snapshot.standings[0].name, 'Alex');
  } finally { await server.close(); }
});
