// My Library: films the signed-in person has rented or bought (payments with purpose 'rent' or 'buy').
// Owning beats renting; for rentals, the latest one counts. Only what a viewer needs is returned.

import { Router } from "express";
import { config } from "./config.js";
import { db } from "./db.js";
import { createLoginToken, requireUser } from "./auth.js";
import { entitlement, filmPageUrl } from "./sales.js";

export const libraryRouter = Router();
libraryRouter.use(requireUser);

// From My Library to a film's own page, already signed in there: sessions are per address, so we hand over a
// short one-time sign-in link (the film page uses it on load). Only for films they can still watch.
libraryRouter.get("/go/:id", (req, res) => {
  const film = db.prepare("SELECT * FROM films WHERE id = ?").get(Number(req.params.id));
  if (!film || film.status !== "live" || film.hidden) return res.redirect(302, `${config.appUrl}/library/`);
  if (!entitlement(req.user.id, film)) return res.redirect(302, filmPageUrl(film));
  const t = createLoginToken(req.user.id, 5);
  res.redirect(302, `${filmPageUrl(film)}?signin=${t}`);
});

const DAY = 86_400_000;

libraryRouter.get("/", (req, res) => {
  const rows = db
    .prepare(
      `SELECT p.purpose, p.created_at AS paid_at, p.started_at, f.id, f.title, f.year, f.poster_path, f.rental_days, f.rental_watch_days,
              f.status, f.hidden, f.address_type, f.subdomain, f.own_domain
       FROM payments p JOIN films f ON f.id = p.film_id
       WHERE p.user_id = ? AND p.purpose IN ('rent', 'buy') AND p.revoked_at IS NULL
       ORDER BY p.created_at DESC`
    )
    .all(req.user.id);

  const byFilm = new Map();
  for (const r of rows) {
    const have = byFilm.get(r.id);
    if (!have || (have.purpose === "rent" && r.purpose === "buy")) byFilm.set(r.id, r);
  }

  const films = [...byFilm.values()].map((r) => {
    const address =
      r.status !== "live" || r.hidden ? null : r.address_type === "own" && r.own_domain ? `watch.${r.own_domain}` : r.subdomain ? `${r.subdomain}.${config.siteName}` : null;
    const base = { id: r.id, title: r.title, year: r.year, poster_url: r.poster_path ? `/uploads/${r.poster_path}` : null, address, paid_at: r.paid_at };
    if (r.purpose === "buy") return { ...base, access: "owned" };
    const watchDays = r.rental_watch_days ?? 3;
    const startBy = new Date(new Date(r.paid_at).getTime() + (r.rental_days ?? 30) * DAY).toISOString();
    // Once started, a rental lasts rental_watch_days from the first play (same rule as sales.js entitlement()).
    if (r.started_at) {
      const endsAt = new Date(new Date(r.started_at).getTime() + watchDays * DAY).toISOString();
      return { ...base, access: endsAt > new Date().toISOString() ? "rented" : "expired", start_by: startBy, ends_at: endsAt, watch_days: watchDays };
    }
    return { ...base, access: startBy > new Date().toISOString() ? "rented" : "expired", start_by: startBy, watch_days: watchDays };
  });
  res.json({ films });
});

// ---------- Watch Later (mounted at /api/watchlist) ----------

export const watchlistRouter = Router();
watchlistRouter.use(requireUser);

const liveAddress = (f) =>
  f.address_type === "own" && f.own_domain ? `watch.${f.own_domain}` : f.subdomain ? `${f.subdomain}.${config.siteDomain}` : null;

// Saved films that are still live and visible, newest first.
watchlistRouter.get("/", (req, res) => {
  const rows = db
    .prepare(
      `SELECT f.*, w.created_at AS saved_at FROM watchlist w JOIN films f ON f.id = w.film_id
       WHERE w.user_id = ? AND f.status = 'live' AND f.hidden = 0 ORDER BY w.created_at DESC`
    )
    .all(req.user.id);
  res.json({
    films: rows.map((f) => ({
      id: f.id,
      title: f.title,
      year: f.year,
      poster_url: f.poster_path ? `/uploads/${f.poster_path}` : null,
      address: liveAddress(f),
      rent_price_cents: f.rent_price_cents,
      buy_price_cents: f.buy_price_cents,
      free_watch: !!f.free_watch,
      saved_at: f.saved_at,
    })),
  });
});

watchlistRouter.put("/:id", (req, res) => {
  const film = db.prepare("SELECT id, status, hidden FROM films WHERE id = ?").get(Number(req.params.id));
  if (!film || film.status !== "live" || film.hidden) return res.status(404).json({ error: "That film isn't available." });
  db.prepare("INSERT OR IGNORE INTO watchlist (user_id, film_id) VALUES (?, ?)").run(req.user.id, film.id);
  res.json({ ok: true });
});

watchlistRouter.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM watchlist WHERE user_id = ? AND film_id = ?").run(req.user.id, Number(req.params.id));
  res.json({ ok: true });
});
