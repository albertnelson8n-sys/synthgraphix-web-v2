import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { Badge, Card } from "../../components/ui";

type HistoryRow = {
  id: number;
  created_at: string;
  reward_ksh: number;
  title: string;
  type: string;
};

type WithdrawalRow = {
  id: number;
  amount_ksh: number;
  method: string;
  status: string;
  created_at: string;
};

function safeNum(n: any) {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

export default function Analytics() {
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
  const [err, setErr] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    (async () => {
      setErr("");
      setLoading(true);
      try {
        const h = await api<HistoryRow[]>("/history");
        const w = await api<WithdrawalRow[]>("/withdrawals");
        setHistory(Array.isArray(h) ? h : []);
        setWithdrawals(Array.isArray(w) ? w : []);
      } catch (e: any) {
        setErr(e?.message || "Failed to load analytics");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const kpis = useMemo(() => {
    const totalEarned = history.reduce((a, r) => a + safeNum(r.reward_ksh), 0);
    const tasksCompleted = history.length;
    const withdrawalsTotal = withdrawals.reduce((a, r) => a + safeNum(r.amount_ksh), 0);
    const withdrawalsPending = withdrawals.filter((w) => (w.status || "").toLowerCase() === "pending").length;
    const avgReward = tasksCompleted ? Math.round(totalEarned / tasksCompleted) : 0;

    // Simple type breakdown (top 5)
    const byType = new Map<string, number>();
    for (const r of history) byType.set(r.type || "unknown", (byType.get(r.type || "unknown") || 0) + 1);
    const topTypes = [...byType.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

    return { totalEarned, tasksCompleted, withdrawalsTotal, withdrawalsPending, avgReward, topTypes };
  }, [history, withdrawals]);

  const trend = useMemo(() => {
    // last 14 records grouped into 7 buckets for a compact "trend" bar
    const rows = [...history].slice(0, 70);
    const buckets = new Array(7).fill(0);
    rows.forEach((r, i) => {
      const b = Math.floor(i / 10);
      if (b < 7) buckets[b] += safeNum(r.reward_ksh);
    });
    const max = Math.max(1, ...buckets);
    return { buckets, max };
  }, [history]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-2xl font-extrabold">Analytics</div>
          <div className="sg-muted mt-1">Operational snapshot for your earnings and withdrawals.</div>
        </div>
        <Badge>Classic Theme • 3D UI</Badge>
      </div>

      {err ? (
        <div className="rounded-2xl border border-[color:var(--danger)]/35 bg-[color:var(--danger)]/10 px-4 py-3 text-[color:var(--danger)]">
          {err}
        </div>
      ) : null}

      {loading ? (
        <div className="sg-muted">Loading analytics…</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <Card className="p-4">
              <div className="sg-muted text-xs">Total Earned (Tasks)</div>
              <div className="mt-1 text-2xl font-extrabold">KSH {kpis.totalEarned}</div>
              <div className="mt-2 sg-muted text-sm">Avg reward: KSH {kpis.avgReward} / task</div>
            </Card>
            <Card className="p-4">
              <div className="sg-muted text-xs">Tasks Completed</div>
              <div className="mt-1 text-2xl font-extrabold">{kpis.tasksCompleted}</div>
              <div className="mt-2 sg-muted text-sm">History shows up to 50 latest completions.</div>
            </Card>
            <Card className="p-4">
              <div className="sg-muted text-xs">Withdrawals Total</div>
              <div className="mt-1 text-2xl font-extrabold">KSH {kpis.withdrawalsTotal}</div>
              <div className="mt-2 sg-muted text-sm">Pending: {kpis.withdrawalsPending}</div>
            </Card>
            <Card className="p-4">
              <div className="sg-muted text-xs">System Status</div>
              <div className="mt-1 text-lg font-extrabold">All services nominal</div>
              <div className="mt-2 sg-muted text-sm">Token-auth • SQLite • Daily assignments</div>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="p-4 lg:col-span-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-extrabold">Earnings Trend</div>
                  <div className="sg-muted text-sm">Approximate recent momentum based on completion records.</div>
                </div>
                <div className="text-xs sg-muted">Higher bar = more earnings</div>
              </div>
              <div className="mt-4 flex items-end gap-2 h-[140px]">
                {trend.buckets.map((v, i) => (
                  <div key={i} className="flex-1">
                    <div
                      className="w-full rounded-xl bg-white/5 border border-white/10"
                      style={{ height: Math.max(12, Math.round((v / trend.max) * 140)) }}
                    />
                    <div className="mt-2 text-center text-xs sg-muted">#{7 - i}</div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-4">
              <div className="font-extrabold">Top Task Types</div>
              <div className="sg-muted text-sm mt-1">Based on your recent history.</div>
              <div className="mt-3 space-y-2">
                {kpis.topTypes.length === 0 ? (
                  <div className="sg-muted">No completions yet.</div>
                ) : (
                  kpis.topTypes.map(([t, n]) => (
                    <div key={t} className="flex items-center justify-between rounded-xl bg-black/20 border border-white/10 px-3 py-2">
                      <div className="text-sm font-semibold">{t}</div>
                      <div className="text-xs sg-muted">{n}</div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
