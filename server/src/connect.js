// Stripe Connect: each filmmaker gets their own connected account (Accounts v2) on our platform account.
// SaaS setup: the filmmaker is the merchant of record (direct charges), uses the full Stripe Dashboard, pays Stripe's
// fees themselves, and Stripe carries negative-balance losses. We take our cut per sale with application_fee_amount.
// Onboarding happens inside our own pages with Stripe's embedded components (account_onboarding + notification_banner).

import { Router } from "express";
import Stripe from "stripe";
import { config } from "./config.js";
import { db, now } from "./db.js";
import { requireUser } from "./auth.js";
import { notifyAdmin, stripeNeedsInfoEmail } from "./email.js";

const stripe = config.stripeSecretKey ? new Stripe(config.stripeSecretKey) : null;

export const connectEnabled = () => !!stripe && !!config.stripePublishableKey;

// What the pages need to know. canAcceptPayments is the go-live test for films that sell.
export const connectInfo = (u) => ({
  accountId: u.connect_account_id || null,
  cardPayments: u.connect_card_payments || null,
  payouts: u.connect_payouts || null,
  canAcceptPayments: u.connect_card_payments === "active",
  checkedAt: u.connect_checked_at || null,
  country: u.connect_country || null,
});

// Countries a filmmaker's Stripe account can be in (Stripe's supported countries that a US platform can onboard
// without special arrangements). Lowercase two-letter codes, as Accounts v2 takes them. Keep in step with
// COUNTRIES in src/ConnectStripe.tsx.
export const CONNECT_COUNTRIES = new Set(
  "us ca gb ie at be bg hr cy cz dk ee fi fr de gi gr hu it lv li lt lu mt nl no pl pt ro sk si es se ch au nz jp sg hk mx my".split(" ")
);

const getUser = (id) => db.prepare("SELECT * FROM users WHERE id = ?").get(id);

// Asks Stripe for the account's current capability status and caches it on the user. Returns the fresh user row.
export async function refreshConnect(user) {
  if (!stripe || !user.connect_account_id) return user;
  const account = await stripe.v2.core.accounts.retrieve(user.connect_account_id, { include: ["configuration.merchant", "identity"] });
  const caps = account.configuration?.merchant?.capabilities || {};
  const card = caps.card_payments?.status || null;
  const payouts = caps.stripe_balance?.payouts?.status || null;
  const country = String(account.identity?.country || user.connect_country || "").toLowerCase() || null;
  const before = user.connect_card_payments;
  db.prepare("UPDATE users SET connect_card_payments = ?, connect_payouts = ?, connect_checked_at = ?, connect_country = ? WHERE id = ?").run(
    card,
    payouts,
    now(),
    country,
    user.id
  );
  if (card === "active" && before !== "active") {
    notifyAdmin("Stripe connected", `${user.email} can now take payments (${user.connect_account_id}).`);
  }
  return getUser(user.id);
}

// account.updated webhook: refresh the cached status. If the account could take payments and now can't (Stripe
// wants more information), tell the filmmaker, since their films' Rent/Buy stop working until it's fixed.
export async function handleAccountUpdated(accountId) {
  const user = accountId && db.prepare("SELECT * FROM users WHERE connect_account_id = ?").get(String(accountId));
  if (!user) return;
  const before = user.connect_card_payments;
  const after = (await refreshConnect(user)).connect_card_payments;
  if (before === "active" && after !== "active") {
    stripeNeedsInfoEmail(user.email, `${config.appUrl}/account/`).catch((e) => console.error("Stripe notice email failed:", e.message));
    notifyAdmin("Stripe account restricted", `${user.email}'s Stripe account can't take payments right now (${after}).`);
  }
}

// True when this user's films may sell: re-checked with Stripe (not just the cache).
export async function canSell(user) {
  if (!stripe || !user.connect_account_id) return false;
  try {
    return (await refreshConnect(user)).connect_card_payments === "active";
  } catch (e) {
    console.error("Connect check failed:", e.message);
    return user.connect_card_payments === "active"; // Stripe unreachable: fall back to the last known status
  }
}

// Makes the filmmaker's Stripe account in the country they picked (Stripe can't change it later).
async function ensureAccount(user, country) {
  if (user.connect_account_id) return user;
  if (!CONNECT_COUNTRIES.has(country)) throw Object.assign(new Error("Choose the country where you or your business is based."), { status: 400 });
  const account = await stripe.v2.core.accounts.create(
    {
      display_name: (user.name || user.email).slice(0, 100),
      contact_email: user.email,
      identity: { country },
      dashboard: "full",
      defaults: { responsibilities: { fees_collector: "stripe", losses_collector: "stripe" } },
      configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
      metadata: { app: "watchmyfilm", user_id: String(user.id) },
    },
    // A double click can't make two accounts.
    // (A new account after "start over" uses a different key, because the old one is recorded below.)
    { idempotencyKey: `wmf-connect-account-${user.id}-${user.email}-${country}-${user.connect_restarts || 0}`.slice(0, 255) }
  );
  // Another request may have stored one in the meantime; keep the first.
  db.prepare("UPDATE users SET connect_account_id = ?, connect_country = ?, connect_checked_at = ? WHERE id = ? AND connect_account_id IS NULL").run(
    account.id,
    country,
    now(),
    user.id
  );
  return refreshConnect(getUser(user.id));
}

export const connectRouter = Router();
connectRouter.use(requireUser);

connectRouter.use((_req, res, next) => {
  if (!connectEnabled()) return res.status(503).json({ error: "Connecting Stripe isn't available yet. Try again soon." });
  next();
});

// Current status, fresh from Stripe.
connectRouter.get("/", async (req, res) => {
  try {
    res.json({ connect: connectInfo(await refreshConnect(req.user)) });
  } catch (e) {
    console.error("Connect status failed:", e.message);
    res.json({ connect: connectInfo(req.user), stale: true });
  }
});

// Starts (or resumes) onboarding: makes the account if needed and returns a short-lived session for the embedded
// components. The client secret only works in the browser with our publishable key, for this one account.
connectRouter.post("/session", async (req, res) => {
  try {
    const user = await ensureAccount(req.user, String(req.body.country || "").toLowerCase());
    const session = await stripe.accountSessions.create({
      account: user.connect_account_id,
      components: {
        account_onboarding: { enabled: true, features: { external_account_collection: true } },
        notification_banner: { enabled: true, features: { external_account_collection: true } },
        account_management: { enabled: true, features: { external_account_collection: true } },
      },
    });
    res.json({ clientSecret: session.client_secret, publishableKey: config.stripePublishableKey, connect: connectInfo(user) });
  } catch (e) {
    if (e.status === 400) return res.status(400).json({ error: e.message });
    console.error("Connect session failed:", e.message);
    res.status(502).json({ error: "We couldn't reach Stripe. Try again in a minute." });
  }
});

// Made in the wrong country and not finished yet: forget that account and make a new one in the right country.
// (Stripe can't change an account's country. The unfinished one is left as it is on Stripe; it can't take
// payments.) Not allowed once the account can take payments.
connectRouter.post("/restart", async (req, res) => {
  const country = String(req.body.country || "").toLowerCase();
  if (!CONNECT_COUNTRIES.has(country)) return res.status(400).json({ error: "Choose the country where you or your business is based." });
  const user = await refreshConnect(req.user).catch(() => req.user);
  if (!user.connect_account_id) return res.status(400).json({ error: "There's no Stripe setup to start over." });
  if (user.connect_card_payments === "active")
    return res.status(409).json({ error: "This Stripe account can already take payments, so it can't be replaced here. Email us and we'll help." });
  const old = user.connect_account_id;
  db.prepare(
    `UPDATE users SET connect_account_id = NULL, connect_card_payments = NULL, connect_payouts = NULL, connect_country = NULL,
     connect_restarts = coalesce(connect_restarts, 0) + 1, connect_checked_at = ? WHERE id = ?`
  ).run(now(), user.id);
  notifyAdmin("Stripe setup restarted", `${user.email} started Stripe setup over in ${country.toUpperCase()} (old unfinished account ${old}).`);
  console.log(`Connect restart: user ${user.id} left unfinished account ${old}, new country ${country}`);
  res.json({ connect: connectInfo(getUser(user.id)) });
});
