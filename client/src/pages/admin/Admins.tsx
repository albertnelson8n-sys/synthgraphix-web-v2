import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useAdminAuth } from "../../state/adminAuth";
import { Card, Input, PrismButton, Badge, SoftButton, PrismText } from "../../components/ui";

type AdminRow = {
  id: number;
  username: string;
  email: string;
  role: string;
  is_active: number;
  created_at: string;
  last_login_at: string | null;
};

export default function Admins() {
  const { adminToken } = useAdminAuth();

  const [rows, setRows] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "superadmin">("admin");
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const r = await api<AdminRow[]>("/api/admin/admins", { token: adminToken });
      setRows(r);
    } catch (e: any) {
      setError(e?.message || "Failed to load admins");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createAdmin(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError("");
    try {
      const created = await api<AdminRow>("/api/admin/admins", {
        method: "POST",
        body: { username, email, password, role },
        token: adminToken,
      });
      setRows([created, ...rows]);
      setUsername("");
      setEmail("");
      setPassword("");
      setRole("admin");
    } catch (e: any) {
      setError(e?.message || "Create failed");
    } finally {
      setCreating(false);
    }
  }

  async function toggle(id: number, is_active: boolean) {
    try {
      const updated = await api<AdminRow>(`/api/admin/admins/${id}/status`, {
        method: "PATCH",
        body: { is_active },
        token: adminToken,
      });
      setRows(rows.map((r) => (r.id === id ? updated : r)));
    } catch (e: any) {
      setError(e?.message || "Update failed");
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <PrismText as="h1" className="text-4xl font-black tracking-wide">Admins</PrismText>
          <div className="mt-1 text-sm sg-muted">
            Create and manage administrator accounts. For security, only <b>superadmin</b> may add or disable admins.
          </div>
        </div>
        <SoftButton onClick={load} disabled={loading}>{loading ? "Refreshing..." : "Refresh"}</SoftButton>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="font-extrabold">Add Admin</div>
          <div className="mt-1 text-xs sg-muted">
            Recommended: create at least two superadmins for redundancy, and rotate passwords after deployment.
          </div>
          <form onSubmit={createAdmin} className="mt-4 space-y-3">
            <div>
              <div className="text-xs sg-muted mb-1">Username</div>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g., ops.lead" />
            </div>
            <div>
              <div className="text-xs sg-muted mb-1">Email</div>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@domain.com" />
            </div>
            <div>
              <div className="text-xs sg-muted mb-1">Password (min 8 chars)</div>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Strong password" />
            </div>
            <div>
              <div className="text-xs sg-muted mb-1">Role</div>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as any)}
                className="w-full rounded-xl bg-black/35 border border-white/10 px-4 py-3 text-[14px] text-white outline-none focus:ring-2 focus:ring-[color:var(--accent)]/20 focus:border-[color:var(--accent)]/55"
              >
                <option value="admin">admin</option>
                <option value="superadmin">superadmin</option>
              </select>
            </div>
            <PrismButton disabled={creating} type="submit">{creating ? "Creating..." : "Create Admin"}</PrismButton>
          </form>
        </Card>

        <Card className="p-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="font-extrabold">Admin Accounts</div>
            <Badge>{rows.length} total</Badge>
          </div>
          <div className="mt-3 overflow-auto">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="text-xs sg-muted">
                <tr>
                  <th className="text-left py-2">ID</th>
                  <th className="text-left py-2">Identity</th>
                  <th className="text-left py-2">Role</th>
                  <th className="text-left py-2">Status</th>
                  <th className="text-left py-2">Created</th>
                  <th className="text-left py-2">Last Login</th>
                  <th className="text-left py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id} className="border-t border-white/10">
                    <td className="py-2">#{a.id}</td>
                    <td className="py-2">
                      <div className="font-semibold">{a.username}</div>
                      <div className="text-xs sg-muted">{a.email}</div>
                    </td>
                    <td className="py-2"><Badge>{a.role}</Badge></td>
                    <td className="py-2">
                      {a.is_active ? <Badge>active</Badge> : <Badge className="opacity-60">disabled</Badge>}
                    </td>
                    <td className="py-2 text-xs sg-muted">{a.created_at}</td>
                    <td className="py-2 text-xs sg-muted">{a.last_login_at || "—"}</td>
                    <td className="py-2">
                      <div className="flex gap-2">
                        {a.is_active ? (
                          <SoftButton onClick={() => toggle(a.id, false)}>Disable</SoftButton>
                        ) : (
                          <SoftButton onClick={() => toggle(a.id, true)}>Enable</SoftButton>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-2 text-xs sg-muted">
            Policy: keep at least one superadmin enabled. Disabling an account immediately blocks login. Actions are recorded in admin audit logs.
          </div>
        </Card>
      </div>
    </div>
  );
}
