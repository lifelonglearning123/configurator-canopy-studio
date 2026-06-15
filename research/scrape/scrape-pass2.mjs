// Second-pass scraper for URLs that came back empty.
// Strategy changes:
//  - Longer hydration wait (15s)
//  - NO overlay-hiding CSS (it may have been hiding content)
//  - Capture text from iframes too
//  - Capture text without offsetParent visibility filter
import { chromium } from 'playwright';
import fs from 'fs';

const prev = JSON.parse(fs.readFileSync('results.json', 'utf8'));
const targets = prev.filter(r => (r.bodyText || '').length < 200 || (r.formGroups?.length || 0) === 0);
console.log(`Pass 2: retrying ${targets.length} of ${prev.length} URLs`);

const CONCURRENCY = 3;
const HYDRATION_MS = 15000;

async function scrapeOne(browser, entry) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-GB',
  });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('cookie-consent', 'all');
      localStorage.setItem('cookieConsent', 'all');
      localStorage.setItem('cookies-accepted', '1');
    } catch {}
  });
  const page = await ctx.newPage();
  const result = { ...entry, success: false };

  try {
    await page.goto(entry.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(HYDRATION_MS);

    // Try clicking the cookie accept button directly (no CSS hide)
    for (const txt of ['Accept all', 'Accept All', 'Accept', 'Sprejmi vse', 'Souhlasím', 'I agree', 'Zaakceptuj']) {
      try {
        const btn = page.locator(`button:has-text("${txt}")`).first();
        if (await btn.count()) { await btn.click({ timeout: 1500 }); break; }
      } catch {}
    }
    await page.waitForTimeout(2000);

    // Walk frames
    const frames = page.frames();
    const data = { frames: frames.length, formGroups: [], bodyText: '', productCards: [], iframeTexts: [] };

    for (const frame of frames) {
      try {
        const out = await frame.evaluate(() => {
          const norm = s => (s || '').replace(/\s+/g, ' ').trim();
          const fg = Array.from(document.querySelectorAll('.form-group')).map(g => ({
            heading: norm(g.querySelector('h1,h2,h3,h4,h5,h6,label,.title,.subtitle')?.innerText) || norm(g.innerText).split('\n')[0],
            allText: norm(g.innerText),
            buttons: Array.from(g.querySelectorAll('button')).map(b => norm(b.innerText)).filter(Boolean),
            selectOptions: Array.from(g.querySelectorAll('option')).map(o => norm(o.innerText)).filter(Boolean),
            ranges: Array.from(g.querySelectorAll('input[type=range], input[type=number]')).map(i => ({ min: i.min, max: i.max, step: i.step, value: i.value, name: i.name || i.id })),
          }));
          const cards = Array.from(document.querySelectorAll('a, [data-product]'))
            .filter(el => el.querySelector('img'))
            .slice(0, 60)
            .map(el => ({ text: norm(el.innerText).slice(0, 200), href: el.href || '' }))
            .filter(o => o.text);
          return { url: location.href, bodyText: norm(document.body.innerText).slice(0, 15000), formGroups: fg, productCards: cards };
        });
        if (out.bodyText.length > data.bodyText.length) data.bodyText = out.bodyText;
        data.formGroups.push(...out.formGroups);
        data.productCards.push(...out.productCards);
        data.iframeTexts.push({ url: out.url, len: out.bodyText.length });
      } catch (e) {
        // cross-origin frame — skip
      }
    }

    Object.assign(result, data, { success: true });
  } catch (e) {
    result.error = e.message;
  } finally {
    await ctx.close();
  }
  return result;
}

async function runPool(browser, items, n) {
  const out = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: n }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      const item = items[idx];
      const t0 = Date.now();
      const r = await scrapeOne(browser, item);
      out[idx] = r;
      const bt = (r.bodyText || '').length, fg = r.formGroups?.length || 0;
      console.log(`[${idx + 1}/${items.length}] ${item.name} — body=${bt} fg=${fg} frames=${r.frames || 0} — ${Date.now() - t0}ms`);
      fs.writeFileSync('results.pass2.partial.json', JSON.stringify(out.filter(Boolean), null, 2));
    }
  });
  await Promise.all(workers);
  return out;
}

const browser = await chromium.launch({ headless: true });
const t0 = Date.now();
const results = await runPool(browser, targets, CONCURRENCY);
await browser.close();
fs.writeFileSync('results.pass2.json', JSON.stringify(results, null, 2));
console.log(`Pass 2 done in ${((Date.now() - t0) / 1000).toFixed(1)}s — wrote results.pass2.json`);
