import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
test('review UI labels fictional records, exposes source history, blocks approval, and starts with zero standings', async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false }, optimizeDeps: { noDiscovery: true }, esbuild: { jsx: 'automatic' } });
  try {
    const page = await server.ssrLoadModule('/src/pages/ResultsReviewPage.tsx');
    const html = renderToStaticMarkup(createElement(page.ResultsReviewPage));
    assert.match(html, /Fictional demonstration/);
    assert.match(html, /not an operational administrator system/);
    assert.match(html, /Original — preserved/);
    assert.match(html, /Resolve the player to a registry ID/);
    assert.match(html, /<button disabled="">Explicitly approve demo results/);
    assert.match(html, /<td>0\.00<\/td>/);
    assert.match(html, /Has not yet met the participation requirement/);
  } finally { await server.close(); }
});
