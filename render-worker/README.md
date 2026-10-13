# Render worker

Produces photoreal, path-traced stills of quoted builds for customers whose
device could not render one itself (phones, low-tier laptops). The app queues a
job per quote request that arrived without a photo; this worker renders it on a
machine with a GPU and writes the image back to the lead.

```
quote request ──► /api/leads ──► render_jobs (queued)
                                      │
            worker.mjs polls ◄────────┘
                   │  opens  APP_URL/render?job=…&token=…  in headless Chromium (GPU)
                   │  waits for the path tracer (≈300 samples, 1–4 min)
                   ▼
            renders bucket  ──► leads.render_url  ──► admin lead list / CRM
```

## Where to run it

Anywhere with a GPU and Node 22: an office PC that stays on, or a small cloud
GPU VM. It needs outbound HTTPS only (to Supabase and the app); nothing
connects to it. One machine handles one render at a time; run a second
worker for more throughput, they claim jobs atomically.

Vercel cannot host it: serverless functions have no GPU and time out long
before a render finishes.

## Setup

1. Apply migration `supabase/migrations/0011_render_jobs.sql` (and `0010_lead_renders.sql` if not yet applied).
2. On the app (Vercel env): set `RENDER_JOBS_ENABLED=1` and a long random `RENDER_WORKER_TOKEN`.
3. On the worker machine:

```
cd render-worker
npm install
npm run setup            # downloads Chromium
copy .env.example .env   # fill in the values
node worker.mjs --url "https://<app>/render?dev=veranda&samples=60" --out test.jpg   # only against a dev server
node worker.mjs --once   # process one queued job
node worker.mjs          # run as a service (pm2, NSSM or Task Scheduler on Windows)
```

The worker reads `.env` only if you export it yourself (e.g. `set -a; . ./.env` on
bash, or a pm2 ecosystem file); plain `node` does not load it.

## Behaviour

- Jobs are claimed by flipping `status` from `queued` to `rendering`; a job that
  fails goes back to `queued` up to 3 attempts, then stays `failed` with the error.
- The first render after start-up compiles the path tracer's shader, which can
  take a minute or more; later renders in the same browser session skip it.
- Output: 1600×1000 JPEG, 300 samples or 4 minutes after the first sample,
  whichever comes first (`SAMPLES`, `MAX_MS`, `WIDTH`, `HEIGHT`).
- The customer's CRM record already carries the snapshot taken at submit time;
  the photoreal still replaces the lead's `render_url` when it is ready.
