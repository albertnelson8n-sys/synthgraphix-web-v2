import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";

type Admin = {
  id: number;
  username: string;
  email: string;
  role: string;
};

type AdminAuthCtx = {
  adminToken: string;
  setAdminToken: (t: string) => void;
  adminLogout: () => void;
  logout: () => void;
  admin: Admin | null;
  refreshAdmin: () => Promise<void>;
};

const Ctx = createContext<AdminAuthCtx | null>(null);

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [adminToken, setAdminTokenState] = useState(localStorage.getItem("admin_token") || "");
  const [admin, setAdmin] = useState<Admin | null>(null);

  const setAdminToken = (t: string) => {
    setAdminTokenState(t);
    localStorage.setItem("admin_token", t);
  };

  const adminLogout = () => {
    setAdminTokenState("");
    localStorage.removeItem("admin_token");
    setAdmin(null);
  };

  const refreshAdmin = async () => {
    if (!adminToken) {
      setAdmin(null);
      return;
    }
    try {
      const me = await api<any>("/api/admin/me", { token: adminToken });
      setAdmin(me ? { id: me.id, username: me.username, email: me.email, role: me.role } : null);
    } catch {
      // Token invalid/expired
      adminLogout();
    }
  };

  useEffect(() => {
    refreshAdmin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminToken]);

  const value = useMemo(
    () => ({ adminToken, setAdminToken, adminLogout, logout: adminLogout, admin, refreshAdmin }),
    [adminToken, admin]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdminAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("AdminAuthProvider missing");
  return v;
}
