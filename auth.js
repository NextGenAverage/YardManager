// Logins, sessions, roles and user accounts.
//
// Roles, each including everything the one before it can do:
//   viewer   - see the map and history
//   worker   - change status, damaged and note on trailers in the yard
//   operator - add, move, depart and remove trailers, correct times
//   admin    - manage users (later also the map layout and backups)
//
// Passwords are hashed with scrypt (built into Node). The browser gets a random
// session token in an httpOnly cookie; the database only stores its SHA-256 hash.
const crypto = require("crypto");
const { db } = require("./db");

const ROLES = ["viewer", "worker", "operator", "admin"];
const COOKIE = "yard_session";
const HOUR = 3600e3;
const SESSION_LENGTH = { viewer: 30 * 24 * HOUR, default: 12 * HOUR }; // viewers: wall screens
const MIN_PASSWORD = 8;

const atLeast = (role, needed) => ROLES.indexOf(role) >= ROLES.indexOf(needed);

// ---- Passwords ----

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

function checkPassword(password, stored) {
  const [, salt, hash] = stored.split("$");
  const expected = Buffer.from(hash, "base64");
  const actual = crypto.scryptSync(password, Buffer.from(salt, "base64"), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

// Temporary passwords an admin reads out or writes down: no look-alike characters.
function temporaryPassword() {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let p = "";
  for (let i = 0; i < 10; i++) p += chars[crypto.randomInt(chars.length)];
  return p;
}

function passwordProblem(password) {
  return typeof password === "string" && password.length >= MIN_PASSWORD
    ? null : `Password must be at least ${MIN_PASSWORD} characters.`;
}

// ---- Users ----

const publicUser = (u) => u && {
  id: u.id, username: u.username, name: u.name, role: u.role,
  active: !!u.active, mustChangePassword: !!u.must_change_pw, lastLoginAt: u.last_login_at,
};

const userById = (id) => db.prepare("SELECT * FROM users WHERE id = ?").get(id);
const userByName = (username) => db.prepare("SELECT * FROM users WHERE username = ?").get(username);
const listUsers = () => db.prepare("SELECT * FROM users ORDER BY active DESC, name").all().map(publicUser);
const countActiveAdmins = () => db.prepare("SELECT COUNT(*) n FROM users WHERE role = 'admin' AND active = 1").get().n;

function userProblem({ username, name, role }) {
  if (!/^[a-z0-9._-]{2,32}$/i.test(username || "")) return "Username: 2–32 letters, digits, dots, dashes or underscores.";
  if (!name || name.length > 60) return "Name is required (max 60 characters).";
  if (!ROLES.includes(role)) return "Unknown role.";
  return null;
}

// Returns { user, password } where password is the temporary password to hand over.
function createUser({ username, name, role }) {
  const password = temporaryPassword();
  const { lastInsertRowid } = db.prepare(`INSERT INTO users (username, name, role, password_hash, created_at)
    VALUES (?, ?, ?, ?, ?)`).run(username, name, role, hashPassword(password), Date.now());
  return { user: publicUser(userById(lastInsertRowid)), password };
}

function updateUser(id, { name, role, active }) {
  db.prepare("UPDATE users SET name = ?, role = ?, active = ? WHERE id = ?").run(name, role, active ? 1 : 0, id);
}

function resetPassword(id) {
  const password = temporaryPassword();
  db.prepare("UPDATE users SET password_hash = ?, must_change_pw = 1 WHERE id = ?").run(hashPassword(password), id);
  endSessions(id);
  return password;
}

function setOwnPassword(id, password) {
  db.prepare("UPDATE users SET password_hash = ?, must_change_pw = 0 WHERE id = ?").run(hashPassword(password), id);
}

// ---- Sessions ----

const tokenHash = (token) => crypto.createHash("sha256").update(token).digest("hex");

function startSession(user) {
  const token = crypto.randomBytes(32).toString("base64url");
  const now = Date.now();
  const length = SESSION_LENGTH[user.role] || SESSION_LENGTH.default;
  db.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(tokenHash(token), user.id, now, now + length);
  db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(now, user.id);
  return { token, maxAge: length };
}

// The logged-in user for a cookie token, or null. Viewer sessions are extended while in use.
function sessionUser(token) {
  if (!token) return null;
  const h = tokenHash(token);
  const row = db.prepare(`SELECT s.expires_at, u.* FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`).get(h, Date.now());
  if (!row) return null;
  if (row.role === "viewer" && row.expires_at - Date.now() < SESSION_LENGTH.viewer - 24 * HOUR) {
    db.prepare("UPDATE sessions SET expires_at = ? WHERE token_hash = ?").run(Date.now() + SESSION_LENGTH.viewer, h);
  }
  return { ...row, tokenHash: h };
}

function endSession(token) {
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash(token));
}

function endSessions(userId) {
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}

setInterval(() => db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now()), HOUR).unref();

// ---- Login attempts: 5 wrong passwords lock that username (from that address) for 5 minutes ----

const failures = new Map();
const LOCK_AFTER = 5, LOCK_MS = 5 * 60e3;

function lockedOut(key) {
  const f = failures.get(key);
  return f && f.count >= LOCK_AFTER && Date.now() - f.last < LOCK_MS;
}

function recordFailure(key) {
  const f = failures.get(key);
  const fresh = !f || Date.now() - f.last > LOCK_MS;
  failures.set(key, { count: fresh ? 1 : f.count + 1, last: Date.now() });
}

// ---- Express helpers ----

function readCookie(req, name) {
  for (const part of (req.headers.cookie || "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

function setSessionCookie(req, res, token, maxAge) {
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: req.secure, maxAge, path: "/" });
}

// Puts the logged-in user (or null) on req.user for every request.
function loadUser(req, res, next) {
  req.sessionToken = readCookie(req, COOKIE);
  req.user = sessionUser(req.sessionToken);
  next();
}

// Route guard: requireRole("operator") lets operators and admins through.
// Users who must change their temporary password can't do anything else first.
const requireRole = (role) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: "Please log in." });
  if (req.user.must_change_pw) return res.status(403).json({ error: "Please choose a new password first." });
  if (!atLeast(req.user.role, role)) return res.status(403).json({ error: "Your role doesn't allow this." });
  next();
};

module.exports = {
  ROLES, COOKIE, atLeast,
  hashPassword, checkPassword, passwordProblem,
  publicUser, userById, userByName, listUsers, countActiveAdmins, userProblem,
  createUser, updateUser, resetPassword, setOwnPassword,
  startSession, endSession, endSessions,
  lockedOut, recordFailure, failures,
  setSessionCookie, loadUser, requireRole,
};
