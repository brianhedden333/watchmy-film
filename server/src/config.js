// Settings come from server/.env (see .env.example). Nothing secret is hard-coded here.

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = resolve(root, ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const env = process.env;
const production = env.NODE_ENV === "production";

export const config = {
  production,
  port: Number(env.PORT || 5050),
  // Two sites, one server and database:
  //   watchmyfilm.online (APP_URL)  — for filmmakers: home page, sign-up, My Films, add-a-film, admin.
  //   indiefilm.club     (CLUB_URL) — for viewers: Browse, My Library, and every film at <name>.indiefilm.club.
  // Locally: http://localhost:5173 and http://indiefilm.localhost:5173 (films at <name>.indiefilm.localhost:5173).
  appUrl: (env.APP_URL || "http://localhost:5173").replace(/\/$/, ""),
  clubUrl: (env.CLUB_URL || (production ? "https://indiefilm.club" : "http://indiefilm.localhost:5173")).replace(/\/$/, ""),
  siteName: env.SITE_NAME || "watchmyfilm.online",
  clubName: env.CLUB_NAME || "IndieFilm.club",
  // Films live at <name>.<siteDomain>: the viewer site's domain unless SITE_DOMAIN says otherwise.
  siteDomain: (env.SITE_DOMAIN || new URL(env.CLUB_URL || (production ? "https://indiefilm.club" : "http://indiefilm.localhost:5173")).hostname).toLowerCase(),
  // The built site (for the watch page shell). On the droplet: /var/www/watchmyfilm/site.
  // Defaults to ../site next to the server (the droplet's layout), else ../dist (a local build).
  siteDir: resolve(root, env.SITE_DIR || (existsSync(resolve(root, "../site")) ? "../site" : "../dist")),
  dbPath: resolve(root, env.DB_PATH || "data/watchmyfilm.db"),
  uploadDir: resolve(root, env.UPLOAD_DIR || "uploads"),
  stripeSecretKey: env.STRIPE_SECRET_KEY || "",
  stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET || "",
  // pk_… key for the embedded Connect onboarding in the browser (not secret). Without it, connecting Stripe is off.
  stripePublishableKey: env.STRIPE_PUBLISHABLE_KEY || "",
  // pmc_… id of a Stripe payment method configuration for the setup fee (cards only). Optional.
  stripePaymentMethodConfig: env.STRIPE_PAYMENT_METHOD_CONFIG || "",
  setupFeeCents: Number(env.SETUP_FEE_CENTS || 9900),
  // Nothing up front (default): films go to review without paying; the setup cost is recovered by adding
  // SETUP_SURCHARGE_CENTS to our fee on each sale until SETUP_FEE_CENTS is covered.
  // SETUP_UPFRONT=1 brings back the old flow: pay the setup fee by Stripe Checkout (or a waiver code) to submit.
  setupUpfront: env.SETUP_UPFRONT === "1",
  setupSurchargeCents: Number(env.SETUP_SURCHARGE_CENTS || 100),
  // Our cut of each viewer sale (Standard plan; must match pricing.tiers.standard in src/config.ts).
  platformFeePercent: Number(env.PLATFORM_FEE_PERCENT || 8),
  platformFeeMinCents: Number(env.PLATFORM_FEE_MIN_CENTS || 50),
  // Second signing secret for the Connect webhook endpoint (events from filmmakers' accounts). Locally, `stripe listen`
  // uses one secret for both, so this can stay empty.
  stripeConnectWebhookSecret: env.STRIPE_CONNECT_WEBHOOK_SECRET || "",
  // On a full refund of a viewer sale we keep our application fee (and its setup credit stays), like Stripe keeps its
  // processing fee. Set REFUND_OUR_FEE=1 to give our fee back to the filmmaker on full refunds instead.
  refundOurFee: env.REFUND_OUR_FEE === "1",
  sendgridKey: env.SENDGRID_API_KEY || "",
  fromEmail: env.FROM_EMAIL || "hello@watchmyfilm.online",
  fromName: env.FROM_NAME || "watchmyfilm", // a plain name: domain-looking sender names can trip spam filters
  // Where replies to our emails go (every email we send carries it, unless a message sets its own).
  replyToEmail: env.REPLY_TO_EMAIL || "hello@watchmyfilm.online",
  // Comma-separated. These accounts can open /admin/.
  adminEmails: (env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean),
  // Where sign-up and submission notices go.
  notifyEmail: env.NOTIFY_EMAIL || "",
};

if (production && !config.sendgridKey) console.warn("SENDGRID_API_KEY is not set: sign-in links will only be logged.");
if (!config.stripeSecretKey) console.warn("STRIPE_SECRET_KEY is not set: checkout is disabled.");
