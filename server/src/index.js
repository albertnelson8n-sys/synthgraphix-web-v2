require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { z } = require("zod");

const { initDb, run, get, all } = require("./db");
const { submitOrder, getTransactionStatus } = require("./pesapal");

const app = express();
const allowedOrigins = (process.env.CLIENT_ORIGIN || "").split(",").map(s => s.trim()).filter(Boolean);
app.use(
  cors({
    origin: allowedOrigins.length ? allowedOrigins : true,
    credentials: true,
  })
);

app.use(
  helmet({
    // the client loads media (images/audio/video) from external sources
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(express.json());

const PORT = process.env.PORT || 5175;
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

// Business rule: activation fee is fixed (external payment only)
const ACTIVATION_FEE_KSH = 100;

async function getSetting(key, fallback = null) {
  const row = await get("SELECT value FROM app_settings WHERE key=?", [key]);
  return row?.value ?? fallback;
}
async function getIntSetting(key, fallback) {
  const v = await getSetting(key, null);
  const n = Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

// Basic brute-force protection (especially important for admin auth)
const userLoginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
});
const adminLoginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

function dayKeyNairobi() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || "";
    const m = auth.match(/^Bearer (.+)$/);
    if (!m) return res.status(401).json({ error: "Unauthorized" });
    const token = m[1];
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.id };
    next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
}


// ---------------------------
// Admin auth + RBAC
// ---------------------------
function requireAdmin(req, res, next) {
  try {
    const auth = req.headers.authorization || "";
    const m = auth.match(/^Bearer (.+)$/);
    if (!m) return res.status(401).json({ error: "Unauthorized" });
    const token = m[1];
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload || payload.scope !== "admin" || !payload.admin_id) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    req.admin = { id: payload.admin_id, role: payload.role || "admin" };
    next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
}

function requireSuperAdmin(req, res, next) {
  if (!req.admin) return res.status(401).json({ error: "Unauthorized" });
  if (req.admin.role !== "superadmin") {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}

async function audit(adminId, action, entity, entityId = null, meta = null) {
  try {
    await run(
      "INSERT INTO admin_audit (admin_id, action, entity, entity_id, meta_json) VALUES (?,?,?,?,?)",
      [adminId, action, entity, entityId ? String(entityId) : null, meta ? JSON.stringify(meta) : null]
    );
  } catch {
    // non-blocking
  }
}

function makeReferralCode(username) {
  const base = username.replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase() || "USER";
  const rand = Math.floor(1000 + Math.random() * 9000);
  return base + rand;
}

app.get("/api/health", (req, res) => res.json({ ok: true }));


// ---------------------------
// Admin API
// ---------------------------
const AdminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

app.post("/api/admin/login", adminLoginLimiter, async (req, res) => {
  try {
    const data = AdminLoginSchema.parse(req.body);
    const a = await get(
      "SELECT id, username, email, password_hash, role, is_active FROM admins WHERE email = ?",
      [data.email]
    );
    if (!a || !a.is_active) return res.status(400).json({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(data.password, a.password_hash);
    if (!ok) return res.status(400).json({ error: "Invalid credentials" });

    await run("UPDATE admins SET last_login_at=CURRENT_TIMESTAMP WHERE id=?", [a.id]);

    const token = jwt.sign(
      { scope: "admin", admin_id: a.id, role: a.role },
      JWT_SECRET,
      { expiresIn: "12h" }
    );
    res.json({ token, admin: { id: a.id, username: a.username, email: a.email, role: a.role } });
  } catch (e) {
    res.status(400).json({ error: e.message || "Bad request" });
  }
});


// One-time bootstrap (create first superadmin)
// Security: set ADMIN_SETUP_KEY in server env, then call this endpoint once.
// Endpoint only works if no admins exist.
const AdminBootstrapSchema = z.object({
  username: z.string().min(3),
  email: z.string().email(),
  password: z.string().min(8),
});

app.post("/api/admin/bootstrap", adminLoginLimiter, async (req, res) => {
  try {
    const setupKey = process.env.ADMIN_SETUP_KEY || "";
    if (!setupKey) return res.status(400).json({ error: "ADMIN_SETUP_KEY not configured" });
    const provided = String(req.headers["x-admin-setup-key"] || "");
    if (provided !== setupKey) return res.status(401).json({ error: "Unauthorized" });

    const count = (await get("SELECT COUNT(*) AS n FROM admins"))?.n || 0;
    if (count > 0) return res.status(400).json({ error: "Admins already exist" });

    const data = AdminBootstrapSchema.parse(req.body);
    const password_hash = await bcrypt.hash(data.password, 10);
    const ins = await run(
      "INSERT INTO admins (username, email, password_hash, role, is_active) VALUES (?,?,?,?,1)",
      [data.username, data.email, password_hash, "superadmin"]
    );

    const token = jwt.sign(
      { scope: "admin", admin_id: ins.lastID, role: "superadmin" },
      JWT_SECRET,
      { expiresIn: "12h" }
    );

    res.json({ ok: true, token });
  } catch (e) {
    res.status(400).json({ error: e.message || "Bad request" });
  }
});

app.get("/api/admin/me", requireAdmin, async (req, res) => {
  const a = await get(
    "SELECT id, username, email, role, is_active, created_at, last_login_at FROM admins WHERE id=?",
    [req.admin.id]
  );
  if (!a) return res.status(404).json({ error: "Admin not found" });
  res.json(a);
});

app.get("/api/admin/overview", requireAdmin, async (req, res) => {
  try {
    const dayKey = dayKeyNairobi();

    const users_total = (await get("SELECT COUNT(*) AS n FROM users"))?.n || 0;
    const users_last_24h = (await get("SELECT COUNT(*) AS n FROM users WHERE created_at >= datetime('now','-1 day')"))?.n || 0;

    const tasks_active = (await get("SELECT COUNT(*) AS n FROM tasks WHERE active=1"))?.n || 0;
    const tasks_total = (await get("SELECT COUNT(*) AS n FROM tasks"))?.n || 0;

    const completions_today = (await get(
      "SELECT COUNT(*) AS n FROM task_completions WHERE created_at >= date('now')",
    ))?.n || 0;
    const completions_total = (await get("SELECT COUNT(*) AS n FROM task_completions"))?.n || 0;

    const activation_paid = (await get("SELECT COUNT(*) AS n FROM activation_fees WHERE status='paid'"))?.n || 0;
    const activation_unpaid = (await get("SELECT COUNT(*) AS n FROM activation_fees WHERE status!='paid'"))?.n || 0;

    const withdrawals_pending = (await get("SELECT COUNT(*) AS n FROM withdrawals WHERE status='pending'"))?.n || 0;
    const withdrawals_paid = (await get("SELECT COUNT(*) AS n FROM withdrawals WHERE status='paid'"))?.n || 0;
    const withdrawals_rejected = (await get("SELECT COUNT(*) AS n FROM withdrawals WHERE status='rejected'"))?.n || 0;
    const withdrawals_pending_amount = (await get("SELECT COALESCE(SUM(amount_ksh),0) AS s FROM withdrawals WHERE status='pending'"))?.s || 0;

    const top_balances = await all(
      "SELECT id, username, email, balance_ksh, bonus_ksh, created_at FROM users ORDER BY balance_ksh DESC LIMIT 8"
    );

    const latest_users = await all(
      "SELECT id, username, email, balance_ksh, created_at FROM users ORDER BY id DESC LIMIT 8"
    );

    const latest_withdrawals = await all(
      "SELECT w.id, w.amount_ksh, w.phone_number, w.method, w.status, w.created_at, u.username, u.email " +
      "FROM withdrawals w JOIN users u ON u.id=w.user_id ORDER BY w.id DESC LIMIT 10"
    );

    res.json({
      day_key: dayKey,
      users: { total: users_total, last_24h: users_last_24h },
      tasks: { total: tasks_total, active: tasks_active },
      completions: { total: completions_total, today: completions_today },
      activations: { paid: activation_paid, unpaid: activation_unpaid },
      withdrawals: {
        pending: withdrawals_pending,
        paid: withdrawals_paid,
        rejected: withdrawals_rejected,
        pending_amount_ksh: withdrawals_pending_amount,
      },
      top_balances,
      latest_users,
      latest_withdrawals,
    });
  } catch (e) {
    res.status(500).json({ error: e.message || "Server error" });
  }
});

// Admin management
const AdminCreateSchema = z.object({
  username: z.string().min(3),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["admin", "superadmin"]).optional().default("admin"),
});

app.get("/api/admin/admins", requireAdmin, requireSuperAdmin, async (req, res) => {
  const rows = await all(
    "SELECT id, username, email, role, is_active, created_at, last_login_at FROM admins ORDER BY id DESC"
  );
  res.json(rows);
});

app.post("/api/admin/admins", requireAdmin, requireSuperAdmin, async (req, res) => {
  try {
    const data = AdminCreateSchema.parse(req.body);
    const exists = await get("SELECT id FROM admins WHERE email=? OR username=?", [data.email, data.username]);
    if (exists) return res.status(400).json({ error: "Admin already exists" });

    const password_hash = await bcrypt.hash(data.password, 10);
    const ins = await run(
      "INSERT INTO admins (username, email, password_hash, role, is_active) VALUES (?,?,?,?,1)",
      [data.username, data.email, password_hash, data.role]
    );
    await audit(req.admin.id, "create", "admin", ins.lastID, { username: data.username, email: data.email, role: data.role });

    const row = await get(
      "SELECT id, username, email, role, is_active, created_at, last_login_at FROM admins WHERE id=?",
      [ins.lastID]
    );
    res.json(row);
  } catch (e) {
    res.status(400).json({ error: e.message || "Bad request" });
  }
});

app.patch("/api/admin/admins/:id/status", requireAdmin, requireSuperAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const schema = z.object({ is_active: z.boolean() });
  try {
    const data = schema.parse(req.body);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
    if (id === req.admin.id) return res.status(400).json({ error: "You cannot disable yourself" });

    await run("UPDATE admins SET is_active=? WHERE id=?", [data.is_active ? 1 : 0, id]);
    await audit(req.admin.id, data.is_active ? "enable" : "disable", "admin", id);

    const row = await get(
      "SELECT id, username, email, role, is_active, created_at, last_login_at FROM admins WHERE id=?",
      [id]
    );
    res.json(row);
  } catch (e) {
    res.status(400).json({ error: e.message || "Bad request" });
  }
});

// Admin: change own password
app.post("/api/admin/password", requireAdmin, async (req, res) => {
  const schema = z.object({ old_password: z.string().min(1), new_password: z.string().min(8) });
  try {
    const data = schema.parse(req.body);
    const a = await get("SELECT id, password_hash FROM admins WHERE id=? AND is_active=1", [req.admin.id]);
    if (!a) return res.status(404).json({ error: "Admin not found" });
    const ok = await bcrypt.compare(data.old_password, a.password_hash);
    if (!ok) return res.status(400).json({ error: "Old password is incorrect" });
    const nh = await bcrypt.hash(data.new_password, 10);
    await run("UPDATE admins SET password_hash=? WHERE id=?", [nh, req.admin.id]);
    await audit(req.admin.id, "update", "admin_password", req.admin.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message || "Bad request" });
  }
});

// Admin: settings (superadmin only)
app.get("/api/admin/settings", requireAdmin, requireSuperAdmin, async (req, res) => {
  const rows = await all("SELECT key, value, updated_at FROM app_settings ORDER BY key ASC");
  res.json(rows);
});

app.post("/api/admin/settings", requireAdmin, requireSuperAdmin, async (req, res) => {
  const schema = z.object({
    tasks_per_day: z.number().int().min(1).max(50).optional(),
    referral_bonus_ksh: z.number().int().min(0).max(1_000_000).optional(),
    min_withdraw_ksh: z.number().int().min(0).max(1_000_000).optional(),
  });
  try {
    const data = schema.parse(req.body || {});
    const updates = Object.entries(data).filter(([, v]) => v !== undefined);
    await run("BEGIN");
    try {
      for (const [k, v] of updates) {
        await run(
          "INSERT INTO app_settings (key, value, updated_at) VALUES (?,?,CURRENT_TIMESTAMP) " +
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP",
          [k, String(v)]
        );
      }
      await run("COMMIT");
    } catch (e) {
      await run("ROLLBACK");
      throw e;
    }
    await audit(req.admin.id, "update", "app_settings", null, data);
    const rows = await all("SELECT key, value, updated_at FROM app_settings ORDER BY key ASC");
    res.json({ ok: true, settings: rows });
  } catch (e) {
    res.status(400).json({ error: e.message || "Bad request" });
  }
});

// Admin: audit trail
app.get("/api/admin/audit", requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(200, Math.max(10, Number(req.query.limit || 50)));
    const offset = Math.max(0, Number(req.query.offset || 0));
    const q = String(req.query.q || "").trim();

    const where = [];
    const params = [];
    if (q) {
      where.push("(a.action LIKE ? OR a.entity LIKE ? OR a.entity_id LIKE ? OR ad.email LIKE ? OR ad.username LIKE ?)");
      for (let i = 0; i < 5; i++) params.push(`%${q}%`);
    }

    const sql =
      "SELECT a.id, a.created_at, a.action, a.entity, a.entity_id, a.meta_json, " +
      "ad.id AS admin_id, ad.username AS admin_username, ad.email AS admin_email, ad.role AS admin_role " +
      "FROM admin_audit a JOIN admins ad ON ad.id=a.admin_id " +
      (where.length ? "WHERE " + where.join(" AND ") + " " : "") +
      "ORDER BY a.id DESC LIMIT ? OFFSET ?";
    const rows = await all(sql, [...params, limit, offset]);
    res.json(rows.map((r) => ({
      ...r,
      meta: r.meta_json ? (() => { try { return JSON.parse(r.meta_json); } catch { return r.meta_json; } })() : null,
    })));
  } catch (e) {
    res.status(500).json({ error: e.message || "Server error" });
  }
});

// Users
app.get("/api/admin/users", requireAdmin, async (req, res) => {
  const q = String(req.query.q || "").trim();
  const limit = Math.min(200, Math.max(10, Number(req.query.limit || 50)));
  const params = [];
  let where = "";
  if (q) {
    where = "WHERE username LIKE ? OR email LIKE ?";
    params.push(`%${q}%`, `%${q}%`);
  }
  const rows = await all(
    `SELECT id, username, email, balance_ksh, bonus_ksh, referral_code, created_at FROM users ${where} ORDER BY id DESC LIMIT ${limit}`,
    params
  );
  res.json(rows);
});

app.get("/api/admin/users/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });

  const user = await get(
    "SELECT id, username, email, full_name, phone, payment_number, referral_code, referred_by, balance_ksh, bonus_ksh, created_at FROM users WHERE id=?",
    [id]
  );
  if (!user) return res.status(404).json({ error: "User not found" });

  const activation = await get(
    "SELECT fee_ksh, paid_ksh, status, paid_at FROM activation_fees WHERE user_id=?",
    [id]
  );

  const withdrawals = await all(
    "SELECT id, amount_ksh, phone_number, method, status, created_at FROM withdrawals WHERE user_id=? ORDER BY id DESC LIMIT 15",
    [id]
  );

  const completions = await get(
    "SELECT COUNT(*) AS n, COALESCE(SUM(reward_ksh),0) AS sum FROM task_completions WHERE user_id=?",
    [id]
  );

  res.json({ user, activation, withdrawals, completions: completions || { n: 0, sum: 0 } });
});

app.post("/api/admin/users/:id/balance", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const schema = z.object({ balance_ksh: z.number().int().min(0) });
  try {
    const data = schema.parse(req.body);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });

    await run("UPDATE users SET balance_ksh=? WHERE id=?", [data.balance_ksh, id]);
    await audit(req.admin.id, "set_balance", "user", id, { balance_ksh: data.balance_ksh });

    const u = await get("SELECT id, username, email, balance_ksh FROM users WHERE id=?", [id]);
    res.json(u);
  } catch (e) {
    res.status(400).json({ error: e.message || "Bad request" });
  }
});

app.post("/api/admin/users/:id/bonus", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const schema = z.object({ bonus_ksh: z.number().int().min(0) });
  try {
    const data = schema.parse(req.body);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });

    await run("UPDATE users SET bonus_ksh=? WHERE id=?", [data.bonus_ksh, id]);
    await audit(req.admin.id, "set_bonus", "user", id, { bonus_ksh: data.bonus_ksh });

    const u = await get("SELECT id, username, email, bonus_ksh FROM users WHERE id=?", [id]);
    res.json(u);
  } catch (e) {
    res.status(400).json({ error: e.message || "Bad request" });
  }
});

app.post("/api/admin/users/:id/activation", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const schema = z.object({ status: z.enum(["paid", "unpaid"]) });
  try {
    const data = schema.parse(req.body);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });

    await run(
      "INSERT OR IGNORE INTO activation_fees (user_id, fee_ksh, paid_ksh, status) VALUES (?, 100, 0, 'unpaid')",
      [id]
    );
    if (data.status === "paid") {
      await run(
        "UPDATE activation_fees SET paid_ksh=fee_ksh, status='paid', paid_at=CURRENT_TIMESTAMP WHERE user_id=?",
        [id]
      );
    } else {
      await run(
        "UPDATE activation_fees SET paid_ksh=0, status='unpaid', paid_at=NULL WHERE user_id=?",
        [id]
      );
    }
    await audit(req.admin.id, "set_activation", "user", id, { status: data.status });

    const row = await get("SELECT fee_ksh, paid_ksh, status, paid_at FROM activation_fees WHERE user_id=?", [id]);
    res.json(row);
  } catch (e) {
    res.status(400).json({ error: e.message || "Bad request" });
  }
});

// Withdrawals review
app.get("/api/admin/withdrawals", requireAdmin, async (req, res) => {
  const status = String(req.query.status || "").trim();
  const limit = Math.min(200, Math.max(10, Number(req.query.limit || 50)));
  const params = [];
  let where = "";
  if (status) {
    where = "WHERE w.status=?";
    params.push(status);
  }
  const rows = await all(
    `SELECT w.id, w.amount_ksh, w.phone_number, w.method, w.status, w.created_at, u.id as user_id, u.username, u.email
     FROM withdrawals w JOIN users u ON u.id=w.user_id
     ${where}
     ORDER BY w.id DESC
     LIMIT ${limit}`,
    params
  );
  res.json(rows);
});

app.patch("/api/admin/withdrawals/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const schema = z.object({ status: z.enum(["pending", "paid", "rejected"]) });
  try {
    const data = schema.parse(req.body);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });

    await run("UPDATE withdrawals SET status=? WHERE id=?", [data.status, id]);
    await audit(req.admin.id, "set_status", "withdrawal", id, { status: data.status });

    const row = await get("SELECT id, user_id, amount_ksh, phone_number, method, status, created_at FROM withdrawals WHERE id=?", [id]);
    res.json(row);
  } catch (e) {
    res.status(400).json({ error: e.message || "Bad request" });
  }
});

const RegisterSchema = z.object({
  username: z.string().min(3),
  email: z.string().email(),
  password: z.string().min(6),
  referralCode: z.string().optional().default(""),
});

app.post("/api/auth/register", loginLimiter, async (req, res) => {
  try {
    const data = RegisterSchema.parse(req.body);

    const existsEmail = await get("SELECT id FROM users WHERE email = ?", [data.email]);
    if (existsEmail) return res.status(400).json({ error: "Email already registered" });

    const existsUser = await get("SELECT id FROM users WHERE username = ?", [data.username]);
    if (existsUser) return res.status(400).json({ error: "Username already taken" });

    let referredById = null;
    if (data.referralCode && data.referralCode.trim()) {
      const ref = await get("SELECT id FROM users WHERE referral_code = ?", [data.referralCode.trim()]);
      if (!ref) return res.status(400).json({ error: "Invalid referral code" });
      referredById = ref.id;
    }

    const password_hash = await bcrypt.hash(data.password, 10);

    // ensure unique referral code
    let referral_code = makeReferralCode(data.username);
    for (let i = 0; i < 10; i++) {
      const existsCode = await get("SELECT id FROM users WHERE referral_code = ?", [referral_code]);
      if (!existsCode) break;
      referral_code = makeReferralCode(data.username);
    }

    const userInsert = await run(
      "INSERT INTO users (username, email, password_hash, referral_code, referred_by, balance_ksh, bonus_ksh) VALUES (?, ?, ?, ?, ?, 0, 0)",
      [data.username, data.email, password_hash, referral_code, referredById]
    );

    // activation fee record (required before withdrawals)
    const activationFee = ACTIVATION_FEE_KSH;
    await run(
      "INSERT OR IGNORE INTO activation_fees (user_id, fee_ksh, paid_ksh, status) VALUES (?, ?, 0, 'unpaid')",
      [userInsert.lastID, activationFee]
    );

    // referral bonus goes into bonus wallet
    if (referredById) {
      const rb = await getIntSetting("referral_bonus_ksh", 100);
      if (rb > 0) await run("UPDATE users SET bonus_ksh = bonus_ksh + ? WHERE id = ?", [rb, referredById]);
    }

    const token = jwt.sign({ id: userInsert.lastID }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token });
  } catch (e) {
    res.status(400).json({ error: e.message || "Bad request" });
  }
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

app.post("/api/auth/login", userLoginLimiter, async (req, res) => {
  try {
    const data = LoginSchema.parse(req.body);
    const user = await get("SELECT id, password_hash FROM users WHERE email = ?", [data.email]);
    if (!user) return res.status(400).json({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(data.password, user.password_hash);
    if (!ok) return res.status(400).json({ error: "Invalid credentials" });

    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token });
  } catch (e) {
    res.status(400).json({ error: e.message || "Bad request" });
  }
});


app.get("/api/me", requireAuth, async (req, res) => {
  try {
    const u = await get(
      "SELECT id, username, email, " +
        "COALESCE(full_name, '') AS full_name, " +
        "COALESCE(phone, '') AS phone, " +
        "COALESCE(payment_number, '') AS payment_number, " +
        "referral_code, balance_ksh, COALESCE(bonus_ksh,0) AS bonus_ksh, " +
        "created_at, delete_requested_at, delete_effective_at " +
      "FROM users WHERE id = ?",
      [req.user.id]
    );
    if (!u) return res.status(404).json({ error: "User not found" });
    res.json(u);
  } catch (e) {
    console.error("/api/me failed:", e);
    res.status(500).json({ error: "Server error" });
  }
});




app.put("/api/me", requireAuth, async (req, res) => {
  try {
    const full_name = (req.body.full_name || "").toString();
    const phone = (req.body.phone || "").toString();
    const payment_number = (req.body.payment_number || "").toString();

    await run(
      "UPDATE users SET full_name=?, phone=?, payment_number=? WHERE id=?",
      [full_name, phone, payment_number, req.user.id]
    );
    const me = await get(
      "SELECT id, username, email, referral_code, balance_ksh, bonus_ksh, COALESCE(full_name,'') AS full_name, COALESCE(phone,'') AS phone, COALESCE(payment_number,'') AS payment_number FROM users WHERE id=?",
      [req.user.id]
    );
    res.json(me);
  } catch (e) {
    res.status(400).json({ error: e.message || "Bad request" });
  }
});

app.post("/api/me/password", requireAuth, async (req, res) => {
  const schema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(6),
  });
  try {
    const data = schema.parse(req.body);
    const user = await get("SELECT password_hash FROM users WHERE id = ?", [req.user.id]);
    const ok = user && (await bcrypt.compare(data.currentPassword, user.password_hash));
    if (!ok) return res.status(400).json({ error: "Current password is wrong" });

    const newHash = await bcrypt.hash(data.newPassword, 10);
    await run("UPDATE users SET password_hash = ? WHERE id = ?", [newHash, req.user.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message || "Bad request" });
  }
});

app.delete("/api/me", requireAuth, async (req, res) => {
  await run("DELETE FROM users WHERE id = ?", [req.user.id]);
  res.json({ ok: true });
});

app.get("/api/referrals/status", requireAuth, async (req, res) => {
  const r = await get("SELECT COUNT(*) AS referrals FROM users WHERE referred_by = ?", [req.user.id]);
  const u = await get("SELECT bonus_ksh FROM users WHERE id = ?", [req.user.id]);
  res.json({ referrals: r?.referrals || 0, bonus_ksh: u?.bonus_ksh || 0 });
});

app.post("/api/referrals/redeem", requireAuth, async (req, res) => {
  const u = await get("SELECT bonus_ksh, balance_ksh FROM users WHERE id = ?", [req.user.id]);
  if (!u) return res.status(404).json({ error: "User not found" });
  const threshold = await getIntSetting("referral_redeem_threshold_ksh", 1000);
  const transfer = await getIntSetting("referral_redeem_transfer_ksh", 1000);
  if ((u.bonus_ksh || 0) < threshold) {
    return res.status(400).json({ error: `Bonus must reach KSH ${threshold} to redeem` });
  }

  await run(
    "UPDATE users SET balance_ksh = balance_ksh + ?, bonus_ksh = bonus_ksh - ? WHERE id = ?",
    [transfer, transfer, req.user.id]
  );
  const me = await get("SELECT balance_ksh, bonus_ksh FROM users WHERE id = ?", [req.user.id]);
  res.json({ ok: true, ...me });
});

// --- Activation fee (external payment only; unlocks withdrawals) ---
async function ensureActivationRow(userId) {
  const fee = ACTIVATION_FEE_KSH;
  await run(
    "INSERT OR IGNORE INTO activation_fees (user_id, fee_ksh, paid_ksh, status) VALUES (?, ?, 0, 'unpaid')",
    [userId, fee]
  );
  // If fee changes and user is not yet paid, keep row in sync.
  await run(
    "UPDATE activation_fees SET fee_ksh=? WHERE user_id=? AND status!='paid'",
    [fee, userId]
  );
}

async function refreshActivationFromProvider(userId) {
  await ensureActivationRow(userId);
  const row = await get(
    "SELECT user_id, fee_ksh, status, provider, provider_order_tracking_id FROM activation_fees WHERE user_id=?",
    [userId]
  );
  if (!row) return null;

  if (row.status === "paid") return row;
  if (row.provider === "pesapal" && row.provider_order_tracking_id) {
    try {
      const st = await getTransactionStatus(row.provider_order_tracking_id);
      const statusText = String(st?.payment_status_description || st?.payment_status || st?.status_description || "").toUpperCase();
      const raw = JSON.stringify(st || {});

      // Common Pesapal statuses include COMPLETED / FAILED / INVALID / REJECTED / CANCELLED / PENDING.
      if (statusText.includes("COMPLET")) {
        await run(
          "UPDATE activation_fees SET status='paid', paid_ksh=fee_ksh, paid_at=CURRENT_TIMESTAMP, provider_status=?, provider_raw_json=? WHERE user_id=?",
          [statusText, raw, userId]
        );
      } else {
        await run(
          "UPDATE activation_fees SET status=CASE WHEN status='unpaid' THEN 'pending' ELSE status END, provider_status=?, provider_raw_json=? WHERE user_id=?",
          [statusText || "PENDING", raw, userId]
        );
      }
    } catch {
      // ignore provider issues; user can retry refresh
    }
  }

  return await get(
    "SELECT fee_ksh, paid_ksh, status, paid_at, provider, provider_order_tracking_id, provider_merchant_reference, provider_status FROM activation_fees WHERE user_id=?",
    [userId]
  );
}

app.get("/api/activation", requireAuth, async (req, res) => {
  try {
    const act = await refreshActivationFromProvider(req.user.id);
    const me = await get("SELECT balance_ksh FROM users WHERE id=?", [req.user.id]);
    res.json({
      fee_ksh: act?.fee_ksh ?? 100,
      paid_ksh: act?.paid_ksh ?? 0,
      status: act?.status ?? "unpaid",
      paid_at: act?.paid_at ?? null,
      provider: act?.provider ?? null,
      provider_order_tracking_id: act?.provider_order_tracking_id ?? null,
      provider_status: act?.provider_status ?? null,
      balance_ksh: me?.balance_ksh ?? 0,
    });
  } catch (e) {
    res.status(500).json({ error: e.message || "Server error" });
  }
});

// Initiate Pesapal payment for activation fee.
app.post("/api/activation/initiate", requireAuth, async (req, res) => {
  try {
    await ensureActivationRow(req.user.id);
    const act = await get(
      "SELECT fee_ksh, status FROM activation_fees WHERE user_id=?",
      [req.user.id]
    );
    if (act?.status === "paid") return res.json({ ok: true, status: "paid" });

    const ipnId = process.env.PESAPAL_IPN_ID || "";
    if (!ipnId) {
      return res.status(500).json({
        error: "PESAPAL_IPN_ID not configured. Register an IPN URL in Pesapal and set PESAPAL_IPN_ID in server env.",
      });
    }

    const publicUrl = (process.env.APP_PUBLIC_URL || "").replace(/\/$/, "");
    if (!publicUrl) {
      return res.status(500).json({ error: "APP_PUBLIC_URL not configured (required for Pesapal callback/IPN)." });
    }

    const u = await get("SELECT username, email, phone, full_name FROM users WHERE id=?", [req.user.id]);
    const fee = Number(act?.fee_ksh || 100);

    const merchantRef = `ACT-${req.user.id}-${Date.now()}`;
    const orderPayload = {
      id: merchantRef,
      currency: process.env.PESAPAL_CURRENCY || "KES",
      amount: fee,
      description: "Account activation fee (withdrawal unlock)",
      callback_url: `${publicUrl}/api/activation/callback`,
      redirect_mode: "TOP_WINDOW",
      notification_id: ipnId,
      branch: process.env.PESAPAL_BRANCH || "SynthGraphix",
      billing_address: {
        email_address: u?.email || undefined,
        phone_number: (u?.phone || "").trim() || undefined,
        country_code: process.env.PESAPAL_COUNTRY || "KE",
        first_name: (u?.full_name || u?.username || "").split(" ")[0] || undefined,
        last_name: (u?.full_name || "").split(" ").slice(1).join(" ") || undefined,
      },
    };

    const created = await submitOrder(orderPayload);

    await run(
      "UPDATE activation_fees SET status='pending', provider='pesapal', provider_order_tracking_id=?, provider_merchant_reference=?, provider_status=?, provider_raw_json=? WHERE user_id=?",
      [
        created.order_tracking_id,
        created.merchant_reference,
        "PENDING",
        JSON.stringify(created),
        req.user.id,
      ]
    );

    res.json({ ok: true, redirect_url: created.redirect_url });
  } catch (e) {
    res.status(500).json({ error: e.message || "Activation initiation failed" });
  }
});

// Legacy endpoint kept for older clients
app.post("/api/activation/pay", requireAuth, async (req, res) => {
  return res.status(410).json({
    error: "This endpoint has been replaced. Use POST /api/activation/initiate to pay via Pesapal.",
  });
});

// Pesapal callback (GET) - user is redirected here after payment.
app.get("/api/activation/callback", async (req, res) => {
  try {
    const trackingId = String(req.query.OrderTrackingId || "");
    const merchantRef = String(req.query.OrderMerchantReference || "");
    if (!trackingId || !merchantRef) return res.status(400).send("Missing callback parameters");

    const row = await get(
      "SELECT user_id FROM activation_fees WHERE provider='pesapal' AND provider_order_tracking_id=? AND provider_merchant_reference=?",
      [trackingId, merchantRef]
    );
    if (row?.user_id) await refreshActivationFromProvider(row.user_id);

    const client = (process.env.CLIENT_PUBLIC_URL || "").replace(/\/$/, "");
    if (client) {
      return res.redirect(`${client}/app/withdraw?activation=callback`);
    }
    res.send("Activation callback received. You may close this tab.");
  } catch (e) {
    res.status(500).send(e.message || "Callback error");
  }
});

// Pesapal IPN webhook (GET or POST)
app.all("/api/activation/ipn", async (req, res) => {
  try {
    const trackingId = String(req.body?.OrderTrackingId || req.query.OrderTrackingId || "");
    const merchantRef = String(req.body?.OrderMerchantReference || req.query.OrderMerchantReference || "");
    if (!trackingId || !merchantRef) return res.status(200).json({ ok: true });

    const row = await get(
      "SELECT user_id FROM activation_fees WHERE provider='pesapal' AND provider_order_tracking_id=? AND provider_merchant_reference=?",
      [trackingId, merchantRef]
    );
    if (row?.user_id) await refreshActivationFromProvider(row.user_id);

    res.json({ ok: true });
  } catch {
    res.status(200).json({ ok: true });
  }
});


// ---- Daily task assignment (configurable; default 10/day; avoid duplicate types) ----
async function ensureDailyTasks(userId, dayKey) {
  await run("PRAGMA foreign_keys = ON");

  // clean broken rows (prevents crashes)
  await run("DELETE FROM daily_tasks WHERE user_id NOT IN (SELECT id FROM users)");
  await run("DELETE FROM daily_tasks WHERE task_id NOT IN (SELECT id FROM tasks)");

  const user = await get("SELECT id FROM users WHERE id = ?", [userId]);
  if (!user) return;

  const limit = await getIntSetting("tasks_per_day", 10);

  // already have tasks for today?
  const existing = await all("SELECT task_id FROM daily_tasks WHERE user_id=? AND day_key=?", [userId, dayKey]);
  if (existing.length >= limit) return;

  // ensure we do not duplicate type per day
  const existingTypes = await all(
    `SELECT DISTINCT t.type AS type
     FROM daily_tasks dt
     JOIN tasks t ON t.id = dt.task_id
     WHERE dt.user_id=? AND dt.day_key=?`,
    [userId, dayKey]
  );
  const used = new Set(existingTypes.map(x => x.type));
  const existingCats = await all(
    `SELECT DISTINCT t.category AS category
     FROM daily_tasks dt
     JOIN tasks t ON t.id = dt.task_id
     WHERE dt.user_id=? AND dt.day_key=?`,
    [userId, dayKey]
  );
  const usedCats = new Set(existingCats.map((x) => x.category));

  // Prefer whatever task types exist in the database (allows richer catalogs without code changes).
  const typeRows = await all("SELECT DISTINCT type FROM tasks WHERE active=1 ORDER BY type");
  let ALL_TYPES = (typeRows || []).map((r) => r.type).filter(Boolean);
  if (ALL_TYPES.length === 0) {
    // Fallback for empty/partial DBs
    ALL_TYPES = ["audio_transcription", "video_transcription", "image_caption", "image_tagging", "text_cleanup"];
  }
  const picks = [];

  // Prefer category diversity first (random categories per user/day)
  const catRows = await all("SELECT DISTINCT category FROM tasks WHERE active=1 ORDER BY category");
  let categories = (catRows || []).map((r) => r.category).filter(Boolean);
  // shuffle categories
  for (let i = categories.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [categories[i], categories[j]] = [categories[j], categories[i]];
  }

  for (const cat of categories) {
    if (picks.length + existing.length >= limit) break;
    if (usedCats.has(cat)) continue;
    const row = await get(
      "SELECT id, type, category FROM tasks WHERE active=1 AND category=? ORDER BY RANDOM() LIMIT 1",
      [cat]
    );
    if (!row) continue;
    if (used.has(row.type)) continue;
    used.add(row.type);
    usedCats.add(row.category);
    picks.push(row.id);
  }

  // Then spread across types
  for (const typ of ALL_TYPES) {
    if (picks.length + existing.length >= limit) break;
    if (used.has(typ)) continue;
    const row = await get("SELECT id, type, category FROM tasks WHERE active=1 AND type=? ORDER BY RANDOM() LIMIT 1", [typ]);
    if (!row) continue;
    used.add(row.type);
    usedCats.add(row.category);
    picks.push(row.id);
  }

  // Fill remainder with random tasks not already chosen (still avoid duplicate type)
  let attempts = 0;
  while (picks.length + existing.length < limit) {
    attempts += 1;
    if (attempts > 250) {
      // In small catalogs, we may not have enough unique types.
      // Relax the constraint to avoid an infinite loop.
      used.clear();
      attempts = 0;
    }
    const row = await get("SELECT id, type, category FROM tasks WHERE active=1 ORDER BY RANDOM() LIMIT 1");
    if (!row) break;
    if (used.has(row.type)) continue;
    used.add(row.type);
    usedCats.add(row.category);
    picks.push(row.id);
  }

  for (const tid of picks) {
    await run(
      "INSERT OR IGNORE INTO daily_tasks (user_id, day_key, task_id) VALUES (?,?,?)",
      [userId, dayKey, tid]
    );
  }
}

app.get("/api/tasks", requireAuth, async (req, res) => {
  try {
    const dayKey = dayKeyNairobi();
    const limit = await getIntSetting("tasks_per_day", 10);
    await ensureDailyTasks(req.user.id, dayKey);

    const rows = await all(
      `SELECT
         dt.id AS dt_id,
         t.id AS id,
         t.type,
         t.category,
         t.title,
         t.prompt,
         t.media_url,
         t.reward_ksh,
         t.complexity,
         CASE WHEN dt.completed_at IS NULL THEN 0 ELSE 1 END AS completed,
         dt.answer_text
       FROM daily_tasks dt
       JOIN tasks t ON t.id = dt.task_id
       WHERE dt.user_id = ? AND dt.day_key = ?
       ORDER BY dt.id ASC
       LIMIT ?`,
      [req.user.id, dayKey, limit]
    );

    const me = await get("SELECT balance_ksh FROM users WHERE id=?", [req.user.id]);
    const remaining = rows.filter(r => !r.completed).length;

    res.json({ day_key: dayKey, remaining, balance_ksh: me?.balance_ksh || 0, tasks: rows });
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to load tasks" });
  }
});

app.post("/api/tasks/:id/complete", requireAuth, async (req, res) => {
  try {
    const dayKey = dayKeyNairobi();
    const taskId = Number(req.params.id);
    if (!Number.isFinite(taskId)) return res.status(400).json({ error: "Invalid task id" });

    const ans = (req.body.answer_text ?? req.body.answer ?? "").toString().trim();
    if (ans.length < 2) return res.status(400).json({ error: "Answer is required" });

    // must be assigned today
    const dt = await get(
      "SELECT id, completed_at FROM daily_tasks WHERE user_id=? AND day_key=? AND task_id=?",
      [req.user.id, dayKey, taskId]
    );
    if (!dt) return res.status(400).json({ error: "Task not assigned for today" });
    if (dt.completed_at) return res.status(400).json({ error: "Task already completed" });

    const task = await get("SELECT reward_ksh FROM tasks WHERE id=? AND active=1", [taskId]);
    if (!task) return res.status(404).json({ error: "Task not found" });

    await run("BEGIN");
    try {
      await run(
        "UPDATE daily_tasks SET completed_at=CURRENT_TIMESTAMP, answer_text=? WHERE id=?",
        [ans, dt.id]
      );
      await run(
        "INSERT INTO task_completions (user_id, task_id, reward_ksh, answer_text) VALUES (?,?,?,?)",
        [req.user.id, taskId, task.reward_ksh, ans]
      );
      await run(
        "UPDATE users SET balance_ksh = balance_ksh + ? WHERE id=?",
        [task.reward_ksh, req.user.id]
      );
      await run("COMMIT");
    } catch (e) {
      await run("ROLLBACK");
      throw e;
    }

    const me = await get("SELECT balance_ksh FROM users WHERE id=?", [req.user.id]);
    const limit = await getIntSetting("tasks_per_day", 10);
    const rows = await all(
      `SELECT dt.id AS dt_id, t.id AS id, t.type, t.category, t.title, t.prompt, t.media_url, t.reward_ksh, t.complexity,
              CASE WHEN dt.completed_at IS NULL THEN 0 ELSE 1 END AS completed, dt.answer_text
       FROM daily_tasks dt JOIN tasks t ON t.id=dt.task_id
       WHERE dt.user_id=? AND dt.day_key=?
       ORDER BY dt.id ASC
       LIMIT ?`,
      [req.user.id, dayKey, limit]
    );
    const remaining = rows.filter(r => !r.completed).length;

    res.json({ ok: true, balance_ksh: me?.balance_ksh || 0, remaining });
  } catch (e) {
    res.status(500).json({ error: e.message || "Complete failed" });
  }
});

app.get("/api/history", requireAuth, async (req, res) => {
  const rows = await all(
    `SELECT tc.id, tc.created_at, tc.reward_ksh, t.title, t.type
     FROM task_completions tc
     JOIN tasks t ON t.id = tc.task_id
     WHERE tc.user_id = ?
     ORDER BY tc.id DESC
     LIMIT 50`,
    [req.user.id]
  );
  res.json(rows);
});

// withdrawals (kept simple)
app.get("/api/withdrawals", requireAuth, async (req, res) => {
  const rows = await all(
    "SELECT id, amount_ksh, phone_number, method, status, created_at FROM withdrawals WHERE user_id=? ORDER BY id DESC LIMIT 50",
    [req.user.id]
  );
  res.json(rows);
});

app.post("/api/withdrawals", requireAuth, async (req, res) => {
  try {
    const schema = z.object({
      amount: z.number().positive(),
      phone_number: z.string().min(5),
      method: z.string().min(2),
    });
    const data = schema.parse(req.body);

    // Activation is mandatory before withdrawals.
    const act = await refreshActivationFromProvider(req.user.id);
    if (!act || act.status !== "paid") {
      return res.status(402).json({
        error: "Activation fee required before withdrawals.",
        code: "activation_required",
      });
    }

    const minW = await getIntSetting("min_withdraw_ksh", 200);
    if (Number(data.amount) < minW) {
      return res.status(400).json({ error: `Minimum withdrawal is KSH ${minW}` });
    }

    const u = await get("SELECT balance_ksh FROM users WHERE id=?", [req.user.id]);
    if (!u) return res.status(404).json({ error: "User not found" });
    if (u.balance_ksh < data.amount) return res.status(400).json({ error: "Insufficient balance" });

    await run("BEGIN");
    try {
      await run("UPDATE users SET balance_ksh = balance_ksh - ? WHERE id=?", [data.amount, req.user.id]);
      await run(
        "INSERT INTO withdrawals (user_id, amount_ksh, phone_number, method, status) VALUES (?,?,?,?,?)",
        [req.user.id, Math.floor(data.amount), data.phone_number, data.method, "pending"]
      );
      await run("COMMIT");
    } catch (e) {
      await run("ROLLBACK");
      throw e;
    }

    const me = await get("SELECT balance_ksh FROM users WHERE id=?", [req.user.id]);
    res.json({ ok: true, balance_ksh: me.balance_ksh });
  } catch (e) {
    res.status(400).json({ error: e.message || "Bad request" });
  }
});

(async () => {
  try {
    await initDb();


    // Bootstrap superadmin from env (optional)
    // Set ADMIN_EMAIL, ADMIN_PASSWORD (min 8), and optionally ADMIN_USERNAME.
    // If an admin already exists, this is ignored.
    try {
      const aCount = (await get("SELECT COUNT(*) AS n FROM admins"))?.n || 0;
      if (aCount === 0) {
        const email = process.env.ADMIN_EMAIL || "";
        const password = process.env.ADMIN_PASSWORD || "";
        const username = process.env.ADMIN_USERNAME || "superadmin";
        if (email && password && password.length >= 8) {
          const password_hash = await bcrypt.hash(password, 10);
          await run("INSERT INTO admins (username, email, password_hash, role, is_active) VALUES (?,?,?,?,1)", [username, email, password_hash, "superadmin"]);
          console.log("[admin] Superadmin created from env ADMIN_EMAIL/ADMIN_PASSWORD");
        }
      }
    } catch (e) {
      console.warn("[admin] env bootstrap failed:", e?.message || e);
    }


    app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));
  } catch (e) {
    console.error("DB init failed:", e);
    process.exit(1);
  }
})();
