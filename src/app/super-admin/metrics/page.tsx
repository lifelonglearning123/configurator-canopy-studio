import { adminClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

type Row = { subscription_status: string; status: string; created_at: string };

async function loadMetrics() {
  const db = adminClient();
  const { data: tenants } = await db.from('tenants').select('subscription_status, status, created_at');
  const { count: leadCount } = await db.from('leads').select('id', { count: 'exact', head: true });
  const rows = (tenants ?? []) as Row[];

  const bySub: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  for (const r of rows) {
    bySub[r.subscription_status] = (bySub[r.subscription_status] ?? 0) + 1;
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  }

  // Last 12 weeks of signups, week starts Monday UTC.
  const now = new Date();
  const weeks: Array<{ label: string; count: number }> = [];
  for (let i = 11; i >= 0; i--) {
    const end = new Date(now);
    end.setUTCDate(end.getUTCDate() - i * 7);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 7);
    const count = rows.filter(r => {
      const d = new Date(r.created_at);
      return d >= start && d < end;
    }).length;
    weeks.push({ label: `${end.getUTCMonth() + 1}/${end.getUTCDate()}`, count });
  }
  const maxCount = Math.max(1, ...weeks.map(w => w.count));

  return {
    total: rows.length,
    leads: leadCount ?? 0,
    bySub,
    byStatus,
    weeks,
    maxCount,
  };
}

export default async function MetricsPage() {
  const m = await loadMetrics();

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Platform metrics</h1>
        <p className="text-sm text-stone-600">Live counts across all tenants.</p>
      </header>

      <section className="grid grid-cols-3 gap-4">
        <Stat label="Total tenants" value={String(m.total)} />
        <Stat label="Active subscriptions" value={String(m.bySub.active ?? 0)} />
        <Stat label="Leads (platform-wide)" value={String(m.leads)} />
      </section>

      <section>
        <h2 className="text-sm font-semibold tracking-tight mb-3">By subscription status</h2>
        <div className="bg-white border border-stone-200 rounded-xl p-4 grid grid-cols-5 gap-2">
          {['active', 'trialing', 'incomplete', 'past_due', 'canceled'].map(k => (
            <div key={k} className="text-center">
              <div className="text-xs uppercase tracking-wider text-stone-500">{k}</div>
              <div className="text-2xl font-semibold tabular-nums mt-1">{m.bySub[k] ?? 0}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold tracking-tight mb-3">By lifecycle status</h2>
        <div className="bg-white border border-stone-200 rounded-xl p-4 grid grid-cols-3 gap-2">
          {['active', 'suspended', 'deleted'].map(k => (
            <div key={k} className="text-center">
              <div className="text-xs uppercase tracking-wider text-stone-500">{k}</div>
              <div className="text-2xl font-semibold tabular-nums mt-1">{m.byStatus[k] ?? 0}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold tracking-tight mb-3">Signups — last 12 weeks</h2>
        <div className="bg-white border border-stone-200 rounded-xl p-6">
          <div className="flex items-end gap-2 h-40">
            {m.weeks.map((w, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full bg-stone-200 rounded-t" style={{ height: `${(w.count / m.maxCount) * 100}%` }} title={`${w.count} signups`} />
                <div className="text-[10px] text-stone-500">{w.label}</div>
                <div className="text-[10px] text-stone-400 tabular-nums">{w.count}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-4">
      <div className="text-xs uppercase tracking-wider text-stone-500">{label}</div>
      <div className="text-2xl font-semibold tracking-tight mt-1 tabular-nums">{value}</div>
    </div>
  );
}
