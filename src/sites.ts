// Our two sites (one server, one database):
//   APP  = watchmyfilm.online — filmmakers: home page, sign-up, My Films, add-a-film, admin
//   CLUB = indiefilm.club     — viewers: Browse (its home page), My Library, films at <name>.indiefilm.club
// Locally they're http://localhost:5173 and http://indiefilm.localhost:5173 (films at <name>.indiefilm.localhost:5173).

const LOCAL = location.hostname === "localhost" || location.hostname.endsWith(".localhost");
const port = location.port ? `:${location.port}` : "";

export const APP = LOCAL ? `${location.protocol}//localhost${port}` : "https://watchmyfilm.online";
export const CLUB = LOCAL ? `${location.protocol}//indiefilm.localhost${port}` : "https://indiefilm.club";
export const CLUB_DOMAIN = "indiefilm.club"; // what film addresses show (<name>.indiefilm.club)
const clubHost = new URL(CLUB).hostname;

// Which site this page is on. Film pages (including films on their own domains) count as the club.
export const onClub = () => location.hostname !== new URL(APP).hostname;
export const onApp = () => !onClub();

// A film's public address, the one viewers always see: <name>.indiefilm.club. A filmmaker's own domain
// (watch.theirfilm.com) only forwards there, so a DNS mistake on their side never breaks our links.
export function filmAddress(f: { subdomain?: string | null }) {
  return f.subdomain ? `${f.subdomain}.${CLUB_DOMAIN}` : null;
}

// A link to a film's watch page that works where we are: locally <name>.indiefilm.localhost:<port>/watch/.
export function filmHref(f: { subdomain?: string | null }) {
  if (LOCAL) return f.subdomain ? `${location.protocol}//${f.subdomain}.${clubHost}${port}/watch/` : null;
  const a = filmAddress(f);
  return a ? `https://${a}/` : null;
}

// A link to a page on the other site that keeps the person signed in: it passes through /api/auth/hop, which
// signs them in there with a one-time code (or just goes there if they aren't signed in).
export const cross = (url: string) => `/api/auth/hop?next=${encodeURIComponent(url)}`;
