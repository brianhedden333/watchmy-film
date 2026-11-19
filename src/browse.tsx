import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { api, getMe, type User } from "./api";
import { textOn, type Credit } from "./films";
import { embedUrl } from "./watchpage";
import "./styles.css";
import "./browse.css";

/* Browse, spines version: the catalog as a stack of DVD cases lying flat, so you only see each spine (title, and a
   strip of the film's wide image). Hover a spine for "Click for trailer"; click it and the stack dims while the film
   opens in a pop-up: trailer, poster and synopsis, rent and buy, then details and credits. The X puts it back.
   The earlier shelves version is saved at git tag browse-shelves-v1. Not linked from anywhere yet. */

const home = import.meta.env.BASE_URL;

type Card = {
  id: number;
  title: string;
  logline: string | null;
  synopsis: string | null;
  credits: Credit[];
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
  trailer_url: string | null;
  color_background: string | null;
  color_primary: string | null;
  color_button: string | null;
  address: string;
  added_at: string;
};

const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const href = (f: Card) => `https://${f.address}`;
const HEX = /^#[0-9a-f]{6}$/i;

// Spines without a color of their own get one of these, picked by film so it never changes.
const SPINE_FALLBACK = ["#2a2724", "#3a2a2f", "#24303a", "#33302a", "#1f2b26", "#3b3326"];

function spineColors(f: Card) {
  const bg = f.color_button && HEX.test(f.color_button) ? f.color_button : SPINE_FALLBACK[f.id % SPINE_FALLBACK.length];
  const want = f.color_primary && HEX.test(f.color_primary) ? f.color_primary : null;
  // Use the film's own text color only when it reads on the spine; otherwise black or white.
  const fg = want && contrast(want, bg) >= 3 ? want : textOn(bg);
  return { bg, fg };
}

function contrast(a: string, b: string) {
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// A hand-stacked pile isn't perfectly square: each case sits a little left or right, by film.
const nudge = (id: number) => (((id * 37) % 11) - 5) * 0.35; // -1.75%..+1.75%

// The trailer player, starting as soon as the pop-up opens (the click counts as the go-ahead).
function trailerSrc(link: string | null) {
  const src = embedUrl(link);
  if (!src) return null;
  return `${src}${src.includes("?") ? "&" : "?"}autoplay=1${src.includes("youtube") ? "&rel=0" : ""}`;
}

function Browse() {
  const [films, setFilms] = useState<Card[] | null>(null);
  const [error, setError] = useState("");
  const [me, setMe] = useState<User | null>(null);
  const [aisle, setAisle] = useState<string | null>(() => new URLSearchParams(location.search).get("aisle"));
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Card | null>(null);
  const lastSpine = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    api<{ films: Card[] }>("/browse")
      .then((r) => setFilms(r.films))
      .catch(() => setError("The films didn't load. Refresh to try again."));
    getMe().then(setMe).catch(() => {});
  }, []);

  useEffect(() => {
    const u = new URL(location.href);
    if (aisle) u.searchParams.set("aisle", aisle);
    else u.searchParams.delete("aisle");
    history.replaceState(null, "", u);
  }, [aisle]);

  // While a film is open, the page behind it can't be reached and doesn't scroll.
  useEffect(() => {
    const root = document.getElementById("root");
    if (root) root.inert = !!open;
    document.documentElement.classList.toggle("bz-locked", !!open);
  }, [open]);

  function close() {
    setOpen(null);
    requestAnimationFrame(() => lastSpine.current?.focus({ preventScroll: true }));
  }

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
      <a className="bz-skip" href="#stack">
        Skip to the films
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

        <div className="bz-wrap">
          {error && <p className="bz-empty">{error}</p>}
          {!films && !error && <p className="bz-empty" aria-live="polite">Stacking the cases…</p>}
          {films && films.length === 0 && (
            <div className="bz-empty">
              <p>Nothing on the stack yet. Films appear here when their filmmakers add them to Browse.</p>
              <a className="btn" href={home}>
                Add your film
              </a>
            </div>
          )}

          {films && films.length > 0 && (
            <section className={`bz-pile${open ? " is-open" : ""}`} aria-labelledby="bz-pile-title">
              <h2 className="bz-shelf-name" id="bz-pile-title">
                {aisle || (query ? "Search" : "Everything")}
                <span className="bz-n" aria-live="polite">
                  {shown.length === 1 ? "1 film" : `${shown.length} films`}
                </span>
              </h2>
              {shown.length ? (
                <ol className="bz-stack" id="stack">
                  {shown.map((f) => (
                    <li key={f.id} style={{ marginLeft: `${2 + nudge(f.id)}%`, marginRight: `${2 - nudge(f.id)}%` }}>
                      <Spine
                        film={f}
                        current={open?.id === f.id}
                        onOpen={(el) => {
                          lastSpine.current = el;
                          setOpen(f);
                        }}
                      />
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="bz-empty-inline">
                  Nothing in the stack matches.{" "}
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
        </div>
      </main>

      <footer className="bz-wrap bz-foot">
        <p>
          Made a film? <a href={home}>Sell it from your own website</a> and add it to the stack.
        </p>
        <p className="bz-legal">
          <a href={`${home}terms/`}>Terms</a>
          <a href={`${home}privacy/`}>Privacy</a>
        </p>
      </footer>

      {open && createPortal(<FilmPopup film={open} onClose={close} />, document.body)}
    </div>
  );
}

// One case lying flat: director, title and year, with a strip of the film's wide image at the right end.
function Spine({ film: f, current, onOpen }: { film: Card; current: boolean; onOpen: (el: HTMLButtonElement) => void }) {
  const { bg, fg } = spineColors(f);
  const img = f.still_url || f.banner_url;
  return (
    <button
      type="button"
      className={`bz-spine${current ? " is-current" : ""}`}
      style={{ background: bg, color: fg, ["--spine" as string]: bg }}
      aria-haspopup="dialog"
      aria-label={`${f.title}${f.director ? `, ${f.director}` : ""}${f.year ? `, ${f.year}` : ""}. ${f.trailer_url ? "Open the trailer" : "Open details"}`}
      onClick={(e) => onOpen(e.currentTarget)}
    >
      <span className="bz-spine-who">{f.director}</span>
      <span className="bz-spine-title">{f.title}</span>
      <span className="bz-spine-year">{f.year}</span>
      <span className="bz-spine-img" aria-hidden="true">
        {img && <img src={img} alt="" loading="lazy" />}
        <span className="bz-spine-cta">
          <svg viewBox="0 0 10 10" width="10" height="10">
            <path d="M2 1.5v7l6-3.5z" fill="currentColor" />
          </svg>
          {f.trailer_url ? "Click for trailer" : "Click for details"}
        </span>
      </span>
    </button>
  );
}

// The film, taken off the stack: trailer, poster and synopsis, rent and buy above the fold; details and credits below.
function FilmPopup({ film: f, onClose }: { film: Card; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const trailer = trailerSrc(f.trailer_url);
  const paragraphs = (f.synopsis || "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  // Up top: the one-line description (or the start of the synopsis). The full synopsis is under About the film.
  const intro = f.logline || paragraphs[0] || "";
  const details: [string, string][] = [
    ["Director", f.credits.some((c) => /^directors?$/i.test(c.role)) ? "" : f.director || ""], // listed under Credits when it's there
    ["Year", f.year ? String(f.year) : ""],
    ["Running time", f.runtime_minutes ? `${f.runtime_minutes} minutes` : ""],
    ["Genre", f.genre || ""],
    ["Languages", f.languages || ""],
    ["Rental", f.rent_price_cents && f.rental_hours ? `${f.rental_hours} hours to watch once you start` : ""],
  ].filter((d): d is [string, string] => !!d[1]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="bz-pop-layer">
      <div className="bz-pop-scrim" onClick={onClose} aria-hidden="true" />
      <div className="bz-pop" role="dialog" aria-modal="true" aria-labelledby="bz-pop-title">
        <button type="button" className="bz-close" onClick={onClose} ref={closeRef} aria-label="Close and put it back on the stack">
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
            <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>

        <div className="bz-pop-screen">
          {trailer ? (
            <iframe src={trailer} title={`${f.title} trailer`} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
          ) : (
            <>
              {(f.still_url || f.banner_url) && <img src={(f.still_url || f.banner_url)!} alt="" />}
              <p className="bz-pop-notrailer">No trailer yet</p>
            </>
          )}
        </div>

        <div className="bz-pop-body">
          <div className="bz-pop-top">
            {f.poster_url && <img className="bz-pop-poster" src={f.poster_url} alt={`${f.title} poster`} width={400} height={600} />}
            <div className="bz-pop-text">
              <h2 id="bz-pop-title">{f.title}</h2>
              <p className="bz-pop-meta">{[f.director, f.year, f.runtime_minutes && `${f.runtime_minutes} min`].filter(Boolean).join(", ")}</p>
              {intro && <p className="bz-pop-intro">{intro}</p>}
            </div>
          </div>

          <div className="bz-pop-buy">
            {f.rent_price_cents != null && (
              <a className="btn" href={href(f)}>
                Rent {money(f.rent_price_cents)}
              </a>
            )}
            {f.buy_price_cents != null && (
              <a className={f.rent_price_cents != null ? "btn btn-outline" : "btn"} href={href(f)}>
                Buy {money(f.buy_price_cents)}
              </a>
            )}
            {f.pwyw_enabled && (
              <a className="bz-ghost" href={href(f)}>
                Or pay what you want, from {money(f.pwyw_min_cents)}
              </a>
            )}
          </div>

          <div className="bz-pop-more">
            {paragraphs.length > 0 && (
              <section>
                <h3>About the film</h3>
                {paragraphs.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </section>
            )}
            <div className="bz-pop-cols">
              {details.length > 0 && (
                <section>
                  <h3>Details</h3>
                  <dl className="bz-dl">
                    {details.map(([k, v]) => (
                      <div key={k}>
                        <dt>{k}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}
              {f.credits.length > 0 && (
                <section>
                  <h3>Credits</h3>
                  <dl className="bz-dl">
                    {f.credits.map((c) => (
                      <div key={c.role}>
                        <dt>{c.role}</dt>
                        <dd>{c.names.join(", ")}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}
            </div>
            {f.tags.length > 0 && (
              <ul className="bz-pop-tags" aria-label="Tags">
                {f.tags.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            )}
            <p className="bz-pop-page">
              <a href={href(f)}>Go to the film's page</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Browse />
  </StrictMode>
);
