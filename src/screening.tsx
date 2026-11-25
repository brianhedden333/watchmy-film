import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { api } from "./api";
import { pageTheme, type Film } from "./films";
import { WatchPage } from "./watchpage";
import { APP } from "./sites";
import "./styles.css";
import "./sample.css";

/* Admin test screening, on indiefilm.club: a film's watch page with the film itself playable, opened from a
   private expiring link made in admin (any status, even a draft without an address). It runs on indiefilm.club so
   the Vimeo embed is tested on the domain the filmmaker allowed. Nobody is charged here. */

const token = new URLSearchParams(location.search).get("t") || "";

function Screening() {
  const [film, setFilm] = useState<Film | null>(null);
  const [expires, setExpires] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return setError("This test link is missing its code. Make a new one from admin.");
    api<{ film: Film; expires_at: string }>(`/watch/screening?t=${encodeURIComponent(token)}`)
      .then((r) => {
        setFilm(r.film);
        setExpires(r.expires_at);
        document.title = `Test screening: ${r.film.title}`;
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  const until = expires && new Date(expires).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
  return (
    <div className="sample" style={film ? pageTheme(film) : undefined}>
      <div className="preview-bar" role="region" aria-label="Test screening notice">
        <div className="preview-bar-text">
          <p className="preview-bar-title">Admin test screening{film ? ` of ${film.title}` : ""}, on indiefilm.club.</p>
          <p>
            The film is unlocked as if you'd bought it: press play to check its Vimeo embed works on this domain. Nobody is
            charged. This private link works until {until || "it expires"}.
          </p>
        </div>
        <a href={`${APP}/admin/`} className="btn btn-small">
          Back to admin
        </a>
      </div>
      {error ? (
        <div className="s-wrap s-main">
          <p role="alert">{error}</p>
        </div>
      ) : !film ? (
        <div className="s-wrap s-main">
          <p role="status">Loading…</p>
        </div>
      ) : (
        <WatchPage film={film} canWatch startOpen={film.buy_price_cents ? "buy" : film.rent_price_cents ? "rent" : film.free_watch ? "free" : film.pwyw_access} />
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Screening />
  </StrictMode>
);
