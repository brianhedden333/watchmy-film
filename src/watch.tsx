import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { pageTheme, type Film } from "./films";
import { HoldingPage, WatchPage } from "./watchpage";
import "./styles.css";
import "./sample.css";

/* The live watch page at a film's own address (<name>.watchmyfilm.online). The server inlines the film as
   window.__WATCH__ (with its title and image in the HTML for link previews); otherwise we ask the API. */

declare global {
  interface Window {
    __WATCH__?: { film: Film | null };
  }
}

const MAIN_SITE = "https://watchmyfilm.online";
// The main site's own look, for the "no film here" page.
const SITE_COLORS = { color_background: "#000000", color_primary: "#ede8df", color_secondary: "#a39e95", color_button: "#ede8df" };

function Watch() {
  const [film, setFilm] = useState<Film | null | undefined>(window.__WATCH__ ? window.__WATCH__.film : undefined);

  useEffect(() => {
    if (film !== undefined) return;
    fetch(`/api/watch?host=${encodeURIComponent(location.hostname)}`)
      .then((r) => (r.ok ? r.json() : { film: null }))
      .then((d) => setFilm(d.film ?? null))
      .catch(() => setFilm(null));
  }, [film]);

  useEffect(() => {
    if (film) document.title = film.hidden ? film.title : `Watch ${film.title}`;
  }, [film]);

  if (film === undefined) return <div className="sample" />;
  if (!film) return <NotFound />;

  return (
    <div className="sample" style={pageTheme(film)}>
      {film.hidden ? <HoldingPage film={film} /> : <WatchPage film={film} mode="public" />}
      <footer className="watch-foot">
        <a href={MAIN_SITE}>Sell your film from your own website · watchmyfilm.online</a>
      </footer>
    </div>
  );
}

function NotFound() {
  return (
    <div className="sample watch-404" style={pageTheme(SITE_COLORS)}>
      <main className="s-wrap">
        <h1>There's no film here.</h1>
        <p>Check the address, or ask the filmmaker for the link to their film.</p>
        <a className="s-btn watch-404-btn" href={MAIN_SITE}>
          Go to watchmyfilm.online
        </a>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Watch />
  </StrictMode>
);
