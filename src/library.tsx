import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { api, getMe, type User } from "./api";
import { AppHeader } from "./AppHeader";
import "./styles.css";
import "./dashboard.css";

/* My Library: posters of the films this person has rented or bought. Each opens the film's watch page. */

const home = import.meta.env.BASE_URL;

type LibraryFilm = {
  id: number;
  title: string;
  year: number | null;
  poster_url: string | null;
  address: string | null; // the film's watch page, once it's live
  paid_at: string;
  access: "owned" | "rented" | "expired";
  start_by?: string;
  rental_hours?: number;
};

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

function accessLine(f: LibraryFilm) {
  if (f.access === "owned") return "Owned";
  if (f.access === "expired") return `Rental ended ${day(f.start_by!)}`;
  return `Rented · start by ${day(f.start_by!)}`;
}

function Library() {
  const [user, setUser] = useState<User | null>(null);
  const [films, setFilms] = useState<LibraryFilm[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getMe()
      .then(async (u) => {
        if (!u) return location.replace(`${home}signin/`);
        setUser(u);
        setFilms((await api<{ films: LibraryFilm[] }>("/library")).films);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  return (
    <div className="dash">
      <AppHeader user={user} />
      <main className="wrap dash-main">
        <h1>My Library</h1>
        {error && <p className="dash-alert" role="alert">{error}</p>}
        {!films && !error && <p role="status">Loading…</p>}
        {films && films.length === 0 && (
          <div className="list-empty">
            <p>
              Films you rent or buy on a watchmyfilm.online watch page show up here, signed in with the same email you paid
              with.
            </p>
          </div>
        )}
        {films && films.length > 0 && (
          <ul className="library-grid">
            {films.map((f) => {
              const href = f.address && f.access !== "expired" ? `https://${f.address}` : null;
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
                  <h2>
                    {href ? <a href={href}>{f.title}</a> : f.title}
                    {f.year && <span className="film-row-year"> ({f.year})</span>}
                  </h2>
                  <p className={`library-access access-${f.access}`}>{accessLine(f)}</p>
                </li>
              );
            })}
          </ul>
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
