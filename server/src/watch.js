// Public watch pages: <name>.watchmyfilm.online (and later watch.<their domain>) show a live film to anyone.
// Only what a viewer may see is returned. Never a paid film's Vimeo link or the bonus video links;
// a film that's free to watch includes its own link (bonus features stay paid).

import { Router } from "express";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "./config.js";
import { db } from "./db.js";
import { publicFilm } from "./films.js";
import { filmPageUrl } from "./sales.js"; // (sales.js imports this file too; both are only used at request time)

export const watchRouter = Router();

// The films row for a hostname (any status), or null. Used by sales.js too.
export function filmRowForHost(rawHost) {
  const host = String(rawHost || "").toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  if (!host || host.length > 253) return null;
  let row = null;
  // <name>.indiefilm.club (locally <name>.indiefilm.localhost).
  const suffix = `.${config.siteDomain}`;
  if (host.endsWith(suffix)) {
    const name = host.slice(0, -suffix.length);
    if (name && !name.includes(".")) row = db.prepare("SELECT * FROM films WHERE subdomain = ? AND deleted_at IS NULL").get(name);
  }
  // Their own domain: watch.theirfilm.com -> own_domain theirfilm.com
  if (!row && host.startsWith("watch.")) row = db.prepare("SELECT * FROM films WHERE own_domain = ? AND deleted_at IS NULL").get(host.slice(6));
  return row || null;
}

// The film for a hostname as viewers may see it, or null. Hidden films come back with hidden: true (holding page).
export function filmForHost(rawHost) {
  const row = filmRowForHost(rawHost);
  if (!row || row.status !== "live") return null;
  return viewerFilm(row);
}

// "More films from this account": the same filmmaker's other live, visible films with a poster (newest first).
// Only what's already public on each film's own page: title, poster and address.
function moreFromAccount(row) {
  return db
    .prepare(
      `SELECT id, title, poster_path, subdomain, own_domain, address_type FROM films
       WHERE user_id = ? AND id != ? AND status = 'live' AND hidden = 0 AND deleted_at IS NULL AND poster_path IS NOT NULL
       ORDER BY coalesce(submitted_at, created_at) DESC LIMIT 24`
    )
    .all(row.user_id, row.id)
    .map((m) => ({
      id: m.id,
      title: m.title,
      poster_url: `/uploads/${m.poster_path}`,
      address: m.address_type === "own" && m.own_domain ? `watch.${m.own_domain}` : m.subdomain ? `${m.subdomain}.${config.siteDomain}` : null,
      url: filmPageUrl(m), // the watch page (right for local testing too)
    }))
    .filter((m) => m.address);
}

function viewerFilm(row) {
  const f = publicFilm(row);
  const out = {
    id: f.id,
    title: f.title,
    hidden: f.hidden,
    poster_url: f.poster_url,
    still_url: f.still_url,
    banner_url: f.banner_url,
    color_background: f.color_background,
    color_primary: f.color_primary,
    color_secondary: f.color_secondary,
    color_button: f.color_button,
  };
  if (f.hidden) return out; // the holding page needs only the look
  return {
    ...out,
    more: moreFromAccount(row),
    logline: f.logline,
    synopsis: f.synopsis,
    year: f.year,
    runtime_minutes: f.runtime_minutes,
    genre: f.genre,
    languages: f.languages,
    director: f.director,
    credits: f.credits,
    trailer_url: f.trailer_url,
    rent_price_cents: f.rent_price_cents,
    buy_price_cents: f.buy_price_cents,
    rental_days: f.rental_days,
    rental_watch_days: f.rental_watch_days,
    pwyw_enabled: f.pwyw_enabled,
    pwyw_min_cents: f.pwyw_min_cents,
    pwyw_suggested_cents: f.pwyw_suggested_cents,
    pwyw_access: f.pwyw_access,
    tip_venmo: f.tip_venmo,
    tip_paypal: f.tip_paypal,
    tip_zelle: f.tip_zelle,
    free_watch: f.free_watch,
    hide_title: f.hide_title,
    vimeo_url: f.free_watch ? f.vimeo_url : null,
    // Titles and descriptions only: the videos themselves are what people pay for.
    bonus: {
      rent: { description: f.bonus.rent.description, videos: f.bonus.rent.videos.map((v) => ({ title: v.title, url: "" })) },
      buy: { description: f.bonus.buy.description, videos: f.bonus.buy.videos.map((v) => ({ title: v.title, url: "" })) },
    },
  };
}

// JSON for the page (and for local testing): GET /api/watch?host=mountaingoat.watchmyfilm.online
watchRouter.get("/", (req, res) => {
  const film = filmForHost(req.query.host || req.headers.host);
  if (!film) return res.status(404).json({ error: "No film here." });
  res.set("Cache-Control", "no-cache");
  res.json({ film });
});

// The page itself, with the film's title, description and image in the HTML for link previews,
// and the film data inlined so it renders without a second request. nginx sends "/" on film hosts here.
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

let shell = { mtime: 0, html: "" };
function pageShell() {
  const file = resolve(config.siteDir, "watch/index.html");
  if (!existsSync(file)) return null;
  const mtime = statSync(file).mtimeMs;
  if (mtime !== shell.mtime) shell = { mtime, html: readFileSync(file, "utf8") };
  return shell.html;
}

watchRouter.get("/page", (req, res) => {
  const host = String(req.headers.host || "");
  const film = filmForHost(host);
  const html = pageShell();
  if (!html) return res.status(500).send("Watch page isn't built.");
  const origin = `https://${host.replace(/:\d+$/, "")}`;
  const abs = (u) => (u ? `${config.appUrl}${u}` : `${config.appUrl}/brand/share.jpg`);

  let head;
  if (!film) {
    head = `<title>Film not found | ${esc(config.clubName)}</title><meta name="robots" content="noindex">`;
  } else {
    const title = film.hidden ? `${film.title}` : `Watch ${film.title}`;
    const desc = film.hidden ? "Not available right now. Check back soon." : film.logline || `Rent or buy ${film.title}.`;
    const img = abs(film.still_url || film.banner_url || film.poster_url);
    head = [
      `<title>${esc(title)}</title>`,
      `<meta name="description" content="${esc(desc)}">`,
      `<link rel="canonical" href="${esc(origin)}/">`,
      `<meta property="og:type" content="video.movie">`,
      `<meta property="og:title" content="${esc(film.title)}">`,
      `<meta property="og:description" content="${esc(desc)}">`,
      `<meta property="og:url" content="${esc(origin)}/">`,
      `<meta property="og:image" content="${esc(img)}">`,
      `<meta name="twitter:card" content="summary_large_image">`,
      `<meta name="twitter:image" content="${esc(img)}">`,
      film.hidden ? `<meta name="robots" content="noindex">` : "",
    ].join("\n    ");
  }
  // JSON inside <script>: escape "<" so a title can't close the tag.
  const data = `<script>window.__WATCH__=${JSON.stringify({ film }).replace(/</g, "\\u003c")}</script>`;
  const out = html.replace(/<title>[\s\S]*?<\/title>/, head).replace("</head>", `    ${data}\n  </head>`);
  res.status(film ? 200 : 404).set("Cache-Control", "no-cache").type("html").send(out);
});
