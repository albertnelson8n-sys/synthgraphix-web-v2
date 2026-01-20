import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { Badge, Card, PrismButton, PrismText, SoftButton } from "../../components/ui";

type WithdrawRow = {
  id: number;
  created_at: string;
  amount_ksh: number;
  phone_number?: string | null;
  method: string;
  status: string;
};

type Activation = {
  fee_ksh: number;
  status: "unpaid" | "pending" | "paid";
  paid_ksh: number;
  paid_at: string | null;
  balance_ksh: number;
  provider?: string | null;
  provider_status?: string | null;
};

function fmtKsh(n: number) {
  try {
    return new Intl.NumberFormat("en-KE").format(n);
  } catch {
    return String(n);
  }
}

export default function Withdraw() {
  const [amount, setAmount] = useState<string>("");
  const [method, setMethod] = useState<string>("M-Pesa");
  const [phone, setPhone] = useState<string>("");

  const [history, setHistory] = useState<WithdrawRow[]>([]);
  const [act, setAct] = useState<Activation | null>(null);

  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingAct, setLoadingAct] = useState(false);

  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const slides = useMemo(
    () => [
      {
        tag: "WITHDRAWALS",
        title: "PRISM PAYOUTS",
        subtitle:
          "Withdraw earnings with clear status tracking. Activation unlocks processing and helps protect the platform from abuse.",
      },
      {
        tag: "SECURITY",
        title: "ACCOUNT VERIFIED FLOW",
        subtitle:
          "A one-time activation fee unlocks withdrawals. Requests are logged and tied to your identity and device fingerprints.",
      },
      {
        tag: "MOBILE MONEY",
        title: "FAST MOBILE CASHOUT",
        subtitle:
          "Request cashout to M-Pesa or Airtel Money. Always confirm your payment number before submitting.",
      },
    ],
    []
  );

  const [slideIdx, setSlideIdx] = useState(0);

  useEffect(() => {
    const t = window.setInterval(() => setSlideIdx((i) => (i + 1) % slides.length), 7000);
    return () => window.clearInterval(t);
  }, [slides.length]);

  function flashOk(text: string) {
    setMsg(text);
    setErr("");
    window.setTimeout(() => setMsg(""), 3500);
  }
  function flashErr(text: string) {
    setErr(text);
    setMsg("");
  }

  async function loadHistory() {
    setLoadingHistory(true);
    setErr("");
    try {
      const rows = await api<WithdrawRow[]>("/withdrawals");
      setHistory(Array.isArray(rows) ? rows : []);
    } catch (e: any) {
      setHistory([]);
      flashErr(e?.message || "Failed to load withdrawal history");
    } finally {
      setLoadingHistory(false);
    }
  }

  async function loadActivation() {
    setLoadingAct(true);
    try {
      const a = await api<Activation>("/activation");
      setAct(a);
    } catch {
      // non-fatal
      setAct(null);
    } finally {
      setLoadingAct(false);
    }
  }

  async function payActivation() {
    setLoading(true);
    setErr("");
    setMsg("");
    try {
      const res = await api<any>("/activation/initiate", { method: "POST" });
      if (res?.redirect_url) {
        // Redirect user to Pesapal checkout
        window.location.href = String(res.redirect_url);
        return;
      }
      await loadActivation();
      flashOk("Activation already completed.");
    } catch (e: any) {
      flashErr(e?.message || "Activation failed");
    } finally {
      setLoading(false);
    }
  }

  async function submitWithdraw() {
    setLoading(true);
    setMsg("");
    setErr("");
    try {
      const a = Math.floor(Number(amount || 0));
      const p = phone.trim();

      if (!Number.isFinite(a) || a <= 0) throw new Error("Enter a valid amount");
      if (p.length < 8) throw new Error("Enter a valid phone number");

      await api("/withdrawals", {
        method: "POST",
        body: {
          amount: a,
          phone_number: p,
          method,
        },
      });

      flashOk("Withdrawal request submitted");
      setAmount("");
      await loadHistory();
      await loadActivation();
    } catch (e: any) {
      flashErr(e?.message || "Submit failed");
      await loadActivation();
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadHistory();
    loadActivation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canSubmit = useMemo(() => {
    const a = Number(amount || 0);
    return Number.isFinite(a) && a > 0 && phone.trim().length >= 8 && !loading;
  }, [amount, phone, loading]);

  const active = slides[slideIdx];
  const activationLocked = act && act.status !== "paid";

  return (
    <div className="w-full space-y-6">
      <div className="rounded-[28px] overflow-hidden border border-white/10 sg-shadow-3d">
        <div className="relative p-6 sm:p-8 md:p-10 sg-prism-spot">
          <div className="flex items-center gap-3">
            <Badge className="tracking-[0.22em]">{active.tag}</Badge>
            <div className="ml-auto flex items-center gap-2">
              {slides.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setSlideIdx(i)}
                  className={`h-2.5 rounded-full transition-all ${i === slideIdx ? "w-10 bg-white/90" : "w-6 bg-white/25 hover:bg-white/35"}`}
                  aria-label={`Slide ${i + 1}`}
                  type="button"
                />
              ))}
            </div>
          </div>

          <div className="mt-5 max-w-[900px]">
            <PrismText as="div" className="text-[30px] sm:text-[44px] md:text-[58px]">
              {active.title}
            </PrismText>
            <div className="mt-3 text-white/75 max-w-[70ch]">{active.subtitle}</div>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card className="p-4">
              <div className="sg-muted text-xs">Processing</div>
              <div className="mt-1 font-extrabold">Queued & verified</div>
              <div className="mt-2 text-sm sg-muted">Status updates appear in your history.</div>
            </Card>
            <Card className="p-4">
              <div className="sg-muted text-xs">Activation</div>
              <div className="mt-1 font-extrabold">KES 100 (one time)</div>
              <div className="mt-2 text-sm sg-muted">Paid externally via Pesapal (not deducted from your in-app balance).</div>
            </Card>
            <Card className="p-4">
              <div className="sg-muted text-xs">Methods</div>
              <div className="mt-1 font-extrabold">M-Pesa / Airtel</div>
              <div className="mt-2 text-sm sg-muted">Make sure your number is correct.</div>
            </Card>
          </div>
        </div>
      </div>

      {(err || msg) && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${err ? "border-red-500/30 bg-red-500/10 text-red-200" : "border-[color:var(--accent)]/30 bg-white/5 text-white"}`}
        >
          {err || msg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-extrabold">Withdrawal Access</div>
                <div className="sg-muted mt-1 text-sm">Activation is required before a withdrawal can be processed.</div>
              </div>
              <div className="text-right">
                <div className="text-xs sg-muted">Status</div>
                <div className="mt-1">
                  {loadingAct ? (
                    <Badge>Loading…</Badge>
                  ) : act ? (
                    <Badge
                      className={act.status === "paid" ? "border-[color:var(--accent)]/30" : "border-white/10"}
                    >
                      {act.status === "paid" ? "Activated" : act.status === "pending" ? "Pending" : "Not active"}
                    </Badge>
                  ) : (
                    <Badge>Unknown</Badge>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="sg-muted text-xs">Activation Fee</div>
                <div className="mt-1 font-extrabold">KES {act ? fmtKsh(act.fee_ksh) : "100"}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="sg-muted text-xs">Wallet Balance</div>
                <div className="mt-1 font-extrabold">KES {act ? fmtKsh(act.balance_ksh) : "—"}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="sg-muted text-xs">Paid</div>
                <div className="mt-1 font-extrabold">KES {act ? fmtKsh(act.paid_ksh || 0) : "0"}</div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <PrismButton
                onClick={payActivation}
                disabled={loading || !act || act.status === "paid"}
                className="w-auto"
              >
                Pay Activation (KES {act ? fmtKsh(act.fee_ksh) : "100"})
              </PrismButton>
              <SoftButton onClick={() => loadActivation()} className="w-auto">
                Refresh
              </SoftButton>
              {act && act.status !== "paid" ? (
                <div className="text-sm sg-muted">
                  Payment is processed externally via Pesapal. After paying, click Refresh to update your status.
                </div>
              ) : null}
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <div className="text-lg font-extrabold">Request Withdrawal</div>
            <div className="sg-muted mt-1 text-sm">Submit a cashout request once your account is activated.</div>

            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <div className="text-xs sg-muted mb-1">Withdrawal Amount (KES)</div>
                <input
                  className="w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-white outline-none focus:border-[color:var(--accent)]/55 focus:ring-2 focus:ring-[color:var(--accent)]/15"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="e.g. 500"
                  inputMode="numeric"
                />
              </div>

              <div>
                <div className="text-xs sg-muted mb-1">Method</div>
                <select
                  className="w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-white outline-none focus:border-[color:var(--accent)]/55"
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                >
                  <option>M-Pesa</option>
                  <option>Airtel Money</option>
                </select>
              </div>

              <div>
                <div className="text-xs sg-muted mb-1">Payment Number</div>
                <input
                  className="w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-white outline-none focus:border-[color:var(--accent)]/55"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="07xx xxx xxx"
                  inputMode="tel"
                />
              </div>

              <div className="md:col-span-2 flex flex-wrap gap-3 items-center">
                <PrismButton onClick={submitWithdraw} disabled={!canSubmit || activationLocked} className="w-auto">
                  {activationLocked ? "Activate to Withdraw" : loading ? "Submitting…" : "Submit Withdrawal"}
                </PrismButton>
                <SoftButton className="w-auto" onClick={loadHistory} disabled={loadingHistory}>
                  {loadingHistory ? "Loading…" : "Reload History"}
                </SoftButton>
                {activationLocked ? (
                  <div className="text-sm sg-muted">Activation required before withdrawals can be processed.</div>
                ) : null}
              </div>
            </div>
          </Card>
        </div>

        <Card className="p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-extrabold">History</div>
              <div className="sg-muted mt-1 text-sm">Latest 50 withdrawal requests.</div>
            </div>
            <Badge>{history.length}</Badge>
          </div>

          <div className="mt-4 space-y-3 max-h-[520px] overflow-auto pr-1">
            {loadingHistory ? (
              <div className="sg-muted">Loading…</div>
            ) : history.length === 0 ? (
              <div className="sg-muted">No requests yet.</div>
            ) : (
              history.map((r) => (
                <div key={r.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-extrabold">KES {fmtKsh(r.amount_ksh)}</div>
                      <div className="mt-1 text-xs sg-muted">
                        {r.method} • {r.phone_number || "—"}
                      </div>
                    </div>
                    <Badge className={(r.status || "").toLowerCase() === "pending" ? "" : "border-[color:var(--accent)]/35"}>
                      {r.status}
                    </Badge>
                  </div>
                  <div className="mt-3 text-xs sg-muted">{r.created_at}</div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
