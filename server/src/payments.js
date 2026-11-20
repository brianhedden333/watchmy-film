// Setup fee (SETUP_FEE_CENTS, $99) through Stripe Checkout, on the FTS Stripe account.
// That account also takes Fracking the System sales, so every session we create is tagged app=watchmyfilm
// and anything without that tag is ignored here.

import Stripe from "stripe";
import { config } from "./config.js";
import { db, now } from "./db.js";
import { filmSubmittedEmail, notifyAdmin } from "./email.js";
import { settleSale } from "./sales.js";

const APP_TAG = "watchmyfilm";
const stripe = config.stripeSecretKey ? new Stripe(config.stripeSecretKey) : null;

export const stripeEnabled = () => !!stripe;

export async function createSetupCheckout(film, user) {
  const back = `${config.appUrl}/add-a-film/?film=${film.id}`;
  const meta = { app: APP_TAG, purpose: "setup_fee", film_id: String(film.id), user_id: String(user.id) };
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: user.email,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: config.setupFeeCents,
          product_data: {
            name: `${config.siteName} setup`,
            description: `Watch page setup for "${film.title}"`.slice(0, 300),
          },
        },
      },
    ],
    metadata: meta,
    // Our own payment method configuration (cards, Apple Pay, Google Pay) instead of the FTS account's defaults,
    // which include Klarna, Affirm, crypto etc. Set STRIPE_PAYMENT_METHOD_CONFIG to its pmc_… id.
    ...(config.stripePaymentMethodConfig ? { payment_method_configuration: config.stripePaymentMethodConfig } : {}),
    payment_intent_data: {
      metadata: meta,
      description: `${config.siteName} setup: ${film.title}`.slice(0, 1000),
      // Card statements read "<FTS prefix>* WATCHMYFILM" so the charge is recognizable.
      statement_descriptor_suffix: "WATCHMYFILM",
    },
    success_url: `${back}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${back}&canceled=1`,
  });
  db.prepare("UPDATE films SET pending_checkout_id = ?, updated_at = ? WHERE id = ?").run(session.id, now(), film.id);
  return session;
}

export function expireCheckout(id) {
  stripe?.checkout.sessions.expire(id).catch(() => {}); // already finished or expired: nothing to do
}

// Marks a film paid if the Checkout session really was paid. Safe to call any number of times (webhook, return page, dashboard load).
export async function settleCheckout(sessionOrId) {
  if (!stripe) return false;
  const session = typeof sessionOrId === "string" ? await stripe.checkout.sessions.retrieve(sessionOrId) : sessionOrId;
  if (session.metadata?.app !== APP_TAG || session.metadata?.purpose !== "setup_fee") return false;
  if (session.status === "expired") {
    db.prepare("UPDATE films SET pending_checkout_id = NULL WHERE pending_checkout_id = ?").run(session.id);
    return false;
  }
  if (session.payment_status !== "paid") return false;

  const filmId = Number(session.metadata.film_id);
  const settled = db.transaction(() => {
    const exists = db.prepare("SELECT 1 FROM payments WHERE stripe_session_id = ?").get(session.id);
    if (exists) return false;
    db.prepare(
      `INSERT INTO payments (film_id, user_id, purpose, stripe_session_id, stripe_payment_intent, amount_cents)
       VALUES (?, ?, 'setup_fee', ?, ?, ?)`
    ).run(filmId, Number(session.metadata.user_id), session.id, String(session.payment_intent || ""), session.amount_total);
    db.prepare(
      `UPDATE films SET setup_status = 'paid', setup_paid_at = ?, pending_checkout_id = NULL, updated_at = ?,
       status = CASE WHEN status = 'draft' THEN 'in_review' ELSE status END,
       submitted_at = CASE WHEN status = 'draft' THEN ? ELSE submitted_at END
       WHERE id = ?`
    ).run(now(), now(), now(), filmId);
    return true;
  })();

  if (settled) {
    const film = db.prepare("SELECT f.*, u.email FROM films f JOIN users u ON u.id = f.user_id WHERE f.id = ?").get(filmId);
    if (film) {
      notifyAdmin(
        "Setup fee paid",
        `${film.email} paid $${(session.amount_total / 100).toFixed(2)} for "${film.title}". It's in review.\n\n${config.appUrl}/admin/`
      );
      filmSubmittedEmail(film.email, film, "paid").catch((e) => console.error("Email failed:", e.message));
    }
  }
  return settled;
}

// Mounted before express.json() because Stripe signs the raw body.
export async function stripeWebhook(req, res) {
  if (!stripe || !config.stripeWebhookSecret) return res.status(503).end();
  // Our own account's endpoint and the Connect endpoint (events from filmmakers' accounts) have different secrets.
  let event;
  let lastError;
  for (const secret of [config.stripeWebhookSecret, config.stripeConnectWebhookSecret].filter(Boolean)) {
    try {
      event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], secret);
      break;
    } catch (e) {
      lastError = e;
    }
  }
  if (!event) return res.status(400).send(`Webhook error: ${lastError?.message}`);
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    try {
      // event.account is set for events from a connected account: a viewer's purchase of a film.
      if (event.account) await settleSale(event.data.object, event.account);
      else await settleCheckout(event.data.object);
    } catch (e) {
      console.error("Webhook settle failed:", e.message);
      return res.status(500).end(); // Stripe retries
    }
  }
  res.json({ received: true });
}
