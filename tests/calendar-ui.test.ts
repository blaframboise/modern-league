import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
test('public calendar pages show only official pending states, never fictional sample schedules', async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false }, optimizeDeps: { noDiscovery: true }, esbuild: { jsx: 'automatic' } });
  try {
    const pages = await server.ssrLoadModule('/src/pages/CalendarPages.tsx');
    const events = renderToStaticMarkup(createElement(pages.EventsPage));
    const seasons = renderToStaticMarkup(createElement(pages.SeasonsPage));
    for (const html of [events, seasons]) {
      assert.doesNotMatch(html, /FICTIONAL SAMPLE|Demonstration schedule|2027-03-27|2027-12-18/);
      assert.match(html, /PENDING/);
    }
    assert.match(events, /No official events are currently listed/);
    assert.match(seasons, /Season and championship dates are not yet confirmed/);
  } finally { await server.close(); }
});
