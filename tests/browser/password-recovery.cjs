// Run against a production build configured with example.supabase.co and a test publishable key.
const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const base = process.env.BASE_URL || 'http://127.0.0.1:4174/modern-league/';
  const jwt = `e30.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url')}.c2lnbmF0dXJl`;
  const user = { id: 'recovery-user', aud: 'authenticated', role: 'authenticated', email: 'admin@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
  try {
    for (const width of [390, 1440]) {
      for (const scenario of ['success', 'expired', 'missing', 'verify-failed', 'update-failed']) {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        const errors = []; let updates = 0; let reads = 0;
        page.on('pageerror', error => errors.push(String(error)));
        const existingSession = JSON.stringify({ access_token: jwt, refresh_token: 'unrelated-session', expires_at: Math.floor(Date.now()/1000)+3600, expires_in: 3600, token_type: 'bearer', user });
        await page.addInitScript(value => {
          if (!localStorage.getItem('sb-example-auth-token')) localStorage.setItem('sb-example-auth-token', value);
        }, existingSession);
        await page.route('https://example.supabase.co/**', async route => {
          if (route.request().method() === 'PUT') updates++;
          if (route.request().method() === 'GET') reads++;
          const failed = scenario === 'expired' || (scenario === 'verify-failed' && reads > 1) || (scenario === 'update-failed' && route.request().method() === 'PUT');
          await route.fulfill({ status: failed ? 403 : 200, contentType: 'application/json', body: JSON.stringify(failed ? { msg: 'Auth request rejected' } : user) });
        });
        await page.goto(base + (scenario === 'missing' ? '?recovery=1' : `?recovery=1#access_token=${jwt}&refresh_token=test&type=recovery`));
        await page.getByRole('heading', { name: 'Reset your password' }).waitFor();
        assert.equal(new URL(page.url()).hash, '#/reset-password');
        assert.equal(new URL(page.url()).search, '');
        if (scenario === 'success') {
          await page.getByLabel('New password', { exact: true }).fill('a-long-new-password');
          await page.getByLabel('Confirm new password').fill('different-password');
          await page.getByRole('button', { name: 'Update password' }).click();
          await page.getByText('Passwords do not match.', { exact: true }).waitFor();
          assert.equal(updates, 0);
          await page.getByLabel('Confirm new password').fill('a-long-new-password');
          await page.getByRole('button', { name: 'Update password' }).click();
          await page.getByText('Password updated.', { exact: false }).waitFor();
          assert.equal(updates, 1);
          await page.reload();
        }
        if (scenario === 'update-failed') {
          await page.getByLabel('New password', { exact: true }).fill('a-long-new-password');
          await page.getByLabel('Confirm new password').fill('a-long-new-password');
          await page.getByRole('button', { name: 'Update password' }).click();
          await page.getByText('Password update failed.', { exact: false }).waitFor();
        } else {
          await page.getByText('This recovery link is invalid or expired.', { exact: false }).waitFor();
        }
        assert.equal(await page.getByRole('button', { name: 'Update password' }).count(), 0);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        assert.deepEqual(errors, []);
        assert.equal(await page.evaluate(() => localStorage.getItem('sb-example-auth-token')), existingSession);
        assert.equal(await page.evaluate(() => localStorage.getItem('modern-league-recovery')), null);
        await page.close();
      }
    }
    console.log('Production Pages recovery callback, mismatch, success, expiry, and refresh pass at mobile and desktop sizes');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
