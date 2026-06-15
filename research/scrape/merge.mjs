// Merge results.json + results.pass2.json, keeping richer entry per URL.
import fs from 'fs';

const pass1 = JSON.parse(fs.readFileSync('results.json', 'utf8'));
const pass2 = JSON.parse(fs.readFileSync('results.pass2.json', 'utf8'));

const score = r => (r?.bodyText?.length || 0) + (r?.formGroups?.length || 0) * 50;

const byUrl = new Map();
for (const r of pass1) byUrl.set(r.url, r);
for (const r of pass2) {
  const cur = byUrl.get(r.url);
  if (!cur || score(r) > score(cur)) byUrl.set(r.url, r);
}

const merged = pass1.map(r => byUrl.get(r.url) || r);
fs.writeFileSync('results.merged.json', JSON.stringify(merged, null, 2));

const rich = merged.filter(r => (r.bodyText || '').length > 500 || (r.formGroups?.length || 0) > 0);
const fg = merged.filter(r => (r.formGroups?.length || 0) > 0);
console.log(`Merged ${merged.length} entries: ${rich.length} with body text, ${fg.length} with structured form-groups.`);
