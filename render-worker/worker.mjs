#!/usr/bin/env node
// GPU render worker: turns queued render_jobs into photoreal stills.
//
// Polls Supabase for queued jobs, opens the app's headless /render page in
// Chromium on this machine's GPU, waits for the path-traced JPEG, uploads it
// to the `renders` bucket and writes the URL back to the job and its lead.
// Runs anywhere with a GPU and Chrome: an office PC, a cloud GPU VM.
//
//   node worker.mjs                 poll forever
//   node worker.mjs --once          process one job (or none) and exit
//   node worker.mjs --url <renderPageUrl> --out out.jpg   dry run, no database
//
// Environment (see .env.example): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// APP_URL, RENDER_WORKER_TOKEN; optional POLL_MS, SAMPLES, MAX_MS, WIDTH,
// HEIGHT, PAGE_TIMEOUT_MS, CHROME_ARGS.

import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const once = args.includes('--once');
const dryUrl = flag('--url');
const dryOut = flag('--out') ?? 'render.jpg';

const cfg = {
  pollMs: int(process.env.POLL_MS, 5000),
  samples: int(process.env.SAMPLES, 300),
  maxMs: int(process.env.MAX_MS, 240_000),
  width: int(process.env.WIDTH, 1600),
  height: int(process.env.HEIGHT, 1000),
  pageTimeoutMs: int(process.env.PAGE_TIMEOUT_MS, 600_000),
  chromeArgs: (process.env.CHROME_ARGS ?? '--use-gl=angle --use-angle=d3d11 --enable-gpu --ignore-gpu-blocklist').split(/\s+/).filter(Boolean),
};
function int(v, d) { const n = parseInt(v ?? '', 10); return Number.isFinite(n) ? n : d; }
const log = (...m) => console.log(new Date().toISOString(), ...m);

let browser = null;
async function getBrowser() {
  if (browser && browser.isConnected()) return browser;
  browser = await chromium.launch({ headless: true, args: cfg.chromeArgs });
  return browser;
}

/** Load a render page and return { dataUrl, samples, ms }. Throws on failure. */
export async function renderUrl(url) {
  const b = await getBrowser();
  const page = await b.newPage({ viewport: { width: cfg.width + 40, height: cfg.height + 40 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    const handle = await page.waitForFunction(
      () => window.__renderResult || window.__renderError || null,
      null,
      { timeout: cfg.pageTimeoutMs, polling: 1000 },
    );
    const result = await handle.jsonValue();
    if (typeof result === 'string') throw new Error(`render page: ${result}`);
    if (!result?.dataUrl) throw new Error(`render page produced no image${errors.length ? ': ' + errors[0] : ''}`);
    return result;
  } finally {
    await page.close().catch(() => {});
  }
}

function jpegBytes(dataUrl) {
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
}

async function dryRun() {
  log('dry run', dryUrl);
  const t0 = Date.now();
  const r = await renderUrl(dryUrl);
  writeFileSync(dryOut, jpegBytes(r.dataUrl));
  log(`wrote ${dryOut}: ${r.samples} samples, page ${r.ms} ms, total ${Date.now() - t0} ms`);
}

async function processJob(db, job) {
  const url = `${process.env.APP_URL.replace(/\/$/, '')}/render?job=${job.id}&token=${encodeURIComponent(process.env.RENDER_WORKER_TOKEN)}&samples=${cfg.samples}&max=${cfg.maxMs}&w=${cfg.width}&h=${cfg.height}`;
  log(`job ${job.id}: ${job.product_key} for lead ${job.lead_id ?? '-'}`);
  const t0 = Date.now();
  const r = await renderUrl(url);
  const path = `${job.tenant_id}/${job.lead_id ?? job.id}-photo.jpg`;
  const { error: upErr } = await db.storage.from('renders').upload(path, jpegBytes(r.dataUrl), { contentType: 'image/jpeg', upsert: true });
  if (upErr) throw new Error(`upload failed: ${upErr.message}`);
  const renderUrlPublic = db.storage.from('renders').getPublicUrl(path).data.publicUrl;
  await db.from('render_jobs').update({ status: 'done', render_url: renderUrlPublic, samples: r.samples, finished_at: new Date().toISOString(), error: null }).eq('id', job.id);
  if (job.lead_id) await db.from('leads').update({ render_url: renderUrlPublic }).eq('id', job.lead_id);
  log(`job ${job.id}: done in ${Math.round((Date.now() - t0) / 1000)} s, ${r.samples} samples -> ${renderUrlPublic}`);
}

async function claimJob(db) {
  const { data: jobs, error } = await db.from('render_jobs').select('*').eq('status', 'queued').order('created_at').limit(1);
  if (error) { log('poll error', error.message); return null; }
  const job = jobs?.[0];
  if (!job) return null;
  // Claim it; a second worker racing for the same row loses on the status filter.
  const { data: claimed } = await db.from('render_jobs')
    .update({ status: 'rendering', started_at: new Date().toISOString(), attempts: (job.attempts ?? 0) + 1 })
    .eq('id', job.id).eq('status', 'queued').select('*').maybeSingle();
  return claimed ?? null;
}

async function mainLoop() {
  for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'APP_URL', 'RENDER_WORKER_TOKEN']) {
    if (!process.env[k]) { console.error(`missing env ${k}`); process.exit(2); }
  }
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  log(`render worker up: ${cfg.samples} samples / ${cfg.maxMs} ms cap, ${cfg.width}x${cfg.height}, poll ${cfg.pollMs} ms`);
  for (;;) {
    const job = await claimJob(db);
    if (job) {
      try {
        await processJob(db, job);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log(`job ${job.id}: failed: ${msg}`);
        // Up to 3 attempts, then it stays failed for a human to look at.
        const status = (job.attempts ?? 1) >= 3 ? 'failed' : 'queued';
        await db.from('render_jobs').update({ status, error: msg.slice(0, 1000), finished_at: status === 'failed' ? new Date().toISOString() : null }).eq('id', job.id);
        // A broken browser is the usual cause; start fresh next time.
        await browser?.close().catch(() => {}); browser = null;
      }
      if (once) break;
      continue;
    }
    if (once) break;
    await new Promise(r => setTimeout(r, cfg.pollMs));
  }
  await browser?.close().catch(() => {});
}

const entry = async () => (dryUrl ? dryRun() : mainLoop());
entry().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
