import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PrismButton, Input, Glass, PrismText, Badge } from "../../components/ui";
import { api } from "../../lib/api";
import { useAdminAuth } from "../../state/adminAuth";

export default function AdminLogin() {
  const nav = useNavigate();
  const { adminToken, setAdminToken } = useAdminAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (adminToken) nav("/admin", { replace: true });
  }, [adminToken, nav]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const r = await api<any>("/api/admin/login", {
        method: "POST",
        body: { email, password },
        token: "",
      });
      setAdminToken(r.token);
      nav("/admin", { replace: true });
    } catch (err: any) {
      setError(err?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen text-white flex items-center justify-center px-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <PrismText as="h1" className="text-4xl font-black tracking-wide">
            Admin Console
          </PrismText>
          <div className="mt-2 text-sm sg-muted">
            Secure operations workspace for oversight, payouts, and configuration.
          </div>
        </div>

        <Glass className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="font-extrabold">Sign in</div>
              <div className="text-xs sg-muted">Use your administrator email and password.</div>
            </div>
            <Badge>Restricted</Badge>
          </div>

          {error ? (
            <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <div className="text-xs sg-muted mb-1">Admin Email</div>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@domain.com" />
            </div>
            <div>
              <div className="text-xs sg-muted mb-1">Password</div>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
            <PrismButton disabled={loading} type="submit">
              {loading ? "Signing in..." : "Login"}
            </PrismButton>
          </form>

          <div className="mt-5 text-xs sg-muted leading-relaxed">
            Initial setup: configure ADMIN_EMAIL/ADMIN_PASSWORD in the server .env, or set ADMIN_SETUP_KEY and call
            the one-time bootstrap endpoint.
          </div>
        </Glass>
      </div>
    </div>
  );
}
