import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useAdminAuth } from "../../state/adminAuth";
import { Card, Input, PrismText, Badge, SoftButton, PrismButton } from "../../components/ui";

type UserRow = {
  id: number;
  username: string;
  email: string;
  balance_ksh: number;
  bonus_ksh: number;
  referral_code: string;
  created_at: string;
};

type UserDetail = {
  user: any;
  activation: any;
  withdrawals: any[];
  completions: { n: number; sum: number };
};

export default function Users() {
  const { adminToken } = useAdminAuth();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [newBalance, setNewBalance] = useState<string>("");
  const [newBonus, setNewBonus] = useState<string>("");
  const [activationStatus, setActivationStatus] = useState<"paid" | "unpaid">("unpaid");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const r = await api<UserRow[]>(`/api/admin/users?q=${encodeURIComponent(q)}&limit=80`, { token: adminToken });
      setRows(r);
    } catch (e: any) {
      setError(e?.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(id: number) {
    setDetailLoading(true);
    setError("");
    try {
      const r = await api<UserDetail>(`/api/admin/users/${id}`, { token: adminToken });
      setDetail(r);
      setNewBalance(String(r.user?.balance_ksh ?? ""));
      setNewBonus(String(r.user?.bonus_ksh ?? ""));
      setActivationStatus((r.activation?.status || "unpaid") === "paid" ? "paid" : "unpaid");
    } catch (e: any) {
      setError(e?.message || "Failed to load user details");
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  async function saveBalance() {
    if (!selectedId) return;
    const val = Math.max(0, Math.floor(Number(newBalance || 0)));
    const u = await api<any>(`/api/admin/users/${selectedId}/balance`, {
      method: "POST",
      body: { balance_ksh: val },
      token: adminToken,
    });
    setDetail(detail ? { ...detail, user: { ...detail.user, balance_ksh: u.balance_ksh } } : detail);
    setRows(rows.map((r) => (r.id === selectedId ? { ...r, balance_ksh: u.balance_ksh } : r)));
  }

  async function saveBonus() {
    if (!selectedId) return;
    const val = Math.max(0, Math.floor(Number(newBonus || 0)));
    const u = await api<any>(`/api/admin/users/${selectedId}/bonus`, {
      method: "POST",
      body: { bonus_ksh: val },
      token: adminToken,
    });
    setDetail(detail ? { ...detail, user: { ...detail.user, bonus_ksh: u.bonus_ksh } } : detail);
    setRows(rows.map((r) => (r.id === selectedId ? { ...r, bonus_ksh: u.bonus_ksh } : r)));
  }

  async function saveActivation() {
    if (!selectedId) return;
    const a = await api<any>(`/api/admin/users/${selectedId}/activation`, {
      method: "POST",
      body: { status: activationStatus },
      token: adminToken,
    });
    setDetail(detail ? { ...detail, activation: a } : detail);
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <PrismText as="h1" className="text-4xl font-black tracking-wide">Users</PrismText>
          <div className="mt-1 text-sm sg-muted">
            Search accounts, review activity, and adjust operational fields (balance, bonus, activation). All changes are audited.
          </div>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="p-4 lg:col-span-1">
          <div className="flex items-center justify-between gap-2">
            <div className="font-extrabold">Directory</div>
            <Badge>{rows.length}</Badge>
          </div>
          <div className="mt-3 flex gap-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search username or email" />
            <SoftButton onClick={load} disabled={loading}>{loading ? "..." : "Search"}</SoftButton>
          </div>

          <div className="mt-3 max-h-[520px] overflow-auto pr-1">
            {rows.map((u) => (
              <button
                key={u.id}
                onClick={() => setSelectedId(u.id)}
                className={
                  "w-full text-left rounded-xl border px-3 py-3 mb-2 transition " +
                  (selectedId === u.id
                    ? "bg-[color:var(--accent)] text-black border-white/10"
                    : "bg-white/5 border-white/10 hover:bg-white/10")
                }
              >
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{u.username}</div>
                  <div className="text-xs">#{u.id}</div>
                </div>
                <div className={"text-xs mt-1 " + (selectedId === u.id ? "text-black/70" : "sg-muted")}>{u.email}</div>
                <div className={"text-xs mt-1 " + (selectedId === u.id ? "text-black/70" : "sg-muted")}>
                  Balance: KSH {Number(u.balance_ksh || 0).toLocaleString()} • Bonus: KSH {Number(u.bonus_ksh || 0).toLocaleString()}
                </div>
              </button>
            ))}
          </div>
        </Card>

        <Card className="p-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="font-extrabold">User Detail</div>
            {detail?.user ? <Badge>#{detail.user.id}</Badge> : <Badge>none selected</Badge>}
          </div>

          {!selectedId ? (
            <div className="mt-4 text-sm sg-muted">Select a user to view details.</div>
          ) : detailLoading ? (
            <div className="mt-4 text-sm sg-muted">Loading...</div>
          ) : detail ? (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="text-xs sg-muted">Identity</div>
                  <div className="font-semibold">{detail.user.username}</div>
                  <div className="text-xs sg-muted">{detail.user.email}</div>
                </div>
                <div>
                  <div className="text-xs sg-muted">Created</div>
                  <div className="text-sm">{detail.user.created_at}</div>
                  <div className="text-xs sg-muted">Referral: {detail.user.referral_code || "—"}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <div className="text-xs sg-muted mb-1">Balance (KSH)</div>
                  <Input value={newBalance} onChange={(e) => setNewBalance(e.target.value)} />
                  <div className="mt-2"><PrismButton onClick={saveBalance}>Set Balance</PrismButton></div>
                </div>
                <div>
                  <div className="text-xs sg-muted mb-1">Bonus (KSH)</div>
                  <Input value={newBonus} onChange={(e) => setNewBonus(e.target.value)} />
                  <div className="mt-2"><PrismButton onClick={saveBonus}>Set Bonus</PrismButton></div>
                </div>
                <div>
                  <div className="text-xs sg-muted mb-1">Activation</div>
                  <select
                    value={activationStatus}
                    onChange={(e) => setActivationStatus(e.target.value as any)}
                    className="w-full rounded-xl bg-black/35 border border-white/10 px-4 py-3 text-[14px] text-white outline-none focus:ring-2 focus:ring-[color:var(--accent)]/20 focus:border-[color:var(--accent)]/55"
                  >
                    <option value="unpaid">unpaid</option>
                    <option value="paid">paid</option>
                  </select>
                  <div className="mt-2"><PrismButton onClick={saveActivation}>Apply Activation</PrismButton></div>
                  <div className="mt-1 text-xs sg-muted">
                    Current: {detail.activation?.status || "unpaid"} ({detail.activation?.paid_at || "—"})
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-extrabold">Completions</div>
                    <Badge>{detail.completions?.n || 0}</Badge>
                  </div>
                  <div className="mt-2 text-sm">
                    Total earned (from tasks): <b>KSH {Number(detail.completions?.sum || 0).toLocaleString()}</b>
                  </div>
                  <div className="mt-2 text-xs sg-muted">
                    Note: withdrawals may not reflect earned sum if balance has been adjusted or activation payments applied.
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-extrabold">Recent Withdrawals</div>
                    <Badge>{detail.withdrawals?.length || 0}</Badge>
                  </div>
                  <div className="mt-3 overflow-auto">
                    <table className="min-w-[520px] w-full text-sm">
                      <thead className="text-xs sg-muted">
                        <tr>
                          <th className="text-left py-2">ID</th>
                          <th className="text-left py-2">Amount</th>
                          <th className="text-left py-2">Status</th>
                          <th className="text-left py-2">Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(detail.withdrawals || []).map((w: any) => (
                          <tr key={w.id} className="border-t border-white/10">
                            <td className="py-2">#{w.id}</td>
                            <td className="py-2">KSH {Number(w.amount_ksh || 0).toLocaleString()}</td>
                            <td className="py-2"><Badge>{w.status}</Badge></td>
                            <td className="py-2 text-xs sg-muted">{w.created_at}</td>
                          </tr>
                        ))}
                        {detail.withdrawals?.length === 0 ? (
                          <tr><td colSpan={4} className="py-4 sg-muted">No withdrawals yet.</td></tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
