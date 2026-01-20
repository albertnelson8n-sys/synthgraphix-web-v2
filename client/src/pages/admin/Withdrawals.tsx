import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useAdminAuth } from "../../state/adminAuth";
import { Card, PrismText, Badge, SoftButton } from "../../components/ui";

type Row = {
  id: number;
  user_id: number;
  username: string;
  email: string;
  amount_ksh: number;
  phone_number: string;
  method: string;
  status: string;
  created_at: string;
};

export default function Withdrawals() {
  const { adminToken } = useAdminAuth();
  const [status, setStatus] = useState<string>("pending");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const url = status ? `/api/admin/withdrawals?status=${encodeURIComponent(status)}&limit=100` : "/api/admin/withdrawals?limit=100";
      const r = await api<Row[]>(url, { token: adminToken });
      setRows(r);
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function setRowStatus(id: number, next: "pending" | "paid" | "rejected") {
    try {
      const updated = await api<any>(`/api/admin/withdrawals/${id}`, {
        method: "PATCH",
        body: { status: next },
        token: adminToken,
      });
      setRows(rows.map((r) => (r.id === id ? { ...r, status: updated.status } : r)));
    } catch (e: any) {
      setError(e?.message || "Update failed");
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <PrismText as="h1" className="text-4xl font-black tracking-wide">Withdrawals</PrismText>
          <div className="mt-1 text-sm sg-muted">
            Review, approve, or reject payout requests. Change statuses only after you validate phone numbers and payment confirmations.
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-xl bg-black/35 border border-white/10 px-4 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-[color:var(--accent)]/20 focus:border-[color:var(--accent)]/55"
          >
            <option value="pending">pending</option>
            <option value="paid">paid</option>
            <option value="rejected">rejected</option>
            <option value="">all</option>
          </select>
          <SoftButton onClick={load} disabled={loading}>{loading ? "Refreshing..." : "Refresh"}</SoftButton>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <Card className="p-4 mt-6">
        <div className="flex items-center justify-between">
          <div className="font-extrabold">Requests</div>
          <Badge>{rows.length}</Badge>
        </div>

        <div className="mt-3 overflow-auto">
          <table className="min-w-[980px] w-full text-sm">
            <thead className="text-xs sg-muted">
              <tr>
                <th className="text-left py-2">ID</th>
                <th className="text-left py-2">User</th>
                <th className="text-left py-2">Amount</th>
                <th className="text-left py-2">Method</th>
                <th className="text-left py-2">Phone</th>
                <th className="text-left py-2">Status</th>
                <th className="text-left py-2">Created</th>
                <th className="text-left py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => (
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
                  <td className="py-2">
                    <div className="flex gap-2">
                      <SoftButton onClick={() => setRowStatus(w.id, "paid")}>Mark paid</SoftButton>
                      <SoftButton onClick={() => setRowStatus(w.id, "rejected")}>Reject</SoftButton>
                      <SoftButton onClick={() => setRowStatus(w.id, "pending")}>Reset</SoftButton>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-sm sg-muted">No matching withdrawals.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="mt-2 text-xs sg-muted">
          Compliance: store proof of payment (transaction id, timestamp) before setting status to <b>paid</b>.
        </div>
      </Card>
    </div>
  );
}
