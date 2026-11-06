import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
test('calendar pages label samples, show competitive rollover and unconfirmed dates', async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false }, optimizeDeps: { noDiscovery: true }, esbuild: { jsx: 'automatic' } });
  try {
    const pages = await server.ssrLoadModule('/src/pages/CalendarPages.tsx');
    const events = renderToStaticMarkup(createElement(pages.EventsPage));
    const seasons = renderToStaticMarkup(createElement(pages.SeasonsPage));
    for (const html of [events, seasons]) {
      assert.match(html, /Demonstration schedule/);
      assert.match(html, /FICTIONAL SAMPLE/);
      assert.match(html, /Date unconfirmed/);
      assert.match(html, /America\/Detroit/);
    }
    assert.match(events, /Competitive season/);
    assert.match(events, /Event type/);
    assert.match(events, /2028 Season 1/);
    assert.match(seasons, /Regular scoring cutoff/);
    assert.match(seasons, /SEPARATE EVENT/);
  } finally { await server.close(); }
});
