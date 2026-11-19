import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { api, getMe, type User } from "./api";
import "./styles.css";
import "./browse.css";

/* Browse: the public catalog, set up like a late-night video store. A storefront sign over a photo of the racks,
   aisles you can filter by (the filmmakers' tags), and shelves of cases. Every case opens the film's own watch page.
   Not linked from anywhere yet. */

const home = import.meta.env.BASE_URL;

type Card = {
  id: number;
  title: string;
  logline: string | null;
  year: number | null;
  runtime_minutes: number | null;
  genre: string | null;
  director: string | null;
  languages: string | null;
  tags: string[];
  poster_url: string | null;
  still_url: string | null;
  banner_url: string | null;
  rent_price_cents: number | null;
  buy_price_cents: number | null;
  rental_hours: number | null;
  pwyw_enabled: boolean;
  pwyw_min_cents: number;
  address: string;
  added_at: string;
};

const SHELVES_MAX = 6; // aisle shelves shown on the front page
const SHELF_MIN = 3; // an aisle gets its own shelf once it has this many films (smaller ones are in the aisle signs)
const NEW_MAX = 12;

const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const href = (f: Card) => `https://${f.address}`;

// The price sticker: the cheapest way in.
function sticker(f: Card) {
  if (f.rent_price_cents) return `Rent ${money(f.rent_price_cents)}`;
  if (f.buy_price_cents) return `Buy ${money(f.buy_price_cents)}`;
  if (f.pwyw_enabled) return `From ${money(f.pwyw_min_cents)}`;
  return "";
}


function Browse() {
  const [films, setFilms] = useState<Card[] | null>(null);
  const [error, setError] = useState("");
  const [me, setMe] = useState<User | null>(null);
  const [aisle, setAisle] = useState<string | null>(() => new URLSearchParams(location.search).get("aisle"));
  const [q, setQ] = useState("");

  useEffect(() => {
    api<{ films: Card[] }>("/browse")
      .then((r) => setFilms(r.films))
      .catch(() => setError("The shelves didn't load. Refresh to try again."));
    getMe().then(setMe).catch(() => {});
  }, []);

  // Keep the chosen aisle in the address, so it can be shared.
  useEffect(() => {
    const u = new URL(location.href);
    if (aisle) u.searchParams.set("aisle", aisle);
    else u.searchParams.delete("aisle");
    history.replaceState(null, "", u);
  }, [aisle]);

  // Aisles: every tag in use, busiest first.
  const aisles = useMemo(() => {
    const count = new Map<string, { name: string; n: number }>();
    for (const f of films || [])
      for (const t of f.tags) {
        const k = t.toLowerCase();
        const a = count.get(k) || { name: t, n: 0 };
        a.n++;
        count.set(k, a);
      }
    return [...count.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  }, [films]);

  const query = q.trim().toLowerCase();
  const filtering = !!aisle || !!query;
  const shown = useMemo(() => {
    if (!films) return [];
    return films.filter((f) => {
      if (aisle && !f.tags.some((t) => t.toLowerCase() === aisle.toLowerCase())) return false;
      if (!query) return true;
      const hay = [f.title, f.director, f.genre, f.logline, ...f.tags].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(query);
    });
  }, [films, aisle, query]);


  return (
    <div className="bz">
      <a className="bz-skip" href="#shelves">
        Skip to the shelves
      </a>
      <header className="bz-head">
        <div className="bz-wrap bz-head-in">
          <a href={home} className="bz-logo" aria-label="watchmyfilm.online home">
            <img src={`${home}brand/watchmyfilm-logo-white.png`} alt="" width={600} height={163} />
          </a>
          <nav className="bz-nav" aria-label="Site">
            <a href={`${home}browse/`} aria-current="page">
              Browse
            </a>
            <a href={home}>For filmmakers</a>
            {me ? <a href={`${home}library/`}>My library</a> : <a href={`${home}signin/`}>Log in</a>}
          </nav>
        </div>
      </header>

      <main>
        <section className="bz-hero" aria-labelledby="bz-title">
          <img className="bz-hero-img" src={`${home}browse/video-store.jpg`} alt="" width={600} height={424} />
          <div className="bz-hero-shade" aria-hidden="true" />
          <div className="bz-wrap bz-hero-in">
            <h1 id="bz-title">Watch Our Films</h1>
            <p>Independent films, rented and bought straight from the people who made them.</p>
          </div>
        </section>

        <div className="bz-wrap bz-tools">
          <label className="bz-search">
            <span className="visually-hidden">Search films</span>
            <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18">
              <circle cx="8.5" cy="8.5" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="M13 13l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Titles, directors, subjects" />
          </label>
          {aisles.length > 0 && (
            <div className="bz-aisles" role="group" aria-label="Aisles">
              <button type="button" aria-pressed={!aisle} onClick={() => setAisle(null)}>
                Everything
              </button>
              {aisles.map((a) => (
                <button key={a.name} type="button" aria-pressed={aisle?.toLowerCase() === a.name.toLowerCase()} onClick={() => setAisle(a.name)}>
                  {a.name}
                  <span className="bz-n">{a.n}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div id="shelves" tabIndex={-1}>
          {error && <p className="bz-wrap bz-empty">{error}</p>}
          {!films && !error && <p className="bz-wrap bz-empty" aria-live="polite">Stocking the shelves…</p>}

          {films && films.length === 0 && (
            <div className="bz-wrap bz-empty">
              <p>The shelves are empty for now. Films appear here when their filmmakers add them to Browse.</p>
              <a className="btn" href={home}>
                Put your film on the shelf
              </a>
            </div>
          )}

          {films && films.length > 0 && filtering && (
            <section className="bz-wrap bz-results" aria-live="polite">
              <h2 className="bz-shelf-name">
                {aisle || "Search"}
                <span className="bz-n">{shown.length === 1 ? "1 film" : `${shown.length} films`}</span>
              </h2>
              {shown.length ? (
                <ul className="bz-grid">
                  {shown.map((f) => (
                    <li key={f.id}>
                      <Case film={f} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="bz-empty-inline">
                  Nothing on this shelf matches.{" "}
                  <button
                    type="button"
                    className="bz-link"
                    onClick={() => {
                      setQ("");
                      setAisle(null);
                    }}
                  >
                    See everything
                  </button>
                </p>
              )}
            </section>
          )}

          {films && films.length > 0 && !filtering && (
            <>
              <Shelf name="New arrivals" films={films.slice(0, NEW_MAX)} />
              {aisles
                .filter((a) => a.n >= SHELF_MIN)
                .slice(0, SHELVES_MAX)
                .map((a) => (
                <Shelf
                  key={a.name}
                  name={a.name}
                  films={films.filter((f) => f.tags.some((t) => t.toLowerCase() === a.name.toLowerCase()))}
                  onAll={() => {
                    setAisle(a.name);
                    document.getElementById("shelves")?.scrollIntoView({ block: "start" });
                  }}
                />
                ))}
            </>
          )}
        </div>
      </main>

      <footer className="bz-wrap bz-foot">
        <p>
          Made a film? <a href={home}>Sell it from your own website</a> and put it on these shelves.
        </p>
        <p className="bz-legal">
          <a href={`${home}terms/`}>Terms</a>
          <a href={`${home}privacy/`}>Privacy</a>
        </p>
      </footer>
    </div>
  );
}

// One shelf: a scrolling row of cases, with arrows on wider screens.
function Shelf({ name, films, onAll }: { name: string; films: Card[]; onAll?: () => void }) {
  const row = useRef<HTMLUListElement>(null);
  const [ends, setEnds] = useState({ start: true, end: false });
  const id = `shelf-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  const update = () => {
    const el = row.current;
    if (!el) return;
    setEnds({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth > el.scrollWidth - 8 });
  };
  useEffect(() => {
    update();
    addEventListener("resize", update);
    return () => removeEventListener("resize", update);
  }, [films]);

  const move = (dir: 1 | -1) => {
    const el = row.current;
    if (!el) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <section className="bz-shelf" aria-labelledby={id}>
      <div className="bz-wrap bz-shelf-head">
        <h2 className="bz-shelf-name" id={id}>
          {name}
          <span className="bz-n">{films.length === 1 ? "1 film" : `${films.length} films`}</span>
        </h2>
        <div className="bz-shelf-tools">
          {onAll && films.length > 4 && (
            <button type="button" className="bz-link" onClick={onAll}>
              See all
            </button>
          )}
          {!(ends.start && ends.end) && (
            <>
              <button type="button" className="bz-arrow" onClick={() => move(-1)} disabled={ends.start} aria-label={`Scroll ${name} back`}>
                ‹
              </button>
              <button type="button" className="bz-arrow" onClick={() => move(1)} disabled={ends.end} aria-label={`Scroll ${name} forward`}>
                ›
              </button>
            </>
          )}
        </div>
      </div>
      <ul className="bz-row" ref={row} onScroll={update}>
        {films.map((f) => (
          <li key={f.id}>
            <Case film={f} />
          </li>
        ))}
      </ul>
    </section>
  );
}

// A film as a case on the shelf: poster with a spine edge, a price sticker, title and details underneath.
function Case({ film: f }: { film: Card }) {
  const price = sticker(f);
  return (
    <a className="bz-case" href={href(f)}>
      <span className="bz-cover">
        <img src={f.poster_url!} alt="" loading="lazy" width={400} height={600} />
        {price && <span className="bz-sticker">{price}</span>}
        {f.logline && (
          <span className="bz-back" aria-hidden="true">
            {f.logline}
          </span>
        )}
      </span>
      <span className="bz-case-title">{f.title}</span>
      <span className="bz-case-meta">{[f.director, f.year].filter(Boolean).join(", ")}</span>
    </a>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Browse />
  </StrictMode>
);
