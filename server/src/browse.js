// Browse: the public catalog of live films whose filmmakers opted in ("Allow my film to be discovered in Browse").
// Only what a shopper needs to choose a film; never the film link, bonus links or anything about the filmmaker's account.

import { Router } from "express";
import { config } from "./config.js";
import { db } from "./db.js";
import { filmPageUrl } from "./sales.js";

export const browseRouter = Router();

const address = (f) =>
  f.address_type === "own" && f.own_domain ? `watch.${f.own_domain}` : f.subdomain ? `${f.subdomain}.${config.siteDomain}` : null;

const upload = (p) => (p ? `/uploads/${p}` : null);

function card(f) {
  return {
    id: f.id,
    title: f.title,
    logline: f.logline,
    synopsis: f.synopsis,
    credits: f.credits ? JSON.parse(f.credits).filter((c) => c.names?.length) : [],
    year: f.year,
    runtime_minutes: f.runtime_minutes,
    genre: f.genre,
    director: f.director,
    languages: f.languages,
    tags: f.tags ? JSON.parse(f.tags) : [],
    poster_url: upload(f.poster_path),
    still_url: upload(f.still_path),
    banner_url: upload(f.banner_path),
    rent_price_cents: f.rent_price_cents,
    buy_price_cents: f.buy_price_cents,
    rental_watch_days: f.rental_watch_days,
    pwyw_enabled: !!f.pwyw_enabled,
    free_watch: !!f.free_watch,
    pwyw_min_cents: f.pwyw_min_cents,
    // Which tip jars it has (the handles themselves are on the film's own page).
    tips: ["venmo", "paypal", "zelle"].filter((k) => f[`tip_${k}`]),
    trailer_url: f.trailer_url, // public anyway: it plays on the watch page for everyone
    // The film's own page colors (public on its watch page). The spine is printed in them.
    color_background: f.color_background,
    color_primary: f.color_primary,
    color_button: f.color_button,
    staff_pick: !!f.staff_pick,
    address: address(f),
    url: filmPageUrl(f), // the watch page (right for local testing too)
    added_at: f.submitted_at || f.created_at,
  };
}

browseRouter.get("/", (_req, res) => {
  const rows = db
    .prepare(
      `SELECT * FROM films
       WHERE status = 'live' AND hidden = 0 AND discoverable = 1 AND poster_path IS NOT NULL AND deleted_at IS NULL
       ORDER BY coalesce(submitted_at, created_at) DESC`
    )
    .all();
  res.set("Cache-Control", "public, max-age=60");
  res.json({ films: rows.map(card).filter((f) => f.address) });
});
