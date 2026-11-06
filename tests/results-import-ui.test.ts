import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
test('mobile import labels simulation, offers standard camera/multiple pickers, and begins with no results', async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false }, optimizeDeps: { noDiscovery: true }, esbuild: { jsx: 'automatic' } });
  try {
  const page = await server.ssrLoadModule('/src/pages/ResultsImportPage.tsx');
  const html = renderToStaticMarkup(createElement(page.ResultsImportPage));
  assert.match(html, /Mock extraction — no AI or OCR/);
  assert.match(html, /capture="environment"/);
  assert.match(html, /accept="image\/\*" multiple=""/);
  assert.match(html, /0 \/ 8 images selected/);
  assert.match(html, /Simulate extraction failure/);
  assert.doesNotMatch(html, /Explicitly approve fictional draft/);
  } finally { await server.close(); }
});
