import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useMemo } from "react";
import { useAdminAuth } from "../../state/adminAuth";

export default function AdminShell() {
  const { adminToken, adminLogout, admin, refreshAdmin } = useAdminAuth();
  const nav = useNavigate();

  useEffect(() => {
    // Ensure we have a profile loaded (and expire invalid tokens)
    (async () => {
      try {
        await refreshAdmin();
      } catch {
        adminLogout();
        nav("/admin/login", { replace: true });
      }
    })();
  }, [adminToken, refreshAdmin, adminLogout, nav]);

  function onLogout() {
    adminLogout();
    nav("/admin/login");
  }

  const isSuper = admin?.role === "superadmin";
  const links: Array<[string, string, boolean]> = useMemo(() => {
    const base: Array<[string, string, boolean]> = [
      ["Overview", "/admin", true],
      ["Users", "/admin/users", false],
      ["Withdrawals", "/admin/withdrawals", false],
      ["Audit", "/admin/audit", false],
      ["Profile", "/admin/profile", false],
    ];
    if (isSuper) {
      base.splice(1, 0, ["Admins", "/admin/admins", false]);
      base.splice(5, 0, ["Settings", "/admin/settings", false]);
    }
    return base;
  }, [isSuper]);

  return (
    <div className="min-h-screen text-white">
      <div className="sg-panel-strong border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-[color:var(--accent)] text-black flex items-center justify-center font-black shadow-[0_18px_55px_rgba(0,0,0,0.45)]">
              A
            </div>
            <div className="leading-tight">
              <div className="font-extrabold tracking-wide">SYNTHGRAPHIX</div>
              <div className="text-xs sg-muted">Admin Control Board</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-sm sg-muted">
              Signed in as <b className="text-white">{admin?.username || "Admin"}</b> ({admin?.role || "admin"})
            </div>
            <button
              onClick={onLogout}
              className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-semibold"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 pb-3 flex flex-wrap gap-2">
          {links.map(([label, to, isIndex]) => (
            <NavLink
              key={to}
              to={to}
              end={isIndex}
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

      <div className="max-w-7xl mx-auto px-4 py-6">
        <Outlet />
      </div>
    </div>
  );
}
