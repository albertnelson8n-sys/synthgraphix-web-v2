import { Navigate, Route, Routes } from "react-router-dom";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import AppShell from "./pages/app/AppShell";
import Home from "./pages/app/Home";
import Tasks from "./pages/app/Tasks";
import Withdraw from "./pages/app/Withdraw";
import Account from "./pages/app/Account";
import Analytics from "./pages/app/Analytics";
import History from "./pages/app/History";
import Support from "./pages/app/Support";
import Settings from "./pages/app/Settings";
import AdminLogin from "./pages/admin/AdminLogin";
import AdminShell from "./pages/admin/AdminShell";
import AdminDashboard from "./pages/admin/Dashboard";
import Admins from "./pages/admin/Admins";
import Users from "./pages/admin/Users";
import Withdrawals from "./pages/admin/Withdrawals";
import Audit from "./pages/admin/Audit";
import PlatformSettings from "./pages/admin/PlatformSettings";
import AdminProfile from "./pages/admin/AdminProfile";
import { useAuth } from "./state/auth";
import WhatsAppFloat from "./components/WhatsAppFloat";

function Protected({ children }: { children: JSX.Element }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function ProtectedAdmin({ children }: { children: JSX.Element }) {
  const adminToken = localStorage.getItem("admin_token") || "";
  if (!adminToken) return <Navigate to="/admin/login" replace />;
  return children;
}

export default function App() {
  return (
    <div>
      <Routes>
        <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route path="/admin/login" element={<AdminLogin />} />
      <Route
        path="/admin"
        element={
          <ProtectedAdmin>
            <AdminShell />
          </ProtectedAdmin>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="admins" element={<Admins />} />
        <Route path="users" element={<Users />} />
        <Route path="withdrawals" element={<Withdrawals />} />
        <Route path="audit" element={<Audit />} />
        <Route path="settings" element={<PlatformSettings />} />
        <Route path="profile" element={<AdminProfile />} />
      </Route>


      <Route
        path="/app"
        element={
          <Protected>
            <AppShell />
          </Protected>
        }
      >
        <Route index element={<Home />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="history" element={<History />} />
        <Route path="withdraw" element={<Withdraw />} />
        <Route path="account" element={<Account />} />
        <Route path="support" element={<Support />} />
        <Route path="settings" element={<Settings />} />
      </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Floating support shortcut (opens WhatsApp externally) */}
      <WhatsAppFloat phone="+14506003193" />
    </div>
  );
}
