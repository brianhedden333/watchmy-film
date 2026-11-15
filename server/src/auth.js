// Passwordless sign-in: email a one-time link, then keep a session cookie.
// Tokens and session ids are random; only their SHA-256 hashes are stored.

import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import { config } from "./config.js";
import { db, now } from "./db.js";
import { notifyAdmin, signInEmail } from "./email.js";
import { rateLimit } from "./limits.js";

const COOKIE = "wmf_session";
const LINK_MINUTES = 30;
const SESSION_DAYS = 30;

const hash = (s) => createHash("sha256").update(s).digest("hex");
const token = () => randomBytes(32).toString("base64url");
const later = (ms) => new Date(Date.now() + ms).toISOString();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isAdmin = (user) => !!user && config.adminEmails.includes(user.email.toLowerCase());

function readCookie(req, name) {
  for (const part of (req.headers.cookie || "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

function setSessionCookie(res, value, maxAgeSec) {
  const attrs = [`${COOKIE}=${value}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAgeSec}`];
  if (config.production) attrs.push("Secure");
  res.setHeader("Set-Cookie", attrs.join("; "));
}

// Attaches req.user when a valid session cookie is present.
export function loadUser(req, _res, next) {
  const sid = readCookie(req, COOKIE);
  if (sid) {
    req.user = db
      .prepare(
        `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ? AND s.expires_at > ?`
      )
      .get(hash(sid), now());
  }
  next();
}

export function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Please sign in." });
  next();
}

export function requireAdmin(req, res, next) {
  if (!isAdmin(req.user)) return res.status(403).json({ error: "Admins only." });
  next();
}

export const authRouter = Router();

// Step 1: ask for a link. Same response whether or not the account exists, so this can't be used to probe emails.
authRouter.post("/request", rateLimit({ windowMs: 15 * 60_000, max: 8 }), async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const signup = req.body.mode === "signup";
  if (!EMAIL_RE.test(email) || email.length > 254) return res.status(400).json({ error: "Enter a valid email address." });
  if (signup && !req.body.terms) return res.status(400).json({ error: "Please agree to the terms to continue." });

  let user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  const isNew = !user;
  if (isNew) {
    // Sign-in with an unknown email still creates the account; the emailed link is what proves ownership.
    const info = db
      .prepare("INSERT INTO users (email, agreed_terms_at) VALUES (?, ?)")
      .run(email, signup ? now() : null);
    user = { id: info.lastInsertRowid, email };
    notifyAdmin("New sign-up", `${email} created an account.`);
  } else if (signup && !user.agreed_terms_at) {
    db.prepare("UPDATE users SET agreed_terms_at = ? WHERE id = ?").run(now(), user.id);
  }

  const t = token();
  db.prepare("INSERT INTO login_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(
    hash(t),
    user.id,
    later(LINK_MINUTES * 60_000)
  );
  try {
    await signInEmail(email, `${config.appUrl}/signin/?token=${t}`, isNew);
  } catch (e) {
    console.error("Sign-in email failed:", e.message);
    return res.status(502).json({ error: "We couldn't send the email. Try again in a minute." });
  }
  res.json({ ok: true });
});

// Step 2: the page the link opens posts the token here. (A POST, so email scanners that prefetch links don't use it up.)
authRouter.post("/verify", rateLimit({ windowMs: 15 * 60_000, max: 30 }), (req, res) => {
  const t = String(req.body.token || "");
  const row = t && db.prepare("SELECT * FROM login_tokens WHERE token_hash = ?").get(hash(t));
  if (!row || row.used_at || row.expires_at < now()) {
    return res.status(400).json({ error: "That sign-in link has expired or was already used. Request a new one." });
  }
  const sid = token();
  db.transaction(() => {
    db.prepare("UPDATE login_tokens SET used_at = ? WHERE token_hash = ?").run(now(), row.token_hash);
    db.prepare("INSERT INTO sessions (id_hash, user_id, expires_at) VALUES (?, ?, ?)").run(
      hash(sid),
      row.user_id,
      later(SESSION_DAYS * 86_400_000)
    );
    db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(now(), row.user_id);
  })();
  setSessionCookie(res, sid, SESSION_DAYS * 86_400);
  res.json({ ok: true });
});

authRouter.post("/logout", (req, res) => {
  const sid = readCookie(req, COOKIE);
  if (sid) db.prepare("DELETE FROM sessions WHERE id_hash = ?").run(hash(sid));
  setSessionCookie(res, "", 0);
  res.json({ ok: true });
});

authRouter.get("/me", (req, res) => {
  if (!req.user) return res.json({ user: null });
  const { id, email, name } = req.user;
  res.json({ user: { id, email, name, isAdmin: isAdmin(req.user) } });
});

authRouter.patch("/me", requireUser, (req, res) => {
  const name = String(req.body.name ?? "").trim().slice(0, 120) || null;
  db.prepare("UPDATE users SET name = ? WHERE id = ?").run(name, req.user.id);
  res.json({ ok: true });
});

// Housekeeping, run hourly from index.js.
export function purgeExpired() {
  const t = now();
  db.prepare("DELETE FROM login_tokens WHERE expires_at < ?").run(t);
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(t);
}
