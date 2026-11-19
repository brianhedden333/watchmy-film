// Filmmakers' own films: create, edit, image uploads, and the setup step (pay the setup fee or use a waiver code).

import { Router } from "express";
import multer from "multer";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.js";
import { db, now } from "./db.js";
import { isAdmin, requireUser } from "./auth.js";
import { rateLimit } from "./limits.js";
import { redeemSetupWaiver } from "./codes.js";
import { filmSubmittedEmail, notifyAdmin } from "./email.js";
import { createSetupCheckout, expireCheckout, settleCheckout, stripeEnabled } from "./payments.js";

// Editable fields and how to clean each one. Anything not listed here can't be set by the filmmaker.
const text = (max) => (v) => {
  const s = String(v ?? "").trim();
  if (s.length > max) throw new Error(`must be ${max} characters or fewer`);
  return s || null;
};
const int = (min, max) => (v) => {
  if (v === "" || v == null) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`must be a whole number from ${min} to ${max}`);
  return n;
};
const url = (v) => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  let u;
  try {
    u = new URL(s);
  } catch {
    throw new Error("must be a full web address starting with https://");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("must be a web address");
  return u.toString().slice(0, 500);
};
// The full film: a private Vimeo link or an unlisted YouTube link.
const filmLink = (v) => {
  const s = url(v);
  if (!s) return null;
  const host = new URL(s).hostname.replace(/^(www|m)\./, "");
  if (!["vimeo.com", "player.vimeo.com", "youtube.com", "youtu.be"].includes(host)) throw new Error("must be a Vimeo or YouTube link");
  return s;
};

const oneOf = (...opts) => (v) => {
  if (!opts.includes(v)) throw new Error(`must be one of ${opts.join(", ")}`);
  return v;
};
const domain = (v) => {
  const s = String(v ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!s) return null;
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s) || s.length > 253) throw new Error("must be a domain like yourfilm.com");
  return s;
};
// Names we keep for ourselves on watchmyfilm.online.
const RESERVED = new Set(
  "www api app admin mail email smtp ftp ns ns1 ns2 dns cdn static assets uploads media img images files help support docs blog status dashboard account accounts signin signup login logout auth billing pay payments checkout stripe webhook webhooks library preview sample workflow watch test dev staging beta demo shop store about contact terms privacy legal security root system".split(" ")
);
const SUB_RE = /^[a-z0-9](?:[a-z0-9-]{0,40}[a-z0-9])?$/;

const subdomain = (v) => {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return null;
  if (!SUB_RE.test(s)) throw new Error("can use only letters, numbers and dashes, and must start and end with a letter or number");
  if (RESERVED.has(s)) throw new Error("is reserved. Try another");
  return s;
};

// Turn a title into an address: "The Mountain Goat!" -> "the-mountain-goat".
export const slugify = (t) =>
  String(t || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42)
    .replace(/-+$/, "");

const subTaken = (name, filmId) =>
  !!db.prepare("SELECT 1 FROM films WHERE subdomain = ? AND id != ?").get(name, filmId ?? 0);
const domainTaken = (name, filmId) =>
  !!db.prepare("SELECT 1 FROM films WHERE own_domain = ? AND id != ?").get(name, filmId ?? 0);

// A free address close to the one asked for: name-film, name-<year>, name-2, name-3…
function suggestSub(base, film) {
  const b = slugify(base).slice(0, 36) || "film";
  const tries = [b, `${b}-film`, ...(film?.year ? [`${b}-${film.year}`] : []), `${b}-movie`, `watch-${b}`];
  for (let i = 2; i < 50; i++) tries.push(`${b}-${i}`);
  return tries.find((t) => SUB_RE.test(t) && !RESERVED.has(t) && !subTaken(t, film?.id)) || null;
}

// Credits: a list of roles, each with a list of names. Empty names and unnamed roles are dropped.
const credits = (v) => {
  if (v == null || v === "") return null;
  if (!Array.isArray(v) || v.length > 40) throw new Error("must be a list of up to 40 roles");
  const out = [];
  for (const c of v) {
    const role = String(c?.role ?? "").trim().slice(0, 80);
    const names = (Array.isArray(c?.names) ? c.names : []).map((n) => String(n ?? "").trim().slice(0, 200)).filter(Boolean);
    if (names.length > 100) throw new Error(`has too many names under ${role}`);
    if (role) out.push({ role, names });
  }
  return JSON.stringify(out);
};

// Bonus features for rentals and for purchases: a description for the Rent/Buy box and up to 10 videos.
// Rows with neither a title nor a link are dropped; a link without a title (or the reverse) is an error.
const BONUS_MAX = 10;
const bonus = (v) => {
  if (v == null || v === "") return null;
  if (typeof v !== "object" || Array.isArray(v)) throw new Error("isn't in the right format");
  const out = {};
  for (const kind of ["rent", "buy"]) {
    const b = v[kind] || {};
    const label = kind === "rent" ? "Rental" : "Purchase";
    const description = String(b.description ?? "").trim();
    if (description.length > 500) throw new Error(`${label} description must be 500 characters or fewer`);
    const rows = (Array.isArray(b.videos) ? b.videos : [])
      .map((x) => ({ title: String(x?.title ?? "").trim(), url: String(x?.url ?? "").trim() }))
      .filter((x) => x.title || x.url);
    if (rows.length > BONUS_MAX) throw new Error(`${label} bonus features: up to ${BONUS_MAX} videos`);
    const videos = rows.map((x, i) => {
      if (!x.title) throw new Error(`${label} bonus video ${i + 1} needs a title`);
      if (x.title.length > 200) throw new Error(`${label} bonus video ${i + 1}: title must be 200 characters or fewer`);
      if (!x.url) throw new Error(`${label} bonus video ${i + 1} needs a link`);
      let u;
      try {
        u = new URL(x.url);
      } catch {
        throw new Error(`${label} bonus video ${i + 1}: the link must start with https://`);
      }
      if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error(`${label} bonus video ${i + 1}: the link must be a web address`);
      return { title: x.title, url: u.toString().slice(0, 500) };
    });
    out[kind] = { description, videos };
  }
  return JSON.stringify(out);
};

const emptyBonus = () => ({ rent: { description: "", videos: [] }, buy: { description: "", videos: [] } });

const flag = (v) => (v === true || v === 1 || v === "1" || v === "on" ? 1 : 0);

// Venmo username (with or without @, or a venmo.com link).
const venmo = (v) => {
  let s = String(v ?? "").trim();
  if (!s) return null;
  s = s.replace(/^https?:\/\/(account\.)?venmo\.com\/(u\/)?/i, "").replace(/^@/, "").replace(/[/?#].*$/, "");
  if (!/^[A-Za-z0-9_-]{5,30}$/.test(s)) throw new Error("must be a Venmo username like @Jane-Filmmaker");
  return s;
};
// PayPal.Me name (or a paypal.me link).
const paypal = (v) => {
  let s = String(v ?? "").trim();
  if (!s) return null;
  s = s.replace(/^https?:\/\/(www\.)?paypal\.(me|com\/paypalme)\//i, "").replace(/[/?#].*$/, "");
  if (!/^[A-Za-z0-9]{1,20}$/.test(s)) throw new Error("must be your PayPal.Me name, like paypal.me/janefilms");
  return s;
};
// Zelle: the email or US phone number registered with Zelle.
const zelle = (v) => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254) return s.toLowerCase();
  const digits = s.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  throw new Error("must be the email or US phone number you use with Zelle");
};

// Browse tags: up to 10, each 1–32 characters of letters, numbers, spaces and simple punctuation.
// Duplicates (ignoring case) are dropped; the filmmaker's capitalization is kept.
export const TAGS_MAX = 10;
const tags = (v) => {
  if (v == null || v === "") return null;
  if (!Array.isArray(v)) throw new Error("must be a list of tags");
  const out = [];
  const seen = new Set();
  for (const raw of v) {
    const t = String(raw ?? "").trim().replace(/\s+/g, " ");
    if (!t) continue;
    if (t.length > 32) throw new Error(`"${t.slice(0, 32)}…" is too long (32 characters at most)`);
    if (!/^[\p{L}\p{N}][\p{L}\p{N} &'’.\/+-]*$/u.test(t)) throw new Error(`"${t}" can use only letters, numbers, spaces and & ' - / . +`);
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  if (out.length > TAGS_MAX) throw new Error(`can have up to ${TAGS_MAX} tags`);
  return out.length ? JSON.stringify(out) : null;
};

const color = (v) => {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return null;
  if (!/^#[0-9a-f]{6}$/.test(s)) throw new Error("must be a color like #1a2b3c");
  return s;
};

const FIELDS = {
  title: text(200),
  logline: text(300),
  synopsis: text(5000),
  director: text(200),
  year: int(1880, 2100),
  runtime_minutes: int(1, 1000),
  genre: text(100),
  languages: text(300),
  credits,
  bonus,
  trailer_url: url,
  vimeo_url: filmLink,
  rent_price_cents: int(99, 100000),
  buy_price_cents: int(99, 100000),
  pwyw_enabled: flag,
  pwyw_min_cents: (v) => int(99, 100000)(v) ?? 99, // blank means the 99¢ floor
  pwyw_suggested_cents: int(99, 100000),
  pwyw_access: oneOf("rent", "buy"),
  tip_venmo: venmo,
  tip_paypal: paypal,
  tip_zelle: zelle,
  free_watch: flag,
  discoverable: flag,
  tags,
  rental_days: int(1, 365),
  rental_hours: int(1, 720),
  // Only one plan for now: Secure (hosting we pay for) is paused, so every film is Standard.
  tier: () => "standard",
  address_type: oneOf("sub", "own"),
  subdomain,
  own_domain: domain,
  color_background: color,
  color_primary: color,
  color_secondary: color,
  color_button: color,
  contact_name: text(200),
  contact_phone: text(50),
  notes: text(3000),
};

const LABELS = {
  subdomain: "Web address",
  title: "Title",
  synopsis: "Synopsis",
  poster_path: "Poster",
  still_path: "Wide image",
  vimeo_url: "Film link (Vimeo or YouTube)",
  price: "A rent, buy or donation price, free viewing, or a tip jar",
};

const EDITABLE = new Set(["draft", "in_review", "changes_requested"]);

// What still needs filling in before the film can go to review.
export function missingFields(f) {
  const missing = [];
  for (const k of ["title", "synopsis", "poster_path", "still_path", "vimeo_url"]) if (!f[k]) missing.push(LABELS[k]);
  const hasTips = !!(f.tip_venmo || f.tip_paypal || f.tip_zelle);
  if (!f.rent_price_cents && !f.buy_price_cents && !f.pwyw_enabled && !f.free_watch && !hasTips) missing.push(LABELS.price);
  if (!f.subdomain) missing.push(LABELS.subdomain);
  return missing;
}

const directorOf = (creditsJson) =>
  (JSON.parse(creditsJson || "[]").find((c) => /^directors?$/i.test(c.role))?.names || []).join(", ") || null;

export const publicFilm = (f) => ({
  ...f,
  credits: f.credits ? JSON.parse(f.credits) : [],
  bonus: f.bonus ? JSON.parse(f.bonus) : emptyBonus(),
  poster_url: f.poster_path ? `/uploads/${f.poster_path}` : null,
  still_url: f.still_path ? `/uploads/${f.still_path}` : null,
  banner_url: f.banner_path ? `/uploads/${f.banner_path}` : null,
  missing: missingFields(f),
  hidden: !!f.hidden,
  pwyw_enabled: !!f.pwyw_enabled,
  free_watch: !!f.free_watch,
  discoverable: !!f.discoverable,
  tags: f.tags ? JSON.parse(f.tags) : [],
  editable: EDITABLE.has(f.status),
});

const getOwnFilmById = (id, userId) => db.prepare("SELECT * FROM films WHERE id = ? AND user_id = ?").get(id, userId);
const getOwnFilm = (req) => getOwnFilmById(Number(req.params.id), req.user.id);

function clean(body, { requireTitle }) {
  const out = {};
  const errors = {};
  for (const [k, fn] of Object.entries(FIELDS)) {
    if (!(k in body)) continue;
    try {
      out[k] = fn(body[k]);
    } catch (e) {
      errors[k] = e.message;
    }
  }
  if ((requireTitle || "title" in out) && !out.title) errors.title = "is required";
  if ("credits" in out && !errors.credits) out.director = directorOf(out.credits);
  return { out, errors };
}

// Poster and wide image are required; the banner is optional. Each kind has its own folder and column.
const IMAGES = {
  poster: { column: "poster_path", folder: "posters", name: "poster" },
  still: { column: "still_path", folder: "stills", name: "wide image" },
  banner: { column: "banner_path", folder: "banners", name: "banner" },
};
const IMAGE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const uploaders = Object.fromEntries(
  Object.entries(IMAGES).map(([kind, { folder }]) => {
    mkdirSync(join(config.uploadDir, folder), { recursive: true });
    return [
      kind,
      multer({
        storage: multer.diskStorage({
          destination: join(config.uploadDir, folder),
          filename: (_req, file, cb) => cb(null, `${randomBytes(12).toString("hex")}.${IMAGE_TYPES[file.mimetype]}`),
        }),
        limits: { fileSize: 10 * 1024 * 1024, files: 1 },
        fileFilter: (_req, file, cb) => cb(null, !!IMAGE_TYPES[file.mimetype]),
      }).single("image"),
    ];
  })
);

export const filmsRouter = Router();
filmsRouter.use(requireUser);

filmsRouter.get("/", async (req, res) => {
  // If someone paid but closed the tab before returning, settle it now.
  const pending = db
    .prepare("SELECT pending_checkout_id FROM films WHERE user_id = ? AND setup_status = 'unpaid' AND pending_checkout_id IS NOT NULL")
    .all(req.user.id);
  for (const p of pending) await settleCheckout(p.pending_checkout_id).catch((e) => console.error("Settle failed:", e.message));

  const films = db.prepare("SELECT * FROM films WHERE user_id = ? ORDER BY created_at DESC").all(req.user.id);
  res.json({
    films: films.map(publicFilm),
    setupFeeCents: config.setupFeeCents,
    setupUpfront: config.setupUpfront,
    setupSurchargeCents: config.setupSurchargeCents,
    checkoutEnabled: stripeEnabled(),
  });
});

filmsRouter.post("/", (req, res) => {
  const count = db.prepare("SELECT count(*) n FROM films WHERE user_id = ?").get(req.user.id).n;
  if (count >= 25) return res.status(400).json({ error: "That's a lot of films. Email us to add more." });
  const { out, errors } = clean(req.body, { requireTitle: true });
  if (Object.keys(errors).length) return res.status(400).json({ error: "Check the highlighted fields.", errors });
  const cols = Object.keys(out);
  const info = db
    .prepare(`INSERT INTO films (user_id, ${cols.join(", ")}) VALUES (?, ${cols.map(() => "?").join(", ")})`)
    .run(req.user.id, ...cols.map((c) => out[c]));
  const film = db.prepare("SELECT * FROM films WHERE id = ?").get(info.lastInsertRowid);
  notifyAdmin("New film started", `${req.user.email} started "${film.title}".`);
  res.status(201).json({ film: publicFilm(film) });
});

// Admins can read any film too, so they can open its preview while reviewing it.
// Is this address free? Used as the filmmaker types. ?subdomain=…&film=<id> (their own film doesn't count).
filmsRouter.get("/address-check", rateLimit({ windowMs: 60_000, max: 120 }), (req, res) => {
  const filmId = Number(req.query.film) || 0;
  const film = filmId ? getOwnFilmById(filmId, req.user.id) : null;
  if (req.query.domain != null) {
    let d;
    try {
      d = domain(req.query.domain);
    } catch (e) {
      return res.json({ available: false, reason: `Your domain ${e.message}.` });
    }
    if (!d) return res.json({ available: false, reason: "" });
    return res.json(domainTaken(d, filmId) ? { available: false, reason: `${d} is already used by another film.` } : { available: true, name: d });
  }
  const raw = String(req.query.subdomain ?? "");
  let s;
  try {
    s = subdomain(raw);
  } catch (e) {
    return res.json({ available: false, reason: `That address ${e.message}.`, suggestion: suggestSub(raw || film?.title, film) });
  }
  if (!s) return res.json({ available: false, reason: "", suggestion: suggestSub(film?.title, film) });
  if (subTaken(s, filmId)) return res.json({ available: false, reason: `${s}.${config.siteName} is taken.`, suggestion: suggestSub(s, film) });
  res.json({ available: true, name: s });
});

filmsRouter.get("/:id", (req, res) => {
  const film = isAdmin(req.user) ? db.prepare("SELECT * FROM films WHERE id = ?").get(Number(req.params.id)) : getOwnFilm(req);
  if (!film) return res.status(404).json({ error: "Film not found." });
  res.json({ film: publicFilm(film) });
});

filmsRouter.patch("/:id", (req, res) => {
  const film = getOwnFilm(req);
  if (!film) return res.status(404).json({ error: "Film not found." });
  const { out, errors } = clean(req.body, { requireTitle: false });
  // After approval everything stays editable except the link to the full film.
  if (!EDITABLE.has(film.status)) {
    if ("vimeo_url" in out && (out.vimeo_url || null) !== (film.vimeo_url || null))
      return res.status(409).json({ error: "The link to the full film can't change after approval. Email us to change it." });
    delete out.vimeo_url;
    const after = { ...film, ...out };
    const missing = missingFields(after);
    if (missing.length) return res.status(400).json({ error: `Your film is ${film.status}, so it still needs: ${missing.join(", ")}.` });
    if (film.status === "live" && sellsWithStripe(after) && (!req.user.stripe_has_account || !req.user.stripe_email))
      return res.status(400).json({ error: "Add your Stripe details before turning on Rent, Buy or donations, so sales can be paid to you." });
  }
  const minC = out.pwyw_min_cents ?? film.pwyw_min_cents;
  const sugC = "pwyw_suggested_cents" in out ? out.pwyw_suggested_cents : film.pwyw_suggested_cents;
  if (sugC != null && minC != null && sugC < minC) errors.pwyw_suggested_cents = "must be at least the minimum";
  if (out.subdomain && subTaken(out.subdomain, film.id)) {
    const alt = suggestSub(out.subdomain, film);
    errors.subdomain = `is taken${alt ? `. Try ${alt}` : ""}`;
  }
  if (out.own_domain && domainTaken(out.own_domain, film.id)) errors.own_domain = "is already used by another film";
  if (Object.keys(errors).length) return res.status(400).json({ error: "Check the highlighted fields.", errors });
  const cols = Object.keys(out);
  if (cols.length) {
    db.prepare(`UPDATE films SET ${cols.map((c) => `${c} = ?`).join(", ")}, updated_at = ? WHERE id = ?`).run(
      ...cols.map((c) => out[c]),
      now(),
      film.id
    );
  }
  res.json({ film: publicFilm(db.prepare("SELECT * FROM films WHERE id = ?").get(film.id)) });
});

filmsRouter.post("/:id/:kind", (req, res, next) => {
  const image = IMAGES[req.params.kind];
  if (!image) return next(); // checkout, redeem, etc.
  const film = getOwnFilm(req);
  if (!film) return res.status(404).json({ error: "Film not found." });
  uploaders[req.params.kind](req, res, (err) => {
    if (err) return res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "Images can be up to 10 MB." : "Upload failed." });
    if (!req.file) return res.status(400).json({ error: "Choose a JPG, PNG or WebP image." });
    db.prepare(`UPDATE films SET ${image.column} = ?, updated_at = ? WHERE id = ?`).run(`${image.folder}/${req.file.filename}`, now(), film.id);
    res.json({ film: publicFilm(db.prepare("SELECT * FROM films WHERE id = ?").get(film.id)) });
  });
});

// Nothing up front: send the film to review with nothing to pay. The setup cost is recovered later,
// $1 (SETUP_SURCHARGE_CENTS) per sale until SETUP_FEE_CENTS is covered.
filmsRouter.post("/:id/submit", (req, res) => {
  const film = getOwnFilm(req);
  if (!film) return res.status(404).json({ error: "Film not found." });
  if (config.setupUpfront) return res.status(409).json({ error: "Pay the setup fee to send your film for review." });
  if (film.status !== "draft" || film.setup_status !== "unpaid") return res.status(409).json({ error: "This film has already been sent for review." });
  const missing = missingFields(film);
  if (missing.length) return res.status(400).json({ error: `Add these first: ${missing.join(", ")}.` });
  const t = now();
  db.prepare(
    "UPDATE films SET setup_status = 'deferred', status = 'in_review', submitted_at = ?, updated_at = ? WHERE id = ?"
  ).run(t, t, film.id);
  const updated = db.prepare("SELECT * FROM films WHERE id = ?").get(film.id);
  notifyAdmin("Film submitted", `${req.user.email} submitted "${updated.title}".\n\n${config.appUrl}/admin/`);
  filmSubmittedEmail(req.user.email, updated, "deferred").catch((e) => console.error("Email failed:", e.message));
  res.json({ film: publicFilm(updated) });
});

// Paying up front (only when SETUP_UPFRONT=1). Kept for later.
// Setup fee, option 1: Stripe Checkout.
filmsRouter.post("/:id/checkout", async (req, res) => {
  const film = getOwnFilm(req);
  if (!film) return res.status(404).json({ error: "Film not found." });
  if (!config.setupUpfront) return res.status(409).json({ error: "There's no setup fee to pay now. Send your film for review instead." });
  if (film.setup_status !== "unpaid") return res.status(409).json({ error: "The setup fee is already taken care of." });
  const missing = missingFields(film);
  if (missing.length) return res.status(400).json({ error: `Add these first: ${missing.join(", ")}.` });
  if (!stripeEnabled()) return res.status(503).json({ error: "Payments aren't switched on yet. Email us." });
  try {
    const session = await createSetupCheckout(film, req.user);
    res.json({ url: session.url });
  } catch (e) {
    console.error("Checkout failed:", e.message);
    res.status(502).json({ error: "We couldn't start checkout. Try again in a minute." });
  }
});

// Return from Stripe: confirm right away instead of waiting for the webhook.
filmsRouter.post("/:id/confirm", async (req, res) => {
  const film = getOwnFilm(req);
  if (!film) return res.status(404).json({ error: "Film not found." });
  const sessionId = String(req.body.session_id || "");
  if (sessionId && sessionId === film.pending_checkout_id) {
    await settleCheckout(sessionId).catch((e) => console.error("Confirm failed:", e.message));
  }
  res.json({ film: publicFilm(db.prepare("SELECT * FROM films WHERE id = ?").get(film.id)) });
});

// Setup fee, option 2: a waiver code from us.
filmsRouter.post("/:id/redeem", rateLimit({ windowMs: 15 * 60_000, max: 10 }), async (req, res) => {
  const film = getOwnFilm(req);
  if (!film) return res.status(404).json({ error: "Film not found." });
  if (film.setup_status !== "unpaid") return res.status(409).json({ error: "The setup fee is already taken care of." });
  const missing = missingFields(film);
  if (missing.length) return res.status(400).json({ error: `Add these first: ${missing.join(", ")}.` });
  const problem = redeemSetupWaiver(req.body.code, film, req.user);
  if (problem) return res.status(400).json({ error: problem });
  // Close any half-finished checkout so they can't also pay for it.
  if (film.pending_checkout_id) expireCheckout(film.pending_checkout_id);

  const updated = db.prepare("SELECT * FROM films WHERE id = ?").get(film.id);
  notifyAdmin("Film submitted (code)", `${req.user.email} submitted "${updated.title}" with code ${String(req.body.code).toUpperCase()}.\n\n${config.appUrl}/admin/`);
  filmSubmittedEmail(req.user.email, updated, "waived").catch((e) => console.error("Email failed:", e.message));
  res.json({ film: publicFilm(updated) });
});

// After we ask for changes, the filmmaker sends it back to review (fee already handled).
// After approval the owner decides when the page goes public, and can take it down again.
// Going live needs their Stripe details when the film sells anything (rent, buy or donations), since sales are paid
// into their account. A film that's only free to watch and/or has a tip jar can go live without them.
export const sellsWithStripe = (f) => !!(f.rent_price_cents || f.buy_price_cents || f.pwyw_enabled);

filmsRouter.post("/:id/go-live", (req, res) => {
  const film = getOwnFilm(req);
  if (!film) return res.status(404).json({ error: "Film not found." });
  if (film.status !== "approved") return res.status(409).json({ error: "Your film can go live once it's approved." });
  if (sellsWithStripe(film) && (!req.user.stripe_has_account || !req.user.stripe_email)) {
    return res.status(400).json({ error: "Add your Stripe details first, so sales can be paid to you." });
  }
  db.prepare("UPDATE films SET status = 'live', updated_at = ? WHERE id = ?").run(now(), film.id);
  notifyAdmin("Film went live", `${req.user.email} set "${film.title}" live.\n\n${config.appUrl}/admin/`);
  res.json({ film: publicFilm(db.prepare("SELECT * FROM films WHERE id = ?").get(film.id)) });
});

// Hide or show a live film. Hidden: the address shows a holding page instead of the film.
filmsRouter.post("/:id/visibility", (req, res) => {
  const film = getOwnFilm(req);
  if (!film) return res.status(404).json({ error: "Film not found." });
  if (film.status !== "live") return res.status(409).json({ error: "Only a live film can be hidden or shown." });
  const hidden = req.body.hidden === true;
  db.prepare("UPDATE films SET hidden = ?, updated_at = ? WHERE id = ?").run(hidden ? 1 : 0, now(), film.id);
  notifyAdmin(hidden ? "Film hidden" : "Film shown again", `${req.user.email} ${hidden ? "hid" : "unhid"} "${film.title}".\n\n${config.appUrl}/admin/`);
  res.json({ film: publicFilm(db.prepare("SELECT * FROM films WHERE id = ?").get(film.id)) });
});

filmsRouter.post("/:id/resubmit", (req, res) => {
  const film = getOwnFilm(req);
  if (!film) return res.status(404).json({ error: "Film not found." });
  if (film.status !== "changes_requested") return res.status(409).json({ error: "This film isn't waiting on changes." });
  const missing = missingFields(film);
  if (missing.length) return res.status(400).json({ error: `Add these first: ${missing.join(", ")}.` });
  db.prepare("UPDATE films SET status = 'in_review', submitted_at = ?, updated_at = ? WHERE id = ?").run(now(), now(), film.id);
  notifyAdmin("Film resubmitted", `${req.user.email} resubmitted "${film.title}".\n\n${config.appUrl}/admin/`);
  res.json({ film: publicFilm(db.prepare("SELECT * FROM films WHERE id = ?").get(film.id)) });
});
