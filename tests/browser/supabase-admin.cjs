const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE_PATH, headless: true, args: ['--no-sandbox'] });
  try {
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on('pageerror', error => errors.push(String(error)));
      await page.goto(`${process.env.BASE_URL || 'http://127.0.0.1:5173'}/admin`);
      await page.getByRole('heading', { name: 'League administration' }).waitFor();
      await page.getByText('Supabase is not configured.', { exact: false }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Sign in', exact: true }).count(), 0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('Administrator configuration fallback passes at mobile and desktop sizes');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
