// SQLite database: one file, opened once. Schema changes go in MIGRATIONS (append only, never edit a shipped one).

import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "./config.js";

mkdirSync(dirname(config.dbPath), { recursive: true });

export const db = new Database(config.dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

const MIGRATIONS = [
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT,
    agreed_terms_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    last_login_at TEXT
  );

  -- Emailed sign-in links. Only a hash of the token is stored.
  CREATE TABLE login_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    used_at TEXT
  );

  CREATE TABLE sessions (
    id_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    expires_at TEXT NOT NULL
  );

  -- status: draft -> in_review (setup fee paid or waived) -> approved -> live; or changes_requested back to the filmmaker.
  -- setup_status: unpaid | paid | waived | deferred (nothing up front: recovered at $1 per sale until the setup fee is covered)
  CREATE TABLE films (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    logline TEXT,
    synopsis TEXT,
    director TEXT,
    year INTEGER,
    runtime_minutes INTEGER,
    genre TEXT,
    poster_path TEXT,
    trailer_url TEXT,
    vimeo_url TEXT,
    rent_price_cents INTEGER,
    buy_price_cents INTEGER,
    rental_days INTEGER,
    rental_hours INTEGER,
    tier TEXT NOT NULL DEFAULT 'standard',
    address_type TEXT NOT NULL DEFAULT 'sub',
    subdomain TEXT,
    own_domain TEXT,
    contact_name TEXT,
    contact_phone TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    setup_status TEXT NOT NULL DEFAULT 'unpaid',
    setup_paid_at TEXT,
    pending_checkout_id TEXT,
    admin_note TEXT,
    submitted_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE INDEX films_user ON films(user_id);

  -- One table for every kind of code.
  --   film_id NULL: a platform code made by us (e.g. setup fee waivers for friends and early customers).
  --   film_id set:  a filmmaker's own code for their film's viewers (rent/buy discounts; UI comes later).
  -- kind: setup_waiver | percent_off | amount_off.  applies_to: setup | rent | buy | any.
  CREATE TABLE promo_codes (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL,
    film_id INTEGER REFERENCES films(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    percent_off INTEGER,
    amount_off_cents INTEGER,
    applies_to TEXT NOT NULL DEFAULT 'any',
    max_uses INTEGER,
    uses INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    note TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE UNIQUE INDEX promo_codes_scope_code ON promo_codes(ifnull(film_id, 0), code COLLATE NOCASE);

  CREATE TABLE promo_redemptions (
    id INTEGER PRIMARY KEY,
    promo_code_id INTEGER NOT NULL REFERENCES promo_codes(id),
    film_id INTEGER REFERENCES films(id) ON DELETE SET NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE payments (
    id INTEGER PRIMARY KEY,
    film_id INTEGER REFERENCES films(id) ON DELETE SET NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    purpose TEXT NOT NULL,
    stripe_session_id TEXT NOT NULL UNIQUE,
    stripe_payment_intent TEXT,
    amount_cents INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  `,
  `
  ALTER TABLE films ADD COLUMN languages TEXT;
  -- JSON: [{ "role": "Producers", "names": ["…"] }, …]. films.director mirrors the Director role.
  ALTER TABLE films ADD COLUMN credits TEXT;
  `,
  `
  -- Watch page colors as #rrggbb. NULL means our default.
  ALTER TABLE films ADD COLUMN color_background TEXT;
  ALTER TABLE films ADD COLUMN color_primary TEXT;
  ALTER TABLE films ADD COLUMN color_secondary TEXT;
  ALTER TABLE films ADD COLUMN color_button TEXT;
  `,
  `
  -- Wide 16:9 image (still or key art) for phones, the page background and link previews. Required, like the poster.
  ALTER TABLE films ADD COLUMN still_path TEXT;
  `,
  `
  -- Set the first time a sign-in link is used: that's what proves the address is theirs.
  ALTER TABLE users ADD COLUMN email_verified_at TEXT;
  -- Optional. scrypt$N$r$p$salt$hash (base64url). NULL means the account signs in with emailed links only.
  ALTER TABLE users ADD COLUMN password_hash TEXT;
  UPDATE users SET email_verified_at = last_login_at WHERE last_login_at IS NOT NULL;
  `,
  `
  -- Optional wide banner (3:1) across the top of the watch page. Without one, the 16:9 wide image is used.
  ALTER TABLE films ADD COLUMN banner_path TEXT;
  `,
  `
  -- Where the filmmaker's sales should be paid, collected during review (before Stripe Connect is set up).
  -- stripe_has_account: 1 = has one, 0 = not yet, NULL = hasn't said.
  ALTER TABLE users ADD COLUMN stripe_has_account INTEGER;
  ALTER TABLE users ADD COLUMN stripe_email TEXT;
  ALTER TABLE users ADD COLUMN stripe_account_id TEXT;
  ALTER TABLE users ADD COLUMN stripe_country TEXT;
  ALTER TABLE users ADD COLUMN stripe_updated_at TEXT;
  `,
  `
  -- Bonus features, JSON: { "rent": { "description": "…", "videos": [{ "title": "…", "url": "…" }] }, "buy": { … } }
  -- Up to 10 videos each. Rentals get the rent set; purchases get the buy set.
  ALTER TABLE films ADD COLUMN bonus TEXT;
  `,
  `
  -- A live film can be hidden by its owner: its address shows a holding page instead.
  ALTER TABLE films ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;
  -- Every film's address on our domain is unique (it's also the DNS target for films on their own domain),
  -- and so is each custom domain. Both are stored lowercase.
  CREATE UNIQUE INDEX films_subdomain_unique ON films(subdomain) WHERE subdomain IS NOT NULL;
  CREATE UNIQUE INDEX films_own_domain_unique ON films(own_domain) WHERE own_domain IS NOT NULL;
  `,
  `
  -- Pay what you want through Stripe (unlocks the film). Minimum is at least 99 cents.
  -- pwyw_access: 'rent' (rental terms apply) or 'buy' (theirs to keep). When checkout records one, its
  -- payments row uses that purpose, so earnings and libraries treat it like a rental or purchase.
  ALTER TABLE films ADD COLUMN pwyw_enabled INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE films ADD COLUMN pwyw_min_cents INTEGER NOT NULL DEFAULT 99;
  ALTER TABLE films ADD COLUMN pwyw_suggested_cents INTEGER;
  ALTER TABLE films ADD COLUMN pwyw_access TEXT NOT NULL DEFAULT 'rent';
  -- Tip jar: paid outside our checkout, straight to the filmmaker. Nothing is unlocked by a tip.
  ALTER TABLE films ADD COLUMN tip_venmo TEXT;
  ALTER TABLE films ADD COLUMN tip_paypal TEXT;
  ALTER TABLE films ADD COLUMN tip_zelle TEXT;
  `,
  `
  -- Browse: the filmmaker opts in to being listed, and describes the film with up to 10 tags (JSON array of strings).
  ALTER TABLE films ADD COLUMN discoverable INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE films ADD COLUMN tags TEXT;
  `,
  `
  -- Free to watch: anyone can play the film without paying. Rent, buy and donations still work if they're set,
  -- but bonus features stay with rentals and purchases.
  ALTER TABLE films ADD COLUMN free_watch INTEGER NOT NULL DEFAULT 0;
  `,
  `
  -- Stripe Connect (Accounts v2): the filmmaker's own connected account, where their sales are charged (direct charges).
  -- connect_card_payments / connect_payouts cache the capability status from Stripe ('active', 'pending', 'restricted',
  -- 'unsupported'); always re-check with Stripe before going live or taking a payment.
  ALTER TABLE users ADD COLUMN connect_account_id TEXT;
  ALTER TABLE users ADD COLUMN connect_card_payments TEXT;
  ALTER TABLE users ADD COLUMN connect_payouts TEXT;
  ALTER TABLE users ADD COLUMN connect_checked_at TEXT;
  CREATE UNIQUE INDEX users_connect_account ON users(connect_account_id) WHERE connect_account_id IS NOT NULL;
  `,
  `
  -- Viewer sales (rent / buy / pay what you want), charged directly on the filmmaker's connected account.
  -- payments.purpose is the access bought ('rent' or 'buy'); sale_kind is the button used ('rent', 'buy', 'pwyw').
  ALTER TABLE payments ADD COLUMN sale_kind TEXT;
  ALTER TABLE payments ADD COLUMN connect_account TEXT;
  ALTER TABLE payments ADD COLUMN application_fee_cents INTEGER;
  -- Part of application_fee_cents that recovers the setup cost ($1 per sale until SETUP_FEE_CENTS is covered).
  ALTER TABLE payments ADD COLUMN setup_surcharge_cents INTEGER NOT NULL DEFAULT 0;
  -- Rentals: when the viewer first pressed play (the rental_hours clock starts then).
  ALTER TABLE payments ADD COLUMN started_at TEXT;
  -- The Checkout return link signs the buyer in once; after that they use an emailed link.
  ALTER TABLE payments ADD COLUMN claimed_at TEXT;
  ALTER TABLE films ADD COLUMN setup_recovered_cents INTEGER NOT NULL DEFAULT 0;
  CREATE INDEX payments_user_film ON payments(user_id, film_id);
  `,
  `
  -- Rentals: time to finish once started is set in whole days now (rental_hours is kept but unused).
  ALTER TABLE films ADD COLUMN rental_watch_days INTEGER;
  UPDATE films SET rental_watch_days = MAX(1, (rental_hours + 23) / 24) WHERE rental_hours IS NOT NULL;
  -- Stripe's processing fee on a viewer sale (charged to the filmmaker), for their sales list.
  ALTER TABLE payments ADD COLUMN stripe_fee_cents INTEGER;
  `,
  `
  -- Browse: films we feature under "Staff Picks". Set by an admin.
  ALTER TABLE films ADD COLUMN staff_pick INTEGER NOT NULL DEFAULT 0;
  `,
  `
  -- Watch Later: films a viewer saved from Browse to watch later.
  CREATE TABLE watchlist (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    film_id INTEGER NOT NULL REFERENCES films(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (user_id, film_id)
  );
  `,
  `
  -- Refunds and disputes on viewer sales (reported by the Connect webhook).
  ALTER TABLE payments ADD COLUMN refunded_cents INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE payments ADD COLUMN refunded_at TEXT;
  -- Our application fee returned to the filmmaker (full refunds only).
  ALTER TABLE payments ADD COLUMN fee_refunded_cents INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE payments ADD COLUMN disputed_at TEXT;
  -- Set when the viewer loses access (full refund, or a dispute). Cleared if a dispute is won.
  ALTER TABLE payments ADD COLUMN revoked_at TEXT;
  `,
  `
  -- Deleting a film only marks it: the row and everything in it stay, for the record. Deleted films are hidden
  -- everywhere except the admin dashboard. deleted_by is the user who deleted it.
  ALTER TABLE films ADD COLUMN deleted_at TEXT;
  ALTER TABLE films ADD COLUMN deleted_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
  -- A deleted film's address can be used again, so uniqueness only counts films that aren't deleted.
  DROP INDEX films_subdomain_unique;
  DROP INDEX films_own_domain_unique;
  CREATE UNIQUE INDEX films_subdomain_unique ON films(subdomain) WHERE subdomain IS NOT NULL AND deleted_at IS NULL;
  CREATE UNIQUE INDEX films_own_domain_unique ON films(own_domain) WHERE own_domain IS NOT NULL AND deleted_at IS NULL;
  `,
  `
  -- Site design: hide the title (and one-line description) over the banner, so the banner shows as a plain image.
  ALTER TABLE films ADD COLUMN hide_title INTEGER NOT NULL DEFAULT 0;
  -- The buyer agreed (at checkout, on the watch page) that the filmmaker may contact them. 1 = yes, 0 = no.
  ALTER TABLE payments ADD COLUMN contact_ok INTEGER;
  `,
  `
  -- When the filmmaker ticked "I own or control all the rights needed to sell and stream this film" (null = not yet).
  ALTER TABLE films ADD COLUMN rights_confirmed_at TEXT;
  `,
];

const version = db.pragma("user_version", { simple: true });
for (let v = version; v < MIGRATIONS.length; v++) {
  db.transaction(() => {
    db.exec(MIGRATIONS[v]);
    db.pragma(`user_version = ${v + 1}`);
  })();
}

export const now = () => new Date().toISOString();
