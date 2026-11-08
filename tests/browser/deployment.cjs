// Test the production build on a static server with no SPA fallback, like Pages.
const { chromium } = require('playwright-core');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const { resolve, extname } = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const root = resolve('dist');
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    const file = resolve(root, path.slice('/modern-league/'.length) || 'index.html');
    if (!path.startsWith('/modern-league/') || !file.startsWith(root + '/')) {
      res.writeHead(404).end(); return;
    }
    try {
      const data = await readFile(file);
      res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream');
      res.end(data);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE_PATH, headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('response', response => { if (response.status() >= 400) errors.push(response.url()); });
    const base = `http://127.0.0.1:${server.address().port}/modern-league/`;
    for (const route of ['events', 'seasons', 'leaderboards', 'leaderboards/top-16', 'rules', 'results-review', 'results-import', 'admin', 'official-import', 'publish-results', 'correct-official-results', 'edit-tournaments', 'test-workspace']) {
      await page.goto(`${base}#/${route}`);
      await page.locator('main h1').waitFor();
      const title = await page.locator('main h1').innerText();
      assert.doesNotMatch(title, /Page not found/i);
      await page.reload();
      await page.locator('main h1').waitFor();
      assert.equal(await page.locator('main h1').innerText(), title);
      await page.locator('.skip-link').evaluate(link => link.click());
      assert.equal(new URL(page.url()).hash, `#/${route}`);
    }
    await page.goto(`${base}#/admin`);
    await page.locator('nav a[href="#/events"]').first().click();
    await page.waitForURL(`${base}#/events`);
    await page.goBack();
    await page.waitForURL(`${base}#/admin`);
    assert.deepEqual(errors, []);
    console.log('Production static-host routes, refresh, navigation, history and skip links passed.');
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
