// Headless render page for the GPU render worker (render-worker/).
//   /render?job=<render_jobs.id>&token=<RENDER_WORKER_TOKEN>      render a queued job
//   /render?dev=<productKey>&samples=60                             dev servers only: render product defaults
// The worker loads the page in headless Chromium, waits for
// window.__renderResult and uploads the JPEG. Nothing here is linked from
// the app, and the token gate keeps it off the public surface.
import { notFound } from 'next/navigation';
import { env } from '@/lib/env';
import { adminClient } from '@/lib/supabase-server';
import { productSchema } from '@/lib/product-schemas';
import { RenderClient } from '@/components/configurator/RenderClient';
import type { ConfigState } from '@/lib/pricing';

export const dynamic = 'force-dynamic';

type Params = { job?: string; token?: string; dev?: string; samples?: string; max?: string; w?: string; h?: string };

export default async function RenderPage({ searchParams }: { searchParams: Promise<Params> }) {
  const p = await searchParams;
  const samples = clampInt(p.samples, 16, 2000, 300);
  const maxMs = clampInt(p.max, 10_000, 900_000, 240_000);
  const width = clampInt(p.w, 400, 2400, 1600);
  const height = clampInt(p.h, 300, 1600, 1000);

  if (p.dev && process.env.NODE_ENV !== 'production') {
    return <RenderClient productKey={p.dev} scene={(productSchema(p.dev).scene as string | undefined) ?? null} schema={productSchema(p.dev)} samples={samples} maxMs={maxMs} width={width} height={height} />;
  }

  const token = env.renderWorkerToken();
  if (!token || !p.token || !p.job || p.token !== token) notFound();

  const db = adminClient();
  const { data: job } = await db.from('render_jobs').select('product_key, scene, config_json').eq('id', p.job).maybeSingle();
  if (!job) notFound();
  const j = job as { product_key: string; scene: string | null; config_json: unknown };
  return (
    <RenderClient
      productKey={j.product_key}
      scene={j.scene}
      state={j.config_json as ConfigState}
      samples={samples}
      maxMs={maxMs}
      width={width}
      height={height}
    />
  );
}

function clampInt(v: string | undefined, min: number, max: number, dflt: number): number {
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
}
