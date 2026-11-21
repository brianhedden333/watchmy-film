// Which of our two sites a request is for, and where it's safe to send people.
//   app  = watchmyfilm.online (filmmakers)
//   club = indiefilm.club, <name>.indiefilm.club, and films on their own domains (watch.theirfilm.com) — viewers
// Locally: localhost / indiefilm.localhost / <name>.indiefilm.localhost (all on port 5173 through Vite).

import { config } from "./config.js";

const app = new URL(config.appUrl);
const club = new URL(config.clubUrl);
const appHost = app.hostname;
const clubHost = club.hostname;

const hostOf = (req) => String(req.headers.host || "").toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");

const isClubHost = (h) => h === clubHost || h.endsWith(`.${clubHost}`);
const isAppHost = (h) => h === appHost || h === `www.${appHost}`;

// { site, cookieDomain }: club sessions on indiefilm.club are shared with every <name>.indiefilm.club film page
// (cookie Domain=indiefilm.club); a film on its own domain keeps a cookie of its own (host-only).
export function siteOf(req) {
  const h = hostOf(req);
  if (isAppHost(h)) return { site: "app", cookieDomain: null };
  if (isClubHost(h)) return { site: "club", cookieDomain: clubHost };
  return { site: "club", cookieDomain: null };
}

// The site's own address (for emailed links): watchmyfilm.online or indiefilm.club.
export const siteUrl = (site) => (site === "club" ? config.clubUrl : config.appUrl);

// Where a sign-in hop may send someone: either site, or a film on indiefilm.club. Accepts a path ("/library/",
// resolved on this request's host) or a full URL. Anything else is null, so the hop can't redirect elsewhere.
export function safeNext(req, next) {
  const s = String(next || "");
  if (!s) return null;
  let u;
  try {
    if (/^\/(?![/\\])/.test(s)) u = new URL(s, `${config.production ? "https" : "http"}://${req.headers.host}`);
    else u = new URL(s);
  } catch {
    return null;
  }
  const h = u.hostname.toLowerCase();
  const sameScheme = (base) => u.protocol === base.protocol;
  if (isAppHost(h) && sameScheme(app)) return u.href;
  if (isClubHost(h) && sameScheme(club)) return u.href;
  if (h === hostOf(req)) return u.href; // the page they're on (e.g. a film's own domain)
  return null;
}

// Which site a URL belongs to (for the hop: land on the other one).
export const siteOfUrl = (href) => (isAppHost(new URL(href).hostname.toLowerCase()) ? "app" : "club");
