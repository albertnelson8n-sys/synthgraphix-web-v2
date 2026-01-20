import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { useAdminAuth } from "../../state/adminAuth";
import Card from "../../ui/Card";
import PrismText from "../../ui/PrismText";
import SoftButton from "../../ui/SoftButton";

type AuditRow = {
  id: number;
  created_at: string;
  action: string;
  entity: string;
  entity_id: string | null;
  admin_id: number;
  admin_username: string;
  admin_email: string;
  admin_role: string;
  meta: any;
};

function fmt(dt: string) {
  try {
    return new Date(dt).toLocaleString();
  } catch {
    return dt;
  }
}

export default function Audit() {
  const { adminToken } = useAdminAuth();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const canPrev = offset > 0;
  const canNext = rows.length === limit;

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    p.set("limit", String(limit));
    p.set("offset", String(offset));
    if (q.trim()) p.set("q", q.trim());
    return p.toString();
  }, [q, offset]);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const data = await api<AuditRow[]>(`/api/admin/audit?${queryString}`, { token: adminToken });
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setErr(e?.message || "Failed to load audit");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <PrismText as="div" className="text-3xl sm:text-4xl">
            Audit Trail
          </PrismText>
          <div className="sg-muted mt-1 text-sm">
            Immutable log of sensitive admin actions (created, updated, approved, rejected).
          </div>
        </div>

        <div className="flex gap-2">
          <SoftButton onClick={() => load()} className="w-auto">
            Refresh
          </SoftButton>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex-1">
            <div className="text-xs sg-muted mb-1">Search</div>
            <input
              value={q}
              onChange={(e) => {
                setOffset(0);
                setQ(e.target.value);
              }}
              placeholder="action, entity, admin, id…"
              className="w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-white outline-none focus:border-[color:var(--accent)]/55 focus:ring-2 focus:ring-[color:var(--accent)]/15"
            />
          </div>
          <div className="flex gap-2 md:justify-end">
            <SoftButton
              onClick={() => canPrev && setOffset((o) => Math.max(0, o - limit))}
              disabled={!canPrev || loading}
              className="w-auto"
            >
              Prev
            </SoftButton>
            <SoftButton
              onClick={() => canNext && setOffset((o) => o + limit)}
              disabled={!canNext || loading}
              className="w-auto"
            >
              Next
            </SoftButton>
          </div>
        </div>

        {err ? (
          <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {err}
          </div>
        ) : null}

        <div className="mt-4 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-white/70">
                <th className="py-2 pr-3">When</th>
                <th className="py-2 pr-3">Admin</th>
                <th className="py-2 pr-3">Action</th>
                <th className="py-2 pr-3">Entity</th>
                <th className="py-2 pr-3">Entity ID</th>
                <th className="py-2 pr-3">Meta</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-white/10 align-top">
                  <td className="py-2 pr-3 whitespace-nowrap sg-muted">{fmt(r.created_at)}</td>
                  <td className="py-2 pr-3">
                    <div className="font-semibold">{r.admin_username}</div>
                    <div className="text-xs sg-muted">{r.admin_email} · {r.admin_role}</div>
                  </td>
                  <td className="py-2 pr-3 font-semibold">{r.action}</td>
                  <td className="py-2 pr-3">{r.entity}</td>
                  <td className="py-2 pr-3 sg-muted">{r.entity_id || "—"}</td>
                  <td className="py-2 pr-3">
                    {r.meta ? (
                      <pre className="whitespace-pre-wrap text-xs rounded-xl bg-black/30 border border-white/10 p-2 max-w-[520px]">
                        {typeof r.meta === "string" ? r.meta : JSON.stringify(r.meta, null, 2)}
                      </pre>
                    ) : (
                      <span className="sg-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center sg-muted">
                    No audit entries found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
