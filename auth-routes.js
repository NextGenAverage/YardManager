// /api/login, /api/logout, /api/me, /api/password and the admin's /api/users.
const express = require("express");
const auth = require("./auth");

// disconnect(userId): close that user's live connections (after logout or deactivation).
module.exports = function authRoutes({ disconnect }) {
  const r = express.Router();
  const clean = (v, max) => String(v ?? "").trim().slice(0, max);

  r.post("/api/login", (req, res) => {
    const username = clean(req.body.username, 32);
    const password = String(req.body.password ?? "");
    const key = `${req.ip}|${username.toLowerCase()}`;
    if (auth.lockedOut(key)) return res.status(429).json({ error: "Too many wrong passwords. Try again in 5 minutes." });

    const user = auth.userByName(username);
    if (!user || !user.active || !auth.checkPassword(password, user.password_hash)) {
      auth.recordFailure(key);
      return res.status(401).json({ error: "Wrong username or password." });
    }
    auth.failures.delete(key);
    const { token, maxAge } = auth.startSession(user);
    auth.setSessionCookie(req, res, token, maxAge);
    res.json({ user: auth.publicUser(user) });
  });

  r.post("/api/logout", (req, res) => {
    auth.endSession(req.sessionToken);
    res.clearCookie(auth.COOKIE, { path: "/" });
    res.json({ ok: true });
  });

  r.get("/api/me", (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Please log in." });
    res.json({ user: auth.publicUser(req.user) });
  });

  // Change your own password (also used for the first login with a temporary password).
  r.post("/api/password", (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Please log in." });
    if (!auth.checkPassword(String(req.body.current ?? ""), req.user.password_hash)) {
      return res.status(400).json({ error: "Current password is wrong." });
    }
    const err = auth.passwordProblem(req.body.password);
    if (err) return res.status(400).json({ error: err });
    auth.setOwnPassword(req.user.id, req.body.password);
    res.json({ user: auth.publicUser(auth.userById(req.user.id)) });
  });

  // ---- User management (admins) ----
  const admin = auth.requireRole("admin");

  r.get("/api/users", admin, (req, res) => res.json({ users: auth.listUsers(), roles: auth.ROLES }));

  r.post("/api/users", admin, (req, res) => {
    const input = { username: clean(req.body.username, 32), name: clean(req.body.name, 60), role: clean(req.body.role, 20) };
    const err = auth.userProblem(input) || (auth.userByName(input.username) && "That username is taken.");
    if (err) return res.status(400).json({ error: err });
    res.json(auth.createUser(input));
  });

  // Change name, role or active; the last active admin can't be removed or demoted.
  r.post("/api/users/:id", admin, (req, res) => {
    const user = auth.userById(Number(req.params.id));
    if (!user) return res.status(404).json({ error: "No such user." });
    const next = {
      username: user.username,
      name: req.body.name !== undefined ? clean(req.body.name, 60) : user.name,
      role: req.body.role !== undefined ? clean(req.body.role, 20) : user.role,
    };
    const active = req.body.active !== undefined ? !!req.body.active : !!user.active;
    const err = auth.userProblem(next);
    if (err) return res.status(400).json({ error: err });
    const losesAdmin = user.role === "admin" && user.active && (next.role !== "admin" || !active);
    if (losesAdmin && auth.countActiveAdmins() <= 1) {
      return res.status(400).json({ error: "There must be at least one active admin." });
    }
    auth.updateUser(user.id, { ...next, active });
    if (!active || next.role !== user.role) {
      // Log them out everywhere so the change takes effect on all their devices.
      auth.endSessions(user.id);
      disconnect(user.id);
    }
    res.json({ user: auth.publicUser(auth.userById(user.id)) });
  });

  r.post("/api/users/:id/reset-password", admin, (req, res) => {
    const user = auth.userById(Number(req.params.id));
    if (!user) return res.status(404).json({ error: "No such user." });
    const password = auth.resetPassword(user.id);
    disconnect(user.id);
    res.json({ password });
  });

  return r;
};
