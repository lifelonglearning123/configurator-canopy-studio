// Explore the SaleSqueze configurator DOM so we can design selectors.
import { chromium } from 'playwright';
import fs from 'fs';

const URLS = [
  'https://pristinepergola.salesqueze.com/en/showroom/browse',
  'https://stattus.salesqueze.com/en/showroom/browse',
];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1400, height: 900 },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
});
const page = await ctx.newPage();

async function dismissCookies(page) {
  // Try common consent button texts
  const tries = ['Accept all', 'Accept All', 'Accept', 'Required only', 'I agree', 'Souhlasím', 'Sprejmi', 'Zaakceptuj', 'Sprejmi vse'];
  for (const txt of tries) {
    try {
      const btn = page.getByRole('button', { name: new RegExp(`^${txt}$`, 'i') }).first();
      if (await btn.count()) {
        await btn.click({ timeout: 1500 });
        console.log('  dismissed cookies:', txt);
        return true;
      }
    } catch {}
  }
  return false;
}

const out = [];

for (const url of URLS) {
  console.log('Visiting', url);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  } catch (e) {
    console.log('  navigation error:', e.message);
  }
  await page.waitForTimeout(1500);
  await dismissCookies(page);
  await page.waitForTimeout(4000); // let SPA hydrate

  const dump = await page.evaluate(() => {
    const norm = s => (s || '').replace(/\s+/g, ' ').trim();
    const sample = (sel, n = 60) => Array.from(document.querySelectorAll(sel)).slice(0, n).map(el => norm(el.innerText || el.textContent)).filter(Boolean);
    const links = Array.from(document.querySelectorAll('a')).slice(0, 60).map(a => ({ text: norm(a.innerText), href: a.href })).filter(l => l.text);

    // Find showroom product tiles — try a few likely patterns
    const tilesByDataAttr = Array.from(document.querySelectorAll('[data-testid*="product"], [data-test*="product"], [data-product], [data-product-id]'));
    const aTilesWithImg = Array.from(document.querySelectorAll('a')).filter(a => a.querySelector('img'));
    const sectionCounts = Array.from(document.querySelectorAll('section, article, div')).map(el => ({
      cls: (el.className || '').toString().slice(0, 80),
      kids: el.children.length,
      txt: norm(el.innerText).slice(0, 120),
    })).filter(o => o.kids >= 3 && o.kids <= 15 && o.txt.length > 0).slice(0, 20);

    return {
      title: document.title,
      url: location.href,
      h1: sample('h1', 10),
      h2: sample('h2', 30),
      h3: sample('h3', 40),
      buttonsCount: document.querySelectorAll('button').length,
      buttons: sample('button', 60),
      imgs: Array.from(document.querySelectorAll('img')).slice(0, 30).map(img => ({ alt: img.alt, src: img.src.slice(-80) })),
      links: links.slice(0, 40),
      productTiles: {
        byDataAttr: tilesByDataAttr.length,
        anchorWithImg: aTilesWithImg.length,
        anchorSamples: aTilesWithImg.slice(0, 10).map(a => ({ text: norm(a.innerText).slice(0, 150), href: a.href })),
      },
      sectionCounts,
      bodyText: norm(document.body.innerText).slice(0, 2000),
    };
  });

  out.push(dump);
  try { await page.screenshot({ path: `explore-${URLS.indexOf(url)}.png`, fullPage: false, timeout: 8000 }); } catch (e) { console.log('  screenshot skipped:', e.message); }
}

await browser.close();
fs.writeFileSync('explore-dump.json', JSON.stringify(out, null, 2));
console.log('Wrote explore-dump.json');
