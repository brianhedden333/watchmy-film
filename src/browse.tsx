import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { api, getMe, type User } from "./api";
import { textOn } from "./films";
import "./styles.css";
import "./browse.css";

/* Browse, spines version: the catalog as a stack of DVD cases lying flat, so you only see each spine.
   Hover a spine to see its cover and details beside the stack. Click it to take it off the stack: the stack dims,
   and the cover card stays put (with its links) until you close it with the X.
   The earlier shelves version is saved at git tag browse-shelves-v1. Not linked from anywhere yet. */

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

function prices(f: Card) {
  const out: { label: string; note?: string }[] = [];
  if (f.rent_price_cents) out.push({ label: `Rent ${money(f.rent_price_cents)}`, note: f.rental_hours ? `${f.rental_hours} hours to watch` : undefined });
  if (f.buy_price_cents) out.push({ label: `Buy ${money(f.buy_price_cents)}`, note: "Yours to keep" });
  if (f.pwyw_enabled) out.push({ label: `Pay what you want`, note: `From ${money(f.pwyw_min_cents)}` });
  return out;
}

function Browse() {
  const [films, setFilms] = useState<Card[] | null>(null);
  const [error, setError] = useState("");
  const [me, setMe] = useState<User | null>(null);
  const [aisle, setAisle] = useState<string | null>(() => new URLSearchParams(location.search).get("aisle"));
  const [q, setQ] = useState("");
  const [peek, setPeek] = useState<Card | null>(null); // hovered or focused spine
  const [open, setOpen] = useState<Card | null>(null); // clicked: taken off the stack
  const stackRef = useRef<HTMLOListElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
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

  // While a film is open, the stack can't be hovered or tabbed into; Escape puts the film back.
  useEffect(() => {
    const stack = stackRef.current;
    if (stack) stack.inert = !!open;
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [open]);

  function close() {
    setOpen(null);
    setPeek(null);
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

  const current = open || peek;

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
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Titles, directors, subjects" disabled={!!open} />
          </label>
          {aisles.length > 0 && (
            <div className="bz-aisles" role="group" aria-label="Aisles">
              <button type="button" aria-pressed={!aisle} onClick={() => setAisle(null)} disabled={!!open}>
                Everything
              </button>
              {aisles.map((a) => (
                <button key={a.name} type="button" aria-pressed={aisle?.toLowerCase() === a.name.toLowerCase()} onClick={() => setAisle(a.name)} disabled={!!open}>
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
            <div className={`bz-floor${open ? " is-open" : ""}`}>
              <section className="bz-pile" aria-labelledby="bz-pile-title">
                <h2 className="bz-shelf-name" id="bz-pile-title">
                  {aisle || (query ? "Search" : "Everything")}
                  <span className="bz-n" aria-live="polite">
                    {shown.length === 1 ? "1 film" : `${shown.length} films`}
                  </span>
                </h2>
                {shown.length ? (
                  <ol className="bz-stack" id="stack" ref={stackRef} onMouseLeave={() => !open && setPeek(null)}>
                    {shown.map((f) => {
                      const { bg, fg } = spineColors(f);
                      return (
                        <li key={f.id} style={{ marginLeft: `${2 + nudge(f.id)}%`, marginRight: `${2 - nudge(f.id)}%` }}>
                          <button
                            type="button"
                            className={`bz-spine${current?.id === f.id ? " is-current" : ""}`}
                            style={{ background: bg, color: fg }}
                            aria-haspopup="dialog"
                            aria-label={`${f.title}${f.director ? `, ${f.director}` : ""}${f.year ? `, ${f.year}` : ""}`}
                            onMouseEnter={() => !open && setPeek(f)}
                            onFocus={() => !open && setPeek(f)}
                            onClick={(e) => {
                              lastSpine.current = e.currentTarget;
                              setPeek(f);
                              setOpen(f);
                            }}
                          >
                            <span className="bz-spine-who">{f.director}</span>
                            <span className="bz-spine-title">{f.title}</span>
                            <span className="bz-spine-year">{f.year}</span>
                            <span className="bz-spine-mark" aria-hidden="true">
                              <svg viewBox="0 0 10 10" width="10" height="10">
                                <path d="M2 1.5v7l6-3.5z" fill="currentColor" />
                              </svg>
                            </span>
                          </button>
                        </li>
                      );
                    })}
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

              <Display film={current} open={!!open} onClose={close} closeRef={closeRef} />
            </div>
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
    </div>
  );
}

// The cover card beside the stack. A preview while hovering (not clickable); once a spine is clicked it stays,
// becomes a dialog with working links, and closes with the X.
function Display({ film: f, open, onClose, closeRef }: { film: Card | null; open: boolean; onClose: () => void; closeRef: React.RefObject<HTMLButtonElement> }) {
  if (!f) {
    return (
      <aside className="bz-display is-empty" aria-hidden="true">
        <div className="bz-display-blank">
          <p>Hover a spine to see the cover.</p>
          <p>Click it to take it off the stack.</p>
        </div>
      </aside>
    );
  }
  const p = prices(f);
  const details = [f.year, f.runtime_minutes && `${f.runtime_minutes} min`, f.genre, f.languages].filter(Boolean);
  return (
    <>
      {open && <div className="bz-scrim" onClick={onClose} aria-hidden="true" />}
      <aside
        className={`bz-display${open ? " is-open" : " is-peek"}`}
        role={open ? "dialog" : undefined}
        aria-modal={open ? false : undefined}
        aria-label={open ? f.title : undefined}
        aria-hidden={open ? undefined : true}
      >
        {open && (
          <button type="button" className="bz-close" onClick={onClose} ref={closeRef} aria-label="Put it back on the stack">
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        )}
        <div className="bz-display-in">
          <div className="bz-display-cover">{f.poster_url && <img src={f.poster_url} alt="" width={400} height={600} />}</div>
          <div className="bz-display-text">
            <h3>{f.title}</h3>
            {f.director && <p className="bz-display-who">Directed by {f.director}</p>}
            {details.length > 0 && <p className="bz-display-meta">{details.join(", ")}</p>}
            {f.logline && <p className="bz-display-log">{f.logline}</p>}
            {p.length > 0 && (
              <ul className="bz-display-prices">
                {p.map((x) => (
                  <li key={x.label}>
                    <strong>{x.label}</strong>
                    {x.note && <span>{x.note}</span>}
                  </li>
                ))}
              </ul>
            )}
            {open ? (
              <div className="bz-display-act">
                <a className="btn" href={href(f)}>
                  {p[0]?.label || "Watch"}
                </a>
                {f.trailer_url && (
                  <a className="bz-ghost" href={href(f)}>
                    Watch the trailer
                  </a>
                )}
              </div>
            ) : (
              <p className="bz-display-hint">Click the spine to take it off the stack.</p>
            )}
            {f.tags.length > 0 && (
              <ul className="bz-display-tags" aria-label="Tags">
                {f.tags.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Browse />
  </StrictMode>
);
