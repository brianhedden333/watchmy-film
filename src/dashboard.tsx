import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { api, getMe, type User } from "./api";
import { liveAddress, pillClass, statusLabel, type Film, type FilmsResponse } from "./films";
import { AppHeader } from "./AppHeader";
import "./styles.css";
import "./dashboard.css";

/* Dashboard: every film on the account. Each one opens in /add-a-film/, where it's edited and set up. */

const home = import.meta.env.BASE_URL;
const editUrl = (f: Film) => `${home}add-a-film/?film=${f.id}`;

// The public address once a film is live (own domain → watch.<domain>, otherwise a subdomain of ours).
function nextStep(f: Film) {
  switch (f.status) {
    case "draft":
      if (f.missing.length) return `Finish the film details (${f.missing.length} left)`;
      return f.setup_status === "unpaid" ? "Pay the setup fee to send it for review" : "Send it for review";
    case "in_review":
      return "We're reviewing it. We'll email you when it's approved.";
    case "changes_requested":
      return "Make the changes we asked for, then send it back";
    case "approved":
      return "Approved: go live when you're ready";
    case "live":
      return f.hidden ? "Hidden: visitors see a holding page" : null;
  }
}

function Dashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [films, setFilms] = useState<Film[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getMe()
      .then(async (u) => {
        if (!u) return location.replace(`${home}signin/`);
        setUser(u);
        setFilms((await api<FilmsResponse>("/films")).films);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  return (
    <div className="dash">
      <AppHeader user={user} />

      <main className="wrap dash-main">
        {error && <p className="dash-alert" role="alert">{error}</p>}
        {!films && !error && <p role="status">Loading…</p>}
        {films && (
          <>
            <div className="list-head">
              <h1>Your films</h1>
              <a className="btn btn-small" href={films.length ? `${home}add-a-film/?new=1` : `${home}add-a-film/`}>
                Add a film
              </a>
            </div>

            {films.length === 0 ? (
              <div className="list-empty">
                <p>You haven't added a film yet. Start with its title; everything else can come later.</p>
                <a className="btn" href={`${home}add-a-film/`}>
                  Add your first film
                </a>
              </div>
            ) : (
              <ul className="film-list">
                {films.map((f) => {
                  const addr = f.status === "live" && !f.hidden ? liveAddress(f) : null;
                  const step = nextStep(f);
                  return (
                    <li key={f.id} className="film-row">
                      <a href={editUrl(f)} className="film-row-poster" tabIndex={-1} aria-hidden="true">
                        {f.poster_url ? <img src={f.poster_url} alt="" loading="lazy" /> : <span>{f.title.slice(0, 1)}</span>}
                      </a>
                      <div className="film-row-body">
                        <h2>
                          <a href={editUrl(f)}>{f.title}</a>
                          {f.year && <span className="film-row-year"> ({f.year})</span>}
                        </h2>
                        <p className="film-row-status">
                          <span className={pillClass(f)}>{statusLabel(f)}</span>
                          {step && <span>{step}</span>}
                        </p>
                        {addr && (
                          <p className="film-row-addr">
                            <a href={`https://${addr}`} target="_blank" rel="noopener">
                              {addr}
                            </a>
                          </p>
                        )}
                      </div>
                      <div className="film-row-actions">
                        {f.status === "live" && liveAddress(f) ? (
                          <a className="link-btn" href={`https://${liveAddress(f)}`} target="_blank" rel="noopener">
                            View page
                          </a>
                        ) : (
                          <a className="link-btn" href={`${home}preview/?film=${f.id}`}>
                            Preview
                          </a>
                        )}
                        <a className="btn btn-small btn-red" href={editUrl(f)}>
                          {f.editable ? "Edit" : "Details"}
                        </a>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Dashboard />
  </StrictMode>
);
