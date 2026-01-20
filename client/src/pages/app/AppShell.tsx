import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../state/auth";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";

export default function AppShell() {
  const { logout } = useAuth();
  const nav = useNavigate();

  const [balance, setBalance] = useState<number>(0);
  const [username, setUsername] = useState<string>("");

  async function loadMe() {
    const me = await api<any>("/me");
    setBalance(Number(me.balance_ksh || 0));
    setUsername(me.username || "");
  }

  useEffect(() => {
    loadMe().catch(() => {});
  }, []);

  function onLogout() {
    logout();
    nav("/login");
  }

  return (
    <div className="min-h-screen text-white">
      {/* topbar */}
      <div className="sg-panel-strong border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-[color:var(--accent)] text-black flex items-center justify-center font-black shadow-[0_18px_55px_rgba(0,0,0,0.45)]">
              S
            </div>
            <div className="leading-tight">
              <div className="font-extrabold tracking-wide">SYNTHGRAPHIX</div>
              <div className="text-xs sg-muted">Business Platform</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-sm">
              Balance: <b className="text-white">KSH {balance.toFixed(2)}</b>
            </div>

            <div className="hidden sm:block text-sm sg-muted">
              Hi, <b>{username}</b>
            </div>

            <button
              onClick={onLogout}
              className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-semibold"
            >
              Logout
            </button>
          </div>
        </div>

        {/* nav */}
        <div className="max-w-6xl mx-auto px-4 pb-3 flex flex-wrap gap-2">
          {[
            ["Home", "/app"],
            ["Tasks Center", "/app/tasks"],
            ["Analytics", "/app/analytics"],
            ["History", "/app/history"],
            ["Withdrawal", "/app/withdraw"],
            ["Account", "/app/account"],
            ["Support", "/app/support"],
            ["Settings", "/app/settings"],
          ].map(([label, to]) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/app"}
              className={({ isActive }) =>
                "px-4 py-2 rounded-xl text-sm font-semibold border transition " +
                (isActive
                  ? "bg-[color:var(--accent)] text-black border-white/10"
                  : "bg-white/5 text-white/80 border-white/10 hover:bg-white/10")
              }
            >
              {label}
            </NavLink>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <Outlet context={{ refreshBalance: loadMe }} />
      </div>
    </div>
  );
}
