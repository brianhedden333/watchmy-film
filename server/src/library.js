// My Library: films the signed-in person has rented or bought (payments with purpose 'rent' or 'buy').
// Owning beats renting; for rentals, the latest one counts. Only what a viewer needs is returned.

import { Router } from "express";
import { config } from "./config.js";
import { db } from "./db.js";
import { requireUser } from "./auth.js";

export const libraryRouter = Router();
libraryRouter.use(requireUser);

const DAY = 86_400_000;

libraryRouter.get("/", (req, res) => {
  const rows = db
    .prepare(
      `SELECT p.purpose, p.created_at AS paid_at, p.started_at, f.id, f.title, f.year, f.poster_path, f.rental_days, f.rental_hours,
              f.status, f.hidden, f.address_type, f.subdomain, f.own_domain
       FROM payments p JOIN films f ON f.id = p.film_id
       WHERE p.user_id = ? AND p.purpose IN ('rent', 'buy')
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
    const hours = r.rental_hours ?? 72;
    const startBy = new Date(new Date(r.paid_at).getTime() + (r.rental_days ?? 30) * DAY).toISOString();
    // Once started, a rental lasts rental_hours from the first play (same rule as sales.js entitlement()).
    if (r.started_at) {
      const endsAt = new Date(new Date(r.started_at).getTime() + hours * 3_600_000).toISOString();
      return { ...base, access: endsAt > new Date().toISOString() ? "rented" : "expired", start_by: startBy, ends_at: endsAt, rental_hours: hours };
    }
    return { ...base, access: startBy > new Date().toISOString() ? "rented" : "expired", start_by: startBy, rental_hours: hours };
  });
  res.json({ films });
});
