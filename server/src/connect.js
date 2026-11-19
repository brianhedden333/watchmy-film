// Stripe Connect: each filmmaker gets their own connected account (Accounts v2) on our platform account.
// SaaS setup: the filmmaker is the merchant of record (direct charges), uses the full Stripe Dashboard, pays Stripe's
// fees themselves, and Stripe carries negative-balance losses. We take our cut per sale with application_fee_amount.
// Onboarding happens inside our own pages with Stripe's embedded components (account_onboarding + notification_banner).

import { Router } from "express";
import Stripe from "stripe";
import { config } from "./config.js";
import { db, now } from "./db.js";
import { requireUser } from "./auth.js";
import { notifyAdmin } from "./email.js";

const stripe = config.stripeSecretKey ? new Stripe(config.stripeSecretKey) : null;

export const connectEnabled = () => !!stripe && !!config.stripePublishableKey;

// What the pages need to know. canAcceptPayments is the go-live test for films that sell.
export const connectInfo = (u) => ({
  accountId: u.connect_account_id || null,
  cardPayments: u.connect_card_payments || null,
  payouts: u.connect_payouts || null,
  canAcceptPayments: u.connect_card_payments === "active",
  checkedAt: u.connect_checked_at || null,
});

const getUser = (id) => db.prepare("SELECT * FROM users WHERE id = ?").get(id);

// Asks Stripe for the account's current capability status and caches it on the user. Returns the fresh user row.
export async function refreshConnect(user) {
  if (!stripe || !user.connect_account_id) return user;
  const account = await stripe.v2.core.accounts.retrieve(user.connect_account_id, { include: ["configuration.merchant"] });
  const caps = account.configuration?.merchant?.capabilities || {};
  const card = caps.card_payments?.status || null;
  const payouts = caps.stripe_balance?.payouts?.status || null;
  const before = user.connect_card_payments;
  db.prepare("UPDATE users SET connect_card_payments = ?, connect_payouts = ?, connect_checked_at = ? WHERE id = ?").run(card, payouts, now(), user.id);
  if (card === "active" && before !== "active") {
    notifyAdmin("Stripe connected", `${user.email} can now take payments (${user.connect_account_id}).`);
  }
  return getUser(user.id);
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

async function ensureAccount(user) {
  if (user.connect_account_id) return user;
  const account = await stripe.v2.core.accounts.create(
    {
      display_name: (user.name || user.email).slice(0, 100),
      contact_email: user.email,
      identity: { country: "us" },
      dashboard: "full",
      defaults: { responsibilities: { fees_collector: "stripe", losses_collector: "stripe" } },
      configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
      metadata: { app: "watchmyfilm", user_id: String(user.id) },
    },
    // A double click can't make two accounts.
    { idempotencyKey: `wmf-connect-account-${user.id}-${user.email}`.slice(0, 255) }
  );
  // Another request may have stored one in the meantime; keep the first.
  db.prepare("UPDATE users SET connect_account_id = ?, connect_checked_at = ? WHERE id = ? AND connect_account_id IS NULL").run(account.id, now(), user.id);
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
    const user = await ensureAccount(req.user);
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
    console.error("Connect session failed:", e.message);
    res.status(502).json({ error: "We couldn't reach Stripe. Try again in a minute." });
  }
});
