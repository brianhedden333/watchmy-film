// Sign-in: an emailed one-time link (which also confirms the address), or an optional password once confirmed.
// Tokens and session ids are random; only their SHA-256 hashes are stored. Passwords are hashed with scrypt.

import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
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
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 200;

// scrypt N=2^15, r=8, p=1: about 32 MB and ~50 ms per hash.
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const scryptAsync = (pw, salt, len, opts) =>
  new Promise((ok, fail) => scrypt(pw, salt, len, opts, (e, key) => (e ? fail(e) : ok(key))));

async function hashPassword(pw) {
  const salt = randomBytes(16);
  const key = await scryptAsync(pw, salt, 32, SCRYPT);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64url"), key.toString("base64url")].join("$");
}

async function checkPassword(pw, stored) {
  const [alg, N, r, p, salt, hashed] = String(stored || "").split("$");
  if (alg !== "scrypt") return false;
  const want = Buffer.from(hashed, "base64url");
  const key = await scryptAsync(pw, Buffer.from(salt, "base64url"), want.length, { N: +N, r: +r, p: +p, maxmem: SCRYPT.maxmem });
  return timingSafeEqual(key, want);
}

// Checked against when the email has no password, so a wrong email takes as long as a wrong password.
const DUMMY_HASH = await hashPassword(randomBytes(16).toString("hex"));

function passwordError(pw) {
  if (typeof pw !== "string" || pw.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (pw.length > PASSWORD_MAX) return `Use ${PASSWORD_MAX} characters or fewer.`;
  return null;
}

// Where to land after signing in: the films list once one is published, otherwise the add-a-film onboarding.
export function homeFor(userId) {
  const live = db.prepare("SELECT 1 FROM films WHERE user_id = ? AND status = 'live' LIMIT 1").get(userId);
  return live ? "/dashboard/" : "/add-a-film/";
}

function startSession(res, userId) {
  const sid = token();
  db.prepare("INSERT INTO sessions (id_hash, user_id, expires_at) VALUES (?, ?, ?)").run(
    hash(sid),
    userId,
    later(SESSION_DAYS * 86_400_000)
  );
  db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(now(), userId);
  setSessionCookie(res, sid, SESSION_DAYS * 86_400);
}

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
    // Until the address is confirmed, every link is worded as a confirmation.
    await signInEmail(email, `${config.appUrl}/signin/?token=${t}`, !user.email_verified_at);
  } catch (e) {
    console.error("Sign-in email failed:", e.message);
    return res.status(502).json({ error: "We couldn't send the email. Try again in a minute." });
  }
  res.json({ ok: true });
});

// Step 2: the page the link opens posts the token here. (A POST, so email scanners that prefetch links don't use it up.)
// The first time, this also confirms the email address; the page then offers to set a password.
authRouter.post("/verify", rateLimit({ windowMs: 15 * 60_000, max: 30 }), (req, res) => {
  const t = String(req.body.token || "");
  const row = t && db.prepare("SELECT * FROM login_tokens WHERE token_hash = ?").get(hash(t));
  if (!row || row.used_at || row.expires_at < now()) {
    return res.status(400).json({ error: "That sign-in link has expired or was already used. Request a new one." });
  }
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(row.user_id);
  const justVerified = !user.email_verified_at;
  db.transaction(() => {
    db.prepare("UPDATE login_tokens SET used_at = ? WHERE token_hash = ?").run(now(), row.token_hash);
    if (justVerified) db.prepare("UPDATE users SET email_verified_at = ? WHERE id = ?").run(now(), user.id);
    startSession(res, user.id);
  })();
  res.json({ ok: true, justVerified, hasPassword: !!user.password_hash, next: homeFor(user.id) });
});

// Password sign-in, for confirmed accounts that have set one. One vague error for every failure.
authRouter.post("/login", rateLimit({ windowMs: 15 * 60_000, max: 10 }), async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const pw = String(req.body.password || "");
  const user = EMAIL_RE.test(email) ? db.prepare("SELECT * FROM users WHERE email = ?").get(email) : null;
  const ok = await checkPassword(pw.slice(0, PASSWORD_MAX), user?.password_hash || DUMMY_HASH);
  if (!user || !ok || !user.password_hash || !user.email_verified_at) {
    return res.status(401).json({ error: "That email and password don't match. Try again, or email yourself a sign-in link." });
  }
  startSession(res, user.id);
  res.json({ ok: true, next: homeFor(user.id) });
});

// Set or change the password while signed in (offered right after the email is confirmed).
// Changing an existing password needs the current one; other sessions are signed out.
authRouter.post("/password", requireUser, rateLimit({ windowMs: 15 * 60_000, max: 10 }), async (req, res) => {
  const err = passwordError(req.body.password);
  if (err) return res.status(400).json({ error: err, errors: { password: err } });
  if (req.user.password_hash && !(await checkPassword(String(req.body.current || ""), req.user.password_hash))) {
    return res.status(400).json({ error: "Your current password isn't right.", errors: { current: "isn't right" } });
  }
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(await hashPassword(req.body.password), req.user.id);
  const sid = readCookie(req, COOKIE);
  if (req.user.password_hash && sid) db.prepare("DELETE FROM sessions WHERE user_id = ? AND id_hash != ?").run(req.user.id, hash(sid));
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
  res.json({
    user: { id, email, name, isAdmin: isAdmin(req.user), hasPassword: !!req.user.password_hash, home: homeFor(id), stripe: stripeInfo(req.user) },
  });
});

authRouter.patch("/me", requireUser, (req, res) => {
  const name = String(req.body.name ?? "").trim().slice(0, 120) || null;
  db.prepare("UPDATE users SET name = ? WHERE id = ?").run(name, req.user.id);
  res.json({ ok: true });
});

// Payout details, collected before Stripe Connect exists so we can connect each account by hand.
export const stripeInfo = (u) =>
  u.stripe_has_account == null
    ? null
    : { hasAccount: !!u.stripe_has_account, email: u.stripe_email, accountId: u.stripe_account_id, country: u.stripe_country, updatedAt: u.stripe_updated_at };

authRouter.put("/stripe", requireUser, (req, res) => {
  const has = req.body.hasAccount === true;
  if (req.body.hasAccount !== true && req.body.hasAccount !== false) return res.status(400).json({ error: "Say whether you have a Stripe account." });
  const errors = {};
  const email = String(req.body.email || "").trim().toLowerCase();
  const accountId = String(req.body.accountId || "").trim();
  const country = String(req.body.country || "").trim().slice(0, 60);
  if (has && (!EMAIL_RE.test(email) || email.length > 254)) errors.email = "Enter the email you use to sign in to Stripe.";
  if (has && accountId && !/^acct_[A-Za-z0-9]{8,32}$/.test(accountId)) errors.accountId = "Account IDs start with acct_ (or leave it blank).";
  if (!country) errors.country = "Choose the country your bank account is in.";
  if (Object.keys(errors).length) return res.status(400).json({ error: Object.values(errors)[0], errors });

  db.prepare(
    `UPDATE users SET stripe_has_account = ?, stripe_email = ?, stripe_account_id = ?, stripe_country = ?, stripe_updated_at = ? WHERE id = ?`
  ).run(has ? 1 : 0, has ? email : null, has ? accountId || null : null, country, now(), req.user.id);
  notifyAdmin(
    "Stripe details added",
    has
      ? `${req.user.email}: Stripe account ${email}${accountId ? ` (${accountId})` : ""}, ${country}.`
      : `${req.user.email} doesn't have a Stripe account yet (${country}).`
  );
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  res.json({ stripe: stripeInfo(user) });
});

// Housekeeping, run hourly from index.js.
export function purgeExpired() {
  const t = now();
  db.prepare("DELETE FROM login_tokens WHERE expires_at < ?").run(t);
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(t);
}
