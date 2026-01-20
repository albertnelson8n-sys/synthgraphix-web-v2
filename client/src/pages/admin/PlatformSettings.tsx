import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { useAdminAuth } from "../../state/adminAuth";
import Card from "../../ui/Card";
import PrismText from "../../ui/PrismText";
import PrismButton from "../../ui/PrismButton";
import SoftButton from "../../ui/SoftButton";

type SettingRow = {
  key: string;
  value: string;
  updated_at: string;
};

function asInt(v: string, fallback: number) {
  const n = Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

export default function PlatformSettings() {
  const { adminToken, admin } = useAdminAuth();
  const isSuper = admin?.role === "superadmin";

  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const [activationFee, setActivationFee] = useState(100);
  const [tasksPerDay, setTasksPerDay] = useState(10);
  const [referralBonus, setReferralBonus] = useState(100);
  const [minWithdraw, setMinWithdraw] = useState(200);

  const dirty = useMemo(() => {
    return (
      activationFee !== asInt(settings.activation_fee_ksh, 100) ||
      tasksPerDay !== asInt(settings.tasks_per_day, 10) ||
      referralBonus !== asInt(settings.referral_bonus_ksh, 100) ||
      minWithdraw !== asInt(settings.min_withdraw_ksh, 200)
    );
  }, [activationFee, tasksPerDay, referralBonus, minWithdraw, settings]);

  async function load() {
    setLoading(true);
    setErr("");
    setMsg("");
    try {
      const rows = await api<SettingRow[]>("/api/admin/settings", { token: adminToken });
      const map: Record<string, string> = {};
      (rows || []).forEach((r) => {
        map[r.key] = r.value;
      });
      setSettings(map);
      setActivationFee(asInt(map.activation_fee_ksh, 100));
      setTasksPerDay(asInt(map.tasks_per_day, 10));
      setReferralBonus(asInt(map.referral_bonus_ksh, 100));
      setMinWithdraw(asInt(map.min_withdraw_ksh, 200));
    } catch (e: any) {
      setErr(e?.message || "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!isSuper) {
      setErr("Only superadmins can update platform settings.");
      return;
    }
    setLoading(true);
    setErr("");
    setMsg("");
    try {
      const res = await api<any>("/api/admin/settings", {
        token: adminToken,
        method: "POST",
        body: {
          activation_fee_ksh: activationFee,
          tasks_per_day: tasksPerDay,
          referral_bonus_ksh: referralBonus,
          min_withdraw_ksh: minWithdraw,
        },
      });
      const map: Record<string, string> = {};
      (res?.settings || []).forEach((r: any) => {
        map[r.key] = r.value;
      });
      setSettings(map);
      setMsg("Settings saved.");
    } catch (e: any) {
      setErr(e?.message || "Save failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <PrismText as="div" className="text-3xl sm:text-4xl">
            Platform Settings
          </PrismText>
          <div className="sg-muted mt-1 text-sm">
            System-wide controls: activation fee, task issuance, and withdrawal constraints.
          </div>
        </div>
        <div className="flex gap-2">
          <SoftButton onClick={load} disabled={loading} className="w-auto">
            Refresh
          </SoftButton>
          <PrismButton onClick={save} disabled={loading || !dirty || !isSuper} className="w-auto">
            Save
          </PrismButton>
        </div>
      </div>

      {(err || msg) ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${err ? "border-red-500/30 bg-red-500/10 text-red-200" : "border-[color:var(--accent)]/30 bg-white/5 text-white"}`}
        >
          {err || msg}
        </div>
      ) : null}

      <Card className="p-5 sm:p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-xs sg-muted mb-1">Activation fee (KES)</div>
            <input
              value={activationFee}
              onChange={(e) => setActivationFee(Number.parseInt(e.target.value || "0", 10) || 0)}
              inputMode="numeric"
              className="w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-white outline-none focus:border-[color:var(--accent)]/55 focus:ring-2 focus:ring-[color:var(--accent)]/15"
            />
            <div className="mt-1 text-xs sg-muted">Required before withdrawals can be processed.</div>
          </div>

          <div>
            <div className="text-xs sg-muted mb-1">Tasks per user per day</div>
            <input
              value={tasksPerDay}
              onChange={(e) => setTasksPerDay(Number.parseInt(e.target.value || "0", 10) || 0)}
              inputMode="numeric"
              className="w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-white outline-none focus:border-[color:var(--accent)]/55 focus:ring-2 focus:ring-[color:var(--accent)]/15"
            />
            <div className="mt-1 text-xs sg-muted">Daily assignments are randomized across categories.</div>
          </div>

          <div>
            <div className="text-xs sg-muted mb-1">Referral bonus per signup (KES)</div>
            <input
              value={referralBonus}
              onChange={(e) => setReferralBonus(Number.parseInt(e.target.value || "0", 10) || 0)}
              inputMode="numeric"
              className="w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-white outline-none focus:border-[color:var(--accent)]/55 focus:ring-2 focus:ring-[color:var(--accent)]/15"
            />
            <div className="mt-1 text-xs sg-muted">Applied when a referred user registers successfully.</div>
          </div>

          <div>
            <div className="text-xs sg-muted mb-1">Minimum withdrawal (KES)</div>
            <input
              value={minWithdraw}
              onChange={(e) => setMinWithdraw(Number.parseInt(e.target.value || "0", 10) || 0)}
              inputMode="numeric"
              className="w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-white outline-none focus:border-[color:var(--accent)]/55 focus:ring-2 focus:ring-[color:var(--accent)]/15"
            />
            <div className="mt-1 text-xs sg-muted">Requests below this amount are rejected on submit.</div>
          </div>
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <div className="text-lg font-extrabold">Pesapal Configuration Notes</div>
        <div className="sg-muted mt-1 text-sm">
          For activation payments, configure the following environment variables on the server:
        </div>
        <ul className="mt-3 list-disc pl-5 text-sm text-white/80 space-y-1">
          <li><span className="font-semibold">PESAPAL_MODE</span>: sandbox or live</li>
          <li><span className="font-semibold">PESAPAL_CONSUMER_KEY</span> and <span className="font-semibold">PESAPAL_CONSUMER_SECRET</span></li>
          <li><span className="font-semibold">PESAPAL_IPN_ID</span>: register an IPN URL and copy the returned ipn_id</li>
          <li><span className="font-semibold">APP_PUBLIC_URL</span>: public base URL of your API (e.g. https://api.yourdomain.com)</li>
          <li><span className="font-semibold">CLIENT_PUBLIC_URL</span>: public base URL of your frontend (for redirect after payment)</li>
        </ul>
        <div className="mt-3 text-xs sg-muted">
          In local development, IPN and callbacks require a publicly reachable URL (use a tunnel) or test via manual refresh.
        </div>
      </Card>
    </div>
  );
}
