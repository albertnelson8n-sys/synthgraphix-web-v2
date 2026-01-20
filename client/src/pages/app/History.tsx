import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { Card, SoftButton } from "../../components/ui";

type HistoryRow = {
  id: number;
  created_at: string;
  reward_ksh: number;
  title: string;
  type: string;
};

function toCsv(rows: HistoryRow[]) {
  const header = ["id","created_at","reward_ksh","type","title"];
  const esc = (v: any) => {
    const s = String(v ?? "");
    if (/[",\n]/.test(s)) return '"' + s.replaceAll('"','""') + '"';
    return s;
  };
  const lines = [header.join(",")];
  for (const r of rows) lines.push([r.id, r.created_at, r.reward_ksh, r.type, r.title].map(esc).join(","));
  return lines.join("\n");
}

export default function History() {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [q, setQ] = useState<string>("");
  const [err, setErr] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    (async () => {
      setErr("");
      setLoading(true);
      try {
        const h = await api<HistoryRow[]>("/history");
        setRows(Array.isArray(h) ? h : []);
      } catch (e: any) {
        setErr(e?.message || "Failed to load history");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      String(r.title || "").toLowerCase().includes(s) || String(r.type || "").toLowerCase().includes(s)
    );
  }, [rows, q]);

  function downloadCsv() {
    const csv = toCsv(filtered);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `history_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-2xl font-extrabold">History</div>
          <div className="sg-muted mt-1">Your last 50 task completions (server-limited).</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter by title or type…"
            className="w-[280px] max-w-full rounded-xl bg-black/25 border border-white/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--accent)]/15"
          />
          <SoftButton onClick={downloadCsv} className="whitespace-nowrap">
            Export CSV
          </SoftButton>
        </div>
      </div>

      {err ? (
        <div className="rounded-2xl border border-[color:var(--danger)]/35 bg-[color:var(--danger)]/10 px-4 py-3 text-[color:var(--danger)]">
          {err}
        </div>
      ) : null}

      {loading ? (
        <div className="sg-muted">Loading history…</div>
      ) : (
        <Card className="p-4 overflow-hidden">
          <div className="overflow-auto">
            <table className="min-w-[900px] w-full text-sm">
              <thead>
                <tr className="text-left sg-muted">
                  <th className="py-2">Date</th>
                  <th className="py-2">Title</th>
                  <th className="py-2">Type</th>
                  <th className="py-2">Reward</th>
                  <th className="py-2">ID</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 sg-muted">
                      No results.
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => (
                    <tr key={r.id} className="border-t border-white/10">
                      <td className="py-3 sg-muted whitespace-nowrap">{String(r.created_at || "").replace("T", " ")}</td>
                      <td className="py-3 font-semibold">{r.title}</td>
                      <td className="py-3 sg-muted">{r.type}</td>
                      <td className="py-3">
                        <span className="inline-flex items-center rounded-full px-3 py-1 bg-white/5 border border-white/10">
                          KSH {r.reward_ksh}
                        </span>
                      </td>
                      <td className="py-3 sg-muted">#{r.id}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
