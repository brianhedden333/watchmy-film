import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { api, ApiError } from "./api";
import { pageTheme, type Film } from "./films";
import { WatchPage } from "./watchpage";
import { APP } from "./sites";
import "./styles.css";
import "./sample.css";

/* Test screening, on indiefilm.club: /screening/?film=<id>. A film's watch page as a paying viewer sees it, film
   playing, any status (even a draft without an address), so the Vimeo embed is tested on the domain the filmmaker
   allowed. Only the film's own account and admins can view it (the server checks the indiefilm.club sign-in).
   Nobody is charged here.

   Add-a-film and admin link here through the sign-in hop, so they arrive signed in. Opened any other way while not
   signed in here (or as someone else), the page tries the hop once from watchmyfilm.online; "hopped=1" marks that
   it already did, so it can't loop. */

const params = new URLSearchParams(location.search);
const filmId = Number(params.get("film")) || 0;
const hopped = params.has("hopped");

function Screening() {
  const [film, setFilm] = useState<Film | null>(null);
  const [by, setBy] = useState<"owner" | "admin">("owner");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!filmId) return setError("This test screening link is missing its film. Open it again from Add a film.");
    api<{ film: Film; by: "owner" | "admin" }>(`/watch/screening?film=${filmId}`)
      .then((r) => {
        setFilm(r.film);
        setBy(r.by);
        document.title = `Test screening: ${r.film.title}`;
        if (hopped) history.replaceState(null, "", `${location.pathname}?film=${filmId}`);
      })
      .catch((e) => {
        const status = e instanceof ApiError ? e.status : 0;
        if ((status === 401 || status === 403) && !hopped) {
          // Maybe signed in on watchmyfilm.online but not here: pass through the hop once and come back.
          const back = `${location.origin}${location.pathname}?film=${filmId}&hopped=1`;
          location.replace(`${APP}/api/auth/hop?next=${encodeURIComponent(back)}`);
          return;
        }
        setError((e as Error).message);
      });
  }, []);

  return (
    <div className="sample" style={film ? pageTheme(film) : undefined}>
      <div className="preview-bar" role="region" aria-label="Test screening notice">
        <div className="preview-bar-text">
          <p className="preview-bar-title">
            {by === "admin" ? "Admin test screening" : "Test screening"}
            {film ? ` of ${film.title}` : ""}, on indiefilm.club.
          </p>
          <p>
            {by === "admin"
              ? "The film is unlocked as if you'd bought it: press play to check its Vimeo embed works on this domain. "
              : "This is your page as a viewer sees it after paying. Press play and make sure your film appears and plays, then tick the box on Add a film. "}
            Nobody is charged. 🔒 Only the film's own account and our admins can view this page.
          </p>
        </div>
        <a href={by === "admin" ? `${APP}/admin/` : `${APP}/add-a-film/${filmId ? `?film=${filmId}` : ""}`} className="btn btn-small">
          {by === "admin" ? "Back to admin" : "Back to Add a film"}
        </a>
      </div>
      {error ? (
        <div className="s-wrap s-main">
          <p role="alert">{error}</p>
          <p>
            Sign in to <a href={`${APP}/signin/`}>watchmyfilm.online</a> with the film's account, then open the test screening
            from Add a film.
          </p>
        </div>
      ) : !film ? (
        <div className="s-wrap s-main">
          <p role="status">Loading…</p>
        </div>
      ) : (
        <WatchPage
          film={film}
          canWatch
          startOpen={film.buy_price_cents ? "buy" : film.rent_price_cents ? "rent" : film.free_watch ? "free" : film.pwyw_access}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Screening />
  </StrictMode>
);
