// Viewer sales on a film's own page (<name>.watchmyfilm.online): rent, buy, or pay what you want.
//
// Each sale is a Stripe Checkout Session created ON the filmmaker's connected account (a direct charge: they are
// the merchant of record and pay Stripe's card fee). Our cut is application_fee_amount: PLATFORM_FEE_PERCENT
// (min PLATFORM_FEE_MIN_CENTS) plus, for films with setup_status 'deferred', SETUP_SURCHARGE_CENTS per sale until
// SETUP_FEE_CENTS has been recovered.
//
// Viewers don't need an account first: Checkout collects their email, and we make a viewer account for it.
// Sessions are per address (cookies are host-only), so buyers are signed in on the film's own address:
//   - right after paying, the Checkout return link (?paid=cs_…) signs them in once;
//   - the receipt email and "Already paid? Watch now" send a one-time sign-in link to that address.
// Sales are recorded by settleSale(), from the return link or the Connect webhook, whichever comes first.

import { Router } from "express";
import Stripe from "stripe";
import { config } from "./config.js";
import { db, now } from "./db.js";
import { createLoginToken, EMAIL_RE, startSession, useLoginToken } from "./auth.js";
import { notifyAdmin, purchaseEmail, saleEmail, viewerSignInEmail } from "./email.js";
import { rateLimit } from "./limits.js";
import { canSell } from "./connect.js";
import { filmRowForHost } from "./watch.js";
import { publicFilm } from "./films.js";

const APP = "watchmyfilm";
const DAY = 86_400_000;
const HOUR = 3_600_000;
const MAX_CENTS = 100_000; // $1,000, same ceiling as film prices
const CLAIM_HOURS = 24; // the Checkout return link can sign the buyer in once, within this window
// Where the watch page lives on a film's address: "/" in production (nginx), "/watch/" on the Vite dev server.
const PAGE = config.production ? "/" : "/watch/";
const stripe = config.stripeSecretKey ? new Stripe(config.stripeSecretKey) : null;

// ---------- money ----------

// Stripe's card fee on a US card (2.9% + 30¢), charged to the filmmaker on direct charges. Only used to keep room
// for it when sizing our fee on tiny tickets; the real fee is read back from Stripe after the sale.
const stripeFeeEstimate = (amount) => Math.round(amount * 0.029) + 30;

// Our application fee for a sale of `amount` cents on this film: the platform fee (8%, min 50¢), plus up to
// SETUP_SURCHARGE_CENTS toward the setup cost while it isn't recovered. On small tickets the surcharge shrinks
// to what fits after Stripe's fee, so the filmmaker never ends up below zero on a sale. Whatever surcharge we
// take is credited to the film's setup cost.
export function feeFor(film, amount) {
  const base = Math.min(Math.max(Math.round((amount * config.platformFeePercent) / 100), config.platformFeeMinCents), amount);
  let surcharge = 0;
  if (film.setup_status === "deferred") {
    const left = Math.max(0, config.setupFeeCents - (film.setup_recovered_cents || 0));
    const room = Math.max(0, amount - stripeFeeEstimate(amount) - base);
    surcharge = Math.min(config.setupSurchargeCents, left, room);
  }
  return { fee: base + surcharge, surcharge };
}

// ---------- access ----------

const rentalDays = (film) => film.rental_days ?? 30;
const watchDays = (film) => film.rental_watch_days ?? 3;

// What this person may watch of this film right now: owned beats rented; a rental must be started within
// rental_days of paying, and then lasts rental_watch_days from the first play. null = nothing.
export function entitlement(userId, film) {
  if (!userId) return null;
  const rows = db
    .prepare("SELECT * FROM payments WHERE user_id = ? AND film_id = ? AND purpose IN ('rent', 'buy') ORDER BY created_at DESC")
    .all(userId, film.id);
  const owned = rows.find((r) => r.purpose === "buy");
  if (owned) return { access: "buy", payment: owned };
  const t = Date.now();
  for (const r of rows) {
    if (!r.started_at) {
      const startBy = Date.parse(r.created_at) + rentalDays(film) * DAY;
      if (t < startBy) return { access: "rent", payment: r, started: false, start_by: new Date(startBy).toISOString() };
    } else {
      const ends = Date.parse(r.started_at) + watchDays(film) * DAY;
      if (t < ends) return { access: "rent", payment: r, started: true, ends_at: new Date(ends).toISOString() };
    }
  }
  return null;
}

// The film's address, for emails. Production: https://<name>.<domain> (or watch.<own domain>);
// local dev: http://<name>.localhost:<port> next to APP_URL.
export function filmOrigin(film) {
  const app = new URL(config.appUrl);
  if (app.hostname === "localhost" || app.hostname === "127.0.0.1") return `${app.protocol}//${film.subdomain}.localhost${app.port ? `:${app.port}` : ""}`;
  if (film.address_type === "own" && film.own_domain) return `https://watch.${film.own_domain}`;
  return `https://${film.subdomain}.${config.siteDomain}`;
}

// The film's watch page (with the dev-server path when running locally).
export const filmPageUrl = (film) => `${filmOrigin(film)}${PAGE}`;

// ---------- recording a sale ----------

const getUser = (id) => db.prepare("SELECT * FROM users WHERE id = ?").get(id);

// Records a paid Checkout Session from a filmmaker's account. Safe to call any number of times (return link and
// webhook). Returns the payments row, or null if this isn't a finished viewer sale of ours.
export async function settleSale(session, account) {
  if (session.metadata?.app !== APP || session.metadata?.purpose !== "viewer_sale") return null;
  if (session.payment_status !== "paid") return null; // async methods: wait for checkout.session.async_payment_succeeded
  const existing = db.prepare("SELECT * FROM payments WHERE stripe_session_id = ?").get(session.id);
  if (existing) return existing;

  const film = db.prepare("SELECT * FROM films WHERE id = ?").get(Number(session.metadata.film_id));
  const owner = film && getUser(film.user_id);
  if (!owner || owner.connect_account_id !== account) {
    console.error(`Sale ${session.id} doesn't match its film's Stripe account (${account}); not recorded.`);
    return null;
  }
  const email = String(session.customer_details?.email || session.customer_email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new Error(`Sale ${session.id} has no usable email`);

  const access = session.metadata.access === "buy" ? "buy" : "rent";
  const fee = Number(session.metadata.fee) || 0;
  const surcharge = Number(session.metadata.surcharge) || 0;

  const result = db.transaction(() => {
    const again = db.prepare("SELECT * FROM payments WHERE stripe_session_id = ?").get(session.id);
    if (again) return { payment: again, isNew: false };
    let viewer = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!viewer) viewer = { id: db.prepare("INSERT INTO users (email) VALUES (?)").run(email).lastInsertRowid };
    const info = db
      .prepare(
        `INSERT INTO payments (film_id, user_id, purpose, stripe_session_id, stripe_payment_intent, amount_cents,
                               sale_kind, connect_account, application_fee_cents, setup_surcharge_cents)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(film.id, viewer.id, access, session.id, String(session.payment_intent || ""), session.amount_total,
           session.metadata.kind, account, fee, surcharge);
    if (surcharge) {
      db.prepare("UPDATE films SET setup_recovered_cents = MIN(?, setup_recovered_cents + ?) WHERE id = ?").run(config.setupFeeCents, surcharge, film.id);
    }
    return { payment: db.prepare("SELECT * FROM payments WHERE id = ?").get(info.lastInsertRowid), isNew: true };
  })();

  if (result.isNew) {
    recordStripeFee(result.payment).catch((e) => console.error("Stripe fee lookup failed:", e.message));
    const t = createLoginToken(result.payment.user_id, 7 * 24 * 60);
    purchaseEmail(email, { title: film.title, access, link: `${filmOrigin(film)}${PAGE}?signin=${t}`, days: rentalDays(film), watchDays: watchDays(film) })
      .catch((e) => console.error("Purchase email failed:", e.message));
    saleEmail(owner.email, { title: film.title, kind: session.metadata.kind, amountCents: session.amount_total, feeCents: fee, dashboard: "https://dashboard.stripe.com/" })
      .catch((e) => console.error("Sale email failed:", e.message));
    notifyAdmin("Sale", `${film.title}: ${session.metadata.kind} $${(session.amount_total / 100).toFixed(2)}, fee $${(fee / 100).toFixed(2)} (setup ${surcharge}¢).`);
  }
  return result.payment;
}

// Stripe's processing fee on a sale, read from the charge's balance transaction on the filmmaker's account.
// On a direct charge that transaction's fee includes our application fee too, so only 'stripe_fee' parts count.
async function recordStripeFee(payment) {
  if (!stripe || !payment.stripe_payment_intent || !payment.connect_account) return null;
  const pi = await stripe.paymentIntents.retrieve(
    payment.stripe_payment_intent,
    { expand: ["latest_charge.balance_transaction"] },
    { stripeAccount: payment.connect_account }
  );
  const bt = pi.latest_charge?.balance_transaction;
  if (!bt || typeof bt === "string") return null; // not settled into the balance yet; try again later
  const fee = (bt.fee_details || []).filter((d) => d.type === "stripe_fee").reduce((sum, d) => sum + d.amount, 0);
  db.prepare("UPDATE payments SET stripe_fee_cents = ? WHERE id = ?").run(fee, payment.id);
  return fee;
}

// ---------- the filmmaker's sales list (main site, signed in; mounted at /api/sales) ----------

export const filmmakerSalesRouter = Router();

filmmakerSalesRouter.get("/", async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Please sign in." });
  const rows = db
    .prepare(
      `SELECT p.*, f.title AS film_title FROM payments p JOIN films f ON f.id = p.film_id
       WHERE f.user_id = ? AND p.sale_kind IS NOT NULL ORDER BY p.created_at DESC LIMIT 500`
    )
    .all(req.user.id);
  // Fill in Stripe's fee for recent sales that don't have it yet (a few per load, so the page stays quick).
  for (const r of rows.filter((x) => x.stripe_fee_cents == null).slice(0, 10)) {
    try {
      r.stripe_fee_cents = await recordStripeFee(r);
    } catch (e) {
      console.error("Stripe fee lookup failed:", e.message);
    }
  }
  const sales = rows.map((r) => ({
    id: r.id,
    date: r.created_at,
    film_id: r.film_id,
    film_title: r.film_title,
    kind: r.sale_kind,
    amount: r.amount_cents,
    stripe_fee: r.stripe_fee_cents ?? null,
    our_fee: r.application_fee_cents ?? 0,
    setup_part: r.setup_surcharge_cents ?? 0,
    net: r.stripe_fee_cents == null ? null : r.amount_cents - r.stripe_fee_cents - (r.application_fee_cents ?? 0),
  }));
  const sum = (k) => sales.reduce((t, s) => t + (s[k] ?? 0), 0);
  const films = db
    .prepare("SELECT id, title, setup_status, setup_recovered_cents FROM films WHERE user_id = ? AND setup_status = 'deferred'")
    .all(req.user.id)
    .map((f) => ({ id: f.id, title: f.title, recovered: f.setup_recovered_cents, setup_fee: config.setupFeeCents }));
  res.json({
    sales,
    totals: {
      count: sales.length,
      amount: sum("amount"),
      stripe_fee: sum("stripe_fee"),
      our_fee: sum("our_fee"),
      setup_part: sum("setup_part"),
      net: sum("net"),
      pending: sales.filter((s) => s.net == null).length, // sales whose Stripe fee isn't known yet
    },
    setup: films,
  });
});

// ---------- routes (on the film's own address; mounted at /api/watch after loadUser) ----------

export const salesRouter = Router();

// The live, visible film at this address, or a 404.
function liveFilm(req, res) {
  const film = filmRowForHost(req.headers.host);
  if (!film || film.status !== "live" || film.hidden) {
    res.status(404).json({ error: "No film here." });
    return null;
  }
  return film;
}
const originOf = (req) => `${req.protocol}://${req.headers.host}`;

// What the viewer gets once they have access: the film link and that tier's bonus videos.
function accessPayload(film, ent) {
  const f = publicFilm(film);
  const out = { access: ent.access, vimeo_url: f.vimeo_url, bonus: f.bonus[ent.access].videos };
  if (ent.access === "rent") Object.assign(out, { started: ent.started, start_by: ent.start_by || null, ends_at: ent.ends_at || null, watch_days: watchDays(film) });
  return out;
}

// Start a purchase. Body: { kind: 'rent' | 'buy' | 'pwyw', amount_cents (pwyw only) }. Returns { url } for Checkout.
salesRouter.post("/checkout", rateLimit({ windowMs: 10 * 60_000, max: 20 }), async (req, res) => {
  const film = liveFilm(req, res);
  if (!film) return;
  if (!stripe) return res.status(503).json({ error: "Checkout isn't available right now." });
  const kind = req.body.kind;
  let amount;
  if (kind === "rent" && film.rent_price_cents) amount = film.rent_price_cents;
  else if (kind === "buy" && film.buy_price_cents) amount = film.buy_price_cents;
  else if (kind === "pwyw" && film.pwyw_enabled) {
    amount = Math.round(Number(req.body.amount_cents));
    if (!Number.isInteger(amount) || amount < film.pwyw_min_cents || amount > MAX_CENTS) {
      return res.status(400).json({ error: `Choose an amount from $${(film.pwyw_min_cents / 100).toFixed(2)} to $1,000.` });
    }
  } else return res.status(400).json({ error: "That option isn't available for this film." });

  const access = kind === "pwyw" ? (film.pwyw_access === "buy" ? "buy" : "rent") : kind;
  const have = entitlement(req.user?.id, film);
  if (have?.access === "buy") return res.status(409).json({ error: "You already own this film. Press Watch now." });

  const owner = getUser(film.user_id);
  if (!owner || !(await canSell(owner))) return res.status(503).json({ error: "This film isn't taking payments right now. Try again later." });

  const { fee, surcharge } = feeFor(film, amount);
  const name =
    access === "buy" ? `${film.title} (yours to keep)` : `${film.title} (rental: ${rentalDays(film)} days to start, ${watchDays(film)} ${watchDays(film) === 1 ? "day" : "days"} to finish)`;
  const meta = { app: APP, purpose: "viewer_sale", film_id: String(film.id), kind, access, fee: String(fee), surcharge: String(surcharge) };
  const origin = originOf(req);
  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: amount, product_data: { name: name.slice(0, 250) } } }],
        payment_intent_data: { application_fee_amount: fee, description: name.slice(0, 1000), metadata: meta },
        metadata: meta,
        ...(req.user ? { customer_email: req.user.email } : {}),
        success_url: `${origin}${PAGE}?paid={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}${PAGE}`,
      },
      { stripeAccount: owner.connect_account_id }
    );
    res.json({ url: session.url });
  } catch (e) {
    console.error("Viewer checkout failed:", e.message);
    res.status(502).json({ error: "We couldn't start checkout. Try again in a minute." });
  }
});

// Back from Checkout: record the sale (if the webhook hasn't yet) and sign the buyer in here, once.
salesRouter.post("/claim", rateLimit({ windowMs: 10 * 60_000, max: 30 }), async (req, res) => {
  const film = liveFilm(req, res);
  if (!film) return;
  const id = String(req.body.session_id || "");
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(id) || !stripe) return res.status(400).json({ error: "That payment link isn't valid." });
  const owner = getUser(film.user_id);
  let session;
  try {
    // retrieve(id, params, options): the connected account goes in options.
    session = await stripe.checkout.sessions.retrieve(id, {}, { stripeAccount: owner.connect_account_id });
  } catch (e) {
    console.error("Claim: couldn't retrieve", id, e.message);
    return res.status(400).json({ error: "We couldn't find that payment." });
  }
  if (Number(session.metadata?.film_id) !== film.id) return res.status(400).json({ error: "That payment is for a different film." });
  if (session.payment_status !== "paid") return res.json({ pending: true });

  const payment = await settleSale(session, owner.connect_account_id);
  if (!payment) return res.status(400).json({ error: "We couldn't confirm that payment." });

  if (req.user?.id !== payment.user_id) {
    const fresh = Date.now() - Date.parse(payment.created_at) < CLAIM_HOURS * HOUR;
    if (payment.claimed_at || !fresh) return res.json({ signIn: true });
    db.prepare("UPDATE payments SET claimed_at = ? WHERE id = ?").run(now(), payment.id);
    startSession(res, payment.user_id);
  }
  const ent = entitlement(payment.user_id, film);
  res.json({ ok: true, ...(ent ? accessPayload(film, ent) : { access: null }) });
});

// What the signed-in viewer can watch here.
salesRouter.get("/access", (req, res) => {
  const film = liveFilm(req, res);
  if (!film) return;
  res.set("Cache-Control", "no-store");
  const ent = entitlement(req.user?.id, film);
  res.json(ent ? accessPayload(film, ent) : { access: null, signedIn: !!req.user });
});

// First press of play on a rental: the rental_hours clock starts.
salesRouter.post("/start", (req, res) => {
  const film = liveFilm(req, res);
  if (!film) return;
  const ent = entitlement(req.user?.id, film);
  if (!ent) return res.status(403).json({ error: "Your rental has ended, or you haven't rented this film." });
  if (ent.access === "rent" && !ent.started) {
    db.prepare("UPDATE payments SET started_at = ? WHERE id = ? AND started_at IS NULL").run(now(), ent.payment.id);
  }
  res.json(accessPayload(film, entitlement(req.user.id, film)));
});

// "Already paid? Watch now": email a one-time sign-in link for this address. Same answer whether or not the
// email has bought anything, so the form can't be used to look up buyers.
salesRouter.post("/signin", rateLimit({ windowMs: 15 * 60_000, max: 6 }), async (req, res) => {
  const film = liveFilm(req, res);
  if (!film) return;
  const email = String(req.body.email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) return res.status(400).json({ error: "Enter a valid email address." });
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (user && entitlement(user.id, film)) {
    const t = createLoginToken(user.id, 30);
    try {
      await viewerSignInEmail(email, { title: film.title, link: `${originOf(req)}${PAGE}?signin=${t}` });
    } catch (e) {
      console.error("Viewer sign-in email failed:", e.message);
      return res.status(502).json({ error: "We couldn't send the email. Try again in a minute." });
    }
  }
  res.json({ ok: true });
});

// The emailed link lands on the film page, which posts the token here (a POST, so link scanners can't use it up).
salesRouter.post("/signin/verify", rateLimit({ windowMs: 15 * 60_000, max: 30 }), (req, res) => {
  const film = liveFilm(req, res);
  if (!film) return;
  const user = useLoginToken(req.body.token);
  if (!user) return res.status(400).json({ error: "That link has expired or was already used. Ask for a new one below." });
  startSession(res, user.id);
  const ent = entitlement(user.id, film);
  res.json({ ok: true, ...(ent ? accessPayload(film, ent) : { access: null }) });
});
