// Scrape SaleSqueze customer configurators for option schemas.
// Strategy: load each URL, wait for SPA hydration, hide cookie overlay via CSS,
// extract structured option groups from .form-group elements + showroom product cards.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const URLS = JSON.parse(fs.readFileSync('urls.json', 'utf8'));
const CONCURRENCY = 3;
const PER_URL_BUDGET_MS = 35000;
const HYDRATION_WAIT_MS = 7000;

// Block heavy assets to speed up — we only need DOM text
const BLOCK_TYPES = new Set(['media', 'font']);
const BLOCK_EXT = /\.(mp4|webm|woff2?|ttf|otf|gltf|glb|hdr|exr)(\?|$)/i;

// CSS injected to neutralise cookie overlays and other modal layers
const NUKE_OVERLAYS_CSS = `
  .cdk-overlay-container, .cdk-overlay-pane, .ant-modal-mask, .ant-modal-wrap,
  [class*="cookie" i], [class*="consent" i], [id*="cookie" i], [id*="consent" i] {
    display: none !important; visibility: hidden !important; pointer-events: none !important;
  }
`;

async function scrapeOne(browser, entry, attempt = 1) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-GB',
  });
  await ctx.addInitScript(() => {
    // Pretend cookie consent already given (Salesqueze uses localStorage flags)
    try {
      localStorage.setItem('cookie-consent', 'all');
      localStorage.setItem('cookieConsent', 'all');
      localStorage.setItem('cookies-accepted', '1');
    } catch {}
  });

  await ctx.route('**/*', route => {
    const req = route.request();
    const url = req.url();
    const type = req.resourceType();
    if (BLOCK_TYPES.has(type) || BLOCK_EXT.test(url)) return route.abort();
    return route.continue();
  });

  const page = await ctx.newPage();
  const result = { ...entry, success: false, attempt };

  try {
    await page.goto(entry.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.addStyleTag({ content: NUKE_OVERLAYS_CSS }).catch(() => {});
    await page.waitForTimeout(HYDRATION_WAIT_MS);
    await page.addStyleTag({ content: NUKE_OVERLAYS_CSS }).catch(() => {});

    // Re-evaluate after a small extra wait if body is still empty
    let firstPass = await page.evaluate(() => (document.body.innerText || '').trim().length);
    if (firstPass < 50) {
      await page.waitForTimeout(5000);
    }

    const data = await page.evaluate(() => {
      const norm = s => (s || '').replace(/\s+/g, ' ').trim();
      const visible = el => {
        const cs = getComputedStyle(el);
        return cs.display !== 'none' && cs.visibility !== 'hidden' && el.offsetParent !== null;
      };

      // Showroom product cards: <a> with thumbnail + label
      const productCards = Array.from(document.querySelectorAll('a, [role="link"], [data-product], [data-testid*="product" i]'))
        .filter(el => visible(el) && (el.querySelector('img') || el.querySelector('[style*="background-image"]')))
        .map(el => ({
          text: norm(el.innerText).slice(0, 200),
          href: el.href || '',
          img: el.querySelector('img')?.src?.slice(-100) || '',
        }))
        .filter(o => o.text)
        .slice(0, 60);

      // Each .form-group is a configuration section in the SaleSqueze configurator UI
      const formGroups = Array.from(document.querySelectorAll('.form-group')).map(g => {
        if (!visible(g)) return null;
        const heading = norm(g.querySelector('h1,h2,h3,h4,h5,h6,label,.title,.subtitle,.module-title')?.innerText) || norm(g.innerText).split('\n')[0];
        const buttons = Array.from(g.querySelectorAll('button')).map(b => norm(b.innerText)).filter(Boolean);
        const swatches = Array.from(g.querySelectorAll('[class*="color" i], .swatch')).map(s => s.getAttribute('aria-label') || s.title || norm(s.innerText)).filter(Boolean);
        const selectOptions = Array.from(g.querySelectorAll('option')).map(o => norm(o.innerText)).filter(Boolean);
        const ranges = Array.from(g.querySelectorAll('input[type=range], input[type=number]')).map(i => ({
          min: i.min, max: i.max, step: i.step, value: i.value, name: i.name || i.id,
        }));
        const checkboxes = Array.from(g.querySelectorAll('input[type=checkbox], input[type=radio]')).map(i => ({
          type: i.type, name: i.name, value: i.value, label: norm(i.closest('label')?.innerText),
        }));
        return {
          heading,
          allText: norm(g.innerText),
          buttons,
          swatches,
          selectOptions,
          ranges,
          checkboxes,
        };
      }).filter(Boolean);

      // Catalog any visible field labels / select options outside .form-group as fallback
      const looseSelects = Array.from(document.querySelectorAll('select')).map(s => ({
        name: s.name || s.id,
        options: Array.from(s.options).map(o => norm(o.innerText)).filter(Boolean),
      }));

      const tabs = Array.from(document.querySelectorAll('[role="tab"], .tab, .step, [class*="step-" i]'))
        .filter(visible).map(el => norm(el.innerText)).filter(Boolean).slice(0, 30);

      return {
        title: document.title,
        finalUrl: location.href,
        productCards,
        formGroups,
        looseSelects,
        tabs,
        bodyText: norm(document.body.innerText).slice(0, 12000),
      };
    });

    Object.assign(result, data, { success: true });
  } catch (e) {
    result.error = e.message;
  } finally {
    await ctx.close();
  }
  return result;
}

async function withRetry(browser, entry) {
  let res = await scrapeOne(browser, entry, 1);
  if (!res.success || (res.bodyText || '').length < 200) {
    res = await scrapeOne(browser, entry, 2);
  }
  return res;
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
      const r = await Promise.race([
        withRetry(browser, item),
        new Promise(res => setTimeout(() => res({ ...item, success: false, error: 'budget exceeded' }), PER_URL_BUDGET_MS * 2)),
      ]);
      const ms = Date.now() - t0;
      out[idx] = r;
      const tag = r.success ? `ok (${(r.bodyText || '').length}b)` : `FAIL ${r.error || ''}`;
      console.log(`[${idx + 1}/${items.length}] ${item.name} — ${tag} — ${ms}ms`);
      fs.writeFileSync('results.partial.json', JSON.stringify(out.filter(Boolean), null, 2));
    }
  });
  await Promise.all(workers);
  return out;
}

const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
console.log(`Scraping ${URLS.length} URLs with concurrency ${CONCURRENCY}…`);
const t0 = Date.now();
const results = await runPool(browser, URLS, CONCURRENCY);
await browser.close();
fs.writeFileSync('results.json', JSON.stringify(results, null, 2));
console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s — wrote results.json`);
