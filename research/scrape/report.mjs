// Turn results.json into a readable markdown report.
import fs from 'fs';

const results = JSON.parse(fs.readFileSync('results.merged.json', 'utf8'));

const sec = title => `\n## ${title}\n`;
const sub = title => `\n### ${title}\n`;
const code = s => '`' + s + '`';

let md = `# SaleSqueze customer configurators — option inventory\n\n`;
md += `Scraped ${results.length} configurators. Generated ${new Date().toISOString()}.\n`;

// Summary stats
const ok = results.filter(r => r.success);
const fail = results.filter(r => !r.success);
md += `\n- **${ok.length}** succeeded, **${fail.length}** failed.\n`;
md += `- Total form-groups captured: ${ok.reduce((s, r) => s + (r.formGroups?.length || 0), 0)}\n`;
md += `- Customers grouped by product type: ${[...new Set(results.map(r => r.type))].join(', ')}\n`;

// Aggregate across all configurators: which option-section headings appear most often
// Filter list: skip noisy non-configurator content (country dropdowns, language pickers, cookie buttons)
const COUNTRY_RX = /^(afghanistan|albania|algeria|andorra|angola|argentina|armenia|aruba|australia|austria|azerbaijan|bahamas|bahrain|bangladesh|barbados|belarus|belgium|belize|benin|bermuda|bhutan|bolivia|bosnia|botswana|brazil|brunei|bulgaria|burkina|burundi|cambodia|cameroon|canada|cape verde|cayman|chad|chile|china|colombia|comoros|congo|costa rica|croatia|cuba|cyprus|czech|denmark|djibouti|dominica|ecuador|egypt|el salvador|equatorial|eritrea|estonia|ethiopia|faroe|fiji|finland|france|gabon|gambia|georgia|germany|ghana|gibraltar|greece|greenland|grenada|guam|guatemala|guernsey|guinea|guyana|haiti|honduras|hong kong|hungary|iceland|india|indonesia|iran|iraq|ireland|isle of man|israel|italy|jamaica|japan|jersey|jordan|kazakhstan|kenya|kiribati|korea|kuwait|kyrgyzstan|lao|latvia|lebanon|lesotho|liberia|libya|liechtenstein|lithuania|luxembourg|macao|macedonia|madagascar|malawi|malaysia|maldives|mali|malta|marshall|martinique|mauritania|mauritius|mayotte|mexico|micronesia|moldova|monaco|mongolia|montenegro|montserrat|morocco|mozambique|myanmar|namibia|nauru|nepal|netherlands|new caledonia|new zealand|nicaragua|niger|nigeria|niue|norfolk|norway|oman|pakistan|palau|palestin|panama|papua|paraguay|peru|philippines|pitcairn|poland|portugal|puerto rico|qatar|romania|russia|rwanda|samoa|san marino|saudi|senegal|serbia|seychelles|sierra leone|singapore|slovak|slovenia|solomon|somalia|south africa|spain|sri lanka|sudan|suriname|swaziland|sweden|switzerland|syria|taiwan|tajikistan|tanzania|thailand|timor|togo|tokelau|tonga|trinidad|tunisia|turkey|turkmenistan|tuvalu|uganda|ukraine|united arab|united kingdom|united states|uruguay|uzbekistan|vanuatu|venezuela|viet nam|vietnam|virgin islands|wallis|yemen|zambia|zimbabwe|åland|antarctica|åland islands|bonaire|british indian|christmas island|cocos|curaçao|côte|falkland|french guiana|french polynesia|french southern|heard island|holy see|saint barthélemy|saint helena|saint kitts|saint lucia|saint martin|saint pierre|saint vincent|sao tome|svalbard|select country|comparer)/i;
const NOISE_RX = /^(login|prijava|více informací|skip|accept|cookies?|consent|next|back|more info)$/i;
// Broader territory/region filter to catch what slipped past COUNTRY_RX
const TERRITORY_RX = /\b(islands?|samoa|sahara|barbuda|reunion|réunion|maarten|sudan|guadeloupe|caicos|mariana|sandwich|central african|cape verde|côte|virgin|guernsey|jersey|saint|sao tome|svalbard|anguilla|aruba|bermuda|gibraltar|greenland|tokelau|niue)\b/i;
const isJunk = s => !s || COUNTRY_RX.test(s) || NOISE_RX.test(s) || TERRITORY_RX.test(s) || s.length > 80 || /^\d+$/.test(s);

const sectionFreq = new Map();
const allButtons = new Map();
const allSelectOptions = new Map();
for (const r of ok) {
  const seenInThisCustomer = new Set(); // dedup per customer
  for (const g of r.formGroups || []) {
    const h = (g.heading || '').split('\n')[0].trim();
    if (h && !isJunk(h) && !seenInThisCustomer.has(h)) {
      seenInThisCustomer.add(h);
      sectionFreq.set(h, (sectionFreq.get(h) || 0) + 1);
    }
    for (const b of g.buttons || []) if (!isJunk(b)) allButtons.set(b, (allButtons.get(b) || 0) + 1);
    for (const o of g.selectOptions || []) if (!isJunk(o)) allSelectOptions.set(o, (allSelectOptions.get(o) || 0) + 1);
  }
}
const topN = (m, n = 50) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

md += sec('Most common configurator sections (across all customers)');
md += '| Section heading | Count |\n|---|---|\n';
for (const [k, v] of topN(sectionFreq, 40)) md += `| ${k.slice(0, 80)} | ${v} |\n`;

md += sec('Most common option labels (button + select values)');
md += '| Option | Count |\n|---|---|\n';
const merged = new Map();
for (const [k, v] of allButtons) merged.set(k, (merged.get(k) || 0) + v);
for (const [k, v] of allSelectOptions) merged.set(k, (merged.get(k) || 0) + v);
for (const [k, v] of topN(merged, 60)) md += `| ${k.slice(0, 80)} | ${v} |\n`;

// Per-customer details
md += sec('Per-customer option breakdown');
for (const r of results) {
  md += sub(`${r.name} — ${r.type}`);
  md += `URL: ${code(r.url)}\n\n`;
  if (!r.success) { md += `_Scrape failed: ${r.error || 'unknown error'}._\n`; continue; }
  md += `Final URL: ${code(r.finalUrl || r.url)}\n\n`;

  if (r.productCards?.length) {
    md += `**Showroom products (${r.productCards.length}):** ` +
      r.productCards.slice(0, 30).map(c => c.text.split('\n')[0].slice(0, 60)).join(' · ') + '\n\n';
  }

  if (r.tabs?.length) md += `**Steps/tabs:** ${r.tabs.join(' › ')}\n\n`;

  if (r.formGroups?.length) {
    md += `**Configurator sections:**\n\n`;
    for (const g of r.formGroups) {
      const h = (g.heading || '(unnamed)').split('\n')[0].slice(0, 80);
      const opts = [...new Set([...(g.buttons || []), ...(g.selectOptions || []).filter(o => !/^—\s/.test(o))])].slice(0, 25);
      const ranges = (g.ranges || []).map(rg => `${rg.name || ''} ${rg.min}–${rg.max} step ${rg.step}`).filter(s => s.trim()).join(', ');
      md += `- **${h}**`;
      if (opts.length) md += ` — options: ${opts.join(', ')}`;
      if (ranges) md += ` — ranges: ${ranges}`;
      md += '\n';
    }
    md += '\n';
  } else if (r.bodyText) {
    md += `_No .form-group elements found — body text preview:_\n\n> ${r.bodyText.slice(0, 600).replace(/\n/g, ' ')}\n\n`;
  }
}

fs.writeFileSync('REPORT.md', md);
console.log(`Wrote REPORT.md (${md.length} chars)`);
