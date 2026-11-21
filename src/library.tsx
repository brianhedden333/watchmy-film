import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { api, getMe, type User } from "./api";
import { AppHeader } from "./AppHeader";
import { CLUB, CLUB_DOMAIN, cross, onApp } from "./sites";
import "./styles.css";
import "./dashboard.css";

/* My Library (on indiefilm.club): films this person has rented or bought, plus their Watch Later list (saved from
   Browse). Filmmakers also have My Films (the films they sell) on watchmyfilm.online. */

const home = import.meta.env.BASE_URL;

type LibraryFilm = {
  id: number;
  title: string;
  year: number | null;
  poster_url: string | null;
  address: string | null; // the film's address, once it's live
  url: string | null; // its watch page
  paid_at: string;
  access: "owned" | "rented" | "expired";
  start_by?: string;
  ends_at?: string; // set once a rental has been started
  watch_days?: number;
};

type LaterFilm = {
  id: number;
  title: string;
  year: number | null;
  poster_url: string | null;
  address: string | null;
  url: string | null;
  rent_price_cents: number | null;
  buy_price_cents: number | null;
  free_watch: boolean;
};

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const money = (c: number) => `$${(c / 100).toFixed(2)}`;

function left(iso: string) {
  const ms = Math.max(0, Date.parse(iso) - Date.now());
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  if (d) return `${d} ${d === 1 ? "day" : "days"}${h ? ` ${h} ${h === 1 ? "hour" : "hours"}` : ""}`;
  return h ? `${h} ${h === 1 ? "hour" : "hours"}` : "under an hour";
}

function accessLine(f: LibraryFilm) {
  if (f.access === "owned") return "Owned";
  if (f.access === "expired") return `Rental ended ${day(f.ends_at || f.start_by!)}`;
  if (f.ends_at) return `Rented · ${left(f.ends_at)} left to watch`;
  return `Rented · start by ${day(f.start_by!)}`;
}

function priceLine(f: LaterFilm) {
  return [
    f.free_watch && "Free to watch",
    f.rent_price_cents != null && `Rent ${money(f.rent_price_cents)}`,
    f.buy_price_cents != null && `Buy ${money(f.buy_price_cents)}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function Library() {
  const [user, setUser] = useState<User | null>(null);
  const [films, setFilms] = useState<LibraryFilm[] | null>(null);
  const [later, setLater] = useState<LaterFilm[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    // My Library lives on indiefilm.club: from watchmyfilm.online, carry them over (still signed in).
    if (onApp()) return location.replace(cross(`${CLUB}/library/`));
    getMe()
      .then(async (u) => {
        if (!u) return location.replace(`${home}signin/`);
        setUser(u);
        const [lib, wl] = await Promise.all([api<{ films: LibraryFilm[] }>("/library"), api<{ films: LaterFilm[] }>("/watchlist")]);
        setFilms(lib.films);
        setLater(wl.films);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  async function remove(id: number) {
    const before = later;
    setLater((l) => (l ? l.filter((f) => f.id !== id) : l));
    try {
      await api(`/watchlist/${id}`, { method: "DELETE", body: {} });
    } catch (e) {
      setLater(before);
      setError((e as Error).message);
    }
  }

  return (
    <div className="dash">
      <AppHeader user={user} />
      <main className="wrap dash-main">
        <h1>My Library</h1>
        {error && <p className="dash-alert" role="alert">{error}</p>}
        {!films && !error && <p role="status">Loading…</p>}

        {films && (
          <section className="library-section" aria-labelledby="lib-bought">
            <h2 id="lib-bought">Rented and bought</h2>
            {films.length === 0 ? (
              <p className="settings-hint">
                Films you rent or buy on {CLUB_DOMAIN} show up here, using the email you paid with.
              </p>
            ) : (
              <ul className="library-grid">
                {films.map((f) => {
                  // Through /api/library/go so they arrive signed in (a film on its own domain needs a one-time link).
                  const href = f.url && f.access !== "expired" ? `/api/library/go/${f.id}` : f.url;
                  const poster = f.poster_url ? <img src={f.poster_url} alt="" loading="lazy" /> : <span>{f.title}</span>;
                  return (
                    <li key={f.id} className={`library-item is-${f.access}`}>
                      {href ? (
                        <a className="library-poster" href={href} aria-label={`Watch ${f.title}`}>
                          {poster}
                        </a>
                      ) : (
                        <div className="library-poster">{poster}</div>
                      )}
                      <h3>
                        {href ? <a href={href}>{f.title}</a> : f.title}
                        {f.year && <span className="film-row-year"> ({f.year})</span>}
                      </h3>
                      <p className={`library-access access-${f.access}`}>{accessLine(f)}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {later && (
          <section className="library-section" aria-labelledby="lib-later">
            <h2 id="lib-later">Watch Later</h2>
            {later.length === 0 ? (
              <p className="settings-hint">
                Save films from <a href="/">Browse</a> with "Watch later" and they'll wait for you here.
              </p>
            ) : (
              <ul className="library-grid">
                {later.map((f) => {
                  const href = f.url;
                  const poster = f.poster_url ? <img src={f.poster_url} alt="" loading="lazy" /> : <span>{f.title}</span>;
                  return (
                    <li key={f.id} className="library-item">
                      {href ? (
                        <a className="library-poster" href={href} aria-label={`Open ${f.title}`}>
                          {poster}
                        </a>
                      ) : (
                        <div className="library-poster">{poster}</div>
                      )}
                      <h3>
                        {href ? <a href={href}>{f.title}</a> : f.title}
                        {f.year && <span className="film-row-year"> ({f.year})</span>}
                      </h3>
                      <p className="library-access">{priceLine(f)}</p>
                      <button type="button" className="link-btn library-remove" onClick={() => remove(f.id)}>
                        Remove
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Library />
  </StrictMode>
);
