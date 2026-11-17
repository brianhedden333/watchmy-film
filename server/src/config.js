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
  // Public address of the site; used in emailed links and Stripe return URLs.
  appUrl: (env.APP_URL || "http://localhost:5173").replace(/\/$/, ""),
  siteName: env.SITE_NAME || "watchmyfilm.online",
  dbPath: resolve(root, env.DB_PATH || "data/watchmyfilm.db"),
  uploadDir: resolve(root, env.UPLOAD_DIR || "uploads"),
  stripeSecretKey: env.STRIPE_SECRET_KEY || "",
  stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET || "",
  setupFeeCents: Number(env.SETUP_FEE_CENTS || 9900),
  sendgridKey: env.SENDGRID_API_KEY || "",
  fromEmail: env.FROM_EMAIL || "hello@watchmyfilm.online",
  fromName: env.FROM_NAME || "watchmyfilm", // a plain name: domain-looking sender names can trip spam filters
  // Comma-separated. These accounts can open /admin/.
  adminEmails: (env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean),
  // Where sign-up and submission notices go.
  notifyEmail: env.NOTIFY_EMAIL || "",
};

if (production && !config.sendgridKey) console.warn("SENDGRID_API_KEY is not set: sign-in links will only be logged.");
if (!config.stripeSecretKey) console.warn("STRIPE_SECRET_KEY is not set: checkout is disabled.");
