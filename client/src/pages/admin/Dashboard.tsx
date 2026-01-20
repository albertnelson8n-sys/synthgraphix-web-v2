import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { useAdminAuth } from "../../state/adminAuth";
import { Card, PrismText, Badge, SoftButton } from "../../components/ui";

type Overview = {
  day_key: string;
  users: { total: number; last_24h: number };
  tasks: { total: number; active: number };
  completions: { total: number; today: number };
  activations: { paid: number; unpaid: number };
  withdrawals: { pending: number; paid: number; rejected: number; pending_amount_ksh: number };
  top_balances: Array<any>;
  latest_users: Array<any>;
  latest_withdrawals: Array<any>;
};

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs sg-muted">{label}</div>
      <div className="mt-1 text-2xl font-black">{value}</div>
      {hint ? <div className="mt-1 text-xs sg-muted">{hint}</div> : null}
    </Card>
  );
}

export default function Dashboard() {
  const { adminToken } = useAdminAuth();
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const r = await api<Overview>("/api/admin/overview", { token: adminToken });
      setData(r);
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const kpi = useMemo(() => {
    if (!data) return null;
    return {
      conversion_paid: data.users.total ? Math.round((data.activations.paid / data.users.total) * 100) : 0,
      completion_rate_today: data.users.total ? Math.round((data.completions.today / data.users.total) * 100) : 0,
    };
  }, [data]);

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <PrismText as="h1" className="text-4xl font-black tracking-wide">Overview</PrismText>
          <div className="mt-1 text-sm sg-muted">
            Live operational snapshot: users, tasks, activations, withdrawals, and risk indicators.
          </div>
          {data ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge>Day Key: {data.day_key}</Badge>
              <Badge>Activation Conversion: {kpi?.conversion_paid}%</Badge>
              <Badge>Today Completion Index: {kpi?.completion_rate_today}%</Badge>
            </div>
          ) : null}
        </div>

        <div className="flex gap-2">
          <SoftButton onClick={load} disabled={loading}>{loading ? "Refreshing..." : "Refresh"}</SoftButton>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Users" value={data?.users.total ?? "—"} hint={`+${data?.users.last_24h ?? 0} in last 24h`} />
        <StatCard label="Tasks (Active / Total)" value={data ? `${data.tasks.active} / ${data.tasks.total}` : "—"} hint="Catalog health" />
        <StatCard label="Completions" value={data ? `${data.completions.today} today` : "—"} hint={data ? `${data.completions.total} lifetime` : ""} />
        <StatCard label="Activation Status" value={data ? `${data.activations.paid} paid` : "—"} hint={data ? `${data.activations.unpaid} unpaid` : ""} />
      </div>

      <div className="mt-3 grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="p-4 lg:col-span-1">
          <div className="flex items-center justify-between">
            <div className="font-extrabold">Withdrawals Queue</div>
            {data ? <Badge>Pending: {data.withdrawals.pending}</Badge> : null}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <StatCard label="Pending Amount" value={data ? `KSH ${Number(data.withdrawals.pending_amount_ksh || 0).toLocaleString()}` : "—"} />
            <StatCard label="Paid" value={data?.withdrawals.paid ?? "—"} />
            <StatCard label="Rejected" value={data?.withdrawals.rejected ?? "—"} />
            <StatCard label="Pending" value={data?.withdrawals.pending ?? "—"} />
          </div>
          <div className="mt-2 text-xs sg-muted">
            Operational note: statuses are admin-controlled. Keep strict logs and reconcile payout confirmations.
          </div>
        </Card>

        <Card className="p-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="font-extrabold">Recent Withdrawals</div>
            <Badge>Last 10</Badge>
          </div>
          <div className="mt-3 overflow-auto">
            <table className="min-w-[760px] w-full text-sm">
              <thead className="text-xs sg-muted">
                <tr>
                  <th className="text-left py-2">ID</th>
                  <th className="text-left py-2">User</th>
                  <th className="text-left py-2">Amount</th>
                  <th className="text-left py-2">Method</th>
                  <th className="text-left py-2">Phone</th>
                  <th className="text-left py-2">Status</th>
                  <th className="text-left py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {(data?.latest_withdrawals || []).map((w: any) => (
                  <tr key={w.id} className="border-t border-white/10">
                    <td className="py-2">#{w.id}</td>
                    <td className="py-2">
                      <div className="font-semibold">{w.username}</div>
                      <div className="text-xs sg-muted">{w.email}</div>
                    </td>
                    <td className="py-2 font-semibold">KSH {Number(w.amount_ksh || 0).toLocaleString()}</td>
                    <td className="py-2">{w.method}</td>
                    <td className="py-2">{w.phone_number}</td>
                    <td className="py-2"><Badge>{w.status}</Badge></td>
                    <td className="py-2 text-xs sg-muted">{w.created_at}</td>
                  </tr>
                ))}
                {data && data.latest_withdrawals?.length === 0 ? (
                  <tr>
                    <td className="py-4 sg-muted" colSpan={7}>No withdrawals yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div className="font-extrabold">Latest Users</div>
            <Badge>Last 8</Badge>
          </div>
          <div className="mt-3 overflow-auto">
            <table className="min-w-[520px] w-full text-sm">
              <thead className="text-xs sg-muted">
                <tr>
                  <th className="text-left py-2">ID</th>
                  <th className="text-left py-2">Username</th>
                  <th className="text-left py-2">Email</th>
                  <th className="text-left py-2">Balance</th>
                  <th className="text-left py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {(data?.latest_users || []).map((u: any) => (
                  <tr key={u.id} className="border-t border-white/10">
                    <td className="py-2">#{u.id}</td>
                    <td className="py-2 font-semibold">{u.username}</td>
                    <td className="py-2">{u.email}</td>
                    <td className="py-2">KSH {Number(u.balance_ksh || 0).toLocaleString()}</td>
                    <td className="py-2 text-xs sg-muted">{u.created_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div className="font-extrabold">Top Balances</div>
            <Badge>Highest 8</Badge>
          </div>
          <div className="mt-3 overflow-auto">
            <table className="min-w-[520px] w-full text-sm">
              <thead className="text-xs sg-muted">
                <tr>
                  <th className="text-left py-2">User</th>
                  <th className="text-left py-2">Balance</th>
                  <th className="text-left py-2">Bonus</th>
                  <th className="text-left py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {(data?.top_balances || []).map((u: any) => (
                  <tr key={u.id} className="border-t border-white/10">
                    <td className="py-2">
                      <div className="font-semibold">{u.username}</div>
                      <div className="text-xs sg-muted">#{u.id} • {u.email}</div>
                    </td>
                    <td className="py-2 font-semibold">KSH {Number(u.balance_ksh || 0).toLocaleString()}</td>
                    <td className="py-2">KSH {Number(u.bonus_ksh || 0).toLocaleString()}</td>
                    <td className="py-2 text-xs sg-muted">{u.created_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
