import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";

type TaskRow = {
  id: number;
  type: string;
  category: string;
  title: string;
  prompt: string;
  media_url: string | null;
  reward_ksh: number;
  complexity: number;
  completed: number | boolean;
  answer_text: string | null;
};

type TasksResp = {
  day_key: string;
  remaining: number;
  balance_ksh: number;
  tasks: TaskRow[];
};

type HistoryRow = {
  id: number;
  created_at: string;
  reward_ksh: number;
  title: string;
  type: string;
};

function inferMediaKind(task: TaskRow): "audio" | "video" | "image" | "unknown" {
  const t = (task.type || task.category || "").toLowerCase();
  const url = (task.media_url || "").toLowerCase();

  if (t.includes("audio") || url.match(/\.(mp3|ogg|wav|m4a)(\?|$)/)) return "audio";
  if (t.includes("video") || url.match(/\.(mp4|webm|mov|ogv)(\?|$)/)) return "video";
  if (t.includes("image") || url.match(/\.(jpg|jpeg|png|webp|gif|svg)(\?|$)/)) return "image";
  return "unknown";
}

function parseOptions(prompt: string): string[] {
  const p = (prompt || "").replace(/\r\n/g, "\n");
  const idx = p.toLowerCase().lastIndexOf("options:");
  if (idx === -1) return [];
  const tail = p.slice(idx + "options:".length).trim();
  if (!tail) return [];
  // Split on option markers like "A)" "B)" or commas.
  const normalized = tail.replace(/\s+/g, " ").trim();
  const chunks = normalized.split(/(?=[A-Z]\)\s)|,\s*/g).map((s) => s.trim()).filter(Boolean);
  // Clean up accidental single-letter chunks
  const out: string[] = [];
  for (const c of chunks) {
    if (c.length <= 1) continue;
    out.push(c);
  }
  return out.slice(0, 8);
}

export default function Tasks() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const [data, setData] = useState<TasksResp | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [inputs, setInputs] = useState<Record<number, string>>({});
  const [submittingId, setSubmittingId] = useState<number | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("All");

  const tasks = useMemo(() => {
    let list = data?.tasks || [];
    if (categoryFilter !== "All") list = list.filter((t) => t.category === categoryFilter);
    return list;
  }, [data?.tasks, categoryFilter]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const t of data?.tasks || []) {
      if (t.category) set.add(t.category);
    }
    return ["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [data?.tasks]);

  async function loadAll() {
    setErr("");
    setMsg("");
    setLoading(true);
    try {
      const t = await api<TasksResp>("/tasks");
      setData(t);

      // initialize answer boxes (don’t wipe if user already typed)
      setInputs((prev) => {
        const next = { ...prev };
        for (const row of t.tasks) {
          if (next[row.id] === undefined) next[row.id] = row.answer_text || "";
        }
        return next;
      });

      const h = await api<HistoryRow[]>("/history");
      setHistory(h);
      // best-effort: persist balance for header components that read localStorage
      localStorage.setItem("balance_ksh", String(t.balance_ksh || 0));
    } catch (e: any) {
      setErr(e.message || "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // refresh every 60s so midnight reset appears without reload
    const i = window.setInterval(loadAll, 60000);
    return () => window.clearInterval(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submitTask(taskId: number) {
    setSubmittingId(taskId);
    setErr("");
    setMsg("");
    try {
      const answer_text = (inputs[taskId] || "").trim();
      if (!answer_text) throw new Error("Please enter your answer before submitting.");

      const res = await api<{ ok: true; balance_ksh: number; remaining: number }>(`/tasks/${taskId}/complete`, {
        method: "POST",
        body: { answer_text },
      });

      localStorage.setItem("balance_ksh", String(res.balance_ksh || 0));
      setMsg("Task submitted successfully ✓");

      // reload tasks + history + remaining + balance
      await loadAll();
    } catch (e: any) {
      setErr(e.message || "Submission failed");
    } finally {
      setSubmittingId(null);
      setTimeout(() => setMsg(""), 3500);
    }
  }

  return (
    <div className="px-5 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-3xl font-extrabold text-white">Tasks Center</div>
          <div className="text-white/60 mt-1 text-sm">
            You can complete up to <span className="text-white font-semibold">10 tasks/day</span>. Resets at midnight (Nairobi). No duplicate task types per day.
          </div>
        </div>

        <div className="flex gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 min-w-[200px]">
            <div className="text-white/50 text-xs">Category</div>
            <select
              className="mt-1 w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-white text-sm outline-none focus:ring-2 focus:ring-[color:var(--accent)]/15 focus:border-[color:var(--accent)]/40"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-right min-w-[160px]">
            <div className="text-white/50 text-xs">Today ({data?.day_key || "—"})</div>
            <div className="text-white font-extrabold text-lg">Remaining: {data?.remaining ?? "—"}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-right min-w-[140px]">
            <div className="text-white/50 text-xs">Balance</div>
            <div className="text-white font-extrabold text-lg">KSH {data?.balance_ksh ?? 0}</div>
          </div>
        </div>
      </div>

      {err && (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-200 text-sm">
          {err}
        </div>
      )}
      {msg && (
        <div className="mt-4 rounded-xl border border-[color:var(--accent)]/30 bg-[color:var(--accent)]/10 px-4 py-3 text-white text-sm">
          {msg}
        </div>
      )}

      {loading ? (
        <div className="mt-8 text-white/60">Loading tasks…</div>
      ) : (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {tasks.map((t) => {
            const done = !!t.completed;
            const kind = inferMediaKind(t);
            const media = t.media_url || "";

            return (
              <div key={t.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-white font-bold">{t.title}</div>
                    <div className="text-white/60 text-xs mt-0.5">
                      <span className="inline-flex items-center gap-2">
                        <span>{t.type}</span>
                        <span className="h-1 w-1 rounded-full bg-white/40" />
                        <span className="px-2 py-0.5 rounded-full bg-white/10 border border-white/10">
                          {t.category}
                        </span>
                        <span className="h-1 w-1 rounded-full bg-white/40" />
                        <span>
                          Reward: <span className="text-white font-semibold">KSH {t.reward_ksh}</span>
                        </span>
                      </span>
                    </div>
                  </div>
                  <div className={`text-xs px-2 py-1 rounded-full ${done ? "bg-[color:var(--accent)]/15 text-white" : "bg-white/10 text-white/70"}`}>
                    {done ? "Completed" : "Pending"}
                  </div>
                </div>

                <div className="mt-3 text-white/70 text-sm leading-relaxed">{t.prompt}</div>

                {media ? (
                  <div className="mt-3">
                    {kind === "image" && (
                      <img
                        src={media}
                        alt={t.title}
                        className="w-full h-[140px] object-cover rounded-xl border border-white/10"
                        loading="lazy"
                        onError={(e) => ((e.currentTarget.style.display = "none"))}
                      />
                    )}
                    {kind === "audio" && (
                      <audio controls className="w-full">
                        <source src={media} />
                      </audio>
                    )}
                    {kind === "video" && (
                      <video controls className="w-full rounded-xl border border-white/10" preload="metadata">
                        <source src={media} />
                      </video>
                    )}
                  </div>
                ) : null}

                {(() => {
                  const opts = parseOptions(t.prompt);
                  if (!opts.length || done) return null;
                  return (
                    <div className="mt-3">
                      <div className="text-white/50 text-xs mb-2">Quick options</div>
                      <div className="flex flex-wrap gap-2">
                        {opts.map((o) => (
                          <button
                            key={o}
                            type="button"
                            onClick={() =>
                              setInputs((p) => {
                                const prev = (p[t.id] || "").trim();
                                const next = prev ? `${prev}\n${o}` : o;
                                return { ...p, [t.id]: next };
                              })
                            }
                            className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/90 text-xs font-semibold"
                          >
                            {o}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                <textarea
                  className="mt-3 w-full rounded-xl bg-black/30 border border-white/10 p-3 text-white text-sm outline-none focus:ring-2 focus:ring-[color:var(--accent)]/15 focus:border-[color:var(--accent)]/40"
                  placeholder={t.type.includes("image") ? "Write your caption/tags here…" : "Type your transcription/answer here…"}
                  rows={3}
                  value={inputs[t.id] || ""}
                  disabled={done}
                  onChange={(e) => setInputs((p) => ({ ...p, [t.id]: e.target.value }))}
                />

                <button
                  className={`mt-3 w-full rounded-xl px-4 py-2.5 text-sm font-semibold border border-white/10 ${
                    done
                      ? "bg-white/10 text-white/40 cursor-not-allowed"
                      : "bg-[color:var(--accent)] text-black hover:brightness-110"
                  }`}
                  disabled={done || submittingId === t.id}
                  onClick={() => submitTask(t.id)}
                >
                  {done ? "Completed" : submittingId === t.id ? "Submitting…" : "Submit Task"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="text-white font-bold">Task Completion History</div>
        <div className="text-white/60 text-sm mt-1">Your most recent completions (with payout amounts).</div>

        <div className="mt-4 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-white/60">
                <th className="text-left py-2 pr-3">Date</th>
                <th className="text-left py-2 pr-3">Task</th>
                <th className="text-left py-2 pr-3">Type</th>
                <th className="text-right py-2">Reward</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-4 text-white/50">No completions yet.</td>
                </tr>
              ) : (
                history.map((h) => (
                  <tr key={h.id} className="border-t border-white/10">
                    <td className="py-2 pr-3 text-white/70">{String(h.created_at).slice(0, 19).replace("T", " ")}</td>
                    <td className="py-2 pr-3 text-white">{h.title}</td>
                    <td className="py-2 pr-3 text-white/70">{h.type}</td>
                    <td className="py-2 text-right text-white font-semibold">KSH {h.reward_ksh}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
