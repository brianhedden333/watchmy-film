// Sign-in: an emailed one-time link (which also confirms the address), or an optional password once confirmed.
// Tokens and session ids are random; only their SHA-256 hashes are stored. Passwords are hashed with scrypt.

import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { config } from "./config.js";
import { db, now } from "./db.js";
import { notifyAdmin, signInEmail } from "./email.js";
import { rateLimit } from "./limits.js";
import { connectInfo } from "./connect.js";
import { safeNext, siteOf, siteOfUrl, siteUrl } from "./sites.js";

// One cookie per site: watchmyfilm.online's, and indiefilm.club's (shared with its film addresses).
const COOKIES = { app: "wmf_session", club: "ifc_session" };
const HOP_MINUTES = 2;
// Sign-in links are short-lived. Confirmation links (account not yet confirmed) last a day, because some inboxes
// (iCloud especially) can hold a new sender's mail for an hour or more. Both work only once.
const LINK_MINUTES = 30;
const CONFIRM_MINUTES = 24 * 60;
const SESSION_DAYS = 30;

const hash = (s) => createHash("sha256").update(s).digest("hex");
const token = () => randomBytes(32).toString("base64url");
const later = (ms) => new Date(Date.now() + ms).toISOString();
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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

const isViewer = (user) =>
  !!(
    db.prepare("SELECT 1 FROM payments WHERE user_id = ? AND purpose IN ('rent', 'buy') LIMIT 1").get(user.id) ||
    db.prepare("SELECT 1 FROM watchlist WHERE user_id = ? LIMIT 1").get(user.id)
  );

// Where to land after signing in.
// On indiefilm.club: My Library if they have anything there, otherwise Browse.
// On watchmyfilm.online: admins → /admin/; filmmakers → My Films once one is live, otherwise add-a-film;
// viewers with no films of their own → their library on indiefilm.club (a full URL).
export function homeFor(user, site = "app") {
  if (site === "club") return isViewer(user) ? "/library/" : "/";
  if (isAdmin(user)) return "/admin/";
  const live = db.prepare("SELECT 1 FROM films WHERE user_id = ? AND status = 'live' AND deleted_at IS NULL LIMIT 1").get(user.id);
  if (live) return "/dashboard/";
  const ownsFilms = db.prepare("SELECT 1 FROM films WHERE user_id = ? AND deleted_at IS NULL LIMIT 1").get(user.id);
  if (!ownsFilms && isViewer(user)) return `${config.clubUrl}/library/`;
  return "/add-a-film/";
}

// Signs this browser in on the site the request is for. linkId ties it to a session on the other site
// (made by the hop), so signing out of either ends both.
export function startSession(req, res, userId, linkId = null) {
  const { site } = siteOf(req);
  const sid = token();
  db.prepare("INSERT INTO sessions (id_hash, user_id, expires_at, site, link_id) VALUES (?, ?, ?, ?, ?)").run(
    hash(sid),
    userId,
    later(SESSION_DAYS * 86_400_000),
    site,
    linkId || token()
  );
  db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(now(), userId);
  setSessionCookie(req, res, sid, SESSION_DAYS * 86_400);
}

// One-time sign-in link tokens (also used by film pages for viewers: see sales.js).
export function createLoginToken(userId, minutes) {
  const t = token();
  db.prepare("INSERT INTO login_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(hash(t), userId, later(minutes * 60_000));
  return t;
}

// Uses up a token. Returns the user, or null if it's unknown, used or expired. Hop codes don't work here.
export function useLoginToken(t) {
  const row = t && db.prepare("SELECT * FROM login_tokens WHERE token_hash = ?").get(hash(String(t)));
  if (!row || row.used_at || row.expires_at < now() || row.link_id) return null;
  db.prepare("UPDATE login_tokens SET used_at = ? WHERE token_hash = ?").run(now(), row.token_hash);
  return db.prepare("SELECT * FROM users WHERE id = ?").get(row.user_id);
}

export const isAdmin = (user) => !!user && config.adminEmails.includes(user.email.toLowerCase());

function readCookie(req, name) {
  for (const part of (req.headers.cookie || "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

function setSessionCookie(req, res, value, maxAgeSec) {
  const { site, cookieDomain } = siteOf(req);
  const attrs = [`${COOKIES[site]}=${value}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAgeSec}`];
  if (cookieDomain) attrs.push(`Domain=${cookieDomain}`);
  if (config.production) attrs.push("Secure");
  res.setHeader("Set-Cookie", attrs.join("; "));
}

// Attaches req.user when a valid session cookie for this site is present (req.site says which site this is).
export function loadUser(req, _res, next) {
  const { site } = siteOf(req);
  req.site = site;
  const sid = readCookie(req, COOKIES[site]);
  if (sid) {
    const row = db
      .prepare(
        `SELECT u.*, s.link_id AS session_link_id FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.id_hash = ? AND s.expires_at > ? AND s.site = ?`
      )
      .get(hash(sid), now(), site);
    if (row) {
      req.sessionLink = row.session_link_id;
      delete row.session_link_id;
      req.user = row;
    }
  }
  next();
}

export function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Please sign in." });
  next();
}

// Filmmaker tools (films, Stripe, sales, admin, password) only work when signed in on watchmyfilm.online.
// An indiefilm.club sign-in is for watching: library, Watch Later, purchases.
export function appOnly(req, res, next) {
  if (req.site !== "app") return res.status(403).json({ error: `Sign in on ${config.siteName} for this.` });
  next();
}

export function requireAdmin(req, res, next) {
  if (!isAdmin(req.user)) return res.status(403).json({ error: "Admins only." });
  next();
}

export const authRouter = Router();

// Step 1: ask for a link. Same response whether or not the account exists, so this can't be used to probe emails.
// Bot checks for /request: our form sends a hidden honeypot (_gotcha, empty for people) and how long the form was open.
// Anything that fills the honeypot, skips the timing, or submits faster than a person gets a normal-looking reply
// and nothing else: no account, no email, no notice.
const MIN_FILL_MS = 2500;
function looksLikeBot(body) {
  if (String(body._gotcha ?? "").trim()) return "honeypot";
  const elapsed = Number(body.elapsed);
  if (!Number.isFinite(elapsed)) return "no timing";
  if (elapsed < MIN_FILL_MS) return "too fast";
  return null;
}

authRouter.post("/request", rateLimit({ windowMs: 15 * 60_000, max: 8 }), async (req, res) => {
  const bot = looksLikeBot(req.body);
  if (bot) {
    console.warn(`Ignored sign-in request (${bot}) from ${req.ip}`);
    return res.json({ ok: true });
  }
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

  const confirming = !user.email_verified_at;
  const minutes = confirming ? CONFIRM_MINUTES : LINK_MINUTES;
  const t = token();
  db.prepare("INSERT INTO login_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(
    hash(t),
    user.id,
    later(minutes * 60_000)
  );
  try {
    // Until the address is confirmed, every link is worded as a confirmation. The link opens the site they asked on.
    const site = siteOf(req).site;
    await signInEmail(email, `${siteUrl(site)}/signin/?token=${t}`, confirming, site);
  } catch (e) {
    console.error("Sign-in email failed:", e.message);
    return res.status(502).json({ error: "We couldn't send the email. Try again in a minute." });
  }
  res.json({ ok: true, expires: confirming ? "24 hours" : "30 minutes" });
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
    startSession(req, res, user.id);
  })();
  res.json({ ok: true, justVerified, hasPassword: !!user.password_hash, next: homeFor(user, req.site) });
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
  startSession(req, res, user.id);
  res.json({ ok: true, next: homeFor(user, req.site) });
});

// ---------- One sign-in for both sites: the hop ----------
// Cookies can't cross domains, so a signed-in person passes through the other site with a one-time code:
//   GET /api/auth/hop?next=<url>   (on the site they're signed in to)
//     → <other site>/api/auth/land?t=<code>&next=<url>   (signs them in there, linked to this session)
//     → <url>
// next can be on either site (when it's on this one, they bounce through the other and come straight back).
// Not signed in: straight to next. Only our own addresses are allowed as next (see safeNext).
authRouter.get("/hop", (req, res) => {
  const next = safeNext(req, req.query.next);
  if (!next) return res.redirect(302, "/");
  if (!req.user) return res.redirect(302, next);
  const here = req.site;
  const target = siteOfUrl(next);
  const land = target !== here ? target : here === "app" ? "club" : "app";
  const t = token();
  db.prepare("INSERT INTO login_tokens (token_hash, user_id, expires_at, link_id) VALUES (?, ?, ?, ?)").run(
    hash(t),
    req.user.id,
    later(HOP_MINUTES * 60_000),
    req.sessionLink || token()
  );
  res.set("Referrer-Policy", "no-referrer").set("Cache-Control", "no-store");
  res.redirect(302, `${siteUrl(land)}/api/auth/land?t=${encodeURIComponent(t)}&next=${encodeURIComponent(next)}`);
});

authRouter.get("/land", rateLimit({ windowMs: 15 * 60_000, max: 60 }), (req, res) => {
  const next = safeNext(req, req.query.next) || "/";
  const row = req.query.t && db.prepare("SELECT * FROM login_tokens WHERE token_hash = ?").get(hash(String(req.query.t)));
  // Only hop codes (they carry a link_id), unused and unexpired. A bad code just carries on to next, signed out.
  if (row && row.link_id && !row.used_at && row.expires_at >= now()) {
    db.prepare("UPDATE login_tokens SET used_at = ? WHERE token_hash = ?").run(now(), row.token_hash);
    // Already signed in here as the same person: nothing to do. Otherwise sign in (replacing any other sign-in).
    if (req.user?.id !== row.user_id) startSession(req, res, row.user_id, row.link_id);
  }
  res.set("Referrer-Policy", "no-referrer").set("Cache-Control", "no-store");
  res.redirect(302, next);
});

// Set or change the password while signed in (offered right after the email is confirmed).
// Changing an existing password needs the current one; other sessions are signed out.
authRouter.post("/password", requireUser, appOnly, rateLimit({ windowMs: 15 * 60_000, max: 10 }), async (req, res) => {
  const err = passwordError(req.body.password);
  if (err) return res.status(400).json({ error: err, errors: { password: err } });
  if (req.user.password_hash && !(await checkPassword(String(req.body.current || ""), req.user.password_hash))) {
    return res.status(400).json({ error: "Your current password isn't right.", errors: { current: "isn't right" } });
  }
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(await hashPassword(req.body.password), req.user.id);
  const sid = readCookie(req, COOKIES[req.site]);
  // Changing it signs out everywhere else, except this session and its twin on the other site.
  if (req.user.password_hash && sid)
    db.prepare("DELETE FROM sessions WHERE user_id = ? AND id_hash != ? AND (link_id IS NULL OR link_id != ?)").run(req.user.id, hash(sid), req.sessionLink || "");
  res.json({ ok: true });
});

// Signing out of either site ends both (sessions made by the hop share a link_id).
authRouter.post("/logout", (req, res) => {
  const sid = readCookie(req, COOKIES[siteOf(req).site]);
  if (sid) {
    const row = db.prepare("SELECT link_id FROM sessions WHERE id_hash = ?").get(hash(sid));
    if (row?.link_id) db.prepare("DELETE FROM sessions WHERE link_id = ?").run(row.link_id);
    db.prepare("DELETE FROM sessions WHERE id_hash = ?").run(hash(sid));
  }
  setSessionCookie(req, res, "", 0);
  res.json({ ok: true });
});

authRouter.get("/me", (req, res) => {
  if (!req.user) return res.json({ user: null });
  const { id, email, name } = req.user;
  res.json({
    user: { id, email, name, isAdmin: isAdmin(req.user), hasPassword: !!req.user.password_hash, home: homeFor(req.user, req.site), stripe: stripeInfo(req.user), connect: connectInfo(req.user),
      hasFilms: !!db.prepare("SELECT 1 FROM films WHERE user_id = ? AND deleted_at IS NULL LIMIT 1").get(req.user.id),
      agreedTerms: !!req.user.agreed_terms_at },
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

authRouter.put("/stripe", requireUser, appOnly, (req, res) => {
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
