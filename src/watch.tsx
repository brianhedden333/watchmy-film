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
        <a className="watch-foot-brand" href={MAIN_SITE} aria-label="Powered by WatchMyFilm.Online">
          <span>Powered by</span>
          <img src="/brand/watchmyfilm-logo-white.png" alt="WatchMyFilm.Online" width={600} height={163} />
        </a>
        <p className="watch-foot-copy">
          © {new Date().getFullYear()} {film.title}. All rights reserved.
        </p>
      </footer>
    </div>
  );
}

function NotFound() {
  return (
    <div className="sample watch-404" style={pageTheme(SITE_COLORS)}>
      <main className="s-wrap">
        <a className="watch-404-logo" href={MAIN_SITE} aria-label="watchmyfilm.online home">
          <img src="/brand/watchmyfilm-logo-white.png" alt="" width={600} height={163} />
        </a>
        <ShruggingReel />
        <h1>Hmm, no film playing here.</h1>
        <p>This address doesn't have a film right now. Check the link, or ask the filmmaker for theirs.</p>
        <a className="s-btn watch-404-btn" href={MAIN_SITE}>
          Go to watchmyfilm.online
        </a>
      </main>
    </div>
  );
}

// Our film-strip mark as a little character, shrugging: projector-cream body with sprocket holes, raised
// eyebrows, open-palm arms and gold question marks. The shrug loops gently (still if reduced motion is on).
function ShruggingReel() {
  const cream = "#ede8df";
  const gold = "#fceb7e";
  return (
    <svg className="reel" viewBox="0 0 240 210" width="240" height="210" role="img" aria-label="A little film reel shrugging">
      <ellipse cx="120" cy="196" rx="58" ry="7" fill="#1f1d1b" />
      {/* Legs */}
      <g stroke={cream} strokeWidth="8" strokeLinecap="round" fill="none">
        <path d="M100 150 L96 182 L86 186" />
        <path d="M140 150 L144 182 L154 186" />
      </g>
      {/* Arms, bent up at the elbows with open hands: the shrug */}
      <g className="reel-arms" stroke={cream} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M62 104 L38 112 L26 90" />
        <path d="M20 84 L26 90 M24 80 L28 88 M31 80 L29 88" strokeWidth="5" />
        <path d="M178 104 L202 112 L214 90" />
        <path d="M220 84 L214 90 M216 80 L212 88 M209 80 L211 88" strokeWidth="5" />
      </g>
      {/* Body: the film-strip mark */}
      <g className="reel-body">
        <rect x="60" y="40" width="120" height="112" rx="20" fill={cream} />
        {[56, 78, 100, 122].map((y) => (
          <g key={y} fill="#000">
            <rect x="68" y={y} width="10" height="12" rx="3" />
            <rect x="162" y={y} width="10" height="12" rx="3" />
          </g>
        ))}
        {/* Face */}
        <g className="reel-brows" stroke="#000" strokeWidth="4" strokeLinecap="round" fill="none">
          <path d="M92 70 Q100 62 108 68" />
          <path d="M132 68 Q140 62 148 70" />
        </g>
        <circle cx="100" cy="86" r="6" fill="#000" />
        <circle cx="140" cy="86" r="6" fill="#000" />
        <circle cx="102" cy="84" r="2" fill={cream} />
        <circle cx="142" cy="84" r="2" fill={cream} />
        <path d="M106 114 q7 -6 14 0 t14 0" stroke="#000" strokeWidth="4" strokeLinecap="round" fill="none" />
        <circle cx="90" cy="104" r="5" fill="#b8405c" opacity="0.5" />
        <circle cx="150" cy="104" r="5" fill="#b8405c" opacity="0.5" />
      </g>
      {/* Question marks */}
      <g className="reel-q" fill={gold} fontFamily="Archivo, system-ui, sans-serif" fontWeight="800">
        <text x="186" y="34" fontSize="30">?</text>
        <text x="40" y="40" fontSize="22" transform="rotate(-12 40 40)">?</text>
      </g>
    </svg>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Watch />
  </StrictMode>
);
