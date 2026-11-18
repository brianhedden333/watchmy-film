import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { site } from "./config";
import { api, getMe } from "./api";
import { liveAddress, pageTheme, type Film } from "./films";
import { HoldingPage, WatchPage } from "./watchpage";
import "./styles.css";
import "./sample.css";

/* Preview of a filmmaker's watch page: the same layout as /sample/, filled from their saved film.
   A banner on top says it's a preview; Rent and Buy don't charge anyone. */

const home = import.meta.env.BASE_URL;
const filmId = Number(new URLSearchParams(location.search).get("film"));

function Preview() {
  const [film, setFilm] = useState<Film | null>(null);
  const [mine, setMine] = useState(true);
  const [admin, setAdmin] = useState(false);
  const [showFull, setShowFull] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getMe()
      .then(async (u) => {
        if (!u) return location.replace(`${home}signin/`);
        if (!filmId) throw new Error("No film chosen. Open the preview from your film's page.");
        const r = await api<{ film: Film }>(`/films/${filmId}`);
        setMine(r.film.user_id === u.id); // admins can preview anyone's film
        setAdmin(u.isAdmin);
        setFilm(r.film);
        document.title = `Preview: ${r.film.title} | ${site.name}`;
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  if (error || !film) {
    return (
      <div className="sample">
        <PreviewBanner film={null} />
        <div className="s-wrap s-main">{error ? <p role="alert">{error}</p> : <p role="status">Loading preview…</p>}</div>
      </div>
    );
  }

  return (
    <div className="sample" style={pageTheme(film)}>
      {mine && !admin ? <PreviewBanner film={film} /> : <AdminBanner film={film} mine={mine} />}
      {film.hidden && !showFull ? (
        <HoldingPage film={film} onShowFull={() => setShowFull(true)} />
      ) : (
        <WatchPage film={film} canWatch={admin} />
      )}
    </div>
  );
}

function PreviewBanner({ film }: { film: Film | null }) {
  const addr = film && liveAddress(film);
  const back = film ? `${home}add-a-film/?film=${film.id}` : `${home}dashboard/`;
  return (
    <div className="preview-bar" role="region" aria-label="Preview notice">
      <div className="preview-bar-text">
        <p className="preview-bar-title">
          This is a preview of your watch page{film && film.status !== "live" ? ". Only you can see it." : "."}
        </p>
        <p>
          Rent and Buy are switched off here, so nobody is charged.
          {film && film.status !== "live" && (addr ? ` Once it's live, it will be at ${addr}.` : " It goes public once it's approved and live.")}
          {film && film.missing.length > 0 && ` Still to add: ${film.missing.join(", ")}.`}
        </p>
      </div>
      <a href={back} className="btn btn-small">
        {film ? (film.editable ? "Back to editing" : "Back to your film") : "Back to your films"}
      </a>
    </div>
  );
}

function AdminBanner({ film, mine }: { film: Film; mine: boolean }) {
  return (
    <div className="preview-bar" role="region" aria-label="Preview notice">
      <div className="preview-bar-text">
        <p className="preview-bar-title">Admin preview of {film.title}.</p>
        <p>Nobody is charged here. Click Rent Now or Buy Now to see the film the way a renter or buyer does.</p>
      </div>
      <a href={mine ? `${home}add-a-film/?film=${film.id}` : `${home}admin/`} className="btn btn-small">
        {mine ? "Back to editing" : "Back to admin"}
      </a>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Preview />
  </StrictMode>
);
