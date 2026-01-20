import { useState } from "react";
import { api } from "../../lib/api";
import { useAdminAuth } from "../../state/adminAuth";
import Card from "../../ui/Card";
import PrismText from "../../ui/PrismText";
import PrismButton from "../../ui/PrismButton";

export default function AdminProfile() {
  const { adminToken, admin, logout } = useAdminAuth();
  const [oldPass, setOldPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  async function changePassword() {
    setLoading(true);
    setErr("");
    setMsg("");
    try {
      await api("/api/admin/password", {
        token: adminToken,
        method: "POST",
        body: { old_password: oldPass, new_password: newPass },
      });
      setOldPass("");
      setNewPass("");
      setMsg("Password updated.");
    } catch (e: any) {
      setErr(e?.message || "Update failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <PrismText as="div" className="text-3xl sm:text-4xl">
          Admin Profile
        </PrismText>
        <div className="sg-muted mt-1 text-sm">Security and account controls.</div>
      </div>

      {(err || msg) ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${err ? "border-red-500/30 bg-red-500/10 text-red-200" : "border-[color:var(--accent)]/30 bg-white/5 text-white"}`}
        >
          {err || msg}
        </div>
      ) : null}

      <Card className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-lg font-extrabold">Signed in as</div>
            <div className="mt-1 text-sm text-white/80">
              {admin?.username} · <span className="sg-muted">{admin?.email}</span> · <span className="sg-muted">{admin?.role}</span>
            </div>
          </div>
          <button
            className="text-sm underline text-white/80 hover:text-white"
            onClick={logout}
          >
            Log out
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-xs sg-muted mb-1">Current password</div>
            <input
              type="password"
              value={oldPass}
              onChange={(e) => setOldPass(e.target.value)}
              className="w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-white outline-none focus:border-[color:var(--accent)]/55 focus:ring-2 focus:ring-[color:var(--accent)]/15"
            />
          </div>
          <div>
            <div className="text-xs sg-muted mb-1">New password</div>
            <input
              type="password"
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              className="w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-white outline-none focus:border-[color:var(--accent)]/55 focus:ring-2 focus:ring-[color:var(--accent)]/15"
            />
            <div className="mt-1 text-xs sg-muted">Minimum 8 characters.</div>
          </div>
        </div>

        <div className="mt-4">
          <PrismButton
            onClick={changePassword}
            disabled={loading || oldPass.trim().length < 1 || newPass.trim().length < 8}
            className="w-auto"
          >
            Update Password
          </PrismButton>
        </div>
      </Card>
    </div>
  );
}
